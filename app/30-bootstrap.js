fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  closeLayerModal();
});

document.addEventListener("dragenter", (event) => {
  if (isDraggingLayer) return;
  event.preventDefault();
  // If dragDepth is somehow non-zero at the start of a new drag session (e.g. a
  // previous drag ended without a drop or dragleave), reset it so the overlay and
  // depth counter stay in sync.
  if (dragDepth < 0) dragDepth = 0;
  dragDepth += 1;
  updateGlobalDropOverlay(true);
});

document.addEventListener("click", (event) => {
  // Never close when clicking inside the menu itself
  if (event.target.closest(".layer-context-menu")) {
    return;
  }

  // If the click is on a layer card, only skip closing when it belongs to the
  // card that currently owns the open context menu — clicking any *other* card
  // (or anywhere else) should dismiss the menu as expected.
  const clickedCard = event.target.closest(".layer-card");
  if (clickedCard && layerContextMenuElement && !layerContextMenuElement.hidden) {
    const menuLayerId = layerContextMenuElement.dataset.layerId;
    if (clickedCard.dataset.layerId === menuLayerId) {
      return;
    }
  }

  closeLayerContextMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLayerContextMenu();
  }
});

document.addEventListener("dragover", (event) => {
  if (isDraggingLayer) return;
  event.preventDefault();
  updateGlobalDropOverlay(true);
});

document.addEventListener("dragleave", (event) => {
  if (isDraggingLayer) return;
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    updateGlobalDropOverlay(false);
  }
});

document.addEventListener("drop", (event) => {
  // Always clear isDraggingLayer here as a safety net — if the layer-card dragend
  // event failed to fire (e.g. rapid DOM re-render, browser quirk), this prevents
  // the flag from staying true and silently blocking all future file drops.
  if (isDraggingLayer) {
    isDraggingLayer = false;
    return; // layer reorder drop — actual handling is on the card's own drop listener
  }
  event.preventDefault();
  dragDepth = 0;
  updateGlobalDropOverlay(false);
  closeLayerContextMenu();

  // .geojson has no registered MIME type on most OSes, so Chrome (especially on
  // Windows) may leave dataTransfer.files empty AND return null from getAsFile().
  // Strategy:
  //   1. Use dataTransfer.files if it has entries (fastest, most reliable).
  //   2. Fall back to dataTransfer.items → getAsFile() (covers Chrome on macOS/Linux).
  //   3. For any item where getAsFile() returned null, use webkitGetAsEntry().file()
  //      which works even when the OS has no MIME type registered for the extension
  //      (covers Chrome on Windows for .geojson and similar unregistered extensions).
  const items = Array.from(event.dataTransfer.items || []).filter((item) => item.kind === "file");

  if (event.dataTransfer.files?.length) {
    handleFiles(event.dataTransfer.files);
  } else {
    // Attempt getAsFile() for all items; for any that return null, fall back to
    // the FileSystem Entry API (webkitGetAsEntry) which is immune to MIME issues.
    const resolveItem = (item) => {
      const file = item.getAsFile();
      if (file) return Promise.resolve(file);
      // getAsFile() returned null — use the entry API as a fallback.
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isFile) {
        return new Promise((resolve) => entry.file(resolve, () => resolve(null)));
      }
      return Promise.resolve(null);
    };

    Promise.all(items.map(resolveItem)).then((resolved) => {
      handleFiles(resolved.filter(Boolean));
    });
  }
});

clearAllBtn.addEventListener("click", () => {
  loadedLayers.splice(0).forEach((layerRecord) => {
    disposeLayerResources(layerRecord);
    map.removeLayer(layerRecord.layerGroup);
  });
  activeEditableLayerId = "";
  selectedFeatureContext = null;
  drawWorkspace.clearLayers();
  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateInterpolationLegend();
  updateStatus("All layers cleared.");
  if (typeof onProjectDirty === "function") onProjectDirty();
});

addFieldBtn.addEventListener("click", () => {
  addFieldToLayer(addFieldNameInput.value.trim(), addFieldValueInput.value);
  addFieldNameInput.value = "";
  addFieldValueInput.value = "";
});

createLayerBtn.addEventListener("click", () => {
  createEmptyLayer(newLayerNameInput.value.trim(), newLayerGeometryTypeSelect?.value || "point");
  newLayerNameInput.value = "";
});

openLayerModalBtn.addEventListener("click", openLayerModal);
browseLayerBtn.addEventListener("click", () => {
  fileInput.click();
});
closeLayerModalBtn.addEventListener("click", closeLayerModal);

openFieldModalBtn.addEventListener("click", openFieldModal);
closeFieldModalBtn.addEventListener("click", closeFieldModal);
openCalculatorModalBtn.addEventListener("click", openCalculatorModal);
closeCalculatorModalBtn.addEventListener("click", closeCalculatorModal);
toggleAttributeTableBtn.addEventListener("click", toggleAttributeTableVisibility);
wireLayerRenameHandlers();
if (tableEditStatusBtn) {
  tableEditStatusBtn.addEventListener("click", () => {
    const tableLayerId = selectedTableLayerId || activeEditableLayerId;
    if (!tableLayerId) return;
    const tableLayer = loadedLayers.find((lr) => lr.id === tableLayerId && isVectorLayerRecord(lr));
    if (!tableLayer || !isEditableLayerRecord(tableLayer)) return;
    // Flush any in-progress cell edits before the toggle causes a re-render
    if (typeof flushPendingTableEdits === "function") flushPendingTableEdits();
    runLayerCardAction(tableLayer, "toggle-edit");
  });
}

if (tableUndoBtn) {
  tableUndoBtn.addEventListener("click", () => {
    if (!canUndoEdit()) return;
    const activeLayer = getActiveEditableLayer();
    if (!activeLayer) return;
    const stack = getEditHistoryStack();
    const cursor = getEditHistoryCursor();
    _editHistoryCursor = cursor - 1;
    applyEditHistorySnapshot(stack[_editHistoryCursor], activeLayer);
    rebuildLayerFromData(activeLayer);
    syncEditableWorkspace();
    renderAttributeTable();
    updateStatus("Undo applied.");
    if (typeof onProjectDirty === "function") onProjectDirty();
  });
}

if (tableRedoBtn) {
  tableRedoBtn.addEventListener("click", () => {
    if (!canRedoEdit()) return;
    const activeLayer = getActiveEditableLayer();
    if (!activeLayer) return;
    const stack = getEditHistoryStack();
    const cursor = getEditHistoryCursor();
    _editHistoryCursor = cursor + 1;
    applyEditHistorySnapshot(stack[_editHistoryCursor], activeLayer);
    rebuildLayerFromData(activeLayer);
    syncEditableWorkspace();
    renderAttributeTable();
    updateStatus("Redo applied.");
    if (typeof onProjectDirty === "function") onProjectDirty();
  });
}
calculatorFieldSearch.addEventListener("input", renderCalculatorFieldList);
calculatorFunctionSearch.addEventListener("input", renderCalculatorFunctionList);
calculatorExpression.addEventListener("input", scheduleCalculatorPreview);
calculatorExpression.addEventListener("scroll", () => {
  const hl = document.getElementById("calculator-expression-highlight");
  if (hl) { hl.scrollTop = calculatorExpression.scrollTop; hl.scrollLeft = calculatorExpression.scrollLeft; }
});
calculatorPreviewFeature.addEventListener("change", updateCalculatorPreview);
calculatorPreviewBtn.addEventListener("click", updateCalculatorPreview);
calculatorApplyBtn.addEventListener("click", applyCalculatorToLayer);
calculatorSaveExpressionBtn.addEventListener("click", saveCurrentCalculatorExpression);
calculatorLoadExpressionBtn.addEventListener("click", loadSelectedCalculatorExpression);
calculatorDeleteExpressionBtn.addEventListener("click", deleteSelectedCalculatorExpression);
calculatorExportExpressionsBtn.addEventListener("click", exportSavedCalculatorExpressions);
calculatorImportExpressionsBtn.addEventListener("click", () => calculatorImportFile.click());
calculatorImportFile.addEventListener("change", importSavedCalculatorExpressions);
calculatorModeInputs.forEach((input) => {
  input.addEventListener("change", renderCalculatorTargetControls);
});
// ⋯ more menu toggle
document.getElementById("calculator-more-btn")?.addEventListener("click", (event) => {
  event.stopPropagation();
  const menu = document.getElementById("calculator-more-menu");
  if (menu) menu.hidden = !menu.hidden;
});
document.addEventListener("click", () => {
  const menu = document.getElementById("calculator-more-menu");
  if (menu) menu.hidden = true;
});

closeSymbologyModalBtn.addEventListener("click", closeSymbologyModal);
symbologyStylingTab.addEventListener("click", () => setSymbologyTab("styling"));
symbologyLabelingTab.addEventListener("click", () => setSymbologyTab("labeling"));
labelEnabledInput.addEventListener("change", updateLabelOptionsVisibility);
applySymbologyBtn.addEventListener("click", () => {
  updateSymbologyFromControls();
  const layerRecord = getLayerRecordById(activeSymbologyLayerId);
  if (layerRecord) {
    updateStatus(`Symbology updated for ${layerRecord.name}.`);
  }
  closeSymbologyModal();
});
resetSymbologyBtn.addEventListener("click", resetSymbology);
symbologyTypeSelect.addEventListener("change", updateSymbologyFromControls);
symbologyFieldSelect.addEventListener("change", updateSymbologyFromControls);
singleStyleColorInput.addEventListener("input", updateSymbologyFromControls);
graduatedRampSelect.addEventListener("change", updateSymbologyFromControls);
graduatedMethodSelect.addEventListener("change", updateSymbologyFromControls);
graduatedClassCountSelect.addEventListener("change", updateSymbologyFromControls);
[
  pointSymbolShapeSelect,
  pointSymbolSizeInput,
  pointFillColorInput,
  pointStrokeColorInput,
  pointStrokeWidthInput,
  pointOpacityInput,
  pointIconUrlInput,
  lineColorInput,
  lineWidthInput,
  lineOpacityInput,
  lineDashStyleSelect,
  lineDashPatternInput,
  lineCapSelect,
  lineJoinSelect,
  polygonFillColorInput,
  polygonFillOpacityInput,
  polygonStrokeColorInput,
  polygonStrokeWidthInput,
  polygonStrokeOpacityInput,
  polygonStrokeStyleSelect,
  polygonOutlineOnlyInput,
  ruleStyleFieldSelect,
  ruleStyleOperatorSelect,
  ruleStyleValueInput,
  ruleStyleColorInput,
].forEach((input) => {
  input.addEventListener("input", updateSymbologyFromControls);
  input.addEventListener("change", updateSymbologyFromControls);
});
[
  labelFieldSelect,
  labelExpressionInput,
  labelFontFamilySelect,
  labelFontSizeInput,
  labelColorInput,
  labelOpacityInput,
  labelHaloColorInput,
  labelHaloSizeInput,
  labelBackgroundColorInput,
  labelBorderColorInput,
  labelBorderRadiusInput,
  labelPlacementSelect,
  labelLinePlacementSelect,
  labelPolygonPlacementSelect,
  labelOffsetXInput,
  labelOffsetYInput,
  labelRotationInput,
  labelMinZoomInput,
  labelMaxZoomInput,
  labelPriorityInput,
  labelBoldInput,
  labelItalicInput,
  labelUnderlineInput,
  labelShadowInput,
  labelAvoidOverlapInput,
].forEach((input) => {
  input.addEventListener("change", updateLabelControlsChanged);
});
closeRasterStyleModalBtn.addEventListener("click", closeRasterStyleModal);
rasterApplyStyleBtn.addEventListener("click", applyRasterStyleFromControls);
rasterResetStyleBtn.addEventListener("click", resetRasterStyle);
[
  rasterRenderModeSelect,
  rasterRampSelect,
  rasterClassificationSelect,
  rasterClassCountSelect,
  rasterMinInput,
  rasterMaxInput,
  rasterNoDataInput,
  rasterBrightnessInput,
  rasterContrastInput,
  rasterOpacityInput,
].forEach((input) => {
  input.addEventListener("input", renderRasterStylePreview);
  input.addEventListener("change", renderRasterStylePreview);
});
rasterBandSelect.addEventListener("change", updateRasterStyleBandStats);
closeInterpolationModalBtn.addEventListener("click", closeInterpolationModal);
applyInterpolationBtn.addEventListener("click", applyInterpolationToLayer);
clearInterpolationBtn.addEventListener("click", clearInterpolationForLayer);
[
  interpolationFieldSelect,
  interpolationMethodSelect,
  interpolationScopeSelect,
  interpolationClipModeSelect,
  interpolationRadiusInput,
  interpolationCellSizeInput,
  interpolationPowerInput,
  interpolationOpacityInput,
  interpolationMinSamplesInput,
  interpolationRampSelect,
].forEach((input) => {
  input.addEventListener("input", updateInterpolationSummaryPreview);
  input.addEventListener("change", updateInterpolationSummaryPreview);
});
closeHeatmapModalBtn.addEventListener("click", closeHeatmapModal);
applyHeatmapBtn.addEventListener("click", applyHeatmapToLayer);
clearHeatmapBtn.addEventListener("click", clearHeatmapForLayer);
[
  heatmapFieldSelect,
  heatmapScopeSelect,
  heatmapClipModeSelect,
  heatmapRadiusInput,
  heatmapCellSizeInput,
  heatmapOpacityInput,
  heatmapMinSamplesInput,
  heatmapIntensityInput,
  heatmapRampSelect,
].forEach((input) => {
  input.addEventListener("input", updateHeatmapSummaryPreview);
  input.addEventListener("change", updateHeatmapSummaryPreview);
});

closeFilterModalBtn.addEventListener("click", closeFilterModal);
addFilterRuleBtn.addEventListener("click", () => {
  const layerRecord = getLayerRecordById(activeFilterLayerId);
  if (!layerRecord) {
    return;
  }

  layerRecord.filterConfig.rules.push({
    field: getLayerFieldNames(layerRecord)[0] || "",
    operator: "==",
    value: "",
  });
  renderFilterRules(layerRecord);
});
clearFilterBtn.addEventListener("click", clearLayerFilter);
applyFilterBtn.addEventListener("click", applyFilterFromControls);
openHelpModalBtn.addEventListener("click", openHelpModal);
closeHelpModalBtn.addEventListener("click", closeHelpModal);
themeCycleBtn.addEventListener("click", () => {
  const nextTheme = getNextThemePreference(getStoredThemePreference());
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
});

// ── Basemap picker ────────────────────────────────────────────────────────────
(function () {
  const picker      = document.getElementById("basemap-picker");
  const triggerBtn  = document.getElementById("basemap-switcher-btn");
  const dropdown    = document.getElementById("basemap-dropdown");
  const options     = dropdown.querySelectorAll(".bm-option");
  let closeTimer    = null;
  let previewsDrawn = false;

  function openPicker() {
    clearTimeout(closeTimer);
    dropdown.hidden = false;
    triggerBtn.setAttribute("aria-expanded", "true");
    syncSelected();
    if (!previewsDrawn) { drawPreviews(); previewsDrawn = true; }
  }

  function closePicker() {
    dropdown.hidden = true;
    triggerBtn.setAttribute("aria-expanded", "false");
  }

  picker.addEventListener("mouseenter", openPicker);
  picker.addEventListener("mouseleave", () => {
    closeTimer = setTimeout(closePicker, 220);
  });

  // Keyboard: Escape closes
  dropdown.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePicker(); triggerBtn.focus(); }
  });

  function syncSelected() {
    options.forEach((opt) => {
      const isActive = opt.dataset.basemap === activeBasemap;
      opt.setAttribute("aria-selected", String(isActive));
    });
  }

  options.forEach((opt) => {
    opt.addEventListener("click", () => {
      selectBasemap(opt.dataset.basemap);
      syncSelected();
      // redraw previews next open so they reflect new map centre
      previewsDrawn = false;
      closePicker();
    });
  });

  // ── Tile preview drawing ──────────────────────────────────────────────────
  function latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y, z: zoom };
  }

  function drawPreviews() {
    const centre = map.getCenter();
    const zoom   = Math.min(Math.max(Math.round(map.getZoom()), 3), 10);
    const tile   = latLngToTile(centre.lat, centre.lng, zoom);

    document.querySelectorAll(".bm-canvas").forEach((canvas) => {
      const id       = canvas.dataset.basemap;
      const template = basemapTileTemplates[id];
      if (!template) return;

      const url = template.url
        .replace("{z}", tile.z)
        .replace("{x}", tile.x)
        .replace("{y}", tile.y);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        // Draw the 256px tile scaled and centred into the 88px canvas
        ctx.drawImage(img, 0, 0, 88, 88);
      };
      img.onerror = () => {
        // Fallback: draw a simple placeholder so it never shows blank
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = id === "dark" ? "#111" : id === "satellite" ? "#1a2a1a" : "#e8e8e0";
        ctx.fillRect(0, 0, 88, 88);
      };
      img.src = url;
    });
  }
}());

// ── Global DEM (Terrarium) toggle ─────────────────────────────────────────────
(function () {
  const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const DEM_LAYER_ID  = "terrarium-global-dem";
  const DEM_LAYER_NAME = "Global DEM (Terrarium ~30 m)";

  let terrariumLayerRecord = null;

  function _syncBtn(active) {
    if (!demToggleBtn) return;
    demToggleBtn.setAttribute("aria-pressed", String(active));
    demToggleBtn.classList.toggle("is-active", active);
  }

  function addTerrariumLayer() {
    // Don't add twice
    if (loadedLayers.find((lr) => lr.id === DEM_LAYER_ID)) return;

    const tileLayer = L.tileLayer(TERRARIUM_URL, {
      attribution: "Terrain Tiles — Mapzen / AWS Open Data",
      maxZoom: 14,
      opacity: 1,
      className: "terrarium-tile-layer",
    });

    const layerGroup = L.featureGroup([tileLayer]);

    terrariumLayerRecord = {
      id: DEM_LAYER_ID,
      kind: "raster",
      rasterKind: "terrarium",
      name: DEM_LAYER_NAME,
      sourceType: "Terrarium PNG Tiles",
      color: "#60a0d8",
      isVisible: true,
      geojson: { type: "FeatureCollection", features: [] },
      fields: [],
      styleConfig: createDefaultStyleConfig("#60a0d8"),
      labelConfig: createDefaultLabelConfig(),
      interpolationConfig: null,
      heatmapConfig: null,
      filterConfig: createDefaultFilterConfig(),
      interpolationOverlay: null,
      interpolationObjectUrl: "",
      layerGroup,
      rasterTileLayer: tileLayer,
      rasterMetadata: {
        methodLabel: "Global Elevation",
        sourceLayerName: "Terrarium AWS",
        minValue: null,
        maxValue: null,
        width: null,
        height: null,
        bandCount: 3,
        crs: "EPSG:3857",
      },
      featureCount: 1,
      visibleFeatureCount: 1,
      isDerived: false,
      layerOpacity: 1,
      // Called by removeLayer() in 10-analysis-layers.js when deleted via context menu
      onRemove() {
        terrariumLayerRecord = null;
        _syncBtn(false);
      },
    };

    // Push to end → sits below analysis layers in z-order
    loadedLayers.push(terrariumLayerRecord);
    layerGroup.addTo(map);

    if (typeof renderLayerList          === "function") renderLayerList();
    if (typeof renderEditableLayerOptions === "function") renderEditableLayerOptions();
    if (typeof onProjectDirty           === "function") onProjectDirty();

    _syncBtn(true);
  }

  function removeTerrariumLayer() {
    if (!terrariumLayerRecord) return;
    const idx = loadedLayers.indexOf(terrariumLayerRecord);
    if (idx !== -1) loadedLayers.splice(idx, 1);
    map.removeLayer(terrariumLayerRecord.layerGroup);
    terrariumLayerRecord.onRemove();          // clears ref + button state
    terrariumLayerRecord = null;

    if (typeof renderLayerList          === "function") renderLayerList();
    if (typeof renderEditableLayerOptions === "function") renderEditableLayerOptions();
    if (typeof onProjectDirty           === "function") onProjectDirty();
  }

  demToggleBtn.addEventListener("click", () => {
    if (terrariumLayerRecord) {
      removeTerrariumLayer();
    } else {
      addTerrariumLayer();
    }
  });
}());

systemThemeMedia.addEventListener("change", () => {
  if (getStoredThemePreference() === "system") {
    applyTheme("system");
  }
});

closeExportModalBtn.addEventListener("click", closeExportModal);
confirmExportBtn.addEventListener("click", confirmLayerExport);

exportModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeExportModal === "true") {
    closeExportModal();
  }
});

layerModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeLayerModal === "true") {
    closeLayerModal();
  }
});

fieldModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeFieldModal === "true") {
    closeFieldModal();
  }
});

calculatorModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeCalculatorModal === "true") {
    closeCalculatorModal();
  }
});

// Calculator reference-panel tab switching
calculatorModal.addEventListener("click", (event) => {
  const tabBtn = event.target.closest("[data-ref-tab]");
  if (!tabBtn) return;
  const tabName = tabBtn.dataset.refTab;
  calculatorModal.querySelectorAll(".calc2-ref-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.refTab === tabName);
  });
  calculatorModal.querySelectorAll(".calc2-ref-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.refPanel === tabName);
  });
});

symbologyModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeSymbologyModal === "true") {
    closeSymbologyModal();
  }
});

rasterStyleModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeRasterStyleModal === "true") {
    closeRasterStyleModal();
  }
});

interpolationModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeInterpolationModal === "true") {
    closeInterpolationModal();
  }
});

heatmapModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeHeatmapModal === "true") {
    closeHeatmapModal();
  }
});

filterModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeFilterModal === "true") {
    closeFilterModal();
  }
});

helpModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeHelpModal === "true") {
    closeHelpModal();
  }
});

tableResizer.addEventListener("mousedown", () => {
  if (!isAttributeTableVisible) {
    return;
  }
  isResizingTable = true;
  document.body.style.userSelect = "none";
});

document.addEventListener("mousemove", (event) => {
  if (!isResizingTable) {
    return;
  }
  resizeTableDock(event.clientY);
});

document.addEventListener("mouseup", () => {
  if (!isResizingTable) {
    return;
  }
  isResizingTable = false;
  document.body.style.userSelect = "";
});

document.addEventListener("scroll", () => {
  closeLayerContextMenu();
}, true);

window.addEventListener("resize", closeLayerContextMenu);

map.on(L.Draw.Event.CREATED, (event) => {
  const activeLayer = getActiveEditableLayer();
  if (!activeLayer) {
    updateStatus("Select an editable layer before drawing a feature.", true);
    return;
  }

  const newFeature = layerToFeature(event.layer);
  if (!isFeatureAllowedForLayer(activeLayer, newFeature)) {
    updateStatus(`${getGeometryKindLabel(getLayerGeometryKind(activeLayer))} layers only accept matching features.`, true);
    return;
  }

  newFeature.properties = {};

  getLayerFieldNames(activeLayer).forEach((fieldName) => {
    newFeature.properties[fieldName] = "";
  });

  if (!("source" in newFeature.properties)) {
    newFeature.properties.source = "drawn";
  }

  // Snapshot BEFORE mutating so undo restores pre-add state
  pushEditSnapshot(activeLayer);

  activeLayer.fields = getLayerFieldNames(activeLayer)
    .concat(Object.keys(newFeature.properties))
    .filter((fieldName, index, items) => items.indexOf(fieldName) === index)
    .sort();

  activeLayer.geojson.features.push(newFeature);
  rebuildLayerFromData(activeLayer);
  syncActiveLayerGeoJSONFromMap();
  updateStatus("New feature added to the editable layer.");
  if (typeof onProjectDirty === "function") onProjectDirty();
});

map.on(L.Draw.Event.EDITED, () => {
  // Snapshot BEFORE sync so undo restores pre-edit geometry
  const activeLayer = getActiveEditableLayer();
  if (activeLayer) pushEditSnapshot(activeLayer);
  syncActiveLayerGeoJSONFromMap();
  updateStatus("Geometry updated. Node edits were saved into the editable layer.");
  if (typeof onProjectDirty === "function") onProjectDirty();
});

map.on(L.Draw.Event.DELETED, () => {
  // Snapshot BEFORE sync so undo restores the deleted features
  const activeLayer = getActiveEditableLayer();
  if (activeLayer) pushEditSnapshot(activeLayer);
  syncActiveLayerGeoJSONFromMap();
  selectedFeatureContext = null;
  renderAttributeTable();
  updateStatus("Selected features removed from the editable layer.");
  if (typeof onProjectDirty === "function") onProjectDirty();
});

map.on("zoomend", () => {
  loadedLayers
    .filter((layerRecord) => isVectorLayerRecord(layerRecord) && layerRecord.labelConfig?.enabled && layerRecord.isVisible !== false)
    .forEach((layerRecord) => rebuildLayerFromData(layerRecord));
});

renderLayerList();
renderEditableLayerOptions();
renderAttributeTable();
initializeTheme();
initializeBrandLogo();
applyAttributeTableVisibility();
