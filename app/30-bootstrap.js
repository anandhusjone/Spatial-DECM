fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  closeLayerModal();
});

document.addEventListener("dragenter", (event) => {
  if (isDraggingLayer) return;
  event.preventDefault();
  dragDepth += 1;
  updateGlobalDropOverlay(true);
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".layer-context-menu") || event.target.closest(".layer-card")) {
    return;
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
  if (isDraggingLayer) return; // layer reorder — handled by card drop handler
  event.preventDefault();
  dragDepth = 0;
  updateGlobalDropOverlay(false);
  closeLayerContextMenu();

  // dataTransfer.files is empty for .geojson in some browsers (e.g. Chrome on
  // certain OSes) because .geojson has no registered MIME type. Fall back to
  // dataTransfer.items, which always exposes the File objects.
  const files = event.dataTransfer.files?.length
    ? event.dataTransfer.files
    : Array.from(event.dataTransfer.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter(Boolean);

  handleFiles(files);
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
calculatorExpression.addEventListener("input", updateCalculatorPreview);
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

const basemapSwitcherBtn = document.getElementById("basemap-switcher-btn");
basemapSwitcherBtn.addEventListener("click", () => {
  cycleBasemap();
});

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
