/* =============================================================
   60-viewshed.js — Live Viewshed Analysis Panel
   Depends on globals from 00-core.js and 10-analysis-layers.js:
     map, canAnimate, anime, updateStatus, loadedLayers,
     addLayerRecord, removeLayer, isRasterLayerRecord,
     escapeHtml,
     createDefaultStyleConfig, createDefaultLabelConfig, createDefaultFilterConfig
   ============================================================= */

(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────────

  const VIEWSHED_LAYER_NAME = "Viewshed";
  const EARTH_RADIUS_M = 6371000;
  const REFRACTION_K   = 0.13;

  // SVG for pick button (reused across states)
  const PICK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
    viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="2" x2="12" y2="5"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="5" y2="12"/>
    <line x1="19" y1="12" x2="22" y2="12"/>
  </svg>`;

  // ── DOM refs ──────────────────────────────────────────────────

  const panel         = document.getElementById("viewshed-panel");
  const panelHeader   = document.getElementById("viewshed-panel-header");
  const closeBtn      = document.getElementById("viewshed-panel-close-btn");
  const viewshedBtn   = document.getElementById("viewshed-btn");

  const demSelect     = document.getElementById("vs-dem-select");
  const demSelectWrap = document.getElementById("vs-dem-select-wrap");
  const demSrcCtrl    = document.getElementById("vs-dem-source-ctrl");
  const obsHeightInp  = document.getElementById("vs-observer-height");
  const tgtHeightInp  = document.getElementById("vs-target-height");
  const maxRadiusInp  = document.getElementById("vs-max-radius");
  const radiusHint    = document.getElementById("vs-radius-hint");
  const curvatureChk  = document.getElementById("vs-curvature");
  const pickBtn       = document.getElementById("vs-pick-btn");
  const coordsDisplay = document.getElementById("vs-coords-display");
  const clearObsBtn   = document.getElementById("vs-clear-obs-btn");
  const errorMsg      = document.getElementById("vs-error-msg");
  const progressEl    = document.getElementById("vs-progress");
  const progressLabel = document.getElementById("vs-progress-label");
  const applyBtn      = document.getElementById("vs-apply-btn");

  // ── State ─────────────────────────────────────────────────────

  let observerLatLng = null;  // L.LatLng | null
  let observerMarker = null;  // L.CircleMarker | null
  let radiusCircle   = null;  // L.Circle | null — shows max-radius ring
  let isPicking      = false;
  let isComputing    = false;

  // ── Panel open / close ────────────────────────────────────────

  function openPanel() {
    panel.hidden = false;
    viewshedBtn.setAttribute("aria-pressed", "true");
    viewshedBtn.classList.add("vs-active");
    populateDemSelect();

    if (typeof canAnimate !== "undefined" && canAnimate) {
      anime.remove(panel);
      anime.set(panel, { opacity: 0, translateY: -12, scale: 0.96 });
      anime({
        targets: panel,
        opacity: [0, 1],
        translateY: [-12, 0],
        scale: [0.96, 1],
        duration: 280,
        easing: "easeOutExpo",
      });
    }
  }

  function closePanel() {
    if (isPicking) cancelPicking();
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }

    const finalize = () => {
      panel.hidden = true;
      viewshedBtn.setAttribute("aria-pressed", "false");
      viewshedBtn.classList.remove("vs-active");
    };

    if (typeof canAnimate !== "undefined" && canAnimate) {
      anime.remove(panel);
      anime({
        targets: panel,
        opacity: [1, 0],
        translateY: [0, -10],
        scale: [1, 0.96],
        duration: 200,
        easing: "easeInCubic",
        complete: finalize,
      });
    } else {
      finalize();
    }
  }

  viewshedBtn.addEventListener("click", () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  closeBtn.addEventListener("click", closePanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      if (isPicking) {
        cancelPicking();
      } else {
        closePanel();
      }
    }
  });

  // ── Drag-to-move ──────────────────────────────────────────────

  (function makeDraggable() {
    let dragging = false;
    let startX, startY, startLeft, startTop;

    function startDrag(clientX, clientY) {
      dragging  = true;
      startX    = clientX;
      startY    = clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop  = rect.top;
      panel.style.left   = startLeft + "px";
      panel.style.top    = startTop + "px";
      panel.style.right  = "auto";
      panel.style.bottom = "auto";
    }

    function moveDrag(clientX, clientY) {
      if (!dragging) return;
      panel.style.left = Math.max(0, startLeft + (clientX - startX)) + "px";
      panel.style.top  = Math.max(0, startTop  + (clientY - startY)) + "px";
    }

    function endDrag() {
      if (dragging) _justDragged = true;
      dragging = false;
    }

    panelHeader.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });

    panelHeader.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });

    document.addEventListener("mousemove", (e) => {
      moveDrag(e.clientX, e.clientY);
    });

    document.addEventListener("touchmove", (e) => {
      if (!dragging || e.touches.length !== 1) return;
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });

    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);
    document.addEventListener("touchcancel", endDrag);
  })();

  // ── DEM selector population ───────────────────────────────────

  function populateDemSelect() {
    const currentValue = demSelect.value;

    const eligible = loadedLayers.filter(
      (lr) =>
        isRasterLayerRecord(lr) &&
        lr.rasterKind === "geotiff" &&
        lr.rasterImage &&
        lr.rasterTransform &&
        lr.rasterMetadata?.bandCount >= 1
    );

    demSelect.innerHTML =
      '<option value="">— select elevation raster —</option>' +
      eligible
        .map(
          (lr) =>
            `<option value="${lr.id}"${lr.id === currentValue ? " selected" : ""}>${escapeHtml(lr.name)}</option>`
        )
        .join("");
  }

  // Re-populate whenever the layer list DOM changes (addLayerRecord /
  // removeLayer both call renderLayerList which mutates #layer-list).
  const layerListEl = document.getElementById("layer-list");
  if (layerListEl) {
    new MutationObserver(() => {
      if (!panel.hidden) populateDemSelect();
    }).observe(layerListEl, { childList: true, subtree: false });
  }

  // ── DEM source cards ──────────────────────────────────────────

  const GLOBAL_DEM_DEFAULT_RADIUS = 10000; // metres

  let vsDemSource = "local"; // "local" | "global"

  demSrcCtrl.addEventListener("click", (e) => {
    const btn = e.target.closest(".wt-dem-card");
    if (!btn) return;
    const src = btn.dataset.demSource;
    if (!src || src === vsDemSource) return;
    vsDemSource = src;
    demSrcCtrl.querySelectorAll(".wt-dem-card")
      .forEach(b => b.classList.toggle("is-active", b.dataset.demSource === src));
    demSelectWrap.classList.toggle("is-open", src === "local");
    if (src === "global") {
      if (!Number(maxRadiusInp.value)) {
        maxRadiusInp.value = GLOBAL_DEM_DEFAULT_RADIUS;
        updateRadiusCircle();
      }
    }
  });

  // ── Terrarium tile helpers ─────────────────────────────────────
  // Moved to app/dem-utils.js (loaded before this script).
  // Globals available: degToRad, latToTileY, lngToTileX, tileXToLng,
  //   tileYToLat, chooseZoom, fetchTileImageData, fetchGlobalDem,
  //   TERRARIUM_URL, TILE_SIZE

  function setPicking(active) {
    isPicking = active;
    pickBtn.classList.toggle("is-picking", active);
    viewshedBtn.classList.toggle("vs-picking", active);
    document.body.classList.toggle("map-picking-observer", active);

    if (active) {
      pickBtn.innerHTML = PICK_ICON_SVG + " Click on map…";
      map.on("click", onMapPickClick);
      updateStatus("Click on the map to set the observer location. Press Escape to cancel.");
    } else {
      pickBtn.innerHTML = PICK_ICON_SVG + " Pick from Map";
      map.off("click", onMapPickClick);
    }
  }

  function cancelPicking() {
    setPicking(false);
  }

  // Track whether the panel was just dragged so we can ignore the
  // spurious map click that fires immediately after a drag-end.
  let _justDragged = false;

  function onMapPickClick(e) {
    if (_justDragged) { _justDragged = false; return; }
    setPicking(false);
    setObserverLocation(e.latlng);
    updateStatus("Observer location set.");
  }

  function updateRadiusCircle() {
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
    if (!observerLatLng) return;
    const r = Number(maxRadiusInp.value);
    if (!r || r <= 0) return;
    radiusCircle = L.circle(observerLatLng, {
      radius:      r,
      color:       "#00ff78",
      weight:      1.5,
      opacity:     0.7,
      fillOpacity: 0.06,
      dashArray:   "5 4",
      interactive: false,
      pane:        "overlayPane",
    }).addTo(map);
  }

  function setObserverLocation(latlng) {
    observerLatLng = latlng;

    coordsDisplay.textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    coordsDisplay.classList.add("is-set");
    clearObsBtn.hidden = false;

    if (observerMarker) map.removeLayer(observerMarker);
    observerMarker = L.circleMarker(latlng, {
      radius: 7,
      color: "#ffffff",
      fillColor: "#00ff78",
      fillOpacity: 1,
      weight: 2.5,
      interactive: false,
      pane: "markerPane",
    }).addTo(map);
    observerMarker.bindTooltip("Observer", {
      permanent: false,
      direction: "top",
      offset: [0, -8],
      className: "measure-tooltip",
    });

    updateRadiusCircle();
  }

  maxRadiusInp.addEventListener("input", updateRadiusCircle);

  pickBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isPicking) {
      cancelPicking();
    } else {
      setPicking(true);
    }
  });

  clearObsBtn.addEventListener("click", () => {
    if (isPicking) cancelPicking();
    observerLatLng = null;
    if (observerMarker) { map.removeLayer(observerMarker); observerMarker = null; }
    if (radiusCircle)   { map.removeLayer(radiusCircle);   radiusCircle   = null; }
    coordsDisplay.textContent = "Not set";
    coordsDisplay.classList.remove("is-set");
    clearObsBtn.hidden = true;
  });

  // ── Validation ────────────────────────────────────────────────

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  }

  function clearError() {
    errorMsg.hidden = true;
    errorMsg.textContent = "";
  }

  function validate() {
    clearError();

    if (!vsDemSource === "global" && !demSelect.value) {
      showError("Please select a DEM raster layer, or enable Use Global DEM.");
      return false;
    }

    const obsH = Number(obsHeightInp.value);
    if (!Number.isFinite(obsH) || obsH < 0) {
      showError("Observer height must be a non-negative number.");
      return false;
    }

    const tgtH = Number(tgtHeightInp.value);
    if (!Number.isFinite(tgtH) || tgtH < 0) {
      showError("Target height must be a non-negative number.");
      return false;
    }

    const maxR = Number(maxRadiusInp.value);
    if (!Number.isFinite(maxR) || maxR < 0) {
      showError("Max radius must be a non-negative number (0 = unlimited).");
      return false;
    }

    if (vsDemSource === "global" && !(maxR > 0)) {
      showError("A radius is required when using the Global DEM (try 5000–20000 m).");
      return false;
    }

    if (vsDemSource === "global" && maxR > 50000) {
      showError("Radius is limited to 50 000 m with the Global DEM to avoid fetching too many tiles.");
      return false;
    }

    if (!observerLatLng) {
      showError("Pick an observer location on the map first.");
      return false;
    }

    return true;
  }

  // ── Progress UI ───────────────────────────────────────────────

  function showProgress() {
    progressEl.hidden = false;
    progressLabel.textContent = "Computing viewshed…";
    applyBtn.disabled = true;
    isComputing       = true;
    // Trigger fade-in on next frame so the transition fires after display change
    requestAnimationFrame(() => progressEl.classList.add("is-visible"));
  }

  let _hideTimer = null;
  function hideProgress() {
    clearTimeout(_hideTimer);
    applyBtn.disabled = false;
    isComputing       = false;
    progressEl.classList.remove("is-visible");
    // Wait for the fade-out to finish before setting hidden
    _hideTimer = setTimeout(() => {
      progressEl.hidden = true;
      progressLabel.textContent = "Computing viewshed…";
    }, 300);
  }

  // ── Viewshed algorithm ────────────────────────────────────────

  /**
   * Radial Bresenham line-of-sight sweep.
   *
   * For every perimeter pixel, traces a ray from the observer outward.
   * Each cell along a ray is visible if its angle-of-elevation from the
   * observer is ≥ the running maximum encountered so far on that ray.
   *
   * @param {object} opts
   * @param {TypedArray} opts.dem        flat row-major elevation values (band 0)
   * @param {number}     opts.width      DEM pixel width
   * @param {number}     opts.height     DEM pixel height
   * @param {number}     opts.pixObs     observer column (float, clamped to int)
   * @param {number}     opts.rowObs     observer row    (float, clamped to int)
   * @param {number}     opts.cellSizeX  horizontal cell size in metres
   * @param {number}     opts.cellSizeY  vertical cell size in metres
   * @param {number}     opts.obsElev    DEM elevation at observer cell
   * @param {number}     opts.obsH       observer height above ground (m)
   * @param {number}     opts.tgtH       target height above ground (m)
   * @param {boolean}    opts.curvature  apply Earth curvature + refraction
   * @returns {Uint8Array} visibility — 1 = visible, 0 = not visible
   */
  function computeViewshed({ dem, width, height, pixObs, rowObs,
                              cellSizeX, cellSizeY, obsElev, obsH, tgtH, curvature,
                              maxRadius }) {
    const observerElev = obsElev + obsH;
    const result = new Uint8Array(width * height);

    // Convert maxRadius (metres) to a max pixel distance for fast culling.
    // Use the smaller of the two cell sizes to be conservative (inclusive).
    const avgCellSize = (cellSizeX + cellSizeY) / 2;
    const maxPixelDist = (maxRadius > 0) ? (maxRadius / avgCellSize) : Infinity;

    const c0 = Math.round(pixObs);
    const r0 = Math.round(rowObs);
    if (c0 >= 0 && c0 < width && r0 >= 0 && r0 < height) {
      result[r0 * width + c0] = 1; // observer cell always visible
    }

    function traceLine(r1, c1) {
      // Guard: skip degenerate ray (observer → itself), which would infinite-loop
      // because Bresenham makes no progress when dr===0 && dc===0.
      if (r1 === r0 && c1 === c0) return;

      let r = r0, c = c0;
      const dr = Math.abs(r1 - r0);
      const dc = Math.abs(c1 - c0);
      const sr = r1 > r0 ? 1 : -1;
      const sc = c1 > c0 ? 1 : -1;
      let err = dr - dc;
      let maxAngle = -Infinity;

      while (true) {
        const e2 = 2 * err;
        if (e2 > -dc) { err -= dc; c += sc; }
        if (e2 <  dr) { err += dr; r += sr; }

        if (r < 0 || r >= height || c < 0 || c >= width) break;

        const dx = (c - c0);
        const dy = (r - r0);
        if (dx * dx + dy * dy > maxPixelDist * maxPixelDist) break;

        const idx  = r * width + c;
        const elev = Number(dem[idx]);

        const dxM  = dx * cellSizeX;
        const dyM  = dy * cellSizeY;
        const dist = Math.sqrt(dxM * dxM + dyM * dyM) || 0.001;

        // Earth curvature + atmospheric refraction correction (drop in metres)
        const curv  = curvature ? (dist * dist / (2 * EARTH_RADIUS_M)) * (1 - REFRACTION_K) : 0;
        // terrainAngle: bare terrain angle from observer — blocks LOS for
        // cells further along the ray. maxAngle tracks this, not tgtH.
        const terrainAngle = (elev - curv - observerElev) / dist;

        // visAngle: angle to the top of a target of height tgtH on this
        // cell. Visible when this clears the current horizon.
        const visAngle = (elev + tgtH - curv - observerElev) / dist;

        result[idx] = (visAngle >= maxAngle) ? 1 : 0;
        if (terrainAngle > maxAngle) maxAngle = terrainAngle;

        if (r === r1 && c === c1) break;
      }
    }

    // Rays to every perimeter pixel
    for (let c = 0; c < width;      c++) { traceLine(0,          c); traceLine(height - 1, c); }
    for (let r = 1; r < height - 1; r++) { traceLine(r, 0);          traceLine(r, width - 1); }

    return result;
  }

  // ── Visibility → GeoJSON polygon tracing ─────────────────────

  /**
   * Trace the boundary of all visible (value=1) cells in the visibility
   * grid and return a dissolved GeoJSON MultiPolygon in geographic
   * coordinates (lng, lat).
   *
   * Uses the same half-edge approach as the watershed basin tracer:
   * for every visible cell, emit an edge for each side that borders a
   * non-visible (or out-of-bounds) cell.  Then walk the half-edge graph
   * to close rings, classify exterior / hole rings by signed area, and
   * assemble a MultiPolygon.
   *
   * @param {Uint8Array} visibility  flat row-major grid, 1 = visible
   * @param {number}     W           grid width  (columns)
   * @param {number}     H           grid height (rows)
   * @param {object}     transform   raster transform with .extent and
   *                                 .unprojectRasterPoint(x,y)
   * @returns {{ type: "MultiPolygon", coordinates: Array }}
   */
  function visibilityToMultiPolygon(visibility, W, H, transform) {
    const ext    = transform.extent;
    const cw     = (ext.maxX - ext.minX) / W;
    const ch     = (ext.maxY - ext.minY) / H;
    const stride = W + 1;  // grid of corner nodes is (W+1) × (H+1)

    /** Convert a corner node (col, row) in node-space to [lng, lat]. */
    function project(col, row) {
      const pt = transform.unprojectRasterPoint(
        ext.minX + col * cw,
        ext.maxY - row * ch
      );
      return [pt.lng, pt.lat];
    }

    function nodeKey(col, row) { return row * stride + col; }

    function isVisible(r, c) {
      if (r < 0 || r >= H || c < 0 || c >= W) return false;
      return visibility[r * W + c] === 1;
    }

    // Build directed half-edge adjacency: for each boundary segment,
    // store a directed edge from start-node → end-node such that the
    // visible cell is on the LEFT when walking from start to end.
    const edgeMap = new Map();  // nodeKey(start) → [nodeKey(end), ...]

    function addEdge(c1, r1, c2, r2) {
      const k = nodeKey(c1, r1);
      const v = nodeKey(c2, r2);
      const arr = edgeMap.get(k);
      if (arr === undefined) edgeMap.set(k, [v]);
      else arr.push(v);
    }

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (!isVisible(r, c)) continue;
        // Top edge (r,c)→(r): visible cell on left = walk left→right
        if (!isVisible(r - 1, c)) addEdge(c,     r,     c + 1, r);
        // Right edge: walk top→bottom
        if (!isVisible(r, c + 1)) addEdge(c + 1, r,     c + 1, r + 1);
        // Bottom edge: walk right→left
        if (!isVisible(r + 1, c)) addEdge(c + 1, r + 1, c,     r + 1);
        // Left edge: walk bottom→top
        if (!isVisible(r, c - 1)) addEdge(c,     r + 1, c,     r);
      }
    }

    // Walk the half-edge graph to close rings.
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
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
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

    const rings = [];
    for (const [startKey, targets] of edgeMap) {
      while (targets.length > 0) {
        const ring = [];
        let curKey = startKey;
        const maxSteps = edgeMap.size + 4;
        for (let step = 0; step < maxSteps; step++) {
          const col = curKey % stride;
          const row = (curKey / stride) | 0;
          ring.push(project(col, row));
          const nexts = edgeMap.get(curKey);
          if (!nexts || nexts.length === 0) break;
          const nextKey = nexts.shift();
          if (nextKey === startKey) { ring.push(ring[0]); break; }
          curKey = nextKey;
        }
        if (ring.length >= 4) rings.push(simplifyCollinear(ring));
      }
    }

    if (!rings.length) {
      return { type: "MultiPolygon", coordinates: [] };
    }

    // Classify rings: exterior = CW in screen space (negative shoelace in
    // geographic lng/lat because Y increases northward → sign flips).
    const exteriors = rings.filter((r) => signedArea2(r) < 0);
    const holes     = rings.filter((r) => signedArea2(r) >= 0);

    if (!exteriors.length) {
      // Fallback: treat all rings as exteriors (degenerate case)
      return {
        type: "MultiPolygon",
        coordinates: rings.map((r) => [r]),
      };
    }

    const polygons = exteriors.map((ext) => [
      ext,
      ...holes.filter((h) => pointInRing(h[0], ext)),
    ]);

    return { type: "MultiPolygon", coordinates: polygons };
  }

  // ── Layer management ──────────────────────────────────────────

  // When set to true, onRemove should skip clearing the observer marker
  // because the layer is being replaced internally (re-run), not deleted.
  let _replacingViewshed = false;

  function removeExistingViewshedLayer() {
    const existing = loadedLayers.find((lr) => lr.name === VIEWSHED_LAYER_NAME);
    if (existing) {
      _replacingViewshed = true;
      removeLayer(existing.id);
      _replacingViewshed = false;
    }
  }

  /**
   * Build a vector layer record for the viewshed result.
   *
   * The GeoJSON FeatureCollection contains exactly two features:
   *   [0] MultiPolygon — the dissolved visible area
   *   [1] Point        — the observer location
   *
   * Leaflet renders polygons in overlayPane and point markers in
   * markerPane (which sits above overlayPane), so the observer point
   * is always drawn on top of the viewshed polygon without any extra
   * z-index juggling.
   */
  function buildViewshedLayerRecord(multiPolygon, obsLatLng) {
    const VIEWSHED_COLOR   = "#00ff78";
    const OBSERVER_COLOR   = "#ffffff";

    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { type: "viewshed_area", label: "Visible area" },
          geometry: multiPolygon,
        },
        {
          type: "Feature",
          properties: {
            type:  "observer",
            label: "Observer",
            lat:   obsLatLng.lat,
            lng:   obsLatLng.lng,
          },
          geometry: {
            type:        "Point",
            coordinates: [obsLatLng.lng, obsLatLng.lat],
          },
        },
      ],
    };

    // Style config: polygon fill + stroke in viewshed green;
    // point rendered as a contrasting marker.
    const styleConfig = createDefaultStyleConfig(VIEWSHED_COLOR);
    styleConfig.fillOpacity   = 0.45;
    styleConfig.strokeOpacity = 0.8;
    styleConfig.strokeWidth   = 1.5;

    const color = VIEWSHED_COLOR;
    const layerGroup = L.featureGroup();

    // Render polygon feature via L.geoJSON with custom styling.
    const polygonLayer = L.geoJSON(geojson.features[0], {
      style: () => ({
        color:       VIEWSHED_COLOR,
        fillColor:   VIEWSHED_COLOR,
        fillOpacity: 0.45,
        opacity:     0.8,
        weight:      1.5,
        pane:        "overlayPane",
      }),
    });
    polygonLayer.feature = geojson.features[0];
    layerGroup.addLayer(polygonLayer);

    // Render observer point as a circle marker, explicitly in markerPane
    // so it always renders above the polygon overlay.
    const obsMarker = L.circleMarker([obsLatLng.lat, obsLatLng.lng], {
      radius:      7,
      color:       OBSERVER_COLOR,
      fillColor:   VIEWSHED_COLOR,
      fillOpacity: 1,
      weight:      2.5,
      pane:        "markerPane",
      interactive: true,
    });
    obsMarker.bindTooltip("Observer", {
      permanent:  false,
      direction:  "top",
      offset:     [0, -8],
      className:  "measure-tooltip",
    });
    obsMarker.bindPopup(
      `<strong>Observer</strong><br>Lat: ${obsLatLng.lat.toFixed(5)}<br>Lng: ${obsLatLng.lng.toFixed(5)}`
    );
    obsMarker.feature = geojson.features[1];
    layerGroup.addLayer(obsMarker);

    return {
      id:                     crypto.randomUUID(),
      kind:                   "vector",
      name:                   VIEWSHED_LAYER_NAME,
      sourceType:             "Viewshed Analysis",
      color,
      geometryKind:           "mixed",
      isVisible:              true,
      geojson,
      fields:                 ["type", "label", "lat", "lng"],
      crs:                    CRSManager.DEFAULT_CRS,
      crsMetadata:            CRSManager.getCrsMetadata(CRSManager.DEFAULT_CRS),
      styleConfig,
      labelConfig:            createDefaultLabelConfig(),
      filterConfig:           createDefaultFilterConfig(),
      interpolationConfig:    createDefaultInterpolationConfig(),
      heatmapConfig:          createDefaultHeatmapConfig(),
      interpolationOverlay:   null,
      interpolationObjectUrl: "",
      layerGroup,
      featureCount:           2,
      visibleFeatureCount:    2,
      layerOpacity:           1,
      isDerived:              true,
      onRemove() {
        // Skip cleanup when replacing the layer after a re-run.
        if (_replacingViewshed) return;
        if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
        observerLatLng = null;
        coordsDisplay.textContent = "";
        coordsDisplay.classList.remove("is-set");
        clearObsBtn.hidden = true;
      },
    };
  }

  /**
   * Add the viewshed layer at index 0 of loadedLayers so it sits on TOP of
   * the DEM in both the layer panel and on the Leaflet map.
   */
  function addViewshedLayerRecord(layerRecord) {
    loadedLayers.unshift(layerRecord);

    // Re-sync Leaflet z-order: index-0 = top = added LAST.
    const allVisible = loadedLayers.filter((lr) => lr.isVisible !== false);
    allVisible.forEach((lr) => map.removeLayer(lr.layerGroup));
    [...allVisible].reverse().forEach((lr) => lr.layerGroup.addTo(map));

    if (typeof renderLayerList === "function") renderLayerList();
    if (typeof renderEditableLayerOptions === "function") renderEditableLayerOptions();
    if (typeof renderAttributeTable === "function") renderAttributeTable();
    if (typeof updateInterpolationLegend === "function") updateInterpolationLegend();
    if (typeof onProjectDirty === "function") onProjectDirty();
  }

  // ── Apply handler ─────────────────────────────────────────────

  applyBtn.addEventListener("click", async () => {
    if (isComputing) return;
    if (!validate()) return;

    const isGlobal  = vsDemSource === "global";
    const obsH      = Number(obsHeightInp.value);
    const tgtH      = Number(tgtHeightInp.value);
    const maxRadius = Number(maxRadiusInp.value);  // 0 = unlimited (local only)
    const curvature = curvatureChk.checked;

    // Sync guard: for local DEM, check record still exists before showing spinner
    let localDemRecord = null;
    if (!isGlobal) {
      localDemRecord = loadedLayers.find((lr) => lr.id === demSelect.value);
      if (!localDemRecord?.rasterImage || !localDemRecord?.rasterTransform) {
        showError("Selected DEM layer is no longer available.");
        return;
      }
    }

    showProgress();
    clearError();

    // Safety net: spinner resets after 2 min if something fails outside try/catch
    const _spinnerGuard = setTimeout(() => { if (isComputing) hideProgress(); }, 120_000);

    try {
      let dem, demWidth, demHeight, transform, cellSizeX, cellSizeY;

      if (isGlobal) {
        // ── Global path: fetch Terrarium tiles ──────────────────
        progressLabel.textContent = "Fetching elevation tiles…";
        const result = await fetchGlobalDem(
          observerLatLng,
          maxRadius,
          (msg) => { progressLabel.textContent = msg; }
        );
        dem       = result.dem;
        demWidth  = result.width;
        demHeight = result.height;
        transform = result.transform;
        cellSizeX = result.cellSizeX;
        cellSizeY = result.cellSizeY;
        progressLabel.textContent = "Computing viewshed…";

      } else {
        // ── Local GeoTIFF path ───────────────────────────────────
        progressLabel.textContent = "Computing viewshed…";
        transform = localDemRecord.rasterTransform;
        demWidth  = transform.width;
        demHeight = transform.height;

        const rasters = await localDemRecord.rasterImage.readRasters({
          samples: [0], width: demWidth, height: demHeight, interleave: true,
        });
        dem = rasters;

        const extent = transform.extent;
        cellSizeX = Math.abs((extent.maxX - extent.minX) / demWidth);
        cellSizeY = Math.abs((extent.maxY - extent.minY) / demHeight);
      }

      // ── Project observer LatLng → pixel ───────────────────────
      const [rasterX, rasterY] = transform.projectLatLngToRaster(observerLatLng);
      const [pixObs,  rowObs]  = transform.rasterToPixel(rasterX, rasterY);

      if (pixObs < 0 || pixObs >= demWidth || rowObs < 0 || rowObs >= demHeight) {
        throw new Error(
          "Observer point is outside the DEM extent. " +
          (isGlobal
            ? "This should not happen — please report a bug."
            : "Move the observer inside the loaded elevation layer.")
        );
      }

      // ── Ground elevation at observer ──────────────────────────
      const obsIdx  = Math.round(rowObs) * demWidth + Math.round(pixObs);
      const obsElev = Number(dem[obsIdx]);
      if (!Number.isFinite(obsElev)) {
        throw new Error("Observer point falls on a no-data cell in the DEM.");
      }

      // ── Yield so the progress bar actually renders ─────────────
      await new Promise((resolve) => setTimeout(resolve, 0));

      // ── Run viewshed algorithm ────────────────────────────────
      const visibility = computeViewshed({
        dem, width: demWidth, height: demHeight,
        pixObs, rowObs, cellSizeX, cellSizeY,
        obsElev, obsH, tgtH, curvature, maxRadius,
      });

      // ── Yield so the progress label update is visible ─────────
      progressLabel.textContent = "Tracing viewshed polygon\u2026";
      await new Promise((resolve) => setTimeout(resolve, 0));

      // ── Trace pixel boundaries → dissolved MultiPolygon ──────
      const multiPolygon = visibilityToMultiPolygon(visibility, demWidth, demHeight, transform);

      // ── Remove temp observer marker (now embedded in layer) ───
      if (observerMarker) { map.removeLayer(observerMarker); observerMarker = null; }

      // ── Add layer ─────────────────────────────────────────────
      removeExistingViewshedLayer();
      const layerRecord = buildViewshedLayerRecord(multiPolygon, observerLatLng);
      addViewshedLayerRecord(layerRecord);

      const src = isGlobal ? "Global DEM (Terrarium ~30 m)" : localDemRecord.name;
      updateStatus(`Viewshed complete (${src}). Visible areas shown in green on the "Viewshed" layer.`);

    } catch (err) {
      showError(err.message);
      updateStatus(err.message, true);
    } finally {
      clearTimeout(_spinnerGuard);
      hideProgress();
    }
  });

})();
