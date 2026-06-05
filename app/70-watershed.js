/* =============================================================
   70-watershed.js  —  Watershed & Channel Extraction  (v2)
   Clean rewrite: minimal UI, correct hydrology, no fragmentation.

   Three AOI modes
   ───────────────
   pourpoint  Snaps click to nearest stream; delineates upstream basin
   polygon    Draws a polygon; channels & sub-basins clipped to it
   canvas     Uses current map viewport as AOI (Global DEM only)

   Flat-terrain fix
   ─────────────────
   Wang & Liu (2006) sink-fill replaces the old Priority-Flood + ε.
   Each filled cell is raised to at least:
     filled[parent] + minSlope × dist
   where minSlope is user-configurable (default 1e-4 m/m) and dist is
   the D8 cell spacing (1× or √2× the average cell size).  This imposes
   a genuine drainage gradient across flat areas so every cell always
   has a strictly downhill D8 neighbour → flowDir is fully defined →
   channel network is connected even in very flat terrain.

   The reach-tracer uses a single-pass walk that includes the first
   already-visited cell as the closing endpoint of a segment, so
   segments connect seamlessly at confluences.
   ============================================================= */

(function () {
  "use strict";

  /* ── D8 lookup tables ─────────────────────────────────────── */
  // Neighbours in order: E SE S SW W NW N NE
  const D8_DIRS  = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
  const D8_CODES = [1, 2, 4, 8, 16, 32, 64, 128];

  const CODE_TO_DIR = new Int8Array(256).fill(-1);
  D8_CODES.forEach((c, i) => (CODE_TO_DIR[c] = i));

  // Reverse (opposite) direction index for upstream BFS
  const REV = Uint8Array.from({length: 8}, (_, i) => (i + 4) % 8);

  /* ── Constants ────────────────────────────────────────────── */
  const ACCENT         = "#00f5d4";
  const LAYER_CHANNELS = "Stream Channels";
  const LAYER_BASIN    = "Watershed Basin";

  /* ── DOM ──────────────────────────────────────────────────── */
  const panel      = document.getElementById("watershed-panel");
  const panelHdr   = document.getElementById("watershed-panel-header");
  const closeBtn   = document.getElementById("watershed-panel-close-btn");
  const toolBtn    = document.getElementById("watershed-btn");

  const demSrcCtrl  = document.getElementById("wt-dem-source-ctrl");
  const demSelWrap  = document.getElementById("wt-dem-select-wrap");
  const demSel      = document.getElementById("wt-dem-select");
  const radiusWrap    = document.getElementById("wt-global-radius-wrap");
  const radiusIn      = document.getElementById("wt-global-radius");
  const radiusDisplay = document.getElementById("wt-global-radius-display");

  const modeCtrl    = document.getElementById("wt-input-mode-ctrl");
  const ppRow       = document.getElementById("wt-pourpoint-row");
  const polyRow     = document.getElementById("wt-polygon-row");
  const canvasRow   = document.getElementById("wt-canvas-row");
  const pickBtn     = document.getElementById("wt-pick-btn");
  const coordsLbl   = document.getElementById("wt-coords-display");
  const clearPourBtn = document.getElementById("wt-clear-pour-btn");
  const drawBtn     = document.getElementById("wt-draw-btn");
  const polyLbl     = document.getElementById("wt-polygon-status");
  const clearPolyBtn = document.getElementById("wt-clear-poly-btn");

  const threshSlider   = document.getElementById("wt-threshold-slider");
  const threshInput    = document.getElementById("wt-threshold-input");

  const minSlopeSlider  = document.getElementById("wt-minslope-slider");
  const minSlopeDisplay = document.getElementById("wt-minslope-display");

  const subbasinsToggle = document.getElementById("wt-subbasins-toggle");

  const errorEl    = document.getElementById("wt-error-msg");
  const progressWr = document.getElementById("wt-progress");
  const progressFl = document.getElementById("wt-progress-fill");
  const progressLb = document.getElementById("wt-progress-label");
  const applyBtn   = document.getElementById("wt-apply-btn");
  const cancelBtn  = document.getElementById("wt-cancel-btn");

  /* ── State ────────────────────────────────────────────────── */
  let demSource   = "local";       // "local" | "global"
  let inputMode   = "pourpoint";   // "pourpoint" | "polygon" | "canvas"
  let pourPt      = null;          // L.LatLng
  let pourMarker  = null;
  let polyLatLngs = null;
  let polyLayer   = null;
  let drawHandler = null;
  let picking     = false;
  let drawing     = false;
  let computing   = false;

  // Cancellation — replaced on every run; workers register themselves here
  let _cancelRequested = false;
  let _activeWorkers   = new Set();   // live Worker instances for the current run

  function requestCancel() {
    _cancelRequested = true;
    for (const w of _activeWorkers) { try { w.terminate(); } catch (_) {} }
    _activeWorkers.clear();
  }

  function checkCancelled() {
    if (_cancelRequested) throw new DOMException("Watershed cancelled by user.", "AbortError");
  }

  /* ════════════════════════════════════════════════════════════
     PANEL LIFECYCLE
     ════════════════════════════════════════════════════════════ */

  function openPanel() {
    panel.hidden = false;
    toolBtn.setAttribute("aria-pressed", "true");
    refreshDemSelect();
    // Mutual exclusion with other terrain panels
    const vs = document.getElementById("viewshed-panel");
    if (vs && !vs.hidden) document.getElementById("viewshed-panel-close-btn")?.click();
    const pk = document.getElementById("peaks-panel");
    if (pk && !pk.hidden) document.getElementById("peaks-panel-close-btn")?.click();
  }

  function closePanel() {
    cancelInput();
    panel.hidden = true;
    toolBtn.setAttribute("aria-pressed", "false");
  }

  toolBtn.addEventListener("click", () => panel.hidden ? openPanel() : closePanel());
  closeBtn.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      picking || drawing ? cancelInput() : closePanel();
    }
  });

  /* ── Drag to move ─────────────────────────────────────────── */
  (function () {
    let drag = false, sx, sy, sl, st;

    function startDrag(clientX, clientY) {
      drag = true; sx = clientX; sy = clientY;
      const r = panel.getBoundingClientRect();
      sl = r.left; st = r.top;
      panel.style.left = sl + "px"; panel.style.top = st + "px";
      panel.style.right = "auto"; panel.style.bottom = "auto";
    }

    function moveDrag(clientX, clientY) {
      if (!drag) return;
      const maxLeft = window.innerWidth  - panel.offsetWidth;
      const maxTop  = window.innerHeight - panel.offsetHeight;
      panel.style.left = Math.min(Math.max(0, sl + clientX - sx), maxLeft) + "px";
      panel.style.top  = Math.min(Math.max(0, st + clientY - sy), maxTop)  + "px";
    }

    function endDrag() { drag = false; }

    panelHdr.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });

    panelHdr.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });

    document.addEventListener("mousemove", (e) => {
      moveDrag(e.clientX, e.clientY);
    });

    document.addEventListener("touchmove", (e) => {
      if (!drag || e.touches.length !== 1) return;
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });

    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);
    document.addEventListener("touchcancel", endDrag);
  })();

  /* ════════════════════════════════════════════════════════════
     DEM SOURCE
     ════════════════════════════════════════════════════════════ */

  demSrcCtrl.addEventListener("click", (e) => {
    const btn = e.target.closest(".wt-dem-card");
    if (!btn) return;
    const src = btn.dataset.demSource;
    if (!src || src === demSource) return;
    demSource = src;
    demSrcCtrl.querySelectorAll(".wt-dem-card")
      .forEach(b => b.classList.toggle("is-active", b.dataset.demSource === src));
    demSelWrap.classList.toggle("is-open", src === "local");
    radiusWrap.classList.toggle("is-open", src === "global");
    // Canvas mode only makes sense with global; offer hint
    if (src === "local" && inputMode === "canvas") switchMode("pourpoint");
  });

  function refreshDemSelect() {
    const prev = demSel.value;
    while (demSel.options.length > 1) demSel.remove(1);
    loadedLayers.forEach(lr => {
      if (!isRasterLayerRecord(lr) || !lr.rasterImage) return;
      const o = document.createElement("option");
      o.value = lr.id; o.textContent = lr.name;
      demSel.appendChild(o);
    });
    if (prev && [...demSel.options].some(o => o.value === prev)) demSel.value = prev;
  }

  // Refresh when layers change
  const layerListEl = document.getElementById("layer-list");
  if (layerListEl)
    new MutationObserver(() => { if (!panel.hidden) refreshDemSelect(); })
      .observe(layerListEl, { childList: true, subtree: false });

  /* ════════════════════════════════════════════════════════════
     AOI / INPUT MODE
     ════════════════════════════════════════════════════════════ */

  modeCtrl.addEventListener("click", (e) => {
    const btn = e.target.closest(".wt-aoi-card");
    if (!btn) return;
    const mode = btn.dataset.inputMode;
    if (!mode || mode === inputMode) return;
    // Canvas needs global DEM — auto-switch
    if (mode === "canvas" && demSource === "local") {
      demSource = "global";
      demSrcCtrl.querySelectorAll(".wt-dem-card")
        .forEach(b => b.classList.toggle("is-active", b.dataset.demSource === "global"));
      demSelWrap.classList.remove("is-open");
      radiusWrap.classList.add("is-open");
    }
    switchMode(mode);
  });

  function switchMode(mode) {
    cancelInput();
    inputMode = mode;
    modeCtrl.querySelectorAll(".wt-aoi-card")
      .forEach(b => b.classList.toggle("is-active", b.dataset.inputMode === mode));
    ppRow.classList.toggle("is-open",     mode === "pourpoint");
    polyRow.classList.toggle("is-open",   mode === "polygon");
    canvasRow.classList.toggle("is-open", mode === "canvas");
  }

  function cancelInput() {
    if (picking) stopPicking();
    if (drawing) stopDrawing();
  }

  /* ── Pour point ───────────────────────────────────────────── */

  const PICK_HTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg> Pick on map`;
  const DRAW_HTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 20 2 20"/></svg> Draw polygon`;

  function startPicking() {
    picking = true;
    map.on("click", onMapClick);
    pickBtn.textContent = "Click on map…";
    pickBtn.classList.add("is-active");
    document.body.classList.add("map-picking-pourpoint");
  }

  function stopPicking() {
    picking = false;
    map.off("click", onMapClick);
    pickBtn.innerHTML = PICK_HTML;
    pickBtn.classList.remove("is-active");
    document.body.classList.remove("map-picking-pourpoint");
  }

  function onMapClick(e) {
    stopPicking();
    pourPt = e.latlng;
    if (pourMarker) map.removeLayer(pourMarker);
    pourMarker = L.circleMarker(pourPt, {
      radius:6, color:ACCENT, fillColor:ACCENT, fillOpacity:0.35, weight:2, interactive:false,
    }).addTo(map);
    coordsLbl.value = `${pourPt.lat.toFixed(6)}, ${pourPt.lng.toFixed(6)}`;
    coordsLbl.classList.add("is-set");
    clearPourBtn.hidden = false;
  }

  pickBtn.addEventListener("click", () => picking ? stopPicking() : startPicking());

  function clearPourPoint() {
    if (picking) stopPicking();
    pourPt = null;
    if (pourMarker) { map.removeLayer(pourMarker); pourMarker = null; }
    coordsLbl.value = "";
    coordsLbl.placeholder = "Not set — or paste lat, lng";
    coordsLbl.classList.remove("is-set");
    clearPourBtn.hidden = true;
  }

  clearPourBtn.addEventListener("click", clearPourPoint);

  // ── Coordinate paste / manual entry ──────────────────────────
  function parseWtCoordInput(raw) {
    const clean = raw.trim().replace(/\s+/g, " ");
    const m = clean.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return L.latLng(lat, lng);
  }

  function applyWtCoordInput() {
    const latlng = parseWtCoordInput(coordsLbl.value);
    if (!latlng) {
      coordsLbl.classList.add("coords-invalid");
      setTimeout(() => coordsLbl.classList.remove("coords-invalid"), 900);
      return;
    }
    if (picking) stopPicking();
    // Set the pour point marker
    pourPt = latlng;
    if (pourMarker) map.removeLayer(pourMarker);
    pourMarker = L.circleMarker(pourPt, {
      radius: 6, color: ACCENT, fillColor: ACCENT, fillOpacity: 0.35, weight: 2, interactive: false,
    }).addTo(map);
    coordsLbl.value = `${pourPt.lat.toFixed(6)}, ${pourPt.lng.toFixed(6)}`;
    coordsLbl.classList.add("is-set");
    clearPourBtn.hidden = false;
    // Pan map to point
    map.setView(pourPt, Math.max(map.getZoom(), 12), { animate: true });
  }

  coordsLbl.addEventListener("paste", () => {
    setTimeout(applyWtCoordInput, 0);
  });

  coordsLbl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyWtCoordInput(); }
  });

  coordsLbl.addEventListener("blur", () => {
    if (coordsLbl.value.trim() && !coordsLbl.classList.contains("is-set")) {
      applyWtCoordInput();
    }
  });

  /* ── Polygon ──────────────────────────────────────────────── */

  function startDrawing() {
    polyLatLngs = null;
    if (polyLayer) { map.removeLayer(polyLayer); polyLayer = null; }
    drawing = true;
    drawBtn.textContent = "Cancel";
    drawBtn.classList.add("is-active");
    polyLbl.textContent = "Click to add vertices…";
    polyLbl.classList.remove("is-set");
    document.body.classList.add("map-drawing-polygon");
    drawHandler = new L.Draw.Polygon(map, {
      shapeOptions: { color: ACCENT, fillOpacity: 0.06, weight: 1.5 },
      showArea: false, repeatMode: false,
    });
    drawHandler.enable();
    map.once("draw:created", (e) => {
      stopDrawing();
      polyLatLngs = e.layer.getLatLngs()[0];
      polyLbl.textContent = `${polyLatLngs.length} vertices`;
      polyLbl.classList.add("is-set");
      clearPolyBtn.hidden = false;
      polyLayer = L.polygon(polyLatLngs, {
        color:ACCENT, fillOpacity:0.05, weight:1.2, interactive:false, dashArray:"4 4",
      }).addTo(map);
    });
  }

  function stopDrawing() {
    drawing = false;
    document.body.classList.remove("map-drawing-polygon");
    if (drawHandler) { try { drawHandler.disable(); } catch (_) {} drawHandler = null; }
    drawBtn.innerHTML = DRAW_HTML;
    drawBtn.classList.remove("is-active");
    if (!polyLatLngs) { polyLbl.textContent = "Not drawn"; polyLbl.classList.remove("is-set"); }
  }

  drawBtn.addEventListener("click", () => drawing ? stopDrawing() : startDrawing());

  function clearPolygon() {
    if (drawing) stopDrawing();
    polyLatLngs = null;
    if (polyLayer) { map.removeLayer(polyLayer); polyLayer = null; }
    polyLbl.textContent = "Not drawn";
    polyLbl.classList.remove("is-set");
    clearPolyBtn.hidden = true;
  }

  clearPolyBtn.addEventListener("click", clearPolygon);

  /* ── Sliders ──────────────────────────────────────────────── */

  threshSlider.addEventListener("input", () => {
    threshInput.value = threshSlider.value;
  });

  threshInput.addEventListener("input", () => {
    const v = Math.max(1, Math.min(999999, parseInt(threshInput.value, 10) || 1));
    threshSlider.value = v;
  });

  threshInput.addEventListener("change", () => {
    const v = Math.max(1, Math.min(999999, parseInt(threshInput.value, 10) || 1));
    threshInput.value = v;
    threshSlider.value = v;
  });

  function getMinSlope() {
    return Math.pow(10, Number(minSlopeSlider.value));
  }

  function updateMinSlopeDisplay() {
    const v = getMinSlope();
    // Format as e.g. "0.0001 m/m" or "0.01 m/m"
    minSlopeDisplay.textContent = v < 0.001
      ? v.toExponential(0) + " m/m"
      : v.toFixed(v < 0.01 ? 4 : v < 0.1 ? 3 : 2) + " m/m";
  }

  minSlopeSlider.addEventListener("input", updateMinSlopeDisplay);
  updateMinSlopeDisplay();

  function updateRadiusDisplay() {
    const km = (Number(radiusIn.value) / 1000).toFixed(0);
    radiusDisplay.textContent = `${km} km`;
  }
  radiusIn.addEventListener("input", updateRadiusDisplay);
  updateRadiusDisplay();

  /* ════════════════════════════════════════════════════════════
     VALIDATION
     ════════════════════════════════════════════════════════════ */

  function validate() {
    clearError();
    if (demSource === "local") {
      if (!demSel.value) return fail("Select a DEM raster layer.");
      const lr = loadedLayers.find(l => l.id === demSel.value);
      if (!lr?.rasterImage || !lr?.rasterTransform) return fail("Selected DEM is no longer available.");
    } else {
      if (inputMode !== "canvas") {
        const r = Number(radiusIn.value);
        if (!r || r < 5000 || r > 200000) return fail("Radius must be 5–200 km.");
      }
    }
    if (inputMode === "pourpoint" && !pourPt) return fail("Pick a pour point on the map.");
    if (inputMode === "polygon"   && (!polyLatLngs || polyLatLngs.length < 3))
      return fail("Draw a polygon with ≥ 3 vertices.");
    return true;
  }

  function fail(msg) { showError(msg); return false; }
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function clearError()   { errorEl.hidden = true; errorEl.textContent = ""; }

  /* ════════════════════════════════════════════════════════════
     PROGRESS
     ════════════════════════════════════════════════════════════ */

  const STEPS = [
    "Fetching elevation…",
    "Filling sinks (Wang & Liu)…",
    "Computing flow direction…",   // label updated at runtime if GPU is used
    "Accumulating flow (worker)…",
    "Extracting channels…",
    "Delineating basin…",
    "Building vectors…",
  ];
  const N_STEPS = STEPS.length;

  let _wtHideTimer = null;
  function setProgress(step, label) {
    clearTimeout(_wtHideTimer);
    progressWr.hidden = false;
    progressFl.style.width = Math.round((step / (N_STEPS - 1)) * 100) + "%";
    progressLb.textContent = label ?? STEPS[step] ?? "Computing…";
    // Trigger fade-in on next frame so the transition fires after display change
    requestAnimationFrame(() => progressWr.classList.add("is-visible"));
  }

  function hideProgress() {
    clearTimeout(_wtHideTimer);
    progressWr.classList.remove("is-visible");
    // Wait for the fade-out to finish before setting hidden
    _wtHideTimer = setTimeout(() => {
      progressWr.hidden = true;
      progressFl.style.width = "0%";
      progressLb.textContent = STEPS[0];
    }, 300);
  }

  /* ════════════════════════════════════════════════════════════
     MIN-HEAP (shared by fill + breach)
     ════════════════════════════════════════════════════════════ */

  function Heap() {
    // Flat typed arrays — much faster than array-of-arrays for large DEMs
    let cap = 4096;
    let keys = new Float64Array(cap);
    let vals = new Int32Array(cap);
    let len  = 0;

    const grow = () => {
      cap *= 2;
      const k2 = new Float64Array(cap); k2.set(keys); keys = k2;
      const v2 = new Int32Array(cap);   v2.set(vals); vals = v2;
    };

    this.push = (k, v) => {
      if (len >= cap) grow();
      keys[len] = k; vals[len] = v; let i = len++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p] <= keys[i]) break;
        let tk = keys[p]; keys[p] = keys[i]; keys[i] = tk;
        let tv = vals[p]; vals[p] = vals[i]; vals[i] = tv;
        i = p;
      }
    };
    this.pop = () => {
      const rk = keys[0], rv = vals[0];
      len--;
      if (len > 0) {
        keys[0] = keys[len]; vals[0] = vals[len];
        let i = 0;
        for (;;) {
          let s = i, l = 2*i+1, r = 2*i+2;
          if (l < len && keys[l] < keys[s]) s = l;
          if (r < len && keys[r] < keys[s]) s = r;
          if (s === i) break;
          let tk = keys[s]; keys[s] = keys[i]; keys[i] = tk;
          let tv = vals[s]; vals[s] = vals[i]; vals[i] = tv;
          i = s;
        }
      }
      return [rk, rv];
    };
    Object.defineProperty(this, "size", { get: () => len });
  }

  /* ════════════════════════════════════════════════════════════
     GPU DETECTION & WEBGL HELPERS
     ════════════════════════════════════════════════════════════

     We use WebGL 1 (widest support, no WebGPU needed) with a
     float-texture extension for 32-bit elevation data.
     Falls back gracefully to CPU if WebGL is unavailable or the
     required extensions are missing.
     ════════════════════════════════════════════════════════════ */

  let _glCtx = null;         // cached WebGL context
  let _gpuOk = null;         // tri-state: null=untested, true, false

  function getGL() {
    if (_gpuOk === false) return null;
    if (_glCtx) return _glCtx;
    try {
      const cv = document.createElement("canvas");
      const gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
      if (!gl) { _gpuOk = false; return null; }
      // Need OES_texture_float for Float32 textures and WEBGL_color_buffer_float
      // for rendering to a float framebuffer
      const extF = gl.getExtension("OES_texture_float");
      const extFB = gl.getExtension("WEBGL_color_buffer_float") ||
                    gl.getExtension("EXT_color_buffer_float");
      if (!extF || !extFB) { _gpuOk = false; return null; }
      // Quick framebuffer completeness check — some mobile GPUs lie about extensions
      const testTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, testTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const testFB = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, testFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, testTex, 0);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteTexture(testTex);
      gl.deleteFramebuffer(testFB);
      if (status !== gl.FRAMEBUFFER_COMPLETE) { _gpuOk = false; return null; }
      _glCtx = gl; _gpuOk = true;
      console.info("[Watershed] WebGL GPU acceleration enabled.");
      return gl;
    } catch (e) {
      _gpuOk = false; return null;
    }
  }

  /**
   * Compile a WebGL program from VS + FS source strings.
   * Returns the linked program or null on error.
   */
  function glProgram(gl, vsSrc, fsSrc) {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("[Watershed/GL] Shader error:", gl.getShaderInfoLog(s));
        gl.deleteShader(s); return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[Watershed/GL] Link error:", gl.getProgramInfoLog(prog));
      return null;
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    return prog;
  }

  /** Upload a Float32Array as a RGBA float texture (width × height). */
  function uploadFloat32Tex(gl, data, W, H) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Pack one float per RGBA channel R (we waste G,B,A — acceptable for simplicity)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** Create a float RGBA framebuffer texture of size W×H. */
  function createFBTex(gl, W, H) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** Read back RGBA float pixels from the currently bound framebuffer. */
  function readbackFloat(gl, W, H) {
    const buf = new Float32Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, buf);
    return buf;
  }

  // Full-screen quad shared across all GL passes
  const VS_QUAD = `
    attribute vec2 a_pos;
    varying   vec2 v_uv;
    void main() {
      v_uv        = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }`;

  /**
   * GPU D8 flow-direction pass.
   *
   * For each interior cell we sample all 8 neighbours from the
   * filled-DEM texture and store the index d ∈ {0..7} of the
   * steepest-descent neighbour (or 255 if the cell is a local
   * minimum / border) as the R channel.
   *
   * The filled DEM is stored as a single float in the R channel
   * of a RGBA float texture.  We pack the result (a Uint8 code)
   * into R as a normalised float so readPixels gives it back as
   * data[i*4] * 255.
   */
  function gpuFlowDir(gl, demData, W, H, csx, csy, noData) {
    // Pad to power-of-2 or just use raw size — NPOT is fine with CLAMP_TO_EDGE
    gl.canvas.width = W; gl.canvas.height = H;

    // Pack demData (one float per cell) into RGBA — R = elevation, G=B=A=0
    const rgba = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) rgba[i * 4] = demData[i];

    const demTex = uploadFloat32Tex(gl, rgba, W, H);
    const fbTex  = createFBTex(gl, W, H);
    const fb     = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbTex, 0);

    // GLSL ES 1.0 (WebGL 1): no array initialisers, no continue in for-loops.
    // Unroll the 8 D8 directions as calls to a helper function.
    const hasND = (noData !== undefined && noData !== null && !Number.isNaN(noData));
    const ndGLSL = hasND ? noData.toPrecision(9) : "3.40282347e+38"; // use max float as sentinel when no real nodata
    const FS_FD = `
      precision highp float;
      uniform sampler2D u_dem;
      uniform vec2      u_texel;  // vec2(1.0/W, 1.0/H)
      uniform vec2      u_cell;   // vec2(csx, csy) in map units
      uniform float     u_nodata;
      uniform bool      u_has_nodata;
      varying vec2      v_uv;

      bool isND(float v) {
        return u_has_nodata && (abs(v - u_nodata) < 0.5);
      }

      // Returns the drop-slope toward the neighbour at offset (dc,dr) in texel space.
      // Returns +1e20 if the neighbour is OOB or NoData (acts as drainage outlet).
      // Returns -1e20 if the current cell or neighbour is flat/uphill.
      float nbSlope(vec2 px, float elev, float dc, float dr) {
        vec2 nuv = px + vec2(dc, dr) * u_texel;
        if (nuv.x < 0.0 || nuv.x > 1.0 || nuv.y < 0.0 || nuv.y > 1.0) return 1.0e20;
        float ne = texture2D(u_dem, nuv).r;
        if (isND(ne)) return 1.0e20;
        float dx   = abs(dc) * u_cell.x;
        float dy   = abs(dr) * u_cell.y;
        bool  diag = (dc != 0.0) && (dr != 0.0);
        float dist = diag ? sqrt(dx*dx + dy*dy) : (dx + dy);
        return (elev - ne) / dist;
      }

      void main() {
        vec2  px   = v_uv;
        float elev = texture2D(u_dem, px).r;
        // NoData cell: output code 0 (no flow direction)
        if (isND(elev)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        float best = 0.0;
        float code = 0.0;
        float slp;
        slp = nbSlope(px,elev, 1.0, 0.0); if(slp>best){best=slp;code=  1.0;}
        slp = nbSlope(px,elev, 1.0, 1.0); if(slp>best){best=slp;code=  2.0;}
        slp = nbSlope(px,elev, 0.0, 1.0); if(slp>best){best=slp;code=  4.0;}
        slp = nbSlope(px,elev,-1.0, 1.0); if(slp>best){best=slp;code=  8.0;}
        slp = nbSlope(px,elev,-1.0, 0.0); if(slp>best){best=slp;code= 16.0;}
        slp = nbSlope(px,elev,-1.0,-1.0); if(slp>best){best=slp;code= 32.0;}
        slp = nbSlope(px,elev, 0.0,-1.0); if(slp>best){best=slp;code= 64.0;}
        slp = nbSlope(px,elev, 1.0,-1.0); if(slp>best){best=slp;code=128.0;}
        gl_FragColor = vec4(code / 255.0, 0.0, 0.0, 1.0);
      }`;

    const prog = glProgram(gl, VS_QUAD, FS_FD);
    if (!prog) { /* cleanup + signal failure */ gl.deleteTexture(demTex); gl.deleteTexture(fbTex); gl.deleteFramebuffer(fb); return null; }

    // Full-screen quad buffer
    const qBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    gl.useProgram(prog);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(gl.getUniformLocation(prog, "u_dem"), 0);
    gl.uniform2f(gl.getUniformLocation(prog, "u_texel"),   1/W, 1/H);
    gl.uniform2f(gl.getUniformLocation(prog, "u_cell"), csx, csy);
    const hasND2 = (noData !== undefined && noData !== null && !Number.isNaN(noData));
    gl.uniform1f(gl.getUniformLocation(prog, "u_nodata"), hasND2 ? noData : 0.0);
    gl.uniform1i(gl.getUniformLocation(prog, "u_has_nodata"), hasND2 ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, demTex);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read back
    const raw = readbackFloat(gl, W, H);
    const fd  = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) fd[i] = Math.round(raw[i * 4] * 255);

    // Cleanup
    gl.deleteTexture(demTex); gl.deleteTexture(fbTex);
    gl.deleteFramebuffer(fb); gl.deleteBuffer(qBuf);
    gl.deleteProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return fd;
  }

  /* ════════════════════════════════════════════════════════════
     WEB WORKER HELPERS
     ════════════════════════════════════════════════════════════

     We spin up workers for the two most expensive CPU passes:
       • fillSinks    — single-threaded by nature (heap), but we
                        offload it to a worker so the UI stays
                        responsive during the long computation.
       • computeAccum — single-threaded topological sort; again
                        offloaded so the main thread doesn't freeze.
       • computeFlowDir — if GPU is unavailable, offloaded to worker.

     Each helper returns a Promise that resolves to the typed array.
     Workers are created inline via Blob URLs so no extra files
     are needed.
     ════════════════════════════════════════════════════════════ */

  /** Run a function inside a transient Web Worker using transferable buffers.
   *  fnSrc must be a string that defines a function named workerFn(data).
   */
  function runInWorker(fnSrc, transferIn, transferable) {
    return new Promise((resolve, reject) => {
      // fnSrc defines workerFn — we call it by name, NOT as an IIFE
      const src = '"use strict";\n' + fnSrc + '\n' +
        'self.onmessage = function(e) {\n' +
        '  var result = workerFn(e.data);\n' +
        '  var xfer = (result && result.buffer) ? [result.buffer] : [];\n' +
        '  self.postMessage(result, xfer);\n' +
        '};\n';
      const blob = new Blob([src], { type: "application/javascript" });
      const url  = URL.createObjectURL(blob);
      const w    = new Worker(url);
      _activeWorkers.add(w);
      w.onmessage = (e) => {
        _activeWorkers.delete(w);
        w.terminate(); URL.revokeObjectURL(url);
        resolve(e.data);
      };
      w.onerror = (e) => {
        _activeWorkers.delete(w);
        w.terminate(); URL.revokeObjectURL(url);
        reject(new Error(e.message || "Worker error"));
      };
      w.postMessage(transferIn, transferable);
    });
  }

  /* ────────────────────────────────────────────────────────────
     Typed-array heap used inside workers (self-contained — no
     closure over outer Heap, since workers have their own scope).
     ──────────────────────────────────────────────────────────── */
  const WORKER_HEAP_SRC = `
    function Heap() {
      let cap = 8192;
      let keys = new Float64Array(cap);
      let vals = new Int32Array(cap);
      let len  = 0;
      const grow = () => { cap*=2; const k2=new Float64Array(cap); k2.set(keys); keys=k2; const v2=new Int32Array(cap); v2.set(vals); vals=v2; };
      this.push = (k,v) => { if(len>=cap)grow(); keys[len]=k; vals[len]=v; let i=len++; while(i>0){const p=(i-1)>>1; if(keys[p]<=keys[i])break; let tk=keys[p];keys[p]=keys[i];keys[i]=tk; let tv=vals[p];vals[p]=vals[i];vals[i]=tv; i=p;} };
      this.pop  = () => { const rk=keys[0],rv=vals[0]; len--; if(len>0){keys[0]=keys[len];vals[0]=vals[len]; let i=0; for(;;){let s=i,l=2*i+1,r=2*i+2; if(l<len&&keys[l]<keys[s])s=l; if(r<len&&keys[r]<keys[s])s=r; if(s===i)break; let tk=keys[s];keys[s]=keys[i];keys[i]=tk; let tv=vals[s];vals[s]=vals[i];vals[i]=tv; i=s;}} return [rk,rv]; };
      Object.defineProperty(this,'size',{get:()=>len});
    }`;

  /**
   * Worker body for fillSinks — Wang & Liu (2006) depression filling.
   *
   * Identical to Priority-Flood but the slope imposed across flat areas is
   * controlled by `minSlope` (m/m) rather than a hard-coded ε.  Each filled
   * cell is raised to at least:
   *
   *   filled[parent] + minSlope * cellDist(cardinal=1, diagonal=√2) * avgCellSize
   *
   * where avgCellSize = (csx + csy) / 2 in map units.
   *
   * Reference: Wang & Liu (2006), "An Efficient Method for Identifying and
   * Filling Surface Depressions in Digital Elevation Models for Hydrologic
   * Analysis and Modelling." International Journal of Geographical
   * Information Science 20(2):193–213.
   *
   * Receives { dem: ArrayBuffer, W, H, minSlope, csx, csy }
   * Returns  Float32Array (filled DEM)
   */
  const FILL_SINKS_WORKER = `${WORKER_HEAP_SRC}
    function workerFn(d) {
      const { W, H, minSlope, csx, csy } = d;
      const noData = (d.noData !== undefined && !isNaN(d.noData)) ? d.noData : null;
      const dem    = new Float32Array(d.dem);   // transferred in
      // IMPORTANT: use Float64 for the filled array throughout the Priority-Flood.
      // Float32 only has ~7 significant digits, so on high-elevation DEMs (e.g. 4000 m)
      // the tiny minSlope increment (e.g. 0.003 m) is lost to rounding, producing a
      // perfectly flat filled DEM with no gradient — streams cannot form.
      // We convert back to Float32 at the very end (flow-dir only needs relative order).
      const filled  = new Float64Array(W * H);
      for (let i = 0; i < W * H; i++) filled[i] = dem[i];
      const inQueue = new Uint8Array(W * H);
      const heap    = new Heap();
      const SQRT2   = Math.SQRT2;
      // D8 neighbours: [row-delta, col-delta]
      const D8 = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
      // Pre-compute per-direction distance in map units
      const cellAvg = (csx + csy) * 0.5;
      const DIST = D8.map(([dr,dc]) => (dr && dc ? SQRT2 : 1.0) * cellAvg);

      const isND = (v) => noData !== null ? v === noData : !isFinite(v);

      // Replace NoData cells in filled with +Infinity so they never fill
      for (let i = 0; i < W * H; i++) { if (isND(dem[i])) filled[i] = Infinity; }

      // Seed: grid-edge cells AND any interior cell adjacent to a NoData cell or
      // out-of-bounds neighbour (matches SAGA's outlet seeding behaviour so that
      // interior NoData holes / lakes also act as drainage outlets).
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) {
          const i = r*W+c;
          if (isND(dem[i])) continue;  // NoData cells are not seeds themselves
          let isSeed = (r===0 || r===H-1 || c===0 || c===W-1);
          if (!isSeed) {
            for (let dd = 0; dd < 8; dd++) {
              const nr = r + D8[dd][0], nc = c + D8[dd][1];
              if (nr < 0 || nr >= H || nc < 0 || nc >= W || isND(dem[nr*W+nc])) {
                isSeed = true; break;
              }
            }
          }
          if (isSeed && !inQueue[i]) { inQueue[i] = 1; heap.push(filled[i], i); }
        }
      }

      // Priority-Flood with Wang & Liu slope enforcement
      while (heap.size > 0) {
        const [elev, idx] = heap.pop();
        const r = (idx/W)|0, c = idx%W;
        for (let dd = 0; dd < 8; dd++) {
          const [dr,dc] = D8[dd];
          const nr = r+dr, nc = c+dc;
          if (nr<0 || nr>=H || nc<0 || nc>=W) continue;
          const ni = nr*W+nc;
          if (inQueue[ni] || isND(dem[ni])) continue;
          inQueue[ni] = 1;
          // Wang & Liu: impose minimum outflow gradient from parent
          const minFill = elev + minSlope * DIST[dd];
          if (filled[ni] < minFill) filled[ni] = minFill;
          heap.push(filled[ni], ni);
        }
      }
      // Convert back to Float32 for the downstream flow-dir step
      const out = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) out[i] = filled[i];
      return out;
    }`;

  /**
   * Worker body for computeFlowDir (CPU fallback).
   * Receives { dem: Float32Array, W, H, csx, csy }
   * Returns Uint8Array (flow direction codes).
   */
  const FLOW_DIR_WORKER = `
    function workerFn(d) {
      const { W, H, csx, csy } = d;
      const noData = (d.noData !== undefined && d.noData !== null) ? d.noData : null;
      const dem = new Float32Array(d.dem);
      const D8  = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
      const CODES = [1,2,4,8,16,32,64,128];
      const fd = new Uint8Array(W*H);
      const isND = (v) => noData !== null ? v === noData : !isFinite(v);
      for (let r=0;r<H;r++) {
        for (let c=0;c<W;c++) {
          const i=r*W+c;
          if(isND(dem[i])) continue;   // NoData cell: leave fd=0
          const elev=dem[i];
          let best=-Infinity, bestD=0;
          for (let dd=0;dd<8;dd++) {
            const [dr,dc]=D8[dd];
            const nr=r+dr, nc=c+dc;
            // Out-of-bounds or NoData neighbour → acts as a drainage outlet
            // (infinite slope toward it, matching SAGA's seeding rule)
            if(nr<0||nr>=H||nc<0||nc>=W||isND(dem[nr*W+nc])) {
              if(Infinity>best){best=Infinity;bestD=dd;}
              continue;
            }
            const dist=(dr&&dc)?Math.sqrt((dc*csx)**2+(dr*csy)**2):(dc===0?csy:csx);
            const slp=(elev-dem[nr*W+nc])/dist;
            if(slp>best){best=slp;bestD=dd;}
          }
          if(best>0||best===Infinity) fd[i]=CODES[bestD];
        }
      }
      return fd;
    }`;

  /**
   * Worker body for computeAccum (topological sort).
   * Receives { fd: Uint8Array, W, H }
   * Returns Int32Array (flow accumulation).
   */
  const ACCUM_WORKER = `
    function workerFn(d) {
      const { W, H } = d;
      const fd    = new Uint8Array(d.fd);
      const n     = W*H;
      const D8    = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
      const CODES = [1,2,4,8,16,32,64,128];
      const CODE_TO_DIR = new Int8Array(256).fill(-1);
      CODES.forEach((c,i)=>(CODE_TO_DIR[c]=i));
      const accum = new Int32Array(n).fill(1);
      const indeg = new Uint16Array(n);
      for (let i=0;i<n;i++) {
        const dd=CODE_TO_DIR[fd[i]]; if(dd<0) continue;
        const r=(i/W)|0,c=i%W,[dr,dc]=D8[dd];
        const nr=r+dr,nc=c+dc;
        if(nr<0||nr>=H||nc<0||nc>=W) continue;
        indeg[nr*W+nc]++;
      }
      const q=[]; let qi=0;
      for(let i=0;i<n;i++) if(indeg[i]===0) q.push(i);
      while(qi<q.length) {
        const i=q[qi++];
        const dd=CODE_TO_DIR[fd[i]]; if(dd<0) continue;
        const r=(i/W)|0,c=i%W,[dr,dc]=D8[dd];
        const nr=r+dr,nc=c+dc;
        if(nr<0||nr>=H||nc<0||nc>=W) continue;
        const ni=nr*W+nc;
        accum[ni]+=accum[i];
        if(--indeg[ni]===0) q.push(ni);
      }
      return accum;
    }`;

  /**
   * Worker body for delineateBasin (upstream BFS).
   * Receives { fd: Uint8Array, W, H, col, row }
   * Returns Uint8Array (basin mask).
   */
  const BASIN_WORKER = `
    function workerFn(d) {
      const { W, H, col, row } = d;
      const fd  = new Uint8Array(d.fd);
      const D8  = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
      const CODES = [1,2,4,8,16,32,64,128];
      const CODE_TO_DIR = new Int8Array(256).fill(-1);
      CODES.forEach((c,i)=>(CODE_TO_DIR[c]=i));
      const REV = Uint8Array.from({length:8},(_,i)=>(i+4)%8);
      const mask = new Uint8Array(W*H);
      const q = [row*W+col]; mask[q[0]]=1; let qi=0;
      while(qi<q.length){
        const i=q[qi++],r=(i/W)|0,c=i%W;
        for(let d=0;d<8;d++){
          const [dr,dc]=D8[d];
          const nr=r+dr,nc=c+dc;
          if(nr<0||nr>=H||nc<0||nc>=W) continue;
          const ni=nr*W+nc;
          if(mask[ni]) continue;
          if(CODE_TO_DIR[fd[ni]]===REV[d]){mask[ni]=1;q.push(ni);}
        }
      }
      return mask;
    }`;


  /**
   * Worker body for computeSubBasins.
   * BFS seeded from high-accumulation cells; each region >= minCells gets a unique ID.
   * Receives { fd, accum, basinMask, W, H, thr, minCells }
   * Returns Uint32Array of basin IDs (0 = unassigned).
   */
  /**
   * Sub-basin delineation — reach-based algorithm.
   *
   * A "reach" is a channel segment between two junctions (or between a headwater
   * and the first junction, or between the last junction and the outlet).
   * Every raster cell within the basin drains, via D8, into exactly one reach.
   * Grouping cells by their draining reach gives one sub-basin per reach.
   *
   * Steps:
   *  1. Mark channel cells  (accumB >= thr, inside basinMask).
   *  2. Count upstream-channel neighbours per channel cell → junctions (count >= 2).
   *  3. BFS along channel cells, splitting at junctions → reach IDs.
   *  4. For every non-channel basin cell, walk D8 downstream until hitting a
   *     channel cell → inherit that reach ID (hillslope → reach assignment).
   *  5. Merge reaches whose sub-basin area < minCells into the immediately
   *     downstream reach (so tiny slivers disappear).
   *
   * Receives { fd, accumB, basinMask, W, H, thr, minCells }
   * Returns  Uint32Array of sub-basin IDs (1-based; 0 = outside basin).
   */
  const SUBBASINS_WORKER = `
    function workerFn(d) {
      const { W, H, thr, minCells } = d;
      const fd        = new Uint8Array(d.fd);
      const accumB    = new Int32Array(d.accumB);
      const basinMask = new Uint8Array(d.basinMask);
      const n         = W * H;

      const CODES       = [1,2,4,8,16,32,64,128];
      const CODE_TO_DIR = new Int8Array(256).fill(-1);
      CODES.forEach((c,i) => (CODE_TO_DIR[c] = i));
      const D8  = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
      const REV = Uint8Array.from({length:8}, (_,i) => (i+4)%8);

      /* ── 1. channel mask ───────────────────────────────────────── */
      const isCh = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (basinMask[i] && accumB[i] >= thr) isCh[i] = 1;

      /* ── 2. count upstream channel neighbours (in-degree on channel graph) */
      const upCh = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (!isCh[i]) continue;
        const d = CODE_TO_DIR[fd[i]]; if (d < 0) continue;
        const r = (i/W)|0, c = i%W;
        const [dr,dc] = D8[d];
        const nr = r+dr, nc = c+dc;
        if (nr<0||nr>=H||nc<0||nc>=W) continue;
        const ni = nr*W+nc;
        if (isCh[ni]) upCh[ni]++;
      }

      /* ── 3. label reaches via topological BFS along channels ───── */
      //  Start a new reach at every junction outlet and every headwater tip.
      //  Walk downstream; every cell gets the reach ID of its upstream source,
      //  except at a junction where the highest-accum incoming branch wins
      //  (the others start new reaches — each tributary = distinct reach).

      const reachId = new Int32Array(n).fill(-1);  // -1 = unlabelled
      let   nextReach = 1;

      // Process channel cells in ASCENDING accumulation order (headwaters first).
      const chCells = [];
      for (let i = 0; i < n; i++) if (isCh[i]) chCells.push(i);
      chCells.sort((a,b) => accumB[a] - accumB[b]);

      for (const i of chCells) {
        if (reachId[i] >= 0) continue; // already labelled by a downstream pass
        // Start a new reach here (headwater or junction tributary)
        const rid = nextReach++;
        // Walk downstream along channel cells, assigning rid until we hit a
        // cell that already has a reach label or a junction (upCh >= 2).
        let cur = i;
        while (true) {
          if (reachId[cur] >= 0) break; // merge into existing reach — stop
          reachId[cur] = rid;
          // find downstream channel neighbour
          const ddir = CODE_TO_DIR[fd[cur]]; if (ddir < 0) break;
          const r = (cur/W)|0, c = cur%W;
          const [dr,dc] = D8[ddir];
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=H||nc<0||nc>=W) break;
          const ni = nr*W+nc;
          if (!isCh[ni]) break;
          // If the downstream cell is a junction AND is already labelled,
          // we stop — this tributary ends here.
          if (reachId[ni] >= 0) break;
          // If the downstream cell is a junction (upCh>=2) and not yet labelled,
          // label it with the current reach and stop so other tributaries can
          // start fresh reaches when they arrive.
          if (upCh[ni] >= 2) { reachId[ni] = rid; break; }
          cur = ni;
        }
      }

      /* ── 4. assign hillslope cells to their draining reach ──────── */
      const ids = new Uint32Array(n);
      // First assign channel cells
      for (let i = 0; i < n; i++) if (reachId[i] > 0) ids[i] = reachId[i];

      // Then propagate reach IDs upstream into non-channel cells.
      // Process in DESCENDING accumulation order so upstream cells are assigned
      // after their downstream channel neighbours.
      const allMasked = [];
      for (let i = 0; i < n; i++) if (basinMask[i] && !isCh[i]) allMasked.push(i);
      allMasked.sort((a,b) => accumB[b] - accumB[a]); // descending: near-channel cells first

      // Walk each non-channel cell downstream until hitting a labelled cell
      for (const start of allMasked) {
        if (ids[start]) continue;
        // trace downstream
        const path = [start];
        let cur = start;
        let foundId = 0;
        for (let step = 0; step < n; step++) {
          const ddir = CODE_TO_DIR[fd[cur]]; if (ddir < 0) break;
          const r=(cur/W)|0, c=cur%W;
          const [dr,dc]=D8[ddir];
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=H||nc<0||nc>=W) break;
          const ni=nr*W+nc;
          if (!basinMask[ni]) break;
          if (ids[ni]) { foundId = ids[ni]; break; }
          path.push(ni);
          cur = ni;
        }
        if (foundId) for (const p of path) ids[p] = foundId;
      }

      /* ── 5. merge sub-basins smaller than minCells ──────────────── */
      if (minCells > 1) {
        // count cells per reach
        const counts = new Map();
        for (let i = 0; i < n; i++) if (ids[i]) counts.set(ids[i], (counts.get(ids[i])||0)+1);

        // For each small reach, find what the outlet cell drains into and remap
        const remap = new Map();
        function resolve(id) {
          let cur = id;
          while (remap.has(cur)) cur = remap.get(cur);
          return cur;
        }

        // Order reaches by accum of their lowest-accum channel cell (outlet first)
        const reachOutlet = new Map(); // reach -> lowest accum channel cell
        for (let i = 0; i < n; i++) {
          if (!isCh[i] || reachId[i] < 0) continue;
          const rid = reachId[i];
          if (!reachOutlet.has(rid) || accumB[i] < accumB[reachOutlet.get(rid)])
            reachOutlet.set(rid, i);
        }

        const reachList = [...reachOutlet.keys()];
        reachList.sort((a,b) => accumB[reachOutlet.get(a)] - accumB[reachOutlet.get(b)]);

        for (const rid of reachList) {
          const resolved = resolve(rid);
          const cnt = counts.get(resolved) || 0;
          if (cnt >= minCells) continue;
          // find downstream reach of the outlet cell of this reach
          const outCell = reachOutlet.get(rid);
          const ddir = CODE_TO_DIR[fd[outCell]]; if (ddir < 0) continue;
          const r=(outCell/W)|0, c=outCell%W;
          const [dr,dc]=D8[ddir];
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=H||nc<0||nc>=W) continue;
          const ni=nr*W+nc;
          const downReach = resolve(ids[ni]);
          if (!downReach || downReach === resolved) continue;
          // merge resolved into downReach
          remap.set(resolved, downReach);
          counts.set(downReach, (counts.get(downReach)||0) + cnt);
          counts.delete(resolved);
        }

        if (remap.size > 0) {
          for (let i = 0; i < n; i++) {
            if (!ids[i]) continue;
            ids[i] = resolve(ids[i]);
          }
        }
      }

      /* ── 6. compact IDs to 1..K ─────────────────────────────────── */
      const idMap = new Map();
      let compact = 1;
      for (let i = 0; i < n; i++) {
        if (!ids[i]) continue;
        if (!idMap.has(ids[i])) idMap.set(ids[i], compact++);
        ids[i] = idMap.get(ids[i]);
      }

      return ids;
    }`;

  /* CPU mirror — identical algorithm, uses module-level constants */
  function _subBasinsCPU(fd, accumB, basinMask, W, H, thr, minCells) {
    const n = W * H;
    const isCh = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (basinMask[i] && accumB[i] >= thr) isCh[i] = 1;

    const upCh = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!isCh[i]) continue;
      const d = CODE_TO_DIR[fd[i]]; if (d < 0) continue;
      const r = (i/W)|0, c = i%W;
      const [dr,dc] = D8_DIRS[d];
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>=H||nc<0||nc>=W) continue;
      const ni=nr*W+nc;
      if (isCh[ni]) upCh[ni]++;
    }

    const reachId = new Int32Array(n).fill(-1);
    let nextReach = 1;
    const chCells = [];
    for (let i = 0; i < n; i++) if (isCh[i]) chCells.push(i);
    chCells.sort((a,b) => accumB[a] - accumB[b]);

    for (const i of chCells) {
      if (reachId[i] >= 0) continue;
      const rid = nextReach++;
      let cur = i;
      while (true) {
        if (reachId[cur] >= 0) break;
        reachId[cur] = rid;
        const ddir = CODE_TO_DIR[fd[cur]]; if (ddir < 0) break;
        const r=(cur/W)|0, c=cur%W;
        const [dr,dc]=D8_DIRS[ddir];
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=H||nc<0||nc>=W) break;
        const ni=nr*W+nc;
        if (!isCh[ni]) break;
        if (reachId[ni] >= 0) break;
        if (upCh[ni] >= 2) { reachId[ni] = rid; break; }
        cur = ni;
      }
    }

    const ids = new Uint32Array(n);
    for (let i = 0; i < n; i++) if (reachId[i] > 0) ids[i] = reachId[i];

    const allMasked = [];
    for (let i = 0; i < n; i++) if (basinMask[i] && !isCh[i]) allMasked.push(i);
    allMasked.sort((a,b) => accumB[b] - accumB[a]); // descending: near-channel cells first

    for (const start of allMasked) {
      if (ids[start]) continue;
      const path = [start];
      let cur = start, foundId = 0;
      for (let step = 0; step < n; step++) {
        const ddir = CODE_TO_DIR[fd[cur]]; if (ddir < 0) break;
        const r=(cur/W)|0, c=cur%W;
        const [dr,dc]=D8_DIRS[ddir];
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=H||nc<0||nc>=W) break;
        const ni=nr*W+nc;
        if (!basinMask[ni]) break;
        if (ids[ni]) { foundId = ids[ni]; break; }
        path.push(ni); cur = ni;
      }
      if (foundId) for (const p of path) ids[p] = foundId;
    }

    if (minCells > 1) {
      const counts = new Map();
      for (let i = 0; i < n; i++) if (ids[i]) counts.set(ids[i], (counts.get(ids[i])||0)+1);
      const remap = new Map();
      function resolve(id) { let c=id; while(remap.has(c)) c=remap.get(c); return c; }
      const reachOutlet = new Map();
      for (let i = 0; i < n; i++) {
        if (!isCh[i] || reachId[i] < 0) continue;
        const rid = reachId[i];
        if (!reachOutlet.has(rid) || accumB[i] < accumB[reachOutlet.get(rid)])
          reachOutlet.set(rid, i);
      }
      const reachList = [...reachOutlet.keys()];
      reachList.sort((a,b) => accumB[reachOutlet.get(a)] - accumB[reachOutlet.get(b)]);
      for (const rid of reachList) {
        const resolved = resolve(rid);
        const cnt = counts.get(resolved)||0;
        if (cnt >= minCells) continue;
        const outCell = reachOutlet.get(rid);
        const ddir = CODE_TO_DIR[fd[outCell]]; if (ddir < 0) continue;
        const r=(outCell/W)|0, c=outCell%W;
        const [dr,dc]=D8_DIRS[ddir];
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=H||nc<0||nc>=W) continue;
        const ni=nr*W+nc;
        const downReach = resolve(ids[ni]);
        if (!downReach || downReach === resolved) continue;
        remap.set(resolved, downReach);
        counts.set(downReach, (counts.get(downReach)||0)+cnt);
        counts.delete(resolved);
      }
      if (remap.size > 0)
        for (let i = 0; i < n; i++) if (ids[i]) ids[i] = resolve(ids[i]);
    }

    const idMap = new Map(); let compact = 1;
    for (let i = 0; i < n; i++) {
      if (!ids[i]) continue;
      if (!idMap.has(ids[i])) idMap.set(ids[i], compact++);
      ids[i] = idMap.get(ids[i]);
    }
    return ids;
  }

  async function computeSubBasins(fd, accumB, W, H, basinMask, thr, minCells) {
    try {
      if (typeof Worker !== "undefined") {
        const fdBuf   = fd.buffer.slice(0);
        const acBuf   = accumB.buffer.slice(0);
        const mskBuf  = basinMask.buffer.slice(0);
        const result  = await runInWorker(SUBBASINS_WORKER,
          { fd: fdBuf, accumB: acBuf, basinMask: mskBuf, W, H, thr, minCells },
          [fdBuf, acBuf, mskBuf]);
        return result; // Uint32Array
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("[Watershed] Sub-basin worker failed, falling back to CPU.", e);
    }
    return _subBasinsCPU(fd, accumB, basinMask, W, H, thr, minCells);
  }


  /**
   * Worker body for channelsToGeoJSON.
   * Receives { fd, accumB, W, H, thr, extent, unprojectFnSrc }
   * Returns plain object { features: Array, maxOrder: number } — serialised as JSON string.
   */
  const CHANNELS_WORKER = `
    function workerFn(d) {
      const { W, H, thr, minX, maxY, cellW, cellH } = d;
      const fd     = new Uint8Array(d.fd);
      const accumB = new Int32Array(d.accumB);
      const n      = W*H;
      const D8     = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
      const CODES  = [1,2,4,8,16,32,64,128];
      const CTD    = new Int8Array(256).fill(-1);
      CODES.forEach((c,i)=>(CTD[c]=i));
      const REV    = Uint8Array.from({length:8},(_,i)=>(i+4)%8);

      // Simple Web Mercator → lon/lat (matches unprojectRasterPoint for EPSG:3857)
      // For geographic DEMs cellW/cellH are already degrees — pass isProjDeg flag.
      function toCoord(col,row){
        const mx = minX + (col+0.5)*cellW;
        const my = maxY - (row+0.5)*cellH;
        if(d.isGeographic) return [mx, my];
        // Web Mercator inverse
        const lng = mx/20037508.34*180;
        const lat = (Math.atan(Math.exp(my/20037508.34*Math.PI))*2-Math.PI/2)*180/Math.PI;
        return [lng, lat];
      }

      const isCh  = new Uint8Array(n);
      for(let i=0;i<n;i++) if(accumB[i]>=thr) isCh[i]=1;

      const upCnt = new Uint8Array(n);
      for(let i=0;i<n;i++){
        if(!isCh[i]) continue;
        const dd=CTD[fd[i]]; if(dd<0) continue;
        const r=(i/W)|0,c=i%W,[dr,dc]=D8[dd];
        const nr=r+dr,nc=c+dc;
        if(nr<0||nr>=H||nc<0||nc>=W) continue;
        if(isCh[nr*W+nc]) upCnt[nr*W+nc]++;
      }

      const strahler=new Uint8Array(n);
      const indeg=new Int32Array(n);
      for(let i=0;i<n;i++){
        if(!isCh[i]) continue;
        const dd=CTD[fd[i]]; if(dd<0) continue;
        const r=(i/W)|0,c=i%W,[dr,dc]=D8[dd];
        const nr=r+dr,nc=c+dc;
        if(nr<0||nr>=H||nc<0||nc>=W) continue;
        if(isCh[nr*W+nc]) indeg[nr*W+nc]++;
      }
      const q0=[]; let qi0=0;
      for(let i=0;i<n;i++) if(isCh[i]&&indeg[i]===0) q0.push(i);
      while(qi0<q0.length){
        const i=q0[qi0++];
        const r=(i/W)|0,c=i%W;
        const ups=[];
        for(let d=0;d<8;d++){
          const [dr,dc]=D8[d];
          const nr=r+dr,nc=c+dc;
          if(nr<0||nr>=H||nc<0||nc>=W) continue;
          const ni=nr*W+nc;
          if(isCh[ni]&&CTD[fd[ni]]===REV[d]) ups.push(strahler[ni]);
        }
        if(ups.length===0){strahler[i]=1;}
        else{ups.sort((a,b)=>b-a);strahler[i]=(ups.length>=2&&ups[0]===ups[1])?ups[0]+1:ups[0];}
        const dd=CTD[fd[i]]; if(dd<0) continue;
        const [dr,dc]=D8[dd];
        const nr=((i/W)|0)+dr,nc=(i%W)+dc;
        if(nr<0||nr>=H||nc<0||nc>=W) continue;
        const ni=nr*W+nc;
        if(isCh[ni]&&--indeg[ni]===0) q0.push(ni);
      }
      let maxOrder=0;
      for(let i=0;i<n;i++) if(strahler[i]>maxOrder) maxOrder=strahler[i];

      const features=[];
      const visited=new Uint8Array(n);
      function emit(coords,startIdx){
        if(coords.length>=2) features.push({type:"Feature",properties:{order:strahler[startIdx],accumulation:accumB[startIdx]},geometry:{type:"LineString",coordinates:coords}});
      }
      for(let src=0;src<n;src++){
        if(!isCh[src]||upCnt[src]!==0||visited[src]) continue;
        let idx=src,coords=[],segStart=src;
        while(true){
          if(visited[idx]){coords.push(toCoord(idx%W,(idx/W)|0));emit(coords,segStart);break;}
          if(!isCh[idx]){emit(coords,segStart);break;}
          visited[idx]=1;
          coords.push(toCoord(idx%W,(idx/W)|0));
          const dd=CTD[fd[idx]]; if(dd<0){emit(coords,segStart);break;}
          const [dr,dc]=D8[dd];
          const nr=((idx/W)|0)+dr,nc=(idx%W)+dc;
          if(nr<0||nr>=H||nc<0||nc>=W){emit(coords,segStart);break;}
          const ni=nr*W+nc;
          const isConf=isCh[ni]&&upCnt[ni]>1;
          const isOrdChg=isCh[ni]&&strahler[ni]!==strahler[idx];
          if(isConf||isOrdChg){coords.push(toCoord(nc,nr));emit(coords,segStart);coords=[];segStart=ni;}
          idx=ni;
        }
      }
      return JSON.stringify({features,maxOrder});
    }`;

  /**
   * Worker body for basinToGeoJSON — GDAL Polygonize algorithm.
   *
   * GDAL Polygonize (gdal_polygonize.py / GDALPolygonize C) works in one
   * scanline pass over the raster.  Rather than iterating N×basins times
   * (once per basin ID over all cells), it processes every cell exactly
   * once and builds polygon rings incrementally:
   *
   *   1. Scan row by row, left to right.
   *   2. For each cell, detect which of its 4 edges (top/right/bottom/left)
   *      border a *different* value (or the raster boundary).  Each such
   *      border edge is a directed half-edge of the output polygon ring.
   *   3. Store half-edges in a hash-map keyed by their *start* node (integer
   *      pixel-corner coordinate encoded as a single 32-bit integer).
   *   4. After the full pass, chain edges into closed rings by following
   *      each start→end link until we return to the origin.
   *   5. Project pixel-corner coordinates to geographic lon/lat once, only
   *      for the vertices that survive into the final ring — no intermediate
   *      string keys, no per-basin array passes.
   *
   * Complexity: O(N) time, O(border_edges) space — vs the old O(N × basins).
   * For a 4000×4000 DEM with 500 sub-basins the old code made ~8 × 10^9
   * comparisons; this makes exactly 16 000 000.
   *
   * Receives  { basinIds: ArrayBuffer, W, H, minX, maxY, cw, ch, isGeographic }
   * Returns   JSON string { type:"FeatureCollection", features:[] }
   */
  const BASIN_GEO_WORKER = `
    function workerFn(d) {
      const { W, H, minX, maxY, cw, ch } = d;
      const ids    = new Uint32Array(d.basinIds);
      const stride = W + 1;

      // ── Coordinate projection ──────────────────────────────────────────
      function project(col, row) {
        const mx = minX + col * cw;
        const my = maxY - row * ch;
        if (d.isGeographic) return [mx, my];
        const lng = mx / 20037508.34 * 180;
        const lat = (Math.atan(Math.exp(my / 20037508.34 * Math.PI)) * 2 - Math.PI / 2) * 180 / Math.PI;
        return [lng, lat];
      }

      function nodeKey(col, row) { return row * stride + col; }
      function cellId(r, c)      { return (r >= 0 && r < H && c >= 0 && c < W) ? ids[r * W + c] : 0; }

      // ── Single O(N) scanline pass — collect directed border half-edges ──
      //
      // For each cell we emit up to 4 directed edges along borders where the
      // neighbour has a different basin ID.  Edges are directed so that the
      // basin interior is always to the RIGHT of the direction of travel
      // (standard GIS convention: exterior rings are CCW in lon/lat space).
      //
      // Edge map: basinId → Map< fromKey, toKey[] >
      // We store toKey[] (array) because a pixel-corner can be the source of
      // multiple edges when a basin has holes or is non-simply-connected.
      // Using a single-slot map caused the previous "pixel polygon" bug.
      //
      const basinEdges  = new Map();  // id → Map<from, to[]>
      const basinCounts = new Map();  // id → cell count

      function addEdge(id, c1, r1, c2, r2) {
        let em = basinEdges.get(id);
        if (!em) { em = new Map(); basinEdges.set(id, em); }
        const k = nodeKey(c1, r1);
        const v = nodeKey(c2, r2);
        const arr = em.get(k);
        if (arr === undefined) em.set(k, [v]); else arr.push(v);
      }

      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) {
          const id = ids[r * W + c];
          if (!id) continue;
          basinCounts.set(id, (basinCounts.get(id) || 0) + 1);
          // Top edge (interior to the right → directed left-to-right)
          if (cellId(r - 1, c) !== id) addEdge(id, c,     r,     c + 1, r);
          // Right edge (interior to the right → directed top-to-bottom)
          if (cellId(r, c + 1) !== id) addEdge(id, c + 1, r,     c + 1, r + 1);
          // Bottom edge (interior to the right → directed right-to-left)
          if (cellId(r + 1, c) !== id) addEdge(id, c + 1, r + 1, c,     r + 1);
          // Left edge (interior to the right → directed bottom-to-top)
          if (cellId(r, c - 1) !== id) addEdge(id, c,     r + 1, c,     r);
        }
      }

      // ── Collinear vertex removal ───────────────────────────────────────
      // Removes intermediate vertices on straight axis-aligned runs.
      // Reduces vertex count ~70% for raster polygons.
      function simplifyCollinear(ring) {
        if (ring.length <= 4) return ring;
        const out = [ring[0]];
        for (let i = 1; i < ring.length - 1; i++) {
          const [px, py] = ring[i - 1], [cx, cy] = ring[i], [nx, ny] = ring[i + 1];
          if (!((px === cx && cx === nx) || (py === cy && cy === ny)))
            out.push(ring[i]);
        }
        out.push(ring[ring.length - 1]);
        return out;
      }

      // ── Ring-chaining (GDAL Polygonize edge-walking) ──────────────────
      //
      // Algorithm:
      //   For each basin, scan all nodes in its edge map.
      //   When a node still has unconsumed outgoing edges, start a NEW ring
      //   from that node and walk forward, consuming one edge per step, until
      //   we arrive back at the RING ORIGIN (not the startKey iteration var).
      //   This correctly handles:
      //     • Multiple exterior rings (non-contiguous basin)
      //     • Interior holes (separate CW rings)
      //     • Nodes with 2+ outgoing edges (touching corners)
      //
      function signedArea2(ring) {
        // Returns 2x signed area (shoelace). Positive = CCW = exterior.
        let a = 0;
        for (let i = 0, n = ring.length - 1; i < n; i++)
          a += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
        return a;
      }

      function pointInRing(pt, ring) {
        const [px, py] = pt;
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j];
          if ((yi > py) !== (yj > py) &&
              px < (xj - xi) * (py - yi) / (yj - yi) + xi)
            inside = !inside;
        }
        return inside;
      }

      const features = [];

      for (const [id, em] of basinEdges) {
        const rings = [];

        for (const [iterKey, iterTargets] of em) {
          // Keep starting new rings from this node as long as it has edges
          while (iterTargets.length > 0) {
            const originKey = iterKey;   // the node THIS ring must return to
            const ring = [];
            let curKey = originKey;
            const maxSteps = em.size + 4;

            for (let step = 0; step < maxSteps; step++) {
              // Emit current vertex
              ring.push(project(curKey % stride, (curKey / stride) | 0));

              // Consume one outgoing edge from curKey
              const targets = em.get(curKey);
              if (!targets || targets.length === 0) break; // dangling edge

              const nextKey = targets.shift();

              // Did we close the ring?
              if (nextKey === originKey) {
                ring.push(ring[0]); // closing vertex = copy of first
                break;
              }

              curKey = nextKey;
            }

            if (ring.length >= 4) rings.push(simplifyCollinear(ring));
          }
        }

        if (!rings.length) continue;

        // Classify rings: CCW (area > 0) = exterior, CW (area < 0) = hole
        // Rings are traced with interior to the right in raster space (y-down),
        // which produces CW winding in geographic space (y-up/lat).
        // CW in [lng,lat] → negative shoelace area → these are the exteriors.
        const exteriors = rings.filter(r => signedArea2(r) < 0);
        const holes     = rings.filter(r => signedArea2(r) >= 0);

        if (!exteriors.length) continue;

        const cellCount = basinCounts.get(id) || 0;

        if (exteriors.length === 1) {
          // One contiguous region — simple Polygon
          features.push({
            type:       "Feature",
            properties: { basin_id: id, cell_count: cellCount },
            geometry:   { type: "Polygon", coordinates: [exteriors[0], ...holes] },
          });
        } else {
          // Non-contiguous basin — MultiPolygon, one polygon per exterior ring
          const polygons = exteriors.map(ext => [
            ext, ...holes.filter(h => pointInRing(h[0], ext))
          ]);
          features.push({
            type:       "Feature",
            properties: { basin_id: id, cell_count: cellCount },
            geometry:   { type: "MultiPolygon", coordinates: polygons },
          });
        }
      }

      return JSON.stringify({ type: "FeatureCollection", features });
    }`;



    /* ────────────────────────────────────────────────────────────
     Async wrappers that auto-detect GPU / workers
     ──────────────────────────────────────────────────────────── */

  async function fillSinks(dem, W, H, minSlope, csx, csy, noData) {
    try {
      // fillSinks is inherently sequential (heap), but run it off-thread
      // so the UI stays alive during the long computation.
      if (typeof Worker !== "undefined") {
        // Transfer the buffer directly (no .slice copy) to halve peak memory.
        // The caller must not use `dem` after this call.
        const buf = dem.buffer;
        const result = await runInWorker(FILL_SINKS_WORKER, { dem: buf, W, H, minSlope, csx, csy, noData: noData !== undefined && !Number.isNaN(noData) ? noData : null }, [buf]);
        return result;
      }
    } catch (e) {
      console.warn("[Watershed] Worker fillSinks failed, falling back to main thread.", e);
    }
    // Synchronous CPU fallback (Wang & Liu)
    return _fillSinksCPU(dem, W, H, minSlope, csx, csy, noData);
  }

  function _fillSinksCPU(dem, W, H, minSlope, csx, csy, noData) {
    // Use Float64 internally — Float32's ~7 significant digits can't represent
    // minSlope increments (e.g. 0.003 m) added to high elevations (e.g. 4000 m).
    const filled   = new Float64Array(W * H);
    for (let i = 0; i < W * H; i++) filled[i] = dem[i];
    const inQueue  = new Uint8Array(W * H);
    const heap     = new Heap();
    const SQRT2    = Math.SQRT2;
    const cellAvg  = (csx + csy) * 0.5;
    const DIST     = D8_DIRS.map(([dr,dc]) => (dr && dc ? SQRT2 : 1.0) * cellAvg);
    const ndVal    = (noData !== undefined && !Number.isNaN(noData)) ? noData : null;
    const isND     = (v) => ndVal !== null ? v === ndVal : !isFinite(v);

    // Replace NoData cells with +Infinity in filled so they never fill
    for (let i = 0; i < W * H; i++) { if (isND(dem[i])) filled[i] = Infinity; }

    // Seed: edge cells + any valid cell adjacent to a NoData or out-of-bounds neighbour
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const i = r*W+c;
        if (isND(dem[i])) continue;
        let isSeed = (r===0 || r===H-1 || c===0 || c===W-1);
        if (!isSeed) {
          for (let d = 0; d < 8; d++) {
            const nr = r + D8_DIRS[d][0], nc = c + D8_DIRS[d][1];
            if (nr < 0 || nr >= H || nc < 0 || nc >= W || isND(dem[nr*W+nc])) {
              isSeed = true; break;
            }
          }
        }
        if (isSeed && !inQueue[i]) { inQueue[i] = 1; heap.push(filled[i], i); }
      }
    }
    while (heap.size > 0) {
      const [elev, idx] = heap.pop();
      const r = (idx/W)|0, c = idx%W;
      for (let d = 0; d < 8; d++) {
        const [dr, dc] = D8_DIRS[d];
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=H||nc<0||nc>=W) continue;
        const ni = nr*W+nc;
        if (inQueue[ni] || isND(dem[ni])) continue;
        inQueue[ni] = 1;
        const minFill = elev + minSlope * DIST[d];
        if (filled[ni] < minFill) filled[ni] = minFill;
        heap.push(filled[ni], ni);
      }
    }
    // Convert back to Float32 — flow-dir only needs relative order
    const out = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = filled[i];
    return out;
  }

  async function computeFlowDir(dem, W, H, csx, csy, noData) {
    // Try GPU first — D8 per-cell is embarrassingly parallel
    const gl = getGL();
    if (gl) {
      try {
        const fd = gpuFlowDir(gl, dem, W, H, csx, csy, noData);
        if (fd) {
          console.info("[Watershed] D8 flow direction computed on GPU.");
          return fd;
        }
      } catch (e) {
        console.warn("[Watershed] GPU flowDir failed, falling back.", e);
        _gpuOk = false;   // don't retry GPU this session
      }
    }
    // Worker CPU fallback
    try {
      if (typeof Worker !== "undefined") {
        const buf = dem.buffer;   // transfer directly — no copy
        return await runInWorker(FLOW_DIR_WORKER, { dem: buf, W, H, csx, csy, noData: noData !== undefined && !Number.isNaN(noData) ? noData : null }, [buf]);
      }
    } catch (e) {
      console.warn("[Watershed] Worker flowDir failed, falling back to main thread.", e);
    }
    return _flowDirCPU(dem, W, H, csx, csy, noData);
  }

  function _flowDirCPU(dem, W, H, csx, csy, noData) {
    const fd = new Uint8Array(W * H);
    const ndVal = (noData !== undefined && !Number.isNaN(noData)) ? noData : null;
    const isND  = (v) => ndVal !== null ? v === ndVal : !isFinite(v);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const i = r*W+c;
        if (isND(dem[i])) continue;   // NoData cell: leave fd=0
        const elev = dem[i];
        let best = -Infinity, bestD = 0;
        for (let d = 0; d < 8; d++) {
          const [dr, dc] = D8_DIRS[d];
          const nr = r+dr, nc = c+dc;
          // Out-of-bounds or NoData neighbour acts as drainage outlet
          if (nr < 0 || nr >= H || nc < 0 || nc >= W || isND(dem[nr*W+nc])) {
            if (Infinity > best) { best = Infinity; bestD = d; }
            continue;
          }
          const dist = (dr && dc) ? Math.sqrt((dc*csx)**2+(dr*csy)**2) : (dc===0?csy:csx);
          const slope = (elev - dem[nr*W+nc]) / dist;
          if (slope > best) { best = slope; bestD = d; }
        }
        if (best > 0 || best === Infinity) fd[i] = D8_CODES[bestD];
      }
    }
    return fd;
  }

  async function computeAccum(fd, W, H) {
    try {
      if (typeof Worker !== "undefined") {
        // fd is still needed after this call (delineateBasin, channelsToGeoJSON, etc.)
        // so we must copy the buffer rather than transfer it.
        const buf = fd.buffer.slice(0);
        return await runInWorker(ACCUM_WORKER, { fd: buf, W, H }, [buf]);
      }
    } catch (e) {
      console.warn("[Watershed] Worker accum failed, falling back to main thread.", e);
    }
    return _accumCPU(fd, W, H);
  }

  function _accumCPU(fd, W, H) {
    const n     = W * H;
    const accum = new Int32Array(n).fill(1);
    const indeg = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      const d = CODE_TO_DIR[fd[i]]; if (d < 0) continue;
      const r=(i/W)|0, c=i%W, [dr,dc]=D8_DIRS[d];
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>=H||nc<0||nc>=W) continue;
      indeg[nr*W+nc]++;
    }
    const q = []; let qi = 0;
    for (let i = 0; i < n; i++) if (indeg[i]===0) q.push(i);
    while (qi < q.length) {
      const i = q[qi++];
      const d = CODE_TO_DIR[fd[i]]; if (d < 0) continue;
      const r=(i/W)|0, c=i%W, [dr,dc]=D8_DIRS[d];
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>=H||nc<0||nc>=W) continue;
      const ni=nr*W+nc;
      accum[ni]+=accum[i];
      if (--indeg[ni]===0) q.push(ni);
    }
    return accum;
  }

  /* ── 4. Snap pour point to nearest high-accum cell ───────── */

  function snapToStream(col, row, accum, W, H, thr, searchR) {
    let bIdx = row*W + col, bA = accum[bIdx];
    for (let ring = 1; ring <= searchR; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const nr = row+dr, nc = col+dc;
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          const ni = nr*W + nc;
          if (accum[ni] > bA) { bA = accum[ni]; bIdx = ni; }
        }
      }
      if (bA >= thr) break;   // found a stream cell – stop searching
    }
    return bA >= thr ? bIdx : row*W + col;
  }

  /* ── 5. Basin delineation — upstream BFS from pour point ─── */

  async function delineateBasin(fd, W, H, col, row) {
    try {
      if (typeof Worker !== "undefined") {
        const buf = fd.buffer.slice(0);
        return await runInWorker(BASIN_WORKER, { fd: buf, W, H, col, row }, [buf]);
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("[Watershed] Worker basin failed, falling back.", e);
    }
    return _delineateBasinCPU(fd, W, H, col, row);
  }

  function _delineateBasinCPU(fd, W, H, col, row) {
    const mask = new Uint8Array(W * H);
    const q = [row*W + col]; mask[q[0]] = 1; let qi = 0;
    while (qi < q.length) {
      const i = q[qi++], r = (i/W)|0, c = i%W;
      for (let d = 0; d < 8; d++) {
        const [dr, dc] = D8_DIRS[d];
        const nr = r+dr, nc = c+dc;
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
        const ni = nr*W + nc;
        if (mask[ni]) continue;
        if (CODE_TO_DIR[fd[ni]] === REV[d]) { mask[ni] = 1; q.push(ni); }
      }
    }
    return mask;
  }

  /* ── 6. Polygon → raster mask (scanline fill) ────────────── */

  function polyToMask(latlngs, transform, W, H) {
    const mask = new Uint8Array(W * H);
    // Project each vertex to pixel space
    const pts = latlngs.map(ll => {
      const [rx, ry] = transform.projectLatLngToRaster(ll);
      return transform.rasterToPixel(rx, ry);
    });
    const n = pts.length;
    for (let row = 0; row < H; row++) {
      const xs = [];
      for (let i = 0, j = n-1; i < n; j = i++) {
        const [x1, y1] = pts[j], [x2, y2] = pts[i];
        if ((y1 < row && y2 >= row) || (y2 < row && y1 >= row))
          xs.push(x1 + (row - y1) / (y2 - y1) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k < xs.length - 1; k += 2) {
        const c0 = Math.max(0, Math.ceil(xs[k]));
        const c1 = Math.min(W-1, Math.floor(xs[k+1]));
        for (let c = c0; c <= c1; c++) mask[row*W + c] = 1;
      }
    }
    return mask;
  }

  /* ── 7. Canvas → raster mask (whole DEM is the AOI) ──────── */

  function canvasToMask(W, H) {
    const mask = new Uint8Array(W * H).fill(1);
    // Leave a 1-cell border unmasked so border cells remain sinks
    for (let r = 0; r < H; r++) {
      if (r === 0 || r === H-1) { for (let c = 0; c < W; c++) mask[r*W+c] = 0; continue; }
      mask[r*W] = 0; mask[r*W + W-1] = 0;
    }
    return mask;
  }

  /* ── 9. Channel network → GeoJSON LineStrings ────────────── */

  async function channelsToGeoJSON(fd, accumB, transform, W, H, thr) {
    const ext   = transform.extent;
    const cellW = (ext.maxX - ext.minX) / W;
    const cellH = (ext.maxY - ext.minY) / H;
    // Detect whether the CRS is geographic (degrees) or projected (metres).
    // Use both axes: geographic extents are always within ±180/±90.
    const isGeographic = Math.abs(ext.maxX) <= 180 && Math.abs(ext.maxY) <= 90;

    // Workers have no access to proj4, so they can only handle geographic CRS
    // (pass-through) or Web Mercator (built-in inverse formula).
    // For any projected local CRS (e.g. UTM EPSG:32643) skip the worker and
    // fall straight to the CPU path which calls transform.unprojectRasterPoint.
    if (!isGeographic) return _channelsCPU(fd, accumB, transform, W, H, thr);

    try {
      if (typeof Worker !== "undefined") {
        const fdBuf  = fd.buffer.slice(0);
        const acBuf  = accumB.buffer.slice(0);
        const raw = await runInWorker(CHANNELS_WORKER, {
          fd: fdBuf, accumB: acBuf, W, H, thr,
          minX: ext.minX, maxY: ext.maxY, cellW, cellH, isGeographic,
        }, [fdBuf, acBuf]);
        const { features, maxOrder } = JSON.parse(raw);
        return { geojson: { type: "FeatureCollection", features }, maxOrder };
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("[Watershed] Worker channels failed, falling back.", e);
    }
    return _channelsCPU(fd, accumB, transform, W, H, thr);
  }

  function _channelsCPU(fd, accumB, transform, W, H, thr) {
    const n    = W * H;
    const ext  = transform.extent;
    const cellW = (ext.maxX - ext.minX) / W;
    const cellH = (ext.maxY - ext.minY) / H;

    function toCoord(col, row) {
      const pt = transform.unprojectRasterPoint(
        ext.minX + (col + 0.5) * cellW,
        ext.maxY - (row + 0.5) * cellH
      );
      return [pt.lng, pt.lat];
    }

    const isCh = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (accumB[i] >= thr) isCh[i] = 1;

    const upCnt = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!isCh[i]) continue;
      const d = CODE_TO_DIR[fd[i]]; if (d < 0) continue;
      const r = (i/W)|0, c = i%W, [dr, dc] = D8_DIRS[d];
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const ni = nr*W + nc;
      if (isCh[ni]) upCnt[ni]++;
    }

    const strahler = new Uint8Array(n);
    const indeg    = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      if (!isCh[i]) continue;
      const d = CODE_TO_DIR[fd[i]]; if (d < 0) continue;
      const r = (i/W)|0, c = i%W, [dr, dc] = D8_DIRS[d];
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const ni = nr*W + nc;
      if (isCh[ni]) indeg[ni]++;
    }
    const q0 = []; let qi0 = 0;
    for (let i = 0; i < n; i++) if (isCh[i] && indeg[i] === 0) q0.push(i);
    while (qi0 < q0.length) {
      const i = q0[qi0++];
      const r = (i/W)|0, c = i%W;
      const ups = [];
      for (let d = 0; d < 8; d++) {
        const [dr, dc] = D8_DIRS[d];
        const nr = r+dr, nc = c+dc;
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
        const ni = nr*W + nc;
        if (isCh[ni] && CODE_TO_DIR[fd[ni]] === REV[d]) ups.push(strahler[ni]);
      }
      if (ups.length === 0) { strahler[i] = 1; }
      else { ups.sort((a, b) => b - a); strahler[i] = (ups.length >= 2 && ups[0] === ups[1]) ? ups[0] + 1 : ups[0]; }
      const dd = CODE_TO_DIR[fd[i]]; if (dd < 0) continue;
      const [dr, dc] = D8_DIRS[dd];
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const ni = nr*W + nc;
      if (isCh[ni] && --indeg[ni] === 0) q0.push(ni);
    }
    let maxOrder = 0;
    for (let i = 0; i < n; i++) if (strahler[i] > maxOrder) maxOrder = strahler[i];

    const features = [];
    const visited  = new Uint8Array(n);
    function emit(coords, startIdx) {
      if (coords.length >= 2) features.push({ type: "Feature", properties: { order: strahler[startIdx], accumulation: accumB[startIdx] }, geometry: { type: "LineString", coordinates: coords } });
    }
    for (let src = 0; src < n; src++) {
      if (!isCh[src] || upCnt[src] !== 0 || visited[src]) continue;
      let idx = src, coords = [], segStart = src;
      while (true) {
        if (visited[idx]) { coords.push(toCoord(idx % W, (idx / W) | 0)); emit(coords, segStart); break; }
        if (!isCh[idx]) { emit(coords, segStart); break; }
        visited[idx] = 1;
        coords.push(toCoord(idx % W, (idx / W) | 0));
        const dd = CODE_TO_DIR[fd[idx]];
        if (dd < 0) { emit(coords, segStart); break; }
        const [dr, dc] = D8_DIRS[dd];
        const nr = ((idx / W) | 0) + dr, nc = (idx % W) + dc;
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) { emit(coords, segStart); break; }
        const ni = nr*W + nc;
        const isConfluence  = isCh[ni] && upCnt[ni] > 1;
        const isOrderChange = isCh[ni] && strahler[ni] !== strahler[idx];
        if (isConfluence || isOrderChange) { coords.push(toCoord(nc, nr)); emit(coords, segStart); coords = []; segStart = ni; }
        idx = ni;
      }
    }
    return { geojson: { type: "FeatureCollection", features }, maxOrder };
  }

  /* ── 10. Basin IDs → GeoJSON Polygons (edge tracing) ──────── */

  async function basinToGeoJSON(basinIds, W, H, transform) {
    const ext = transform.extent;
    const cw  = (ext.maxX - ext.minX) / W;
    const ch  = (ext.maxY - ext.minY) / H;
    // Use both axes for geographic detection — see channelsToGeoJSON comment.
    const isGeographic = Math.abs(ext.maxX) <= 180 && Math.abs(ext.maxY) <= 90;

    // Workers have no proj4 — skip to CPU path for projected local CRS.
    if (!isGeographic) return _basinGeoCPU(basinIds, W, H, transform);

    try {
      if (typeof Worker !== "undefined") {
        const buf = basinIds.buffer.slice(0);
        const raw = await runInWorker(BASIN_GEO_WORKER, {
          basinIds: buf, W, H,
          minX: ext.minX, maxY: ext.maxY, cw, ch, isGeographic,
        }, [buf]);
        return JSON.parse(raw);
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("[Watershed] Worker basinGeo failed, falling back.", e);
    }
    return _basinGeoCPU(basinIds, W, H, transform);
  }

  function _basinGeoCPU(basinIds, W, H, transform) {
    const ext    = transform.extent;
    const cw     = (ext.maxX - ext.minX) / W;
    const ch     = (ext.maxY - ext.minY) / H;
    const stride = W + 1;

    function project(col, row) {
      const pt = transform.unprojectRasterPoint(ext.minX + col * cw, ext.maxY - row * ch);
      return [pt.lng, pt.lat];
    }
    function nodeKey(col, row) { return row * stride + col; }
    function cellId(r, c) { return (r >= 0 && r < H && c >= 0 && c < W) ? basinIds[r * W + c] : 0; }

    const basinEdges  = new Map();
    const basinCounts = new Map();

    function addEdge(id, c1, r1, c2, r2) {
      let em = basinEdges.get(id);
      if (!em) { em = new Map(); basinEdges.set(id, em); }
      const k = nodeKey(c1, r1), v = nodeKey(c2, r2);
      const arr = em.get(k);
      if (arr === undefined) em.set(k, [v]); else arr.push(v);
    }

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const id = basinIds[r * W + c];
        if (!id) continue;
        basinCounts.set(id, (basinCounts.get(id) || 0) + 1);
        if (cellId(r - 1, c) !== id) addEdge(id, c,     r,     c + 1, r);
        if (cellId(r, c + 1) !== id) addEdge(id, c + 1, r,     c + 1, r + 1);
        if (cellId(r + 1, c) !== id) addEdge(id, c + 1, r + 1, c,     r + 1);
        if (cellId(r, c - 1) !== id) addEdge(id, c,     r + 1, c,     r);
      }
    }

    function simplifyCollinear(ring) {
      if (ring.length <= 4) return ring;
      const out = [ring[0]];
      for (let i = 1; i < ring.length - 1; i++) {
        const [px, py] = ring[i - 1], [cx, cy] = ring[i], [nx, ny] = ring[i + 1];
        if (!((px === cx && cx === nx) || (py === cy && cy === ny))) out.push(ring[i]);
      }
      out.push(ring[ring.length - 1]);
      return out;
    }

    function signedArea2(ring) {
      let a = 0;
      for (let i = 0, n = ring.length - 1; i < n; i++)
        a += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
      return a;
    }

    function pointInRing(pt, ring) {
      const [px, py] = pt;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
          inside = !inside;
      }
      return inside;
    }

    const features = [];

    for (const [id, em] of basinEdges) {
      const rings = [];

      for (const [iterKey, iterTargets] of em) {
        while (iterTargets.length > 0) {
          const originKey = iterKey;
          const ring = [];
          let curKey = originKey;
          const maxSteps = em.size + 4;

          for (let step = 0; step < maxSteps; step++) {
            ring.push(project(curKey % stride, (curKey / stride) | 0));
            const targets = em.get(curKey);
            if (!targets || targets.length === 0) break;
            const nextKey = targets.shift();
            if (nextKey === originKey) { ring.push(ring[0]); break; }
            curKey = nextKey;
          }

          if (ring.length >= 4) rings.push(simplifyCollinear(ring));
        }
      }

      if (!rings.length) continue;

      // Rings are traced CW in geographic space → negative shoelace area = exterior.
      const exteriors = rings.filter(r => signedArea2(r) < 0);
      const holes     = rings.filter(r => signedArea2(r) >= 0);
      if (!exteriors.length) continue;

      const cellCount = basinCounts.get(id) || 0;
      if (exteriors.length === 1) {
        features.push({ type: "Feature",
          properties: { basin_id: id, cell_count: cellCount },
          geometry: { type: "Polygon", coordinates: [exteriors[0], ...holes] } });
      } else {
        const polygons = exteriors.map(ext => [ext, ...holes.filter(h => pointInRing(h[0], ext))]);
        features.push({ type: "Feature",
          properties: { basin_id: id, cell_count: cellCount },
          geometry: { type: "MultiPolygon", coordinates: polygons } });
      }
    }

    return { type: "FeatureCollection", features };
  }


  /* ════════════════════════════════════════════════════════════
     LAYER RECORDS
     ════════════════════════════════════════════════════════════ */

  function buildChannelsRecord(geojson, maxOrder) {
    const lyr = L.geoJSON(geojson, {
      style(f) {
        const o = f.properties.order || 1;
        const t = maxOrder > 1 ? (o - 1) / (maxOrder - 1) : 0;
        return {
          color:   `hsl(${Math.round(195 + t*45)}, 85%, ${Math.round(52 + t*18)}%)`,
          weight:  Math.max(1.2, 1 + o * 0.9),
          opacity: 0.93,
        };
      },
      onEachFeature(f, layer) {
        layer.bindTooltip(
          `Order ${f.properties.order} · ${f.properties.accumulation.toLocaleString()} cells`,
          { sticky: true }
        );
      },
    });
    return _makeRecord(LAYER_CHANNELS, geojson, ACCENT, lyr, [
      { name: "order",        type: "number" },
      { name: "accumulation", type: "number" },
    ], "line");
  }

  function buildBasinRecord(geojson) {
    const lyr = L.geoJSON(geojson, {
      style(f) {
        const hue = (f.properties.basin_id * 137.5) % 360;
        return {
          color:       `hsl(${hue}, 65%, 42%)`,
          fillColor:   `hsl(${hue}, 58%, 54%)`,
          fillOpacity: 0.32,
          weight:      1.3,
          opacity:     0.85,
        };
      },
      onEachFeature(f, layer) {
        layer.bindTooltip(
          `Basin ${f.properties.basin_id} · ${(f.properties.cell_count||0).toLocaleString()} cells`,
          { sticky: true }
        );
      },
    });
    return _makeRecord(LAYER_BASIN, geojson, "#6366f1", lyr, [
      { name: "basin_id",   type: "number" },
      { name: "cell_count", type: "number" },
    ], "polygon");
  }

  function _makeRecord(name, geojson, color, leafletLayer, fields, geometryKind) {
    return {
      id: crypto.randomUUID(), kind: "vector",
      name, sourceType: "Watershed Analysis",
      color, isVisible: true,
      geojson, fields, geometryKind,
      styleConfig:  createDefaultStyleConfig(color),
      labelConfig:  createDefaultLabelConfig(),
      filterConfig: createDefaultFilterConfig(),
      interpolationConfig: null, heatmapConfig: null,
      interpolationOverlay: null, interpolationObjectUrl: "",
      layerGroup: L.featureGroup([leafletLayer]),
      featureCount: geojson.features.length,
      visibleFeatureCount: geojson.features.length,
      rasterObjectUrl: "", rasterMetadata: null,
      isDerived: true, onRemove() {},
    };
  }

  function publishLayers(basinRec, channelsRec) {
    // Remove previous watershed layers
    loadedLayers
      .filter(lr => lr.name === LAYER_BASIN || lr.name === LAYER_CHANNELS)
      .map(lr => lr.id)
      .forEach(id => removeLayer(id));

    // Basin below channels in z-order
    if (channelsRec) loadedLayers.unshift(channelsRec);
    if (basinRec)    loadedLayers.unshift(basinRec);

    // Re-sync Leaflet z-order (bottom of list = rendered first = lowest)
    loadedLayers.filter(lr => lr.isVisible !== false)
      .forEach(lr => map.removeLayer(lr.layerGroup));
    [...loadedLayers].filter(lr => lr.isVisible !== false)
      .reverse()
      .forEach(lr => lr.layerGroup.addTo(map));

    if (typeof renderLayerList            === "function") renderLayerList();
    if (typeof renderEditableLayerOptions === "function") renderEditableLayerOptions();
    if (typeof renderAttributeTable       === "function") renderAttributeTable();
    if (typeof onProjectDirty             === "function") onProjectDirty();
  }

  /* ════════════════════════════════════════════════════════════
     MAIN RUN
     ════════════════════════════════════════════════════════════ */

  cancelBtn.addEventListener("click", () => {
    if (!computing) return;
    requestCancel();
    progressLb.textContent = "Cancelling…";
    cancelBtn.disabled = true;
  });

  applyBtn.addEventListener("click", async () => {
    if (computing) return;
    if (!validate()) return;

    computing = true;
    _cancelRequested = false;
    _activeWorkers.clear();
    applyBtn.disabled = true;
    cancelBtn.hidden = false;
    cancelBtn.disabled = false;
    clearError();
    let ok = false;

    // Safety timeout (3 min)
    const guard = setTimeout(() => { if (computing) finish(false); }, 180_000);

    try {
      /* ── STEP 0: Load DEM ───────────────────────────────────── */
      setProgress(0); await tick();

      let dem, W, H, transform, csx, csy, demNoData = NaN;

      if (demSource === "global") {
        let centre, radius;

        if (inputMode === "canvas") {
          // Use current map viewport
          const bounds  = map.getBounds();
          const cLat    = (bounds.getNorth() + bounds.getSouth()) / 2;
          const cLng    = (bounds.getEast()  + bounds.getWest())  / 2;
          centre = L.latLng(cLat, cLng);
          const cos  = Math.cos(cLat * Math.PI / 180);
          const dLat = (bounds.getNorth() - bounds.getSouth()) * 111320 / 2;
          const dLng = (bounds.getEast()  - bounds.getWest())  * 111320 * cos / 2;
          radius = Math.max(5000, Math.min(200000, Math.ceil(Math.hypot(dLat, dLng))));
        } else if (inputMode === "polygon") {
          const lats = polyLatLngs.map(l => l.lat);
          const lngs = polyLatLngs.map(l => l.lng);
          const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
          const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
          centre = L.latLng(cLat, cLng);
          const cos  = Math.cos(cLat * Math.PI / 180);
          const dLat = (Math.max(...lats) - Math.min(...lats)) * 111320 / 2;
          const dLng = (Math.max(...lngs) - Math.min(...lngs)) * 111320 * cos / 2;
          radius = Math.max(5000, Math.min(200000, Math.ceil(Math.hypot(dLat, dLng) * 1.2)));
        } else {
          centre = pourPt;
          radius = Number(radiusIn.value);
        }

        ({ dem, width: W, height: H, transform, cellSizeX: csx, cellSizeY: csy }
          = await fetchGlobalDem(centre, radius, () => {}));

      } else {
        // Local DEM
        const lr = loadedLayers.find(l => l.id === demSel.value);
        transform = lr.rasterTransform;
        W = transform.width; H = transform.height;
        const ext = transform.extent;
        csx = Math.abs((ext.maxX - ext.minX) / W);
        csy = Math.abs((ext.maxY - ext.minY) / H);
        const rasters = await lr.rasterImage.readRasters({
          samples: [0], width: W, height: H, interleave: true,
        });
        dem = new Float32Array(rasters);
        // Extract noData value so interior holes act as outlets (SAGA behaviour)
        const nd = lr.rasterImage.getGDALNoData?.();
        demNoData = (nd !== undefined && nd !== null && nd !== "") ? Number(nd) : NaN;
      }

      /* ── STEP 1: Fill sinks (Wang & Liu 2006) ──────────────────── */
      setProgress(1); await tick(); checkCancelled();
      const minSlope = getMinSlope();
      const filled = await fillSinks(dem, W, H, minSlope, csx, csy, demNoData);
      dem = null;   // release raw DEM — no longer needed

      /* ── STEP 2: D8 Flow direction ───────────────────────────── */
      checkCancelled();
      setProgress(2, "Computing flow direction (" + (_gpuOk ? "GPU" : "worker") + ")…"); await tick();
      const fd = await computeFlowDir(filled, W, H, csx, csy, demNoData);

      /* ── STEP 3: Flow accumulation ───────────────────────────── */
      checkCancelled();
      setProgress(3); await tick();
      const accum = await computeAccum(fd, W, H);

      checkCancelled();
      const thr = Math.max(1, parseInt(threshInput.value, 10) || 500);

      /* ── STEP 4: Channel sanity check ────────────────────────── */
      setProgress(4); await tick();
      {
        let ok = false;
        for (let i = 0; i < accum.length; i++) if (accum[i] >= thr) { ok = true; break; }
        if (!ok) throw new Error("No channels found — lower the threshold or use a larger area.");
      }

      /* ── STEP 5: Delineate basin / AOI mask ──────────────────── */
      checkCancelled();
      setProgress(5); await tick();
      let basinMask;

      if (inputMode === "pourpoint") {
        const [rx, ry] = transform.projectLatLngToRaster(pourPt);
        const [rawC, rawR] = transform.rasterToPixel(rx, ry);
        const pxC = Math.round(rawC), pxR = Math.round(rawR);
        if (pxC < 0 || pxC >= W || pxR < 0 || pxR >= H)
          throw new Error("Pour point is outside the DEM extent.");

        const snapIdx = snapToStream(pxC, pxR, accum, W, H, thr, 40);
        const sC = snapIdx % W, sR = (snapIdx / W) | 0;

        const spt = transform.unprojectRasterPoint(
          transform.extent.minX + (sC + 0.5) * csx,
          transform.extent.maxY - (sR + 0.5) * csy
        );
        if (pourMarker) map.removeLayer(pourMarker);
        pourMarker = L.circleMarker([spt.lat, spt.lng], {
          radius:7, color:ACCENT, fillColor:ACCENT, fillOpacity:0.55, weight:2, interactive:false,
        }).addTo(map);

        basinMask = await delineateBasin(fd, W, H, sC, sR);

      } else if (inputMode === "polygon") {
        basinMask = polyToMask(polyLatLngs, transform, W, H);

      } else {
        basinMask = canvasToMask(W, H);
      }

      let basinCells = 0;
      for (let i = 0; i < basinMask.length; i++) if (basinMask[i]) basinCells++;
      if (basinCells === 0)
        throw new Error("Basin is empty — check the pour point / polygon overlaps the DEM.");

      const accumB = new Int32Array(accum.length);
      for (let i = 0; i < accum.length; i++) if (basinMask[i]) accumB[i] = accum[i];

      checkCancelled();
      let basinIds;
      if (subbasinsToggle.checked) {
        const minAreaKm2 = 1;  // fixed default: 1 km² (min area slider removed)
        const cellAreaM2 = csx * csy;
        const minCells   = Math.max(1, Math.ceil((minAreaKm2 * 1e6) / cellAreaM2));
        basinIds = await computeSubBasins(fd, accumB, W, H, basinMask, thr, minCells);
        // If every candidate sub-basin was smaller than minCells, fall back to
        // a single whole-basin polygon so the user always sees something.
        let anyAssigned = false;
        for (let i = 0; i < basinIds.length; i++) { if (basinIds[i]) { anyAssigned = true; break; } }
        if (!anyAssigned) {
          console.warn("[Watershed] All sub-basins smaller than min area — showing whole basin.");
          basinIds = new Uint32Array(W * H);
          for (let i = 0; i < basinMask.length; i++) if (basinMask[i]) basinIds[i] = 1;
        }
      } else {
        basinIds = new Uint32Array(W * H);
        for (let i = 0; i < basinMask.length; i++) if (basinMask[i]) basinIds[i] = 1;
      }

      /* ── STEP 6: Vectorise ────────────────────────────────────── */
      checkCancelled();
      setProgress(6); await tick();

      const { geojson: chGJ, maxOrder } = await channelsToGeoJSON(fd, accumB, transform, W, H, thr);
      checkCancelled();
      const bsnGJ = await basinToGeoJSON(basinIds, W, H, transform);

      if (chGJ.features.length === 0)
        throw new Error("No channel features were generated. Try lowering the threshold.");

      if (bsnGJ.features.length === 0)
        throw new Error("Basin polygon could not be generated — the basin mask may be empty or outside the DEM extent.");

      publishLayers(buildBasinRecord(bsnGJ), buildChannelsRecord(chGJ, maxOrder));

      const src = demSource === "global" ? "Global DEM (~30 m)"
        : loadedLayers.find(l => l.id === demSel.value)?.name || "DEM";

      updateStatus(
        `Watershed done — ${src} · ${basinCells.toLocaleString()} cells · ` +
        `${chGJ.features.length} reaches · Strahler max ${maxOrder}`
      );
      ok = true;

    } catch (e) {
      if (e.name === "AbortError") {
        hideProgress();
        updateStatus("Watershed cancelled.");
      } else {
        showError(e.message);
        updateStatus("Watershed error: " + e.message, true);
        console.error("[Watershed]", e);
      }
    } finally {
      clearTimeout(guard);
      finish(ok);
    }
  });

  function finish(success) {
    computing = false;
    applyBtn.disabled = false;
    cancelBtn.hidden = true;
    cancelBtn.disabled = false;
    if (success) {
      progressFl.style.width = "100%";
      progressLb.textContent = "Done ✓";
      setTimeout(hideProgress, 1400);
    } else {
      hideProgress();
    }
  }

  function tick() { return new Promise(r => setTimeout(r, 0)); }

})();
