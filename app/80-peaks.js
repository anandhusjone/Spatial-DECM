/* =============================================================
   80-peaks.js — Peak & Hill Detection Panel

   Finds terrain summits with one user-facing workflow:
   1. optionally smooth DEM noise
   2. find plateau-tolerant local maxima
   3. estimate local relief against surrounding lower terrain
   4. suppress nearby duplicates and classify Peak / Hill by relief

   Depends on globals from 00-core.js, 10-analysis-layers.js,
   dem-utils.js (must load first):
     map, updateStatus, loadedLayers, removeLayer,
     isRasterLayerRecord, escapeHtml,
     createDefaultStyleConfig, createDefaultLabelConfig,
     createDefaultFilterConfig, [createDefaultInterpolationConfig],
     [createDefaultHeatmapConfig], fetchGlobalDem, fetchGlobalDemBBox,
     CRSManager
   ============================================================= */

(function () {
  "use strict";

  // ── Constants ─────────────────────────────────────────────────

  const LAYER_NAME   = "Peaks & Hills";
  const PEAK_COLOR   = "#D85A30";   // coral-red  — sharp peak triangle
  const HILL_COLOR   = "#1D9E75";   // teal-green — broad hill dome
  const PICK_CURSOR_CLASS = "map-picking-observer";   // reuse viewshed CSS

  // SVG for pick button icon
  const PICK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="2" x2="12" y2="5"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="5" y2="12"/>
    <line x1="19" y1="12" x2="22" y2="12"/>
  </svg>`;

  // ── DOM refs ──────────────────────────────────────────────────

  const panel         = document.getElementById("peaks-panel");
  const panelHeader   = document.getElementById("peaks-panel-header");
  const closeBtn      = document.getElementById("peaks-panel-close-btn");
  const peaksBtn      = document.getElementById("peaks-btn");

  const demSrcCtrl    = document.getElementById("pk-dem-source-ctrl");
  const demSelectWrap = document.getElementById("pk-dem-select-wrap");
  const demSelect     = document.getElementById("pk-dem-select");

  const aoiCtrl       = document.getElementById("pk-aoi-ctrl");
  const canvasRow     = document.getElementById("pk-canvas-row");
  const radiusRow     = document.getElementById("pk-radius-row");
  const radiusInp     = document.getElementById("pk-radius-inp");

  // Pick-point row (radius mode)
  const pickBtn       = document.getElementById("pk-pick-btn");
  const coordsInp     = document.getElementById("pk-coords-inp");
  const clearPtBtn    = document.getElementById("pk-clear-pt-btn");

  // Summit params
  const peakWindowInp  = document.getElementById("pk-peak-window-inp");  // search radius, px
  const peakProminInp  = document.getElementById("pk-peak-promin-inp");  // minimum relief, m

  const hillWindowInp  = document.getElementById("pk-hill-window-inp");  // smoothing radius, px
  const hillProminInp  = document.getElementById("pk-hill-promin-inp");  // Peak/Hill relief cutoff, m

  // Shared filters
  const minElevInp    = document.getElementById("pk-min-elev-inp");
  const maxResultInp  = document.getElementById("pk-max-peaks-inp");

  const errorMsg      = document.getElementById("pk-error-msg");
  const progressEl    = document.getElementById("pk-progress");
  const progressLabel = document.getElementById("pk-progress-label");
  const applyBtn      = document.getElementById("pk-apply-btn");

  // ── State ─────────────────────────────────────────────────────

  let pkDemSource    = "local";    // "local" | "global"
  let pkAoiMode      = "canvas";   // "canvas" | "radius"
  let isComputing    = false;
  let isPicking      = false;

  let pickedLatLng   = null;       // L.LatLng — the picked centre point
  let pointMarker    = null;       // L.CircleMarker on map
  let radiusCircle   = null;       // L.Circle  on map — radius preview

  // ── Panel open / close ────────────────────────────────────────

  function clampPanelToViewport() {
    if (!panel || panel.hidden) return;
    const margin = 12;
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const left = Math.min(Math.max(margin, rect.left), maxLeft);
    const top = Math.min(Math.max(margin, rect.top), maxTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function clampPanelAfterLayout() {
    requestAnimationFrame(() => requestAnimationFrame(clampPanelToViewport));
  }

  function openPanel() {
    panel.hidden = false;
    peaksBtn.setAttribute("aria-pressed", "true");
    peaksBtn.classList.add("pk-active");
    document.getElementById("viewshed-panel-close-btn")?.click();
    document.getElementById("watershed-panel-close-btn")?.click();
    populateDemSelect();
    clampPanelAfterLayout();
    if (typeof canAnimate !== "undefined" && canAnimate) {
      anime.remove(panel);
      anime.set(panel, { opacity: 0, translateY: -12, scale: 0.96 });
      anime({ targets: panel, opacity: [0,1], translateY: [-12,0], scale: [0.96,1], duration: 280, easing: "easeOutExpo" });
    }
  }

  function closePanel() {
    if (isPicking) cancelPicking();
    clearMapOverlays();
    const finalize = () => {
      panel.hidden = true;
      peaksBtn.setAttribute("aria-pressed", "false");
      peaksBtn.classList.remove("pk-active");
    };
    if (typeof canAnimate !== "undefined" && canAnimate) {
      anime.remove(panel);
      anime({ targets: panel, opacity: [1,0], translateY: [0,-10], scale: [1,0.96], duration: 200, easing: "easeInCubic", complete: finalize });
    } else { finalize(); }
  }

  peaksBtn.addEventListener("click", () => panel.hidden ? openPanel() : closePanel());
  closeBtn.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      if (isPicking) cancelPicking(); else closePanel();
    }
  });
  window.addEventListener("resize", clampPanelAfterLayout);

  // ── Draggable ─────────────────────────────────────────────────

  let _justDragged = false;
  (function makeDraggable() {
    let dragging = false, startX, startY, startLeft, startTop;
    const startDrag = (cx, cy) => {
      dragging = true; startX = cx; startY = cy;
      const r = panel.getBoundingClientRect();
      startLeft = r.left; startTop = r.top;
      panel.style.cssText += `;left:${startLeft}px;top:${startTop}px;right:auto;bottom:auto`;
    };
    const moveDrag = (cx, cy) => {
      if (!dragging) return;
      const margin = 12;
      const maxLeft = Math.max(margin, window.innerWidth  - panel.offsetWidth - margin);
      const maxTop  = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
      panel.style.left = Math.min(Math.max(margin, startLeft + cx - startX), maxLeft) + "px";
      panel.style.top  = Math.min(Math.max(margin, startTop  + cy - startY), maxTop)  + "px";
    };
    const endDrag = () => { if (dragging) _justDragged = true; dragging = false; };
    panelHeader.addEventListener("mousedown",   (e) => { if (e.button === 0) { startDrag(e.clientX, e.clientY); e.preventDefault(); } });
    panelHeader.addEventListener("touchstart",  (e) => { if (e.touches.length === 1) { startDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } }, { passive: false });
    document.addEventListener("mousemove",  (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener("touchmove",  (e) => { if (dragging && e.touches.length === 1) { moveDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } }, { passive: false });
    document.addEventListener("mouseup",    endDrag);
    document.addEventListener("touchend",   endDrag);
    document.addEventListener("touchcancel",endDrag);
  })();

  // ── DEM source cards ──────────────────────────────────────────

  demSrcCtrl.addEventListener("click", (e) => {
    const btn = e.target.closest(".wt-dem-card");
    if (!btn) return;
    const src = btn.dataset.demSource;
    if (!src || src === pkDemSource) return;
    pkDemSource = src;
    demSrcCtrl.querySelectorAll(".wt-dem-card").forEach(b => b.classList.toggle("is-active", b.dataset.demSource === src));
    demSelectWrap.classList.toggle("is-open", src === "local");
    syncVisibility();
  });

  // ── AOI cards ─────────────────────────────────────────────────

  aoiCtrl.addEventListener("click", (e) => {
    const btn = e.target.closest(".pk-aoi-card");
    if (!btn) return;
    const mode = btn.dataset.aoiMode;
    if (!mode || mode === pkAoiMode) return;
    pkAoiMode = mode;
    aoiCtrl.querySelectorAll(".pk-aoi-card").forEach(b => b.classList.toggle("is-active", b.dataset.aoiMode === mode));
    syncVisibility();
    if (mode === "canvas") clearMapOverlays();
  });

  function syncVisibility() {
    const needsRadius = pkAoiMode === "radius" || pkDemSource === "global";
    radiusRow.classList.toggle("is-open", needsRadius);
    canvasRow.classList.toggle("is-open", pkAoiMode === "canvas" && pkDemSource !== "global");
    if (!needsRadius) clearMapOverlays();
    clampPanelAfterLayout();
  }

  // ── Pick-point system ─────────────────────────────────────────

  function setPicking(active) {
    isPicking = active;
    pickBtn.classList.toggle("is-picking", active);
    document.body.classList.toggle(PICK_CURSOR_CLASS, active);
    if (active) {
      pickBtn.innerHTML = PICK_SVG + " Click on map…";
      map.on("click", onMapClick);
      updateStatus("Click on the map to set the search centre. Press Escape to cancel.");
    } else {
      pickBtn.innerHTML = PICK_SVG + " Pick from Map";
      map.off("click", onMapClick);
    }
  }

  function cancelPicking() { setPicking(false); }

  function onMapClick(e) {
    if (_justDragged) { _justDragged = false; return; }
    setPicking(false);
    setPickedPoint(e.latlng);
    updateStatus("Search centre set.");
  }

  function setPickedPoint(latlng) {
    pickedLatLng = latlng;
    coordsInp.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    coordsInp.classList.add("is-set");
    clearPtBtn.hidden = false;

    // Place / update marker on map
    if (pointMarker) map.removeLayer(pointMarker);
    pointMarker = L.circleMarker(latlng, {
      radius:      7,
      color:       "#ffffff",
      fillColor:   PEAK_COLOR,
      fillOpacity: 1,
      weight:      2.5,
      interactive: false,
      pane:        "markerPane",
    }).addTo(map);
    pointMarker.bindTooltip("Search centre", {
      permanent: false, direction: "top", offset: [0, -8], className: "measure-tooltip",
    });

    updateRadiusCircle();
  }

  function clearPickedPoint() {
    pickedLatLng = null;
    coordsInp.value = "";
    coordsInp.classList.remove("is-set");
    clearPtBtn.hidden = true;
    clearMapOverlays();
  }

  function clearMapOverlays() {
    if (pointMarker) { map.removeLayer(pointMarker); pointMarker = null; }
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  }

  function updateRadiusCircle() {
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
    if (!pickedLatLng) return;
    const r = Number(radiusInp.value);
    if (!r || r <= 0) return;
    radiusCircle = L.circle(pickedLatLng, {
      radius:      r,
      color:       PEAK_COLOR,
      weight:      1.5,
      opacity:     0.7,
      fillOpacity: 0.05,
      dashArray:   "5 4",
      interactive: false,
      pane:        "overlayPane",
    }).addTo(map);
  }

  // Pick button
  pickBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isPicking ? cancelPicking() : setPicking(true);
  });

  // Clear button
  clearPtBtn.addEventListener("click", () => {
    if (isPicking) cancelPicking();
    clearPickedPoint();
  });

  // Radius slider → redraw circle
  radiusInp.addEventListener("input", updateRadiusCircle);

  // ── Coordinate paste / manual entry ──────────────────────────

  function parseCoords(raw) {
    const m = raw.trim().replace(/\s+/g, " ").match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return L.latLng(lat, lng);
  }

  function applyCoordInput() {
    const latlng = parseCoords(coordsInp.value);
    if (!latlng) {
      coordsInp.classList.add("coords-invalid");
      setTimeout(() => coordsInp.classList.remove("coords-invalid"), 900);
      return;
    }
    if (isPicking) cancelPicking();
    clearError();
    setPickedPoint(latlng);
    map.setView(latlng, Math.max(map.getZoom(), 12), { animate: true });
  }

  coordsInp.addEventListener("paste",   () => setTimeout(applyCoordInput, 0));
  coordsInp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCoordInput(); } });
  coordsInp.addEventListener("blur",    () => { if (coordsInp.value.trim() && !coordsInp.classList.contains("is-set")) applyCoordInput(); });

  // ── DEM select population ─────────────────────────────────────

  function populateDemSelect() {
    const cur = demSelect.value;
    const eligible = loadedLayers.filter(
      lr => isRasterLayerRecord(lr) && lr.rasterKind === "geotiff" &&
            lr.rasterImage && lr.rasterTransform && lr.rasterMetadata?.bandCount >= 1
    );
    demSelect.innerHTML =
      '<option value="">— select elevation raster —</option>' +
      eligible.map(lr => `<option value="${lr.id}"${lr.id === cur ? " selected" : ""}>${escapeHtml(lr.name)}</option>`).join("");
  }

  const layerListEl = document.getElementById("layer-list");
  if (layerListEl) {
    new MutationObserver(() => { if (!panel.hidden) populateDemSelect(); })
      .observe(layerListEl, { childList: true, subtree: false });
  }

  // ── Error / progress helpers ──────────────────────────────────

  function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }
  function clearError()   { errorMsg.hidden = true; }

  function showProgress(label) {
    progressEl.hidden = false;
    progressLabel.textContent = label || "Running…";
    applyBtn.disabled = true;
    isComputing = true;
    requestAnimationFrame(() => progressEl.classList.add("is-visible"));
  }

  let _hideTimer = null;
  function hideProgress() {
    clearTimeout(_hideTimer);
    applyBtn.disabled = false;
    isComputing = false;
    progressEl.classList.remove("is-visible");
    _hideTimer = setTimeout(() => { progressEl.hidden = true; }, 300);
  }

  // ── Validation ────────────────────────────────────────────────

  function validate() {
    clearError();
    if (pkDemSource === "local" && !demSelect.value) {
      showError("Select a DEM layer or switch to Global DEM."); return false;
    }
    const searchRadius = Number(peakWindowInp.value);
    if (!Number.isInteger(searchRadius) || searchRadius < 1 || searchRadius > 500) {
      showError("Search radius must be 1–500 px."); return false;
    }
    if (Number(peakProminInp.value) < 0) {
      showError("Minimum relief must be ≥ 0 m."); return false;
    }
    const smoothing = Number(hillWindowInp.value);
    if (!Number.isInteger(smoothing) || smoothing < 0 || smoothing > 25) {
      showError("Smoothing must be 0–25 px."); return false;
    }
    if (Number(hillProminInp.value) < 0) {
      showError("Peak cutoff must be ≥ 0 m."); return false;
    }
    const maxR = Number(maxResultInp.value);
    if (!Number.isInteger(maxR) || maxR < 1 || maxR > 10000) {
      showError("Max results must be 1–10 000."); return false;
    }

    const needsRadius = pkAoiMode === "radius" || pkDemSource === "global";
    if (needsRadius) {
      if (!pickedLatLng) { showError("Pick a search centre point on the map first."); return false; }
      const r = Number(radiusInp.value);
      if (!r || r <= 0) { showError("Enter a radius in metres."); return false; }
      if (r > 50000)    { showError("Radius is limited to 50 000 m."); return false; }
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DETECTION ALGORITHMS
  // ═══════════════════════════════════════════════════════════════

  function haversineMeters(a, b) {
    const R = 6371008.8;
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLng / 2);
    const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function getRasterCellLatLng(transform, width, height, row, col) {
    const ext = transform.extent;
    const rx = ext.minX + (col + 0.5) * (ext.maxX - ext.minX) / width;
    const ry = ext.maxY - (row + 0.5) * (ext.maxY - ext.minY) / height;
    return transform.unprojectRasterPoint(rx, ry);
  }

  function maskOutsideRadius(dem, width, height, transform, centerLatLng, radiusM) {
    let kept = 0;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const idx = r * width + c;
        if (!Number.isFinite(dem[idx])) continue;
        const latlng = getRasterCellLatLng(transform, width, height, r, c);
        const dist = haversineMeters(centerLatLng, latlng);
        if (dist > radiusM) {
          dem[idx] = NaN;
        } else {
          kept += 1;
        }
      }
    }
    if (!kept) {
      throw new Error("The search radius does not overlap any DEM cells. Try a larger radius or choose a different centre point.");
    }
  }

  /** Sliding-window max and min. Non-finite DEM cells are ignored. */
  function slidingWindowStats(dem, width, height, halfWin) {
    const INF = 1e20;
    const rowMax = new Float32Array(width * height);
    const rowMin = new Float32Array(width * height);

    for (let r = 0; r < height; r++) {
      const base = r * width;
      for (let c = 0; c < width; c++) {
        let mx = -INF, mn = INF;
        const c0 = Math.max(0, c - halfWin), c1 = Math.min(width - 1, c + halfWin);
        for (let kc = c0; kc <= c1; kc++) {
          const v = dem[base + kc];
          if (!Number.isFinite(v)) continue;
          if (v > mx) mx = v;
          if (v < mn) mn = v;
        }
        rowMax[base + c] = mx;
        rowMin[base + c] = mn;
      }
    }
    const nbhMax = new Float32Array(width * height);
    const nbhMin = new Float32Array(width * height);
    for (let c = 0; c < width; c++) {
      for (let r = 0; r < height; r++) {
        let mx = -INF, mn = INF;
        const r0 = Math.max(0, r - halfWin), r1 = Math.min(height - 1, r + halfWin);
        for (let kr = r0; kr <= r1; kr++) {
          const v  = rowMax[kr * width + c];
          const v2 = rowMin[kr * width + c];
          if (!Number.isFinite(v) || !Number.isFinite(v2)) continue;
          if (v  > mx) mx = v;
          if (v2 < mn) mn = v2;
        }
        nbhMax[r * width + c] = mx;
        nbhMin[r * width + c] = mn;
      }
    }
    return { nbhMax, nbhMin };
  }

  function boxSmooth(dem, width, height, radius) {
    if (!radius) return dem.slice();

    const rowSum = new Float64Array(width * height);
    const rowCnt = new Uint32Array(width * height);

    for (let r = 0; r < height; r++) {
      const base = r * width;
      const prefix = new Float64Array(width + 1);
      const counts = new Uint32Array(width + 1);
      for (let c = 0; c < width; c++) {
        const v = dem[base + c];
        prefix[c + 1] = prefix[c] + (Number.isFinite(v) ? v : 0);
        counts[c + 1] = counts[c] + (Number.isFinite(v) ? 1 : 0);
      }
      for (let c = 0; c < width; c++) {
        const c0 = Math.max(0, c - radius);
        const c1 = Math.min(width - 1, c + radius);
        const sum = prefix[c1 + 1] - prefix[c0];
        const count = counts[c1 + 1] - counts[c0];
        rowSum[base + c] = sum;
        rowCnt[base + c] = count;
      }
    }

    const out = new Float32Array(width * height);
    for (let c = 0; c < width; c++) {
      const prefix = new Float64Array(height + 1);
      const counts = new Uint32Array(height + 1);
      for (let r = 0; r < height; r++) {
        const idx = r * width + c;
        prefix[r + 1] = prefix[r] + rowSum[idx];
        counts[r + 1] = counts[r] + rowCnt[idx];
      }
      for (let r = 0; r < height; r++) {
        const r0 = Math.max(0, r - radius);
        const r1 = Math.min(height - 1, r + radius);
        const sum = prefix[r1 + 1] - prefix[r0];
        const count = counts[r1 + 1] - counts[r0];
        out[r * width + c] = count ? sum / count : NaN;
      }
    }
    return out;
  }

  function hasLowerNeighbour(dem, width, height, row, col, halfWin, elev, epsilon) {
    const r0 = Math.max(0, row - halfWin), r1 = Math.min(height - 1, row + halfWin);
    const c0 = Math.max(0, col - halfWin), c1 = Math.min(width - 1, col + halfWin);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r === row && c === col) continue;
        const v = dem[r * width + c];
        if (Number.isFinite(v) && v < elev - epsilon) return true;
      }
    }
    return false;
  }

  function localRelief(dem, width, height, row, col, radius, elev) {
    const values = [];
    const r0 = Math.max(0, row - radius), r1 = Math.min(height - 1, row + radius);
    const c0 = Math.max(0, col - radius), c1 = Math.min(width - 1, col + radius);
    const inner = Math.max(1, Math.floor(radius * 0.35));
    const r2 = radius * radius;
    const inner2 = inner * inner;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dr = r - row, dc = c - col;
        const d2 = dr * dr + dc * dc;
        if (d2 > r2 || d2 <= inner2) continue;
        const v = dem[r * width + c];
        if (Number.isFinite(v) && v < elev) values.push(v);
      }
    }
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    const baseline = values[Math.floor(values.length * 0.25)];
    return elev - baseline;
  }

  function detectSummits(dem, width, height, opts) {
    const {
      searchRadius,
      minRelief,
      smoothRadius,
      peakCutoff,
      minElev,
      maxCount,
    } = opts;

    const smoothed = boxSmooth(dem, width, height, smoothRadius);
    const { nbhMax } = slidingWindowStats(smoothed, width, height, searchRadius);
    const reliefRadius = Math.max(searchRadius * 3, searchRadius + 4);
    const epsilon = 0.05;
    const candidates = [];

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const idx = r * width + c;
        const smoothElev = smoothed[idx];
        const elev = dem[idx];
        if (!Number.isFinite(smoothElev) || !Number.isFinite(elev) || elev < minElev) continue;
        if (smoothElev < nbhMax[idx] - epsilon) continue;
        if (!hasLowerNeighbour(smoothed, width, height, r, c, searchRadius, smoothElev, epsilon)) continue;

        const promin = localRelief(smoothed, width, height, r, c, reliefRadius, smoothElev);
        if (promin < minRelief) continue;
        candidates.push({
          row: r,
          col: c,
          elev,
          promin,
          score: promin * 100000 + elev,
          kind: promin >= peakCutoff ? "peak" : "hill",
        });
      }
    }

    return nms(candidates, width, height, searchRadius, maxCount);
  }

  /** NMS: sort by relief score, suppress a window-sized square around each accepted feature. */
  function nms(candidates, width, height, halfWin, maxCount) {
    candidates.sort((a, b) => (b.score ?? b.elev) - (a.score ?? a.elev));
    const suppressed = new Uint8Array(width * height);
    const accepted = [];
    for (const cand of candidates) {
      if (accepted.length >= maxCount) break;
      const idx = cand.row * width + cand.col;
      if (suppressed[idx]) continue;
      accepted.push(cand);
      const r0 = Math.max(0, cand.row - halfWin), r1 = Math.min(height - 1, cand.row + halfWin);
      const c0 = Math.max(0, cand.col - halfWin), c1 = Math.min(width  - 1, cand.col + halfWin);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          suppressed[r * width + c] = 1;
    }
    return accepted;
  }

  // ── GeoJSON builder ───────────────────────────────────────────

  function resultsToGeoJSON(features, width, transform) {
    const ext = transform.extent;
    const H = transform.height;
    return {
      type: "FeatureCollection",
      features: features.map(f => {
        const rx = ext.minX + (f.col + 0.5) * (ext.maxX - ext.minX) / width;
        const ry = ext.maxY - (f.row + 0.5) * (ext.maxY - ext.minY) / H;
        const geo = transform.unprojectRasterPoint(rx, ry);
        const lat = geo.lat ?? geo.y ?? ry;
        const lng = geo.lng ?? geo.x ?? rx;
        return {
          type: "Feature",
          properties: {
            rank:         f.rank,
            kind:         f.kind,
            elevation_m:  Math.round(f.elev  * 10) / 10,
            relief_m:     Math.round(f.promin * 10) / 10,
            label:        `${f.kind === "peak" ? "Peak" : "Hill"} #${f.rank} (${Math.round(f.elev)} m)`,
          },
          geometry: { type: "Point", coordinates: [lng, lat] },
        };
      }),
    };
  }

  // ── Map icon builder ──────────────────────────────────────────

  function buildLayerRecord(geojson, count) {
    const styleConfig = createDefaultStyleConfig(PEAK_COLOR);
    styleConfig.fillOpacity = 1; styleConfig.strokeOpacity = 1; styleConfig.strokeWidth = 2;

    const layerGroup = L.featureGroup();

    L.geoJSON(geojson, {
      pointToLayer(feature, latlng) {
        const { rank, kind, elevation_m, relief_m } = feature.properties;
        const isPeak = kind === "peak";
        const size   = rank === 1 ? 26 : rank <= 3 ? 22 : 18;

        // ── PEAK: coral triangle, inner ridge contour, apex dot ─
        const peakSvg = `<svg xmlns="http://www.w3.org/2000/svg"
            width="${size}" height="${size}" viewBox="0 0 34 34">
          <polygon points="17,2 31,31 3,31"
            fill="${PEAK_COLOR}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
          <polyline points="9,24 17,9 25,24"
            fill="none" stroke="#fff" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>
          <circle cx="17" cy="2" r="3" fill="#fff"/>
        </svg>`;

        // ── HILL: teal dome, 2 nested contour arcs, apex dot ───
        const hillSvg = `<svg xmlns="http://www.w3.org/2000/svg"
            width="${size}" height="${size}" viewBox="0 0 34 34">
          <path d="M2,30 Q9,5 17,3 Q25,5 32,30 Z"
            fill="${HILL_COLOR}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M2,30 Q9,21 17,19 Q25,21 32,30"
            fill="none" stroke="#fff" stroke-width="1.8"
            stroke-linecap="round" opacity=".6"/>
          <path d="M7,30 Q12,25 17,24 Q22,25 27,30"
            fill="none" stroke="#fff" stroke-width="1.2"
            stroke-linecap="round" opacity=".38"/>
          <circle cx="17" cy="3" r="3" fill="#fff"/>
        </svg>`;

        const html   = isPeak ? peakSvg : hillSvg;
        const anchor = [size / 2, size * (2 / 34)]; // anchor at apex dot
        const icon   = L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: anchor });
        const marker = L.marker(latlng, { icon, pane: "markerPane" });

        marker.bindTooltip(
          `<strong>${isPeak ? "Peak" : "Hill"} #${rank}</strong>&nbsp; ${elevation_m} m` +
          `<br><span style="font-size:10px;opacity:0.65">Relief: ${relief_m} m</span>`,
          { direction: "top", offset: [0, -4], className: "measure-tooltip" }
        );
        marker.bindPopup(
          `<strong>${isPeak ? "⛰ Peak" : "⛰ Hill"} #${rank}</strong><br>` +
          `Type: ${isPeak ? "Sharp summit" : "Broad hill"}<br>` +
          `Elevation: ${elevation_m} m<br>` +
          `Relief: ${relief_m} m<br>` +
          `Lat: ${latlng.lat.toFixed(5)}&nbsp;&nbsp;Lng: ${latlng.lng.toFixed(5)}`
        );
        return marker;
      },
    }).getLayers().forEach(l => layerGroup.addLayer(l));

    return {
      id: crypto.randomUUID(),
      kind: "vector",
      name: LAYER_NAME,
      sourceType: "Peak & Hill Detection",
      color: PEAK_COLOR,
      geometryKind: "Point",
      isVisible: true,
      geojson,
      fields: ["rank", "kind", "elevation_m", "relief_m", "label"],
      crs:         CRSManager.DEFAULT_CRS,
      crsMetadata: CRSManager.getCrsMetadata(CRSManager.DEFAULT_CRS),
      styleConfig,
      labelConfig:          createDefaultLabelConfig(),
      filterConfig:         createDefaultFilterConfig(),
      interpolationConfig:  typeof createDefaultInterpolationConfig === "function" ? createDefaultInterpolationConfig() : {},
      heatmapConfig:        typeof createDefaultHeatmapConfig       === "function" ? createDefaultHeatmapConfig()       : {},
      interpolationOverlay:   null,
      interpolationObjectUrl: "",
      layerGroup,
      featureCount:        count,
      visibleFeatureCount: count,
      layerOpacity: 1,
      isDerived: true,
      onRemove() {},
    };
  }

  function removeExistingLayer() {
    const ex = loadedLayers.find(lr => lr.name === LAYER_NAME);
    if (ex) removeLayer(ex.id);
  }

  function addLayerRecord(rec) {
    loadedLayers.unshift(rec);
    const vis = loadedLayers.filter(lr => lr.isVisible !== false);
    vis.forEach(lr => map.removeLayer(lr.layerGroup));
    [...vis].reverse().forEach(lr => lr.layerGroup.addTo(map));
    if (typeof renderLayerList            === "function") renderLayerList();
    if (typeof renderEditableLayerOptions === "function") renderEditableLayerOptions();
    if (typeof renderAttributeTable       === "function") renderAttributeTable();
    if (typeof updateInterpolationLegend  === "function") updateInterpolationLegend();
    if (typeof onProjectDirty             === "function") onProjectDirty();
  }

  // ── Apply handler ─────────────────────────────────────────────

  applyBtn.addEventListener("click", async () => {
    if (isComputing) return;
    if (!validate()) return;

    const isGlobal   = pkDemSource === "global";
    const searchRadius = Number(peakWindowInp.value);
    const minRelief    = Number(peakProminInp.value);
    const smoothRadius = Number(hillWindowInp.value);
    const peakCutoff   = Number(hillProminInp.value);
    const minElev    = minElevInp.value.trim() !== "" ? Number(minElevInp.value) : -Infinity;
    const maxResults = Number(maxResultInp.value);
    const radius     = Number(radiusInp.value);
    const needsRadius = pkAoiMode === "radius" || isGlobal;

    let localRec = null;
    if (!isGlobal) {
      localRec = loadedLayers.find(lr => lr.id === demSelect.value);
      if (!localRec?.rasterImage || !localRec?.rasterTransform) {
        showError("Selected DEM layer is no longer available."); return;
      }
    }

    showProgress("Fetching elevation data…");
    clearError();
    const _guard = setTimeout(() => { if (isComputing) hideProgress(); }, 180_000);

    try {
      let dem, width, height, transform;

      // ── Fetch DEM ─────────────────────────────────────────────
      if (isGlobal) {
        // Global: always use picked centre + radius
        progressLabel.textContent = "Fetching elevation tiles…";
        const res = await fetchGlobalDem(
          pickedLatLng, radius,
          msg => { progressLabel.textContent = msg; }
        );
        ({ dem, width, height, transform } = res);

      } else {
        // Local GeoTIFF
        transform = localRec.rasterTransform;
        width  = transform.width;
        height = transform.height;
        progressLabel.textContent = "Reading DEM…";
        const rasters = await localRec.rasterImage.readRasters({
          samples:[0], width, height, interleave:true,
        });
        dem = new Float32Array(rasters);
        const noDataRaw = localRec.rasterImage.getGDALNoData?.();
        const noData = noDataRaw !== undefined && noDataRaw !== null && noDataRaw !== "" ? Number(noDataRaw) : NaN;
        if (Number.isFinite(noData)) {
          for (let i = 0; i < dem.length; i++) {
            if (dem[i] === noData) dem[i] = NaN;
          }
        }
      }

      // ── AOI mask ──────────────────────────────────────────────
      if (!isGlobal) {
        const ext = transform.extent;

        if (pkAoiMode === "canvas") {
          // Mask everything outside the current map viewport.
          // Project all four map corners first so projected GeoTIFFs work.
          const b  = map.getBounds();
          const projectedCorners = [
            transform.projectLatLngToRaster(b.getNorthWest()),
            transform.projectLatLngToRaster(b.getNorthEast()),
            transform.projectLatLngToRaster(b.getSouthWest()),
            transform.projectLatLngToRaster(b.getSouthEast()),
          ];
          const xs = projectedCorners.map((p) => p[0]);
          const ys = projectedCorners.map((p) => p[1]);
          const minX = Math.max(ext.minX, Math.min(...xs));
          const maxX = Math.min(ext.maxX, Math.max(...xs));
          const minY = Math.max(ext.minY, Math.min(...ys));
          const maxY = Math.min(ext.maxY, Math.max(...ys));
          if (minX >= maxX || minY >= maxY) {
            throw new Error("The current map view does not overlap the selected DEM.");
          }
          const [px0, py0] = transform.rasterToPixel(minX, maxY);
          const [px1, py1] = transform.rasterToPixel(maxX, minY);
          const c0 = Math.max(0, Math.floor(Math.min(px0, px1)));
          const c1 = Math.min(width  - 1, Math.ceil(Math.max(px0, px1)));
          const r0 = Math.max(0, Math.floor(Math.min(py0, py1)));
          const r1 = Math.min(height - 1, Math.ceil(Math.max(py0, py1)));
          for (let r = 0; r < height; r++)
            for (let c = 0; c < width; c++)
              if (r < r0 || r > r1 || c < c0 || c > c1) dem[r * width + c] = NaN;

        }
      }

      if (needsRadius) {
        progressLabel.textContent = "Applying search radius…";
        await new Promise(r => setTimeout(r, 0));
        maskOutsideRadius(dem, width, height, transform, pickedLatLng, radius);
      }

      // ── Run detection ─────────────────────────────────────────
      progressLabel.textContent = "Detecting terrain summits…";
      await new Promise(r => setTimeout(r, 0));
      const merged = detectSummits(dem, width, height, {
        searchRadius,
        minRelief,
        smoothRadius,
        peakCutoff,
        minElev,
        maxCount: maxResults,
      });
      merged.forEach((f, i) => { f.rank = i + 1; });

      if (merged.length === 0) {
        throw new Error(
          "No features found. Try a larger window, lower prominence threshold, or check your AOI."
        );
      }

      // ── Build & add layer ─────────────────────────────────────
      progressLabel.textContent = "Building layer…";
      await new Promise(r => setTimeout(r, 0));

      const geojson = resultsToGeoJSON(merged, width, transform);
      removeExistingLayer();
      addLayerRecord(buildLayerRecord(geojson, merged.length));

      const nP = merged.filter(f => f.kind === "peak").length;
      const nH = merged.filter(f => f.kind === "hill").length;
      const src = isGlobal ? "Global DEM" : localRec.name;
      const summary = [nP && `${nP} peak${nP > 1 ? "s" : ""}`, nH && `${nH} hill${nH > 1 ? "s" : ""}`].filter(Boolean).join(", ");
      updateStatus(`Detection complete (${src}). Found ${summary} — see "${LAYER_NAME}" layer.`);

    } catch (err) {
      showError(err.message);
      updateStatus(err.message, true);
    } finally {
      clearTimeout(_guard);
      hideProgress();
    }
  });

  // ── Init ──────────────────────────────────────────────────────
  syncVisibility();

})();
