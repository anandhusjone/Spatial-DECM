fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  closeLayerModal();
});

document.addEventListener("dragenter", (event) => {
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
  event.preventDefault();
  updateGlobalDropOverlay(true);
});

document.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    updateGlobalDropOverlay(false);
  }
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  updateGlobalDropOverlay(false);
  closeLayerContextMenu();
  handleFiles(event.dataTransfer.files);
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
  createEmptyLayer(newLayerNameInput.value.trim());
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

symbologyModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeSymbologyModal === "true") {
    closeSymbologyModal();
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
  newFeature.properties = {};

  getLayerFieldNames(activeLayer).forEach((fieldName) => {
    newFeature.properties[fieldName] = "";
  });

  if (!("source" in newFeature.properties)) {
    newFeature.properties.source = "drawn";
  }

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
  syncActiveLayerGeoJSONFromMap();
  updateStatus("Geometry updated. Node edits were saved into the editable layer.");
  if (typeof onProjectDirty === "function") onProjectDirty();
});

map.on(L.Draw.Event.DELETED, () => {
  syncActiveLayerGeoJSONFromMap();
  selectedFeatureContext = null;
  renderAttributeTable();
  updateStatus("Selected features removed from the editable layer.");
  if (typeof onProjectDirty === "function") onProjectDirty();
});

renderLayerList();
renderEditableLayerOptions();
renderAttributeTable();
initializeTheme();
initializeBrandLogo();
applyAttributeTableVisibility();
