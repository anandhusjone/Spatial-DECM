/* =============================================================
   60-viewshed.js — Viewshed / Diffraction Loss Modelling Panel
   Depends on globals from 00-core.js and 10-analysis-layers.js:
     map, canAnimate, anime, updateStatus, loadedLayers,
     addLayerRecord, removeLayer, isRasterLayerRecord,
     escapeHtml,
     createDefaultStyleConfig, createDefaultLabelConfig, createDefaultFilterConfig
   ============================================================= */

(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────────

  const VIEWSHED_LAYER_NAME     = "Viewshed";
  const KED_LAYER_NAME          = "KED Diffraction Loss";
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
  const singleRadiusWrap = document.getElementById("vs-single-radius-wrap");
  const radiusHint    = document.getElementById("vs-radius-hint");
  const curvatureChk  = document.getElementById("vs-curvature");
  const observerSrcCtrl = document.getElementById("vs-observer-source-ctrl");
  const singleObserverWrap = document.getElementById("vs-single-observer-wrap");
  const pointLayerWrap = document.getElementById("vs-point-layer-wrap");
  const pointLayerSelect = document.getElementById("vs-point-layer-select");
  const radiusFieldSelect = document.getElementById("vs-radius-field-select");
  const batchRadiusInp = document.getElementById("vs-batch-radius");
  const batchRadiusWrap = document.getElementById("vs-batch-radius-wrap");
  const pickBtn       = document.getElementById("vs-pick-btn");
  const coordsDisplay = document.getElementById("vs-coords-display");
  const clearObsBtn   = document.getElementById("vs-clear-obs-btn");
  const errorMsg      = document.getElementById("vs-error-msg");
  const progressEl    = document.getElementById("vs-progress");
  const progressLabel = document.getElementById("vs-progress-label");
  const applyBtn      = document.getElementById("vs-apply-btn");

  // KED refs
  const kedToggleBtn  = document.getElementById("vs-ked-toggle");
  const kedParams     = document.getElementById("vs-ked-params");
  const kedFreqInp    = document.getElementById("vs-ked-frequency");
  const kedTxPwrInp   = document.getElementById("vs-ked-tx-power");
  const kedRxThreshInp= document.getElementById("vs-ked-rx-thresh");
  const kedSamplesInp = document.getElementById("vs-ked-samples");

  // ── State ─────────────────────────────────────────────────────

  let observerLatLng = null;  // L.LatLng | null
  let observerMarker = null;  // L.CircleMarker | null
  let radiusCircle   = null;  // L.Circle | null — shows max-radius ring
  let isPicking      = false;
  let isComputing    = false;
  let kedEnabled     = false;
  let observerSource  = "single"; // "single" | "layer"

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
    viewshedBtn.setAttribute("aria-pressed", "true");
    viewshedBtn.classList.add("vs-active");
    const wt = document.getElementById("watershed-panel");
    if (wt && !wt.hidden) document.getElementById("watershed-panel-close-btn")?.click();
    const pk = document.getElementById("peaks-panel");
    if (pk && !pk.hidden) document.getElementById("peaks-panel-close-btn")?.click();
    populateDemSelect();
    populatePointLayerSelect();
    populateRadiusFieldSelect();
    clampPanelAfterLayout();

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

  // ── KED toggle ────────────────────────────────────────────────

  function setKedEnabled(active) {
    kedEnabled = active;
    kedToggleBtn.setAttribute("aria-checked", active ? "true" : "false");
    kedParams.classList.toggle("is-open", active);
    applyBtn.textContent = active ? "Run KED" : "Run Viewshed";
    applyBtn.classList.toggle("vs-apply-ked", active);
    clampPanelAfterLayout();
  }

  kedToggleBtn.addEventListener("click", () => {
    setKedEnabled(!kedEnabled);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      if (isPicking) {
        cancelPicking();
      } else {
        closePanel();
      }
    }
  });

  window.addEventListener("resize", clampPanelAfterLayout);

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
      const margin = 12;
      const maxLeft = Math.max(margin, window.innerWidth  - panel.offsetWidth - margin);
      const maxTop  = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
      panel.style.left = Math.min(Math.max(margin, startLeft + (clientX - startX)), maxLeft) + "px";
      panel.style.top  = Math.min(Math.max(margin, startTop  + (clientY - startY)), maxTop)  + "px";
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

  function getPointFeatures(layerRecord) {
    return (layerRecord?.geojson?.features || []).filter((feature) => {
      const type = feature?.geometry?.type;
      return type === "Point" || type === "MultiPoint";
    });
  }

  function getPointLayerRecords() {
    return loadedLayers.filter((lr) => {
      if (!lr || lr.kind !== "vector" || !lr.geojson) return false;
      const kind = typeof getLayerGeometryKind === "function" ? getLayerGeometryKind(lr) : lr.geometryKind;
      return (kind === "point" || kind === "mixed" || kind === "unknown") && getPointFeatures(lr).length > 0;
    });
  }

  function populatePointLayerSelect() {
    if (!pointLayerSelect) return;
    const currentValue = pointLayerSelect.value;
    const eligible = getPointLayerRecords();
    pointLayerSelect.innerHTML =
      '<option value="">— select point layer —</option>' +
      eligible
        .map((lr) => {
          const count = getPointFeatures(lr).length;
          const selected = lr.id === currentValue ? " selected" : "";
          return `<option value="${lr.id}"${selected}>${escapeHtml(lr.name)} (${count})</option>`;
        })
        .join("");
    if (currentValue && !eligible.some((lr) => lr.id === currentValue)) {
      pointLayerSelect.value = "";
    }
    populateRadiusFieldSelect();
  }

  function populateRadiusFieldSelect() {
    if (!radiusFieldSelect || !pointLayerSelect) return;
    const currentValue = radiusFieldSelect.value;
    const layerRecord = loadedLayers.find((lr) => lr.id === pointLayerSelect.value);
    const numericFields = [];
    const fields = typeof collectFieldNamesFromGeoJSON === "function"
      ? collectFieldNamesFromGeoJSON(layerRecord?.geojson)
      : [];
    const pointFeatures = getPointFeatures(layerRecord);

    fields.forEach((field) => {
      const hasNumericRadius = pointFeatures.some((feature) => {
        const value = Number(feature?.properties?.[field]);
        return Number.isFinite(value) && value > 0;
      });
      if (hasNumericRadius) numericFields.push(field);
    });

    radiusFieldSelect.innerHTML =
      '<option value="">Use one radius for all points</option>' +
      numericFields
        .map((field) => `<option value="${escapeHtml(field)}"${field === currentValue ? " selected" : ""}>${escapeHtml(field)}</option>`)
        .join("");
    if (currentValue && !numericFields.includes(currentValue)) {
      radiusFieldSelect.value = "";
    }
    updateBatchRadiusVisibility();
  }

  function updateBatchRadiusVisibility() {
    if (!batchRadiusWrap || !radiusFieldSelect) return;
    batchRadiusWrap.hidden = Boolean(radiusFieldSelect.value);
    clampPanelAfterLayout();
  }

  // Re-populate whenever the layer list DOM changes (addLayerRecord /
  // removeLayer both call renderLayerList which mutates #layer-list).
  const layerListEl = document.getElementById("layer-list");
  if (layerListEl) {
    new MutationObserver(() => {
      if (!panel.hidden) {
        populateDemSelect();
        populatePointLayerSelect();
      }
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

  function setObserverSource(source) {
    observerSource = source === "layer" ? "layer" : "single";
    observerSrcCtrl?.querySelectorAll(".wt-dem-card")
      .forEach((btn) => btn.classList.toggle("is-active", btn.dataset.observerSource === observerSource));

    if (singleObserverWrap) singleObserverWrap.hidden = observerSource !== "single";
    if (singleRadiusWrap) singleRadiusWrap.hidden = observerSource !== "single";
    if (pointLayerWrap) pointLayerWrap.classList.toggle("is-open", observerSource === "layer");
    if (observerSource === "layer") {
      if (isPicking) cancelPicking();
      if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
      populatePointLayerSelect();
    } else {
      updateRadiusCircle();
    }
    clampPanelAfterLayout();
  }

  observerSrcCtrl?.addEventListener("click", (e) => {
    const btn = e.target.closest(".wt-dem-card");
    if (!btn) return;
    setObserverSource(btn.dataset.observerSource);
  });

  pointLayerSelect?.addEventListener("change", populateRadiusFieldSelect);
  radiusFieldSelect?.addEventListener("change", updateBatchRadiusVisibility);

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

    coordsDisplay.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
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

  // ── Coordinate paste / manual entry ──────────────────────────
  function parseCoordInput(raw) {
    // Accept formats:  "lat, lng"  |  "lat lng"  |  "lat,lng"
    // Both decimal and DMS-like numbers; just numeric pairs.
    const clean = raw.trim().replace(/\s+/g, " ");
    const m = clean.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return L.latLng(lat, lng);
  }

  function applyCoordInput() {
    const latlng = parseCoordInput(coordsDisplay.value);
    if (!latlng) {
      // Invalid — flash the field red briefly
      coordsDisplay.classList.add("coords-invalid");
      setTimeout(() => coordsDisplay.classList.remove("coords-invalid"), 900);
      return;
    }
    if (isPicking) cancelPicking();
    clearError();
    setObserverLocation(latlng);
    // Pan map to the pasted point so user can see it
    map.setView(latlng, Math.max(map.getZoom(), 12), { animate: true });
  }

  coordsDisplay.addEventListener("paste", () => {
    // Let the paste event finish before reading value
    setTimeout(applyCoordInput, 0);
  });

  coordsDisplay.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyCoordInput(); }
  });

  coordsDisplay.addEventListener("blur", () => {
    // Only apply on blur if there's something typed
    if (coordsDisplay.value.trim() && !coordsDisplay.classList.contains("is-set")) {
      applyCoordInput();
    }
  });

  clearObsBtn.addEventListener("click", () => {
    if (isPicking) cancelPicking();
    observerLatLng = null;
    if (observerMarker) { map.removeLayer(observerMarker); observerMarker = null; }
    if (radiusCircle)   { map.removeLayer(radiusCircle);   radiusCircle   = null; }
    coordsDisplay.value = "";
    coordsDisplay.placeholder = "Not set — or paste lat, lng";
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

    if (vsDemSource !== "global" && !demSelect.value) {
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

    if (observerSource === "layer") {
      if (kedEnabled) {
        showError("Point layer mode creates vector viewsheds only. Disable KED or switch back to Single Point.");
        return false;
      }
      if (!pointLayerSelect?.value) {
        showError("Select a point vector layer for the observer source.");
        return false;
      }
      if (!radiusFieldSelect?.value) {
        const batchR = Number(batchRadiusInp?.value);
        if (!Number.isFinite(batchR) || batchR <= 0) {
          showError("Enter a common radius greater than 0 metres, or select a numeric radius field.");
          return false;
        }
        if (vsDemSource === "global" && batchR > 50000) {
          showError("Common radius is limited to 50 000 m with the Global DEM to avoid fetching too many tiles.");
          return false;
        }
      }
      return true;
    } else {
      const maxR = Number(maxRadiusInp.value);
      if (!Number.isFinite(maxR) || maxR < 0) {
        showError("Max radius must be a non-negative number (0 = unlimited).");
        return false;
      }

      if (vsDemSource === "global" && !(maxR > 0)) {
        showError("A radius is required when using the Global DEM (try 5000-20000 m).");
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
    }

    return true;
  }

  function readFiniteNumber(input, fallback) {
    const raw = input?.value ?? "";
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function clampIndex(value, maxExclusive) {
    return Math.min(maxExclusive - 1, Math.max(0, Math.round(value)));
  }

  function getCellSizesForLat(transform, width, height, lat) {
    const extent = transform.extent;
    const isGeographic = Math.abs(extent.maxX) <= 180 && Math.abs(extent.maxY) <= 90;
    const rawCellX = Math.abs((extent.maxX - extent.minX) / width);
    const rawCellY = Math.abs((extent.maxY - extent.minY) / height);
    if (isGeographic) {
      const cosLat = Math.max(0.01, Math.cos(lat * Math.PI / 180));
      return {
        cellSizeX: rawCellX * 111320 * cosLat,
        cellSizeY: rawCellY * 111320,
      };
    }
    return { cellSizeX: rawCellX, cellSizeY: rawCellY };
  }

  async function readLocalDemRecord(localDemRecord) {
    const transform = localDemRecord.rasterTransform;
    const width = transform.width;
    const height = transform.height;
    const dem = await localDemRecord.rasterImage.readRasters({
      samples: [0], width, height, interleave: true,
    });
    return { dem, width, height, transform };
  }

  function getFeaturePointCoords(feature) {
    const geom = feature?.geometry;
    if (!geom) return [];
    if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
      return [geom.coordinates];
    }
    if (geom.type === "MultiPoint" && Array.isArray(geom.coordinates)) {
      return geom.coordinates;
    }
    return [];
  }

  function getBatchObservers() {
    const layerRecord = loadedLayers.find((lr) => lr.id === pointLayerSelect?.value);
    const radiusField = radiusFieldSelect?.value || "";
    const commonRadius = Number(batchRadiusInp?.value);
    const observers = [];
    let skipped = 0;

    getPointFeatures(layerRecord).forEach((feature, featureIndex) => {
      const props = feature.properties || {};
      const radius = radiusField ? Number(props[radiusField]) : commonRadius;
      if (!Number.isFinite(radius) || radius <= 0) {
        skipped += 1;
        return;
      }
      if (vsDemSource === "global" && radius > 50000) {
        skipped += 1;
        return;
      }

      getFeaturePointCoords(feature).forEach((coord, coordIndex) => {
        const lng = Number(coord?.[0]);
        const lat = Number(coord?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          skipped += 1;
          return;
        }
        const sourceLabel = String(
          props.name ?? props.Name ?? props.label ?? props.Label ?? props.id ?? props.ID ?? `Point ${featureIndex + 1}`
        );
        observers.push({
          id: observers.length + 1,
          latlng: L.latLng(lat, lng),
          radius,
          sourceFeatureIndex: featureIndex,
          sourcePointIndex: coordIndex,
          sourceLabel,
          properties: props,
        });
      });
    });

    return { layerRecord, observers, skipped, radiusField };
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

    const c0 = clampIndex(pixObs, width);
    const r0 = clampIndex(rowObs, height);
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

  // ── Knife-Edge Diffraction (Epstein-Peterson) ───────────────

  /**
   * Compute the Fresnel-Kirchhoff diffraction parameter ν for a single
   * knife edge given distances d1, d2 to the obstacle tip and wavelength λ.
   *
   * ν = h * sqrt( 2(d1+d2) / (λ·d1·d2) )
   * where h is the clearance height (negative = obstacle above LOS).
   */
  function fresnelNu(h, d1, d2, lambda) {
    if (d1 <= 0 || d2 <= 0) return 0;
    return h * Math.sqrt(2 * (d1 + d2) / (lambda * d1 * d2));
  }

  /**
   * Approximate knife-edge diffraction loss (dB) for a given ν.
   * Uses the Lee approximation (accurate to < 1 dB):
   *   L = 0                          ν < -0.7
   *   L = 20·log10(0.5 - 0.62·ν)   -0.7 ≤ ν < 0
   *   L = 20·log10(0.5·exp(-0.95ν))  0  ≤ ν < 1
   *   L = 20·log10(0.4 - √(0.1184-(0.38-0.1ν)²)) 1 ≤ ν < 2.4
   *   L = 20·log10(0.225/ν)         ν ≥ 2.4
   * Positive return = loss in dB.
   */
  function kedLoss(nu) {
    if (nu < -0.7) return 0;
    let Jnu;
    if (nu < 0)   Jnu = 0.5 - 0.62 * nu;
    else if (nu < 1)   Jnu = 0.5 * Math.exp(-0.95 * nu);
    else if (nu < 2.4) Jnu = 0.4 - Math.sqrt(Math.max(0, 0.1184 - (0.38 - 0.1 * nu) ** 2));
    else               Jnu = 0.225 / nu;
    return -20 * Math.log10(Math.max(Jnu, 1e-10));
  }

  /**
   * Epstein-Peterson multiple knife-edge diffraction loss along a ray.
   *
   * Steps:
   *  1. Sample nSamples terrain heights between observer and target pixel.
   *  2. Find the set of peaks (points above the straight LOS between
   *     consecutive already-found knife edges).
   *  3. Sum the individual KE diffraction losses.
   *
   * @param {TypedArray} dem
   * @param {number}     W, H         DEM dimensions
   * @param {number}     c0, r0       observer pixel (col, row)
   * @param {number}     c1, r1       target pixel
   * @param {number}     obsElevM     observer elevation + height (m asl)
   * @param {number}     tgtH         target height above ground (m)
   * @param {number}     cellSizeX, cellSizeY  metres per pixel
   * @param {number}     lambda       wavelength in metres
   * @param {number}     nSamples     number of profile sample points
   * @param {boolean}    curvature    apply Earth curvature correction
   * @returns {number}  total additional diffraction loss in dB (≥ 0)
   */
  function multipleKedLoss(dem, W, H, c0, r0, c1, r1,
                            obsElevM, tgtH, cellSizeX, cellSizeY,
                            lambda, nSamples, curvature) {
    if (nSamples < 2) nSamples = 2;

    // Build terrain profile: array of { dist: metres, elev: metres }
    const profile = [];
    for (let s = 0; s <= nSamples; s++) {
      const t   = s / nSamples;
      const c   = c0 + t * (c1 - c0);
      const r   = r0 + t * (r1 - r0);
      const ci  = Math.round(c), ri = Math.round(r);
      if (ci < 0 || ci >= W || ri < 0 || ri >= H) continue;
      const dxM = (c - c0) * cellSizeX;
      const dyM = (r - r0) * cellSizeY;
      const d   = Math.sqrt(dxM * dxM + dyM * dyM);
      let elev  = Number(dem[ri * W + ci]);
      if (!Number.isFinite(elev)) elev = 0;
      // Earth curvature correction: terrain is effectively raised by d²/(2R)·(1-k)
      // because the Earth curves away from the LOS straight line.
      const curv = curvature ? (d * d / (2 * EARTH_RADIUS_M)) * (1 - REFRACTION_K) : 0;
      profile.push({ dist: d, elev: elev + curv });
    }

    if (profile.length < 2) return 0;

    const dTotal = profile[profile.length - 1].dist;
    if (dTotal <= 0) return 0;

    // Target apparent elevation at far end
    const tgtElev = profile[profile.length - 1].elev + tgtH;

    // Epstein-Peterson: iteratively find dominant knife edges
    // Start: segment is observer → target
    // A "knife edge" is the sample with the maximum clearance-height above
    // the straight line between the two endpoints of the current segment.
    const MAX_EDGES = 20;
    const edges = [0, profile.length - 1]; // indices of endpoints

    for (let iter = 0; iter < MAX_EDGES; iter++) {
      // Find the index with highest obstruction in each gap
      let bestIdx = -1, bestH = -Infinity;
      for (let i = 0; i < edges.length - 1; i++) {
        const ia = edges[i], ib = edges[i + 1];
        if (ib - ia < 2) continue;
        const da = profile[ia].dist, db = profile[ib].dist;
        const ea = (ia === 0) ? obsElevM : profile[ia].elev;
        const eb = (ib === profile.length - 1) ? tgtElev : profile[ib].elev;
        for (let j = ia + 1; j < ib; j++) {
          const dj = profile[j].dist;
          const t2 = (dj - da) / (db - da);
          const losElev = ea + t2 * (eb - ea);  // LOS elevation at j
          const h = losElev - profile[j].elev;  // positive = LOS above terrain (clear)
          if (-h > bestH) { bestH = -h; bestIdx = j; }
        }
      }
      // If no point blocks LOS (all clear), stop adding edges
      if (bestIdx < 0 || bestH <= 0) break;
      // Insert edge index in sorted order
      const pos = edges.findIndex((e) => e > bestIdx);
      edges.splice(pos < 0 ? edges.length - 1 : pos, 0, bestIdx);
    }

    // Sum loss over each knife-edge triplet
    let totalLoss = 0;
    for (let i = 1; i < edges.length - 1; i++) {
      const ia = edges[i - 1], ib = edges[i], ic = edges[i + 1];
      const ea = (ia === 0) ? obsElevM : profile[ia].elev;
      const ec = (ic === profile.length - 1) ? tgtElev : profile[ic].elev;
      const d1 = profile[ib].dist - profile[ia].dist;
      const d2 = profile[ic].dist - profile[ib].dist;
      if (d1 <= 0 || d2 <= 0) continue;
      // Clearance h: LOS elevation at the edge minus terrain height (negative = obstruction)
      const t2 = d1 / (d1 + d2);
      const losAtEdge = ea + t2 * (ec - ea);
      const h = losAtEdge - profile[ib].elev;  // positive = clear, negative = blocked
      const nu = fresnelNu(-h, d1, d2, lambda);
      totalLoss += kedLoss(nu);
    }

    return totalLoss; // dB, ≥ 0
  }

  /**
   * Compute the full KED signal-level raster.
   *
   * For each target pixel, compute:
   *   Rx (dBm) = Tx (dBm) - FSPL(d) - multipleKedLoss
   *
   * where FSPL = 20log10(4πd/λ).
   *
   * @returns {Float32Array} rxLevel in dBm, NaN = no path
   */
  function computeKedRaster({ dem, width, height, pixObs, rowObs,
                               cellSizeX, cellSizeY, obsElev, obsH,
                               tgtH, curvature, maxRadius,
                               freqMHz, txPowerDbm, nSamples }) {
    const lambda = 3e8 / (freqMHz * 1e6);   // wavelength in metres
    const obsElevM = obsElev + obsH;
    const avgCell  = (cellSizeX + cellSizeY) / 2;
    const maxPixDist = (maxRadius > 0) ? (maxRadius / avgCell) : Infinity;

    const c0 = clampIndex(pixObs, width);
    const r0 = clampIndex(rowObs, height);

    const result = new Float32Array(width * height).fill(NaN);

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const dx = c - c0, dy = r - r0;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        if (distPx > maxPixDist) continue;

        const dxM = dx * cellSizeX, dyM = dy * cellSizeY;
        const distM = Math.sqrt(dxM * dxM + dyM * dyM);
        if (distM < 0.1) {
          result[r * width + c] = txPowerDbm;
          continue;
        }

        // Free-space path loss (dB)
        const fspl = 20 * Math.log10(Math.max(distM, 1)) +
                     20 * Math.log10(freqMHz * 1e6) -
                     20 * Math.log10(3e8 / (4 * Math.PI));

        // Multiple KED diffraction loss
        const diffLoss = multipleKedLoss(
          dem, width, height, c0, r0, c, r,
          obsElevM, tgtH, cellSizeX, cellSizeY,
          lambda, nSamples, curvature
        );

        result[r * width + c] = txPowerDbm - fspl - diffLoss;
      }
    }
    return result;
  }

  /**
   * KED is much more expensive than binary viewshed because every output cell
   * samples a terrain profile. Keep the output grid bounded and scale it back
   * over the original DEM extent as an image overlay.
   */
  function prepareKedGrid({ dem, width, height, pixObs, rowObs, cellSizeX, cellSizeY }) {
    const MAX_KED_DIMENSION = 768;
    const longestSide = Math.max(width, height);
    if (longestSide <= MAX_KED_DIMENSION) {
      return { dem, width, height, pixObs, rowObs, cellSizeX, cellSizeY };
    }

    const scale = longestSide / MAX_KED_DIMENSION;
    const outWidth = Math.max(2, Math.round(width / scale));
    const outHeight = Math.max(2, Math.round(height / scale));
    const outDem = new Float32Array(outWidth * outHeight);

    for (let r = 0; r < outHeight; r++) {
      const srcR = Math.min(height - 1, Math.max(0, Math.round((r + 0.5) * height / outHeight - 0.5)));
      for (let c = 0; c < outWidth; c++) {
        const srcC = Math.min(width - 1, Math.max(0, Math.round((c + 0.5) * width / outWidth - 0.5)));
        outDem[r * outWidth + c] = dem[srcR * width + srcC];
      }
    }

    return {
      dem: outDem,
      width: outWidth,
      height: outHeight,
      pixObs: pixObs * outWidth / width,
      rowObs: rowObs * outHeight / height,
      cellSizeX: cellSizeX * width / outWidth,
      cellSizeY: cellSizeY * height / outHeight,
    };
  }

  // ── KED red opacity renderer ──────────────────────────────────

  /**
   * Render a Float32Array of rx-level values to an RGBA ImageData
   * as a fixed red overlay. Highest received value is fully opaque;
   * weaker received values, which indicate higher total path loss, fade out.
   */
  function kedRasterToCanvas(rxData, width, height, minVal, maxVal) {
    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx  = canvas.getContext("2d");
    const img  = ctx.createImageData(width, height);
    const data = img.data;
    const range = maxVal - minVal || 1;
    const minAlpha = 18;

    for (let i = 0; i < rxData.length; i++) {
      const v = rxData[i];
      const base = i * 4;
      if (!Number.isFinite(v)) {
        data[base]     = 0;
        data[base + 1] = 0;
        data[base + 2] = 0;
        data[base + 3] = 0;  // transparent
        continue;
      }
      const t = Math.max(0, Math.min(1, (v - minVal) / range));
      data[base]     = 255;
      data[base + 1] = 0;
      data[base + 2] = 0;
      data[base + 3] = Math.round(minAlpha + t * (255 - minAlpha));
    }

    ctx.putImageData(img, 0, 0);
    return canvas;
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
      sourceType:             "Viewshed / Diffraction Loss Modelling",
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
        coordsDisplay.value = "";
        coordsDisplay.placeholder = "Not set — or paste lat, lng";
        coordsDisplay.classList.remove("is-set");
        clearObsBtn.hidden = true;
      },
    };
  }

  function addSplitViewshedFeatures(features, multiPolygon, observer) {
    const polygons = multiPolygon?.coordinates || [];
    polygons.forEach((polygonCoords, partIndex) => {
      if (!Array.isArray(polygonCoords) || !polygonCoords.length) return;
      features.push({
        type: "Feature",
        properties: {
          type: "viewshed_area",
          label: `Observer ${observer.id} visible area ${partIndex + 1}`,
          observer_id: observer.id,
          part_index: partIndex + 1,
          radius_m: observer.radius,
          source_index: observer.sourceFeatureIndex + 1,
          source_point_index: observer.sourcePointIndex + 1,
          source_label: observer.sourceLabel,
        },
        geometry: {
          type: "Polygon",
          coordinates: polygonCoords,
        },
      });
    });
  }

  function addViewPointFeature(features, observer, status, note = "") {
    features.push({
      type: "Feature",
      properties: {
        type: "view_point",
        label: `Observer ${observer.id}`,
        observer_id: observer.id,
        part_index: null,
        radius_m: observer.radius,
        source_index: observer.sourceFeatureIndex + 1,
        source_point_index: observer.sourcePointIndex + 1,
        source_label: observer.sourceLabel,
        lat: observer.latlng.lat,
        lng: observer.latlng.lng,
        status,
        note,
      },
      geometry: {
        type: "Point",
        coordinates: [observer.latlng.lng, observer.latlng.lat],
      },
    });
  }

  function buildBatchViewshedLayerRecord(features, sourceName, skippedCount) {
    const VIEWSHED_COLOR = "#00ff78";
    const POINT_COLOR = "#ffffff";
    const geojson = { type: "FeatureCollection", features };
    const styleConfig = createDefaultStyleConfig(VIEWSHED_COLOR);
    styleConfig.fillOpacity = 0.42;
    styleConfig.strokeOpacity = 0.82;
    styleConfig.strokeWidth = 1.3;

    const layerGroup = L.featureGroup();
    features.forEach((feature) => {
      if (feature.geometry?.type === "Point") {
        const [lng, lat] = feature.geometry.coordinates;
        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          color: POINT_COLOR,
          fillColor: VIEWSHED_COLOR,
          fillOpacity: 1,
          weight: 2,
          pane: "markerPane",
          interactive: true,
        });
        marker.bindTooltip(feature.properties.label || "View point", {
          permanent: false,
          direction: "top",
          offset: [0, -8],
          className: "measure-tooltip",
        });
        marker.bindPopup(
          `<strong>${escapeHtml(feature.properties.label || "View point")}</strong><br>` +
          `Source: ${escapeHtml(feature.properties.source_label || "")}<br>` +
          `Radius: ${Number(feature.properties.radius_m).toFixed(0)} m<br>` +
          `Status: ${escapeHtml(feature.properties.status || "ok")}`
        );
        marker.feature = feature;
        layerGroup.addLayer(marker);
      } else if (feature.geometry?.type === "Polygon") {
        const polygonLayer = L.geoJSON(feature, {
          style: () => ({
            color: VIEWSHED_COLOR,
            fillColor: VIEWSHED_COLOR,
            fillOpacity: 0.42,
            opacity: 0.82,
            weight: 1.3,
            pane: "overlayPane",
          }),
          onEachFeature: (ft, layer) => {
            layer.bindPopup(
              `<strong>${escapeHtml(ft.properties.label || "Viewshed area")}</strong><br>` +
              `Source: ${escapeHtml(ft.properties.source_label || "")}<br>` +
              `Radius: ${Number(ft.properties.radius_m).toFixed(0)} m`
            );
          },
        });
        polygonLayer.feature = feature;
        layerGroup.addLayer(polygonLayer);
      }
    });

    return {
      id: crypto.randomUUID(),
      kind: "vector",
      name: VIEWSHED_LAYER_NAME,
      sourceType: "Batch Viewshed / Diffraction Loss Modelling",
      color: VIEWSHED_COLOR,
      geometryKind: "mixed",
      isVisible: true,
      geojson,
      fields: [
        "type", "label", "observer_id", "part_index", "radius_m",
        "source_index", "source_point_index", "source_label", "lat", "lng", "status", "note",
      ],
      crs: CRSManager.DEFAULT_CRS,
      crsMetadata: CRSManager.getCrsMetadata(CRSManager.DEFAULT_CRS),
      styleConfig,
      labelConfig: createDefaultLabelConfig(),
      filterConfig: createDefaultFilterConfig(),
      interpolationConfig: createDefaultInterpolationConfig(),
      heatmapConfig: createDefaultHeatmapConfig(),
      interpolationOverlay: null,
      interpolationObjectUrl: "",
      layerGroup,
      featureCount: features.length,
      visibleFeatureCount: features.length,
      layerOpacity: 1,
      isDerived: true,
      batchViewshed: {
        sourceName,
        skippedCount,
      },
    };
  }

  // ── KED Raster Layer Builder ─────────────────────────────────

  /**
   * Build a raster-style layer record for the KED result.
   * We create an L.imageOverlay from a canvas element.
   */
  function buildKedLayerRecord(canvas, bounds, stats, obsLatLng, params) {
    const objectUrl = canvas.toDataURL("image/png");
    const imageOverlay = L.imageOverlay(objectUrl, bounds, {
      opacity:     1,
      interactive: false,
      pane:        "overlayPane",
      className:   "ked-raster-overlay",
    });

    // Observer marker
    const obsMarker = L.circleMarker([obsLatLng.lat, obsLatLng.lng], {
      radius:      7,
      color:       "#ffffff",
      fillColor:   "#ffb428",
      fillOpacity: 1,
      weight:      2.5,
      pane:        "markerPane",
      interactive: true,
    });
    obsMarker.bindTooltip("Observer (KED)", {
      permanent: false, direction: "top", offset: [0, -8], className: "measure-tooltip",
    });
    obsMarker.bindPopup(
      `<strong>KED Observer</strong><br>` +
      `Lat: ${obsLatLng.lat.toFixed(5)}<br>Lng: ${obsLatLng.lng.toFixed(5)}<br>` +
      `Freq: ${params.freqMHz} MHz<br>Tx: ${params.txPowerDbm} dBm<br>` +
      `Rx threshold: ${params.rxThreshDbm} dBm<br>` +
      `Range: ${stats.minRx.toFixed(1)} – ${stats.maxRx.toFixed(1)} dBm`
    );

    imageOverlay.bindPopup(
      `<strong>${KED_LAYER_NAME}</strong><br>` +
      `Freq: ${params.freqMHz} MHz<br>Tx: ${params.txPowerDbm} dBm<br>` +
      `Rx threshold: ${params.rxThreshDbm} dBm<br>` +
      `Range: ${stats.minRx.toFixed(1)} – ${stats.maxRx.toFixed(1)} dBm<br>` +
      `Grid: ${params.width} x ${params.height}`
    );

    const layerGroup = L.featureGroup([imageOverlay, obsMarker]);

    const rasterMetadata = {
      layerType: "ked",
      width: params.width,
      height: params.height,
      bandCount: 1,
      bounds,
      sourceLayerName: params.sourceLayerName || "DEM",
      methodLabel: "Knife-Edge Diffraction",
      field: "rx_dBm",
      fieldLabel: "Rx signal (dBm)",
      minValue: stats.minRx,
      maxValue: stats.maxRx,
      ramp: "ked-red-alpha",
      freqMHz: params.freqMHz,
      txPowerDbm: params.txPowerDbm,
      rxThreshDbm: params.rxThreshDbm,
    };

    const rasterStyleConfig = {
      mode: "pseudocolor",
      ramp: "ked-red-alpha",
      min: stats.minRx,
      max: stats.maxRx,
    };

    return {
      id:                     crypto.randomUUID(),
      kind:                   "raster",
      rasterKind:             "ked",
      name:                   KED_LAYER_NAME,
      sourceType:             "KED Diffraction Analysis",
      color:                  "#ffb428",
      isVisible:              true,
      geojson:                { type: "FeatureCollection", features: [] },
      fields:                 [],
      crs:                    CRSManager.DEFAULT_CRS,
      crsMetadata:            CRSManager.getCrsMetadata(CRSManager.DEFAULT_CRS),
      styleConfig:            createDefaultStyleConfig("#ffb428"),
      labelConfig:            createDefaultLabelConfig(),
      filterConfig:           createDefaultFilterConfig(),
      interpolationConfig:    null,
      heatmapConfig:          null,
      interpolationOverlay:   null,
      interpolationObjectUrl: "",
      layerGroup,
      rasterObjectUrl:        "",
      rasterMetadata,
      rasterStyleConfig,
      featureCount:           1,
      visibleFeatureCount:    1,
      layerOpacity:           1,
      isDerived:              true,
      kedStats:               stats,
      kedParams:              params,
      onRemove() {
        if (_replacingViewshed) return;
        if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
        observerLatLng = null;
        coordsDisplay.value = "";
        coordsDisplay.placeholder = "Not set — or paste lat, lng";
        coordsDisplay.classList.remove("is-set");
        clearObsBtn.hidden = true;
      },
    };
  }

  function removeExistingKedLayer() {
    const existing = loadedLayers.find((lr) => lr.name === KED_LAYER_NAME);
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

  async function computeOneViewshedFeatureSet({ observer, dem, width, height, transform, obsH, tgtH, curvature, cellSizeX, cellSizeY }) {
    const [rasterX, rasterY] = transform.projectLatLngToRaster(observer.latlng);
    const [pixObs, rowObs] = transform.rasterToPixel(rasterX, rasterY);

    if (pixObs < 0 || pixObs >= width || rowObs < 0 || rowObs >= height) {
      return { skipped: true, note: "Observer outside DEM extent" };
    }

    const obsCol = clampIndex(pixObs, width);
    const obsRow = clampIndex(rowObs, height);
    const obsIdx = obsRow * width + obsCol;
    const obsElev = Number(dem[obsIdx]);
    if (!Number.isFinite(obsElev)) {
      return { skipped: true, note: "Observer on no-data cell" };
    }

    const visibility = computeViewshed({
      dem, width, height,
      pixObs, rowObs, cellSizeX, cellSizeY,
      obsElev, obsH, tgtH, curvature,
      maxRadius: observer.radius,
    });
    const multiPolygon = visibilityToMultiPolygon(visibility, width, height, transform);
    return { skipped: false, multiPolygon };
  }

  async function runBatchViewshed({ isGlobal, localDemRecord, obsH, tgtH, curvature }) {
    const batch = getBatchObservers();
    if (!batch.layerRecord) {
      throw new Error("Selected point layer is no longer available.");
    }
    if (!batch.observers.length) {
      throw new Error("No valid observer points were found. Check point geometry and radius values.");
    }

    const features = [];
    let skippedCount = batch.skipped;
    let localDem = null;

    if (!isGlobal) {
      progressLabel.textContent = "Reading local DEM once for batch viewshed...";
      localDem = await readLocalDemRecord(localDemRecord);
    }

    for (let i = 0; i < batch.observers.length; i += 1) {
      const observer = batch.observers[i];
      progressLabel.textContent = `Computing observer ${i + 1} of ${batch.observers.length}...`;
      await new Promise((resolve) => setTimeout(resolve, 0));

      let result;
      if (isGlobal) {
        const demResult = await fetchGlobalDem(
          observer.latlng,
          observer.radius,
          (msg) => { progressLabel.textContent = `Observer ${i + 1}/${batch.observers.length}: ${msg}`; }
        );
        result = await computeOneViewshedFeatureSet({
          observer,
          dem: demResult.dem,
          width: demResult.width,
          height: demResult.height,
          transform: demResult.transform,
          obsH,
          tgtH,
          curvature,
          cellSizeX: demResult.cellSizeX,
          cellSizeY: demResult.cellSizeY,
        });
      } else {
        const sizes = getCellSizesForLat(localDem.transform, localDem.width, localDem.height, observer.latlng.lat);
        result = await computeOneViewshedFeatureSet({
          observer,
          dem: localDem.dem,
          width: localDem.width,
          height: localDem.height,
          transform: localDem.transform,
          obsH,
          tgtH,
          curvature,
          cellSizeX: sizes.cellSizeX,
          cellSizeY: sizes.cellSizeY,
        });
      }

      if (result.skipped) {
        skippedCount += 1;
        addViewPointFeature(features, observer, "skipped", result.note);
      } else {
        addSplitViewshedFeatures(features, result.multiPolygon, observer);
        addViewPointFeature(features, observer, "ok");
      }
    }

    if (!features.length) {
      throw new Error("No output features were created from the selected point layer.");
    }

    removeExistingViewshedLayer();
    const src = isGlobal ? "Global DEM (Terrarium ~30 m)" : localDemRecord.name;
    const layerRecord = buildBatchViewshedLayerRecord(features, `${batch.layerRecord.name} / ${src}`, skippedCount);
    addViewshedLayerRecord(layerRecord);

    const polygonCount = features.filter((feature) => feature.geometry?.type === "Polygon").length;
    const pointCount = features.filter((feature) => feature.geometry?.type === "Point").length;
    updateStatus(
      `Batch viewshed complete (${src}). Created ${polygonCount} polygon feature(s) and ${pointCount} view point feature(s)` +
      (skippedCount ? `; skipped ${skippedCount} invalid point/radius item(s).` : ".")
    );
  }

  // ── Apply handler ─────────────────────────────────────────────

  applyBtn.addEventListener("click", async () => {
    if (isComputing) return;
    if (!validate()) return;

    const isGlobal  = vsDemSource === "global";
    const obsH      = Number(obsHeightInp.value);
    const tgtH      = Number(tgtHeightInp.value);
    const maxRadius = Number(maxRadiusInp.value);
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

    const _spinnerGuard = setTimeout(() => { if (isComputing) hideProgress(); }, 120_000);

    try {
      if (observerSource === "layer") {
        await runBatchViewshed({ isGlobal, localDemRecord, obsH, tgtH, curvature });
        return;
      }

      let dem, demWidth, demHeight, transform, cellSizeX, cellSizeY;

      if (isGlobal) {
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
      } else {
        const localDem = await readLocalDemRecord(localDemRecord);
        dem = localDem.dem;
        demWidth = localDem.width;
        demHeight = localDem.height;
        transform = localDem.transform;
        const sizes = getCellSizesForLat(transform, demWidth, demHeight, observerLatLng.lat);
        cellSizeX = sizes.cellSizeX;
        cellSizeY = sizes.cellSizeY;
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

      const obsCol = clampIndex(pixObs, demWidth);
      const obsRow = clampIndex(rowObs, demHeight);
      const obsIdx = obsRow * demWidth + obsCol;
      const obsElev = Number(dem[obsIdx]);
      if (!Number.isFinite(obsElev)) {
        throw new Error("Observer point falls on a no-data cell in the DEM.");
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      if (observerMarker) { map.removeLayer(observerMarker); observerMarker = null; }

      if (kedEnabled) {
        // ══ KED DIFFRACTION PATH ══════════════════════════════
        const freqMHz     = Math.max(1, readFiniteNumber(kedFreqInp, 900));
        const txPowerDbm  = readFiniteNumber(kedTxPwrInp, 30);
        const rxThreshDbm = readFiniteNumber(kedRxThreshInp, -90);
        const nSamples    = Math.max(10, Math.min(500, Math.round(readFiniteNumber(kedSamplesInp, 64))));
        if (!Number.isFinite(txPowerDbm) || txPowerDbm < -30 || txPowerDbm > 60) {
          throw new Error("KED Tx power must be between -30 and 60 dBm.");
        }
        if (!Number.isFinite(rxThreshDbm) || rxThreshDbm < -150 || rxThreshDbm > 0) {
          throw new Error("KED Rx threshold must be between -150 and 0 dBm.");
        }

        progressLabel.textContent = "Computing KED diffraction raster…";
        await new Promise((resolve) => setTimeout(resolve, 0));

        const kedGrid = prepareKedGrid({
          dem, width: demWidth, height: demHeight,
          pixObs, rowObs, cellSizeX, cellSizeY,
        });

        const rxData = computeKedRaster({
          dem: kedGrid.dem, width: kedGrid.width, height: kedGrid.height,
          pixObs: kedGrid.pixObs, rowObs: kedGrid.rowObs,
          cellSizeX: kedGrid.cellSizeX, cellSizeY: kedGrid.cellSizeY,
          obsElev, obsH, tgtH, curvature, maxRadius,
          freqMHz, txPowerDbm, nSamples,
        });

        progressLabel.textContent = "Rendering KED signal raster…";
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Compute stats for color mapping
        let minRx = Infinity, maxRx = -Infinity;
        for (let i = 0; i < rxData.length; i++) {
          const v = rxData[i];
          if (!Number.isFinite(v)) continue;
          if (v < minRx) minRx = v;
          if (v > maxRx) maxRx = v;
        }
        if (!Number.isFinite(minRx)) { minRx = -120; maxRx = txPowerDbm; }

        const canvas = kedRasterToCanvas(rxData, kedGrid.width, kedGrid.height, minRx, maxRx);

        // Compute geographic bounds from raster transform (handles projected CRS)
        const ext = transform.extent;
        const corners = [
          transform.unprojectRasterPoint(ext.minX, ext.minY),
          transform.unprojectRasterPoint(ext.minX, ext.maxY),
          transform.unprojectRasterPoint(ext.maxX, ext.minY),
          transform.unprojectRasterPoint(ext.maxX, ext.maxY),
        ];
        const bounds = L.latLngBounds(corners.map(pt => [pt.lat, pt.lng]));

        const kedParams = {
          freqMHz,
          txPowerDbm,
          rxThreshDbm,
          nSamples,
          width: kedGrid.width,
          height: kedGrid.height,
          sourceLayerName: isGlobal ? "Global DEM" : localDemRecord.name,
        };
        const kedStats  = { minRx, maxRx };

        removeExistingKedLayer();
        const layerRecord = buildKedLayerRecord(canvas, bounds, kedStats, observerLatLng, kedParams);
        addViewshedLayerRecord(layerRecord);

        const src = isGlobal ? "Global DEM" : localDemRecord.name;
        updateStatus(
          `KED diffraction analysis complete (${src}, ${freqMHz} MHz). ` +
          `Rx range: ${minRx.toFixed(1)} – ${maxRx.toFixed(1)} dBm. ` +
          `Raster ${kedGrid.width}×${kedGrid.height} on "${KED_LAYER_NAME}" layer.`
        );

      } else {
        // ══ STANDARD VIEWSHED PATH ═════════════════════════════
        progressLabel.textContent = "Computing viewshed…";
        await new Promise((resolve) => setTimeout(resolve, 0));

        const visibility = computeViewshed({
          dem, width: demWidth, height: demHeight,
          pixObs, rowObs, cellSizeX, cellSizeY,
          obsElev, obsH, tgtH, curvature, maxRadius,
        });

        progressLabel.textContent = "Tracing viewshed polygon…";
        await new Promise((resolve) => setTimeout(resolve, 0));

        const multiPolygon = visibilityToMultiPolygon(visibility, demWidth, demHeight, transform);

        removeExistingViewshedLayer();
        const layerRecord = buildViewshedLayerRecord(multiPolygon, observerLatLng);
        addViewshedLayerRecord(layerRecord);

        const src = isGlobal ? "Global DEM (Terrarium ~30 m)" : localDemRecord.name;
        updateStatus(`Viewshed complete (${src}). Visible areas shown in green on the "Viewshed" layer.`);
      }

    } catch (err) {
      showError(err.message);
      updateStatus(err.message, true);
    } finally {
      clearTimeout(_spinnerGuard);
      hideProgress();
    }
  });

})();
