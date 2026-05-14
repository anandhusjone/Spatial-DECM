/* =============================================================
   60-viewshed.js — Live Viewshed Analysis Panel
   Depends on globals from 00-core.js and 10-analysis-layers.js:
     map, canAnimate, anime, updateStatus, loadedLayers,
     addLayerRecord, removeLayer, isRasterLayerRecord,
     dataURLToBlob, escapeHtml,
     createDefaultStyleConfig, createDefaultLabelConfig, createDefaultFilterConfig
   ============================================================= */

(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────────

  const VIEWSHED_LAYER_NAME = "Viewshed";
  const VISIBLE_R   = 0;
  const VISIBLE_G   = 255;
  const VISIBLE_B   = 120;
  const VISIBLE_A   = Math.round(0.45 * 255); // pre-multiplied for ImageData
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
  const globalDemChk  = document.getElementById("vs-global-dem");
  const obsHeightInp  = document.getElementById("vs-observer-height");
  const tgtHeightInp  = document.getElementById("vs-target-height");
  const maxRadiusInp  = document.getElementById("vs-max-radius");
  const radiusHint    = document.getElementById("vs-radius-hint");
  const curvatureChk  = document.getElementById("vs-curvature");
  const pickBtn       = document.getElementById("vs-pick-btn");
  const coordsDisplay = document.getElementById("vs-coords-display");
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

    panelHeader.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging  = true;
      startX    = e.clientX;
      startY    = e.clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop  = rect.top;
      panel.style.left   = startLeft + "px";
      panel.style.top    = startTop + "px";
      panel.style.right  = "auto";
      panel.style.bottom = "auto";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.left = Math.max(0, startLeft + (e.clientX - startX)) + "px";
      panel.style.top  = Math.max(0, startTop  + (e.clientY - startY)) + "px";
    });

    document.addEventListener("mouseup", () => {
      if (dragging) _justDragged = true;
      dragging = false;
    });
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

  // ── Global DEM toggle ─────────────────────────────────────────

  const GLOBAL_DEM_DEFAULT_RADIUS = 10000; // metres — default when radius is 0

  function onGlobalDemToggle() {
    const isGlobal = globalDemChk.checked;
    demSelectWrap.hidden = isGlobal;
    if (isGlobal) {
      radiusHint.textContent = "(required — max 50 km)";
      if (!Number(maxRadiusInp.value)) {
        maxRadiusInp.value = GLOBAL_DEM_DEFAULT_RADIUS;
        updateRadiusCircle();
      }
    } else {
      radiusHint.textContent = "(0 = unlimited)";
    }
  }

  globalDemChk.addEventListener("change", onGlobalDemToggle);

  // ── Terrarium tile helpers ─────────────────────────────────────
  //
  // Elevation tiles from AWS Open Data (public, CORS-enabled, no auth):
  //   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
  //
  // RGB encoding: elevation (m) = (R * 256 + G + B / 256) − 32768
  // Coverage: global, ~30 m/px at zoom 12.

  const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const TILE_SIZE     = 256;

  function degToRad(d) { return d * Math.PI / 180; }

  function latToTileY(lat, z) {
    const n      = Math.pow(2, z);
    const sinLat = Math.sin(degToRad(lat));
    return n * (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI));
  }
  function lngToTileX(lng, z) {
    return Math.pow(2, z) * (lng + 180) / 360;
  }
  function tileXToLng(x, z) {
    return x / Math.pow(2, z) * 360 - 180;
  }
  function tileYToLat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  /** Pick zoom so the stitched raster is ~1024 px wide, capped at z=12 (~30 m/px). */
  function chooseZoom(lat, radiusM) {
    const targetMPP = radiusM / 512;
    const mpp0      = 156543 * Math.cos(degToRad(lat));
    return Math.max(2, Math.min(12, Math.round(Math.log2(mpp0 / targetMPP))));
  }

  async function fetchTileImageData(z, x, y) {
    const url = TERRARIUM_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    const img = await new Promise((resolve, reject) => {
      const i    = new Image();
      i.crossOrigin = "anonymous";
      i.onload  = () => resolve(i);
      i.onerror = () => reject(new Error(
        `Could not load elevation tile ${z}/${x}/${y}. ` +
        `Check your internet connection or try a smaller radius.`
      ));
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = c.height = TILE_SIZE;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.getContext("2d").getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  }

  /**
   * Fetch & stitch Terrarium tiles covering the observer's analysis circle.
   * Returns { dem, width, height, transform, cellSizeX, cellSizeY }
   * with `transform` matching the GeoTIFF rasterTransform interface.
   */
  async function fetchGlobalDem(center, radiusM, onStatus) {
    const z = chooseZoom(center.lat, radiusM);

    // Bounding box in degrees
    const latDeg = radiusM / 111320;
    const lngDeg = radiusM / (111320 * Math.cos(degToRad(center.lat)));
    const north  = center.lat + latDeg, south = center.lat - latDeg;
    const west   = center.lng - lngDeg, east  = center.lng + lngDeg;

    const txMin = Math.floor(lngToTileX(west,  z));
    const txMax = Math.floor(lngToTileX(east,  z));
    const tyMin = Math.floor(latToTileY(north, z));
    const tyMax = Math.floor(latToTileY(south, z));

    const nCols      = txMax - txMin + 1;
    const nRows      = tyMax - tyMin + 1;
    const totalTiles = nCols * nRows;

    if (totalTiles > 64) {
      throw new Error(
        `Radius too large at this location: would need ${totalTiles} tiles. ` +
        `Please reduce the radius (≤ ~50 km works well).`
      );
    }

    if (onStatus) onStatus(`Fetching ${totalTiles} elevation tile${totalTiles !== 1 ? "s" : ""} (zoom ${z})…`);

    // Fetch all tiles in parallel
    const jobs = [];
    for (let ry = 0; ry < nRows; ry++) {
      for (let cx = 0; cx < nCols; cx++) {
        jobs.push(fetchTileImageData(z, txMin + cx, tyMin + ry));
      }
    }
    const tileImgData = await Promise.all(jobs);

    // Stitch into one Float32Array
    const width  = nCols * TILE_SIZE;
    const height = nRows * TILE_SIZE;
    const dem    = new Float32Array(width * height);

    for (let ry = 0; ry < nRows; ry++) {
      for (let cx = 0; cx < nCols; cx++) {
        const imgd = tileImgData[ry * nCols + cx].data;
        for (let py = 0; py < TILE_SIZE; py++) {
          for (let px = 0; px < TILE_SIZE; px++) {
            const si  = (py * TILE_SIZE + px) * 4;
            const dr  = ry * TILE_SIZE + py;
            const dc  = cx * TILE_SIZE + px;
            dem[dr * width + dc] =
              (imgd[si] * 256 + imgd[si + 1] + imgd[si + 2] / 256) - 32768;
          }
        }
      }
    }

    // Geographic extent of the stitched raster
    const bboxNorth = tileYToLat(tyMin,     z);
    const bboxSouth = tileYToLat(tyMax + 1, z);
    const bboxWest  = tileXToLng(txMin,     z);
    const bboxEast  = tileXToLng(txMax + 1, z);

    const cellW = (bboxEast  - bboxWest)  / width;   // degrees per pixel
    const cellH = (bboxNorth - bboxSouth) / height;  // degrees per pixel (north-up)

    // Build a transform object matching the GeoTIFF rasterTransform interface
    const transform = {
      width,
      height,
      extent: { minX: bboxWest, maxX: bboxEast, minY: bboxSouth, maxY: bboxNorth },
      projectLatLngToRaster(latlng) { return [latlng.lng, latlng.lat]; },
      rasterToPixel(x, y) {
        return [(x - bboxWest) / cellW, (bboxNorth - y) / cellH];
      },
      unprojectRasterPoint(x, y) { return { lat: y, lng: x }; },
    };

    // Approximate cell sizes in metres (for the LOS distance calculation)
    const cellSizeX = cellW * 111320 * Math.cos(degToRad(center.lat));
    const cellSizeY = cellH * 111320;

    return { dem, width, height, transform, cellSizeX, cellSizeY };
  }



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

  pickBtn.addEventListener("click", () => {
    if (isPicking) {
      cancelPicking();
    } else {
      setPicking(true);
    }
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

    if (!globalDemChk.checked && !demSelect.value) {
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

    if (globalDemChk.checked && !(maxR > 0)) {
      showError("A radius is required when using the Global DEM (try 5000–20000 m).");
      return false;
    }

    if (globalDemChk.checked && maxR > 50000) {
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
    progressEl.hidden  = false;
    applyBtn.disabled  = true;
    isComputing        = true;
  }

  function hideProgress() {
    progressEl.hidden  = true;
    applyBtn.disabled  = false;
    isComputing        = false;
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
        // terrainAngle: bare terrain angle from observer -- blocks LOS for
        // cells further along the ray. maxAngle tracks this, not tgtH.
        const terrainAngle = (elev - curv - observerElev) / dist;

        // visAngle: angle to the top of a target of height tgtH on this
        // cell. Visible when this clears the current horizon.
        const visAngle = (elev + tgtH - curv - observerElev) / dist;

        if (visAngle >= maxAngle) {
          result[idx] = 1;
        } else {
          result[idx] = 0;
        }
        if (terrainAngle > maxAngle) maxAngle = terrainAngle;

        if (r === r1 && c === c1) break;
      }
    }

    // Rays to every perimeter pixel
    for (let c = 0; c < width;      c++) { traceLine(0,          c); traceLine(height - 1, c); }
    for (let r = 1; r < height - 1; r++) { traceLine(r, 0);          traceLine(r, width - 1); }

    return result;
  }

  // ── Canvas painting ───────────────────────────────────────────

  function paintViewshedToCanvas(visibility, width, height) {
    const canvas  = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx  = canvas.getContext("2d");
    const imgd = ctx.createImageData(width, height);
    const buf  = imgd.data;

    for (let i = 0, pi = 0; i < visibility.length; i++, pi += 4) {
      if (visibility[i]) {
        buf[pi]     = VISIBLE_R;
        buf[pi + 1] = VISIBLE_G;
        buf[pi + 2] = VISIBLE_B;
        buf[pi + 3] = VISIBLE_A;
      }
      // else alpha stays 0 (transparent) — no-write is faster
    }

    ctx.putImageData(imgd, 0, 0);
    return canvas;
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

  function buildViewshedLayerRecord(canvas, bounds) {
    const objectUrl = URL.createObjectURL(dataURLToBlob(canvas.toDataURL("image/png")));
    const overlay   = L.imageOverlay(objectUrl, bounds, {
      opacity:     1,
      interactive: false,
      pane:        "overlayPane",
    });
    const layerGroup = L.featureGroup([overlay]);

    return {
      id:                   crypto.randomUUID(),
      kind:                 "raster",
      name:                 VIEWSHED_LAYER_NAME,
      sourceType:           "Viewshed Analysis",
      color:                "#00ff78",
      isVisible:            true,
      geojson:              { type: "FeatureCollection", features: [] },
      fields:               [],
      styleConfig:          createDefaultStyleConfig("#00ff78"),
      labelConfig:          createDefaultLabelConfig(),
      filterConfig:         createDefaultFilterConfig(),
      interpolationConfig:  null,
      heatmapConfig:        null,
      interpolationOverlay: null,
      interpolationObjectUrl: "",
      layerGroup,
      featureCount:         1,
      visibleFeatureCount:  1,
      rasterObjectUrl:      objectUrl,
      rasterMetadata: {
        layerType:   "viewshed",
        methodLabel: "Line-of-Sight",
        bounds,
      },
      isDerived: true,
      onRemove() {
        // Skip cleanup when we are just replacing the layer after a re-run.
        if (_replacingViewshed) return;
        if (observerMarker) { map.removeLayer(observerMarker); observerMarker = null; }
        if (radiusCircle)   { map.removeLayer(radiusCircle);   radiusCircle   = null; }
        observerLatLng = null;
        coordsDisplay.textContent = "";
        coordsDisplay.classList.remove("is-set");
      },
    };
  }

  // ── Apply handler ─────────────────────────────────────────────

  applyBtn.addEventListener("click", async () => {
    if (isComputing) return;
    if (!validate()) return;

    const isGlobal  = globalDemChk.checked;
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

      // ── Paint to offscreen canvas ─────────────────────────────
      const canvas = paintViewshedToCanvas(visibility, demWidth, demHeight);

      // ── Geographic bounds ─────────────────────────────────────
      const bounds = (function () {
        const ext     = transform.extent;
        const corners = [
          transform.unprojectRasterPoint(ext.minX, ext.minY),
          transform.unprojectRasterPoint(ext.minX, ext.maxY),
          transform.unprojectRasterPoint(ext.maxX, ext.minY),
          transform.unprojectRasterPoint(ext.maxX, ext.maxY),
        ];
        return L.latLngBounds(corners.map((c) => L.latLng(c.lat, c.lng)));
      })();

      // ── Add layer ─────────────────────────────────────────────
      removeExistingViewshedLayer();
      const layerRecord = buildViewshedLayerRecord(canvas, bounds);
      addViewshedLayerRecord(layerRecord);

      const src = isGlobal ? "Global DEM (Terrarium ~30 m)" : localDemRecord.name;
      updateStatus(`Viewshed complete (${src}). Visible areas shown in green on the "Viewshed" layer.`);

    } catch (err) {
      showError(err.message);
      updateStatus(err.message, true);
    } finally {
      clearTimeout(_spinnerGuard);
      progressLabel.textContent = "Computing viewshed…";
      hideProgress();
    }
  });

})();
