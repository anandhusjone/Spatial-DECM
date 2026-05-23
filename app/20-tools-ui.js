function cloneStyleConfig(styleConfig, fallbackColor = "#1db7a6") {
  return VectorStyleManager.cloneStyleConfig(styleConfig, fallbackColor);
}

function cloneLabelConfig(labelConfig) {
  return VectorStyleManager.cloneLabelConfig(labelConfig);
}

function cloneFilterConfig(filterConfig) {
  return {
    logic: filterConfig?.logic === "or" ? "or" : "and",
    rules: (filterConfig?.rules || []).map((rule) => ({
      field: rule.field || "",
      operator: rule.operator || "==",
      value: rule.value ?? "",
    })),
  };
}

function ensureSymbologyFieldOptions(layerRecord) {
  const fields = getLayerFieldNames(layerRecord);
  const fieldOptions = fields.length
    ? fields.map((field) => `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`).join("")
    : '<option value="">No fields available</option>';
  symbologyFieldSelect.innerHTML = fieldOptions;
  ruleStyleFieldSelect.innerHTML = fieldOptions;
  labelFieldSelect.innerHTML = `<option value="">No label</option>${fields.map((field) => `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`).join("")}`;
}

function renderCategorizedValueInputs(layerRecord, styleConfig) {
  if (!layerRecord || !styleConfig.field) {
    categorizedValuesWrap.innerHTML = '<div class="small-note">Choose a field to generate categories.</div>';
    return;
  }

  const uniqueValues = getCategorizedUniqueValues(layerRecord, styleConfig.field);
  if (!uniqueValues.length) {
    categorizedValuesWrap.innerHTML = '<div class="small-note">No values found for this field.</div>';
    return;
  }

  const geometryKind = getLayerGeometryKind(layerRecord);

  function makePreview(color) {
    if (geometryKind === "line") {
      return `<svg width="32" height="16" viewBox="0 0 32 16" xmlns="http://www.w3.org/2000/svg"><line x1="2" y1="8" x2="30" y2="8" stroke="${color}" stroke-width="3" stroke-linecap="round"/></svg>`;
    }
    if (geometryKind === "polygon") {
      return `<svg width="28" height="20" viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="24" height="16" rx="3" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2"/></svg>`;
    }
    // point / default
    return `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  }

  categorizedValuesWrap.innerHTML = uniqueValues
    .map((value, index) => {
      const fallbackColor = palette[index % palette.length];
      if (!styleConfig.categorized.valueColors[value]) {
        styleConfig.categorized.valueColors[value] = fallbackColor;
      }
      const currentColor = styleConfig.categorized.valueColors[value];
      return `
        <div class="cat-value-row">
          <span class="cat-preview" data-category-value="${escapeHtml(value)}">${makePreview(currentColor)}</span>
          <span class="cat-label">${escapeHtml(value)}</span>
          <input
            class="dark-input color-input categorized-color-input cat-color-pick"
            type="color"
            data-category-value="${escapeHtml(value)}"
            value="${escapeHtml(currentColor)}"
            title="${escapeHtml(value)}"
          />
        </div>
      `;
    })
    .join("");

  categorizedValuesWrap.querySelectorAll(".categorized-color-input").forEach((input) => {
    input.addEventListener("input", () => {
      const activeLayer = getLayerRecordById(activeSymbologyLayerId);
      if (!activeLayer) return;
      activeLayer.styleConfig.categorized.valueColors[input.dataset.categoryValue] = input.value;
      // Update the inline SVG preview immediately
      const preview = categorizedValuesWrap.querySelector(`.cat-preview[data-category-value="${CSS.escape(input.dataset.categoryValue)}"]`);
      if (preview) preview.innerHTML = makePreview(input.value);
      rebuildLayerFromData(activeLayer);
    });
  });
}

function renderGraduatedBreakPreview(layerRecord, styleConfig) {
  if (!layerRecord || !styleConfig.field) {
    graduatedBreaksWrap.innerHTML = '<div class="small-note">Choose a numeric field to classify.</div>';
    return;
  }

  const breaks = computeGraduatedBreaks(
    layerRecord,
    styleConfig.field,
    styleConfig.graduated.classCount,
    styleConfig.graduated.method
  );

  if (!breaks.length) {
    graduatedBreaksWrap.innerHTML = '<div class="small-note">This field has no numeric values to classify.</div>';
    return;
  }

  const rampColors = buildColorRamp(styleConfig.graduated.ramp, breaks.length);
  graduatedBreaksWrap.innerHTML = breaks
    .map(
      (currentBreak, index) => `
        <div class="rule-card">
          <div class="legend-chip">
            <span class="legend-swatch" style="background:${rampColors[index]}"></span>
            ${escapeHtml(currentBreak.min.toFixed(2))} to ${escapeHtml(currentBreak.max.toFixed(2))}
          </div>
        </div>
      `
    )
    .join("");
}

function renderSymbologyPanels(layerRecord) {
  const styleConfig = layerRecord?.styleConfig;
  if (!layerRecord || !styleConfig) {
    return;
  }

  const geometryKind = getLayerGeometryKind(layerRecord);
  const isPoint = geometryKind === "point" || geometryKind === "mixed" || geometryKind === "unknown";
  const showAllGeometryPanels = geometryKind === "mixed" || geometryKind === "unknown";

  // Show shape/size only for point layers
  const quickShapeStack = document.getElementById("quick-shape-stack");
  const quickSizeStack = document.getElementById("quick-size-stack");
  if (quickShapeStack) quickShapeStack.hidden = !isPoint;
  if (quickSizeStack) quickSizeStack.hidden = !isPoint;

  if (labelPlacementSelect) {
    labelPlacementSelect.closest(".field-stack").hidden = !(showAllGeometryPanels || geometryKind === "point");
  }
  if (labelLinePlacementSelect) {
    labelLinePlacementSelect.closest(".field-stack").hidden = !(showAllGeometryPanels || geometryKind === "line");
  }
  if (labelPolygonPlacementSelect) {
    labelPolygonPlacementSelect.closest(".field-stack").hidden = !(showAllGeometryPanels || geometryKind === "polygon");
  }

  const mode = styleConfig.mode;
  singleStylePanel.hidden = mode !== "single";
  if (symbologyFieldStack) {
    symbologyFieldStack.hidden = mode === "single";
  }
  categorizedStylePanel.hidden = mode !== "categorized";
  graduatedStylePanel.hidden = mode !== "graduated";
  ruleStylePanel.hidden = mode !== "rule" && mode !== "rule-based";

  renderCategorizedValueInputs(layerRecord, styleConfig);
  renderGraduatedBreakPreview(layerRecord, styleConfig);
  updateLabelOptionsVisibility();
}

function setSymbologyTab(activeTab) {
  const showLabeling = activeTab === "labeling";
  if (symbologyStylingPanel) {
    symbologyStylingPanel.hidden = showLabeling;
  }
  if (symbologyLabelingPanel) {
    symbologyLabelingPanel.hidden = !showLabeling;
  }
  if (symbologyStylingTab) {
    symbologyStylingTab.classList.toggle("is-active", !showLabeling);
    symbologyStylingTab.setAttribute("aria-selected", String(!showLabeling));
  }
  if (symbologyLabelingTab) {
    symbologyLabelingTab.classList.toggle("is-active", showLabeling);
    symbologyLabelingTab.setAttribute("aria-selected", String(showLabeling));
  }
}

function updateLabelOptionsVisibility() {
  if (labelOptionsWrap) {
    labelOptionsWrap.hidden = !labelEnabledInput.checked;
  }
}

function updateLabelControlsChanged() {
  updateLabelOptionsVisibility();
}

function setAdvancedStyleControls(layerRecord) {
  const styleConfig = layerRecord.styleConfig;
  pointSymbolShapeSelect.value = styleConfig.point.shape;
  pointSymbolSizeInput.value = String(styleConfig.point.size);
  pointFillColorInput.value = styleConfig.point.fillColor;
  pointStrokeColorInput.value = styleConfig.point.strokeColor;
  pointStrokeWidthInput.value = String(styleConfig.point.strokeWidth);
  pointOpacityInput.value = String(styleConfig.point.opacity);
  pointIconUrlInput.value = styleConfig.point.iconUrl || "";
  lineColorInput.value = styleConfig.line.color;
  lineWidthInput.value = String(styleConfig.line.width);
  lineOpacityInput.value = String(styleConfig.line.opacity);
  lineDashStyleSelect.value = styleConfig.line.dashStyle;
  lineDashPatternInput.value = styleConfig.line.dashPattern || "";
  lineCapSelect.value = styleConfig.line.lineCap;
  lineJoinSelect.value = styleConfig.line.lineJoin;
  polygonFillColorInput.value = styleConfig.polygon.fillColor;
  polygonFillOpacityInput.value = String(styleConfig.polygon.fillOpacity);
  polygonStrokeColorInput.value = styleConfig.polygon.strokeColor;
  polygonStrokeWidthInput.value = String(styleConfig.polygon.strokeWidth);
  polygonStrokeOpacityInput.value = String(styleConfig.polygon.strokeOpacity);
  polygonStrokeStyleSelect.value = styleConfig.polygon.strokeStyle;
  polygonOutlineOnlyInput.checked = Boolean(styleConfig.polygon.outlineOnly);
  const rule = styleConfig.rules?.[0] || {};
  ruleStyleFieldSelect.value = rule.field || getLayerFieldNames(layerRecord)[0] || "";
  ruleStyleOperatorSelect.value = rule.operator || "==";
  ruleStyleValueInput.value = rule.value ?? "";
  ruleStyleColorInput.value = rule.color || "#ffb454";

  // Sync quick stroke controls from the geometry-specific sub-config
  const kind = getLayerGeometryKind(layerRecord);
  const qStrokeColor = kind === "line" ? styleConfig.line.color
    : kind === "point" ? styleConfig.point.strokeColor
    : styleConfig.polygon.strokeColor;
  const qStrokeWidth = kind === "line" ? styleConfig.line.width
    : kind === "point" ? styleConfig.point.strokeWidth
    : styleConfig.polygon.strokeWidth;
  ["single", "cat", "grad", "rule"].forEach((suffix) => {
    const sc = document.getElementById(`quick-stroke-color-${suffix}`);
    const sw = document.getElementById(`quick-stroke-width-${suffix}`);
    if (sc) sc.value = qStrokeColor || "#ffffff";
    if (sw) sw.value = String(qStrokeWidth ?? 2);
  });
}

function setLabelControls(layerRecord) {
  const labelConfig = layerRecord.labelConfig;
  labelEnabledInput.checked = Boolean(labelConfig.enabled);
  labelFieldSelect.value = labelConfig.field || "";
  labelExpressionInput.value = labelConfig.expression || "";
  labelFontFamilySelect.value = labelConfig.style.fontFamily;
  labelFontSizeInput.value = String(labelConfig.style.fontSize);
  labelColorInput.value = labelConfig.style.color;
  labelOpacityInput.value = String(labelConfig.style.opacity);
  labelHaloColorInput.value = labelConfig.style.haloColor;
  labelHaloSizeInput.value = String(labelConfig.style.haloSize);
  labelBackgroundColorInput.value = labelConfig.style.backgroundColor;
  labelBorderColorInput.value = labelConfig.style.borderColor;
  labelBorderRadiusInput.value = String(labelConfig.style.borderRadius);
  labelPlacementSelect.value = labelConfig.placement;
  labelLinePlacementSelect.value = labelConfig.linePlacement;
  labelPolygonPlacementSelect.value = labelConfig.polygonPlacement;
  labelOffsetXInput.value = String(labelConfig.offsetX);
  labelOffsetYInput.value = String(labelConfig.offsetY);
  labelRotationInput.value = String(labelConfig.rotation);
  labelMinZoomInput.value = String(labelConfig.minZoom);
  labelMaxZoomInput.value = String(labelConfig.maxZoom);
  labelPriorityInput.value = String(labelConfig.priority);
  labelBoldInput.checked = Boolean(labelConfig.style.bold);
  labelItalicInput.checked = Boolean(labelConfig.style.italic);
  labelUnderlineInput.checked = Boolean(labelConfig.style.underline);
  labelShadowInput.checked = Boolean(labelConfig.style.shadow);
  labelAvoidOverlapInput.checked = Boolean(labelConfig.avoidOverlap);
  updateLabelOptionsVisibility();
}

function readAdvancedStyleControls(layerRecord) {
  const styleConfig = layerRecord.styleConfig;
  // Read quick stroke controls: find which mode panel is visible and pick its values
  const mode = styleConfig.mode || "single";
  const qSuffix = mode === "categorized" ? "cat" : mode === "graduated" ? "grad" : mode === "rule" || mode === "rule-based" ? "rule" : "single";
  const qsc = document.getElementById(`quick-stroke-color-${qSuffix}`);
  const qsw = document.getElementById(`quick-stroke-width-${qSuffix}`);
  const quickStrokeColor = qsc ? qsc.value : null;
  const quickStrokeWidth = qsw ? Number(qsw.value) : null;

  styleConfig.point = {
    shape: pointSymbolShapeSelect.value,
    size: Number(pointSymbolSizeInput.value || 14),
    fillColor: pointFillColorInput.value,
    strokeColor: quickStrokeColor ?? pointStrokeColorInput.value,
    strokeWidth: quickStrokeWidth ?? Number(pointStrokeWidthInput.value || 0),
    opacity: Number(pointOpacityInput.value || 0.95),
    iconUrl: pointIconUrlInput.value.trim(),
  };
  styleConfig.line = {
    color: lineColorInput.value,
    width: quickStrokeWidth ?? Number(lineWidthInput.value || 3),
    opacity: Number(lineOpacityInput.value || 0.92),
    dashStyle: lineDashStyleSelect.value,
    dashPattern: lineDashPatternInput.value.trim(),
    lineCap: lineCapSelect.value,
    lineJoin: lineJoinSelect.value,
  };
  styleConfig.polygon = {
    fillColor: polygonFillColorInput.value,
    fillOpacity: Number(polygonFillOpacityInput.value || 0),
    strokeColor: quickStrokeColor ?? polygonStrokeColorInput.value,
    strokeWidth: quickStrokeWidth ?? Number(polygonStrokeWidthInput.value || 0),
    strokeOpacity: Number(polygonStrokeOpacityInput.value || 0.92),
    strokeStyle: polygonStrokeStyleSelect.value,
    outlineOnly: polygonOutlineOnlyInput.checked,
  };
  styleConfig.rules = ruleStyleFieldSelect.value
    ? [{
        field: ruleStyleFieldSelect.value,
        operator: ruleStyleOperatorSelect.value,
        value: ruleStyleValueInput.value,
        color: ruleStyleColorInput.value,
      }]
    : [];
}

function readLabelControls(layerRecord) {
  layerRecord.labelConfig = {
    enabled: labelEnabledInput.checked,
    field: labelFieldSelect.value,
    expression: labelExpressionInput.value.trim(),
    placement: labelPlacementSelect.value,
    linePlacement: labelLinePlacementSelect.value,
    polygonPlacement: labelPolygonPlacementSelect.value,
    offsetX: Number(labelOffsetXInput.value || 0),
    offsetY: Number(labelOffsetYInput.value || 0),
    rotation: Number(labelRotationInput.value || 0),
    minZoom: Number(labelMinZoomInput.value || 0),
    maxZoom: Number(labelMaxZoomInput.value || 22),
    priority: Number(labelPriorityInput.value || 5),
    avoidOverlap: labelAvoidOverlapInput.checked,
    repeat: labelLinePlacementSelect.value === "repeated",
    wrap: 24,
    style: {
      fontFamily: labelFontFamilySelect.value,
      fontSize: Number(labelFontSizeInput.value || 12),
      bold: labelBoldInput.checked,
      italic: labelItalicInput.checked,
      underline: labelUnderlineInput.checked,
      color: labelColorInput.value,
      opacity: Number(labelOpacityInput.value || 1),
      haloColor: labelHaloColorInput.value,
      haloSize: Number(labelHaloSizeInput.value || 0),
      backgroundColor: labelBackgroundColorInput.value || "transparent",
      borderColor: labelBorderColorInput.value || "transparent",
      borderRadius: Number(labelBorderRadiusInput.value || 0),
      shadow: labelShadowInput.checked,
    },
  };
}

function openSymbologyModal(layerId) {
  const layerRecord = getLayerRecordById(layerId);
  if (!layerRecord) {
    return;
  }

  activeSymbologyLayerId = layerId;
  layerRecord.styleConfig = cloneStyleConfig(layerRecord.styleConfig, layerRecord.color);
  layerRecord.labelConfig = cloneLabelConfig(layerRecord.labelConfig);
  symbologyLayerLabel.textContent = `Configure ${getGeometryKindLabel(getLayerGeometryKind(layerRecord)).toLowerCase()} styling and labels for ${layerRecord.name}.`;
  ensureSymbologyFieldOptions(layerRecord);
  symbologyTypeSelect.value = layerRecord.styleConfig.mode;
  symbologyFieldSelect.value = layerRecord.styleConfig.field;
  singleStyleColorInput.value = layerRecord.styleConfig.singleColor || layerRecord.color;
  graduatedRampSelect.value = layerRecord.styleConfig.graduated.ramp;
  graduatedMethodSelect.value = layerRecord.styleConfig.graduated.method;
  graduatedClassCountSelect.value = String(layerRecord.styleConfig.graduated.classCount);
  setAdvancedStyleControls(layerRecord);
  setLabelControls(layerRecord);
  renderSymbologyPanels(layerRecord);
  setSymbologyTab("styling");
  showModal(symbologyModal);
}

function closeSymbologyModal() {
  hideModal(symbologyModal, () => {
    activeSymbologyLayerId = "";
  });
}

function updateSymbologyFromControls() {
  const layerRecord = getLayerRecordById(activeSymbologyLayerId);
  if (!layerRecord) {
    return;
  }

  layerRecord.styleConfig.mode = symbologyTypeSelect.value;
  layerRecord.styleConfig.field = symbologyFieldSelect.value;
  layerRecord.styleConfig.singleColor = singleStyleColorInput.value;
  layerRecord.styleConfig.graduated.ramp = graduatedRampSelect.value;
  layerRecord.styleConfig.graduated.method = graduatedMethodSelect.value;
  layerRecord.styleConfig.graduated.classCount = Number(graduatedClassCountSelect.value);
  readAdvancedStyleControls(layerRecord);
  readLabelControls(layerRecord);

  renderSymbologyPanels(layerRecord);
  rebuildLayerFromData(layerRecord);
  if (typeof onProjectDirty === "function") onProjectDirty();
}

function resetSymbology() {
  const layerRecord = getLayerRecordById(activeSymbologyLayerId);
  if (!layerRecord) {
    return;
  }

  layerRecord.styleConfig = createDefaultStyleConfig(layerRecord.color);
  layerRecord.labelConfig = createDefaultLabelConfig();
  symbologyTypeSelect.value = layerRecord.styleConfig.mode;
  symbologyFieldSelect.value = "";
  singleStyleColorInput.value = layerRecord.styleConfig.singleColor;
  graduatedRampSelect.value = layerRecord.styleConfig.graduated.ramp;
  graduatedMethodSelect.value = layerRecord.styleConfig.graduated.method;
  graduatedClassCountSelect.value = String(layerRecord.styleConfig.graduated.classCount);
  setAdvancedStyleControls(layerRecord);
  setLabelControls(layerRecord);
  renderSymbologyPanels(layerRecord);
  rebuildLayerFromData(layerRecord);
  updateStatus(`Symbology reset for ${layerRecord.name}.`);
}

function cloneRasterStyleConfig(styleConfig, stats = {}) {
  const cloned = createDefaultRasterStyleConfig(stats);
  return {
    ...cloned,
    ...styleConfig,
    classCount: Number(styleConfig?.classCount || cloned.classCount),
    band: Number(styleConfig?.band || cloned.band),
    min: Number.isFinite(Number(styleConfig?.min)) ? Number(styleConfig.min) : cloned.min,
    max: Number.isFinite(Number(styleConfig?.max)) ? Number(styleConfig.max) : cloned.max,
    brightness: Number(styleConfig?.brightness || 0),
    contrast: Number(styleConfig?.contrast || 0),
    opacity: Number.isFinite(Number(styleConfig?.opacity)) ? Number(styleConfig.opacity) : cloned.opacity,
    quantileBreaks: Array.isArray(styleConfig?.quantileBreaks) ? styleConfig.quantileBreaks : [],
  };
}

function formatRasterMetadataValue(value) {
  if (value == null || value === "") {
    return "Not available";
  }
  if (typeof value === "number") {
    return formatCompactNumber(value, 6);
  }
  return String(value);
}

function renderRasterMetadata(layerRecord) {
  const metadata = layerRecord?.rasterMetadata;
  if (!metadata || !rasterMetadataList) {
    return;
  }

  const rows = [
    ["CRS", metadata.crs],
    ["Resolution", `${formatRasterMetadataValue(metadata.resolutionX)} x ${formatRasterMetadataValue(metadata.resolutionY)}`],
    ["Extent", formatRasterExtent(metadata.extent)],
    ["Raster size", `${formatCompactNumber(metadata.width, 0)} x ${formatCompactNumber(metadata.height, 0)} pixels`],
    ["Band count", metadata.bandCount],
    ["NoData", metadata.noData ?? "None declared"],
    ["Sampled range", `${formatCompactNumber(metadata.minValue)} to ${formatCompactNumber(metadata.maxValue)}`],
  ];

  if (metadata.note) {
    rows.push(["Alignment note", metadata.note]);
  }

  rasterMetadataList.innerHTML = rows
    .map(([label, value]) => `
      <div class="raster-metadata-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatRasterMetadataValue(value))}</strong>
      </div>
    `)
    .join("");
}

function renderRasterBandOptions(layerRecord) {
  const bandCount = layerRecord?.rasterMetadata?.bandCount || 1;
  rasterBandSelect.innerHTML = Array.from({ length: bandCount }, (_, index) => `
    <option value="${index + 1}">Band ${index + 1}</option>
  `).join("");
}

function readRasterStyleControls() {
  const noDataText = rasterNoDataInput.value.trim();
  const min = Number(rasterMinInput.value);
  const max = Number(rasterMaxInput.value);
  return {
    mode: rasterRenderModeSelect.value,
    band: Number(rasterBandSelect.value || 1),
    ramp: rasterRampSelect.value,
    classification: rasterClassificationSelect.value,
    classCount: Number(rasterClassCountSelect.value || 5),
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) && max !== min ? max : min + 1,
    noData: noDataText === "" ? null : Number(noDataText),
    brightness: Number(rasterBrightnessInput.value || 0),
    contrast: Number(rasterContrastInput.value || 0),
    opacity: Number(rasterOpacityInput.value || 0.85),
    quantileBreaks: [],
  };
}

function setRasterControlsFromStyle(styleConfig) {
  rasterRenderModeSelect.value = styleConfig.mode || "gray";
  rasterBandSelect.value = String(styleConfig.band || 1);
  rasterRampSelect.value = styleConfig.ramp || "terrain-glow";
  rasterClassificationSelect.value = styleConfig.classification || "continuous";
  rasterClassCountSelect.value = String(styleConfig.classCount || 5);
  rasterMinInput.value = String(styleConfig.min ?? 0);
  rasterMaxInput.value = String(styleConfig.max ?? 1);
  rasterNoDataInput.value = styleConfig.noData == null ? "" : String(styleConfig.noData);
  rasterBrightnessInput.value = String(styleConfig.brightness || 0);
  rasterContrastInput.value = String(styleConfig.contrast || 0);
  rasterOpacityInput.value = String(styleConfig.opacity ?? 0.85);
}

function renderRasterStylePreview() {
  if (!rasterStylePreview) {
    return;
  }

  const styleConfig = readRasterStyleControls();
  const rampStops = styleConfig.mode === "gray"
    ? ["#000000", "#ffffff"]
    : getInterpolationRampStops(styleConfig.ramp);
  const gradient = `linear-gradient(90deg, ${rampStops.join(", ")})`;
  const classNote = styleConfig.classification === "continuous"
    ? "Continuous stretch"
    : `${styleConfig.classCount} ${styleConfig.classification === "quantile" ? "quantile" : "equal interval"} classes`;

  rasterStylePreview.innerHTML = `
    <div class="map-legend-title">${escapeHtml(styleConfig.mode === "gray" ? "Singleband gray" : "Singleband pseudocolor")}</div>
    <div class="map-legend-gradient" style="background:${gradient}"></div>
    <div class="map-legend-range">
      <span>${escapeHtml(formatCompactNumber(styleConfig.min))}</span>
      <span>${escapeHtml(formatCompactNumber(styleConfig.max))}</span>
    </div>
    <div class="small-note">${escapeHtml(classNote)} • opacity ${escapeHtml(formatCompactNumber(styleConfig.opacity, 2))}</div>
  `;
}

async function updateRasterStyleBandStats() {
  const layerRecord = getLayerRecordById(activeRasterStyleLayerId);
  if (!layerRecord?.rasterImage) {
    return;
  }

  try {
    const noDataText = rasterNoDataInput.value.trim();
    const noData = noDataText === "" ? layerRecord.rasterMetadata.noData : Number(noDataText);
    const bandIndex = Math.max(0, Number(rasterBandSelect.value || 1) - 1);
    const stats = await computeRasterBandStats(layerRecord.rasterImage, bandIndex, noData);
    rasterMinInput.value = String(stats.min);
    rasterMaxInput.value = String(stats.max);
    layerRecord.rasterMetadata.minValue = stats.min;
    layerRecord.rasterMetadata.maxValue = stats.max;
    layerRecord.rasterStyleConfig.quantileBreaks = computeRasterQuantileBreaks(stats.values, Number(rasterClassCountSelect.value || 5));
    renderRasterMetadata(layerRecord);
    renderRasterStylePreview();
  } catch (error) {
    updateStatus(`Could not read raster band statistics: ${error.message}`, true);
  }
}

function openRasterStyleModal(layerId) {
  const layerRecord = getLayerRecordById(layerId);
  if (!layerRecord || layerRecord.rasterKind !== "geotiff") {
    return;
  }

  activeRasterStyleLayerId = layerId;
  layerRecord.rasterStyleConfig = cloneRasterStyleConfig(layerRecord.rasterStyleConfig, {
    min: layerRecord.rasterMetadata?.minValue,
    max: layerRecord.rasterMetadata?.maxValue,
    noData: layerRecord.rasterMetadata?.noData,
  });
  rasterStyleLayerLabel.textContent = `Style ${layerRecord.name} using singleband gray or pseudocolor rendering.`;
  renderRasterBandOptions(layerRecord);
  setRasterControlsFromStyle(layerRecord.rasterStyleConfig);
  renderRasterMetadata(layerRecord);
  renderRasterStylePreview();
  showModal(rasterStyleModal);
}

function closeRasterStyleModal() {
  hideModal(rasterStyleModal, () => {
    activeRasterStyleLayerId = "";
  });
}

async function applyRasterStyleFromControls() {
  const layerRecord = getLayerRecordById(activeRasterStyleLayerId);
  if (!layerRecord || layerRecord.rasterKind !== "geotiff") {
    return;
  }

  const styleConfig = readRasterStyleControls();
  if (styleConfig.classification === "quantile") {
    const stats = await computeRasterBandStats(
      layerRecord.rasterImage,
      Math.max(0, styleConfig.band - 1),
      styleConfig.noData
    );
    styleConfig.quantileBreaks = computeRasterQuantileBreaks(stats.values, styleConfig.classCount);
  } else {
    styleConfig.quantileBreaks = [];
  }
  layerRecord.rasterStyleConfig = styleConfig;
  if (layerRecord.rasterTileLayer?.setOpacity) {
    layerRecord.rasterTileLayer.setOpacity(1);
  }
  rebuildLayerFromData(layerRecord);
  renderLayerList();
  updateStatus(`Raster style updated for ${layerRecord.name}.`);
  if (typeof onProjectDirty === "function") onProjectDirty();
  closeRasterStyleModal();
}

async function resetRasterStyle() {
  const layerRecord = getLayerRecordById(activeRasterStyleLayerId);
  if (!layerRecord?.rasterImage) {
    return;
  }

  const stats = await computeRasterBandStats(layerRecord.rasterImage, 0, layerRecord.rasterMetadata.noData);
  layerRecord.rasterStyleConfig = createDefaultRasterStyleConfig({
    min: stats.min,
    max: stats.max,
    noData: layerRecord.rasterMetadata.noData,
  });
  layerRecord.rasterStyleConfig.quantileBreaks = computeRasterQuantileBreaks(stats.values, layerRecord.rasterStyleConfig.classCount);
  setRasterControlsFromStyle(layerRecord.rasterStyleConfig);
  renderRasterStylePreview();
}

function openInterpolationModal(layerId) {
  const layerRecord = getLayerRecordById(layerId);
  if (!layerRecord || !isVectorLayerRecord(layerRecord) || !isInterpolationEligible(layerRecord)) {
    updateStatus("Interpolation is available only for point layers with numeric attribute values.", true);
    return;
  }

  activeInterpolationLayerId = layerId;
  const numericFields = getInterpolationNumericFields(layerRecord, "all");
  const currentField = numericFields.includes(layerRecord.interpolationConfig.field)
    ? layerRecord.interpolationConfig.field
    : numericFields[0];

  layerRecord.interpolationConfig.field = currentField || "";
  interpolationLayerLabel.textContent = isLargeCsvLayerRecord(layerRecord)
    ? `Interpolate a sampled analysis subset from ${layerRecord.name} into a new raster layer.`
    : `Interpolate ${layerRecord.name} into a new raster layer with method, clip, and sampling controls.`;
  interpolationFieldSelect.innerHTML = numericFields
    .map((field) => `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`)
    .join("");
  interpolationFieldSelect.value = currentField || "";
  interpolationMethodSelect.value = layerRecord.interpolationConfig.method;
  interpolationScopeSelect.value = layerRecord.interpolationConfig.sampleScope;
  interpolationClipModeSelect.value = layerRecord.interpolationConfig.clipMode;
  interpolationRadiusInput.value = String(layerRecord.interpolationConfig.radiusMeters);
  interpolationCellSizeInput.value = String(layerRecord.interpolationConfig.cellSizeMeters);
  interpolationPowerInput.value = String(layerRecord.interpolationConfig.power);
  interpolationOpacityInput.value = String(layerRecord.interpolationConfig.opacity);
  interpolationMinSamplesInput.value = String(layerRecord.interpolationConfig.minSamples);
  interpolationRampSelect.value = layerRecord.interpolationConfig.ramp;
  updateInterpolationSummaryPreview();
  showModal(interpolationModal);
}

function closeInterpolationModal() {
  hideModal(interpolationModal, () => {
    activeInterpolationLayerId = "";
  });
}

function openHeatmapModal(layerId) {
  const layerRecord = getLayerRecordById(layerId);
  if (!layerRecord || !isVectorLayerRecord(layerRecord) || !isHeatmapEligible(layerRecord)) {
    updateStatus("Heatmap is available only for point layers with at least two samples.", true);
    return;
  }

  activeHeatmapLayerId = layerId;
  const fieldOptions = getHeatmapWeightFieldOptions(layerRecord, "all");
  const currentField = fieldOptions.some((item) => item.value === layerRecord.heatmapConfig.field)
    ? layerRecord.heatmapConfig.field
    : "__count__";

  layerRecord.heatmapConfig.field = currentField;
  heatmapLayerLabel.textContent = isLargeCsvLayerRecord(layerRecord)
    ? `Build a heatmap from a sampled analysis subset of ${layerRecord.name}.`
    : `Build a heatmap from ${layerRecord.name} into a new raster layer.`;
  heatmapFieldSelect.innerHTML = fieldOptions
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  heatmapFieldSelect.value = currentField;
  heatmapScopeSelect.value = layerRecord.heatmapConfig.sampleScope;
  heatmapClipModeSelect.value = layerRecord.heatmapConfig.clipMode;
  heatmapRadiusInput.value = String(layerRecord.heatmapConfig.radiusMeters);
  heatmapCellSizeInput.value = String(layerRecord.heatmapConfig.cellSizeMeters);
  heatmapOpacityInput.value = String(layerRecord.heatmapConfig.opacity);
  heatmapMinSamplesInput.value = String(layerRecord.heatmapConfig.minSamples);
  heatmapIntensityInput.value = String(layerRecord.heatmapConfig.intensity);
  heatmapRampSelect.value = layerRecord.heatmapConfig.ramp;
  updateHeatmapSummaryPreview();
  showModal(heatmapModal);
}

function closeHeatmapModal() {
  hideModal(heatmapModal, () => {
    activeHeatmapLayerId = "";
  });
}

async function applyInterpolationToLayer() {
  const layerRecord = getLayerRecordById(activeInterpolationLayerId);
  if (!layerRecord || !isVectorLayerRecord(layerRecord)) {
    return;
  }

  const config = readInterpolationConfigFromControls();

  if (!config.field) {
    updateStatus("Choose a numeric field for interpolation.", true);
    return;
  }

  try {
    const samples = getInterpolationSamples(layerRecord, config.field, config.sampleScope);
    if (samples.length < 2) {
      throw new Error("Interpolation needs at least two point samples with numeric values.");
    }

    const projectedSamples = projectInterpolationSamples(samples);
    const gridPlan = planInterpolationGrid(projectedSamples, config);
    const result = await runInterpolationWorker({
      samplePoints: projectedSamples,
      minX: gridPlan.minX,
      maxY: gridPlan.maxY,
      width: gridPlan.width,
      height: gridPlan.height,
      cellSize: gridPlan.cellSize,
      radius: Math.max(Number(config.radiusMeters) || 0, 50),
      power: Math.max(Number(config.power) || 2, 0.5),
      method: config.method,
      clipPolygon: gridPlan.clipPolygon,
      minSamples: config.minSamples,
    });

    const canvas = paintInterpolationSurfaceToCanvas(gridPlan, result, config);
    const rasterSurface = createRasterOverlayFromCanvas(gridPlan, canvas, config.opacity);
    const metadata = {
      layerType: "interpolation",
      field: config.field,
      fieldLabel: config.field,
      method: config.method,
      methodLabel: getInterpolationMethodLabel(config.method),
      sampleCount: samples.length,
      minValue: result.minValue,
      maxValue: result.maxValue,
      width: gridPlan.width,
      height: gridPlan.height,
      cellSize: gridPlan.cellSize,
      averageNeighbors: result.averageNeighbors,
      scope: config.sampleScope,
      clipMode: config.clipMode,
      ramp: config.ramp,
      sourceLayerName: layerRecord.name,
    };

    removeDerivedInterpolationLayers(layerRecord.id);
    layerRecord.interpolationConfig = { ...config };
    const rasterLayerRecord = createRasterLayerRecord(layerRecord, {
      name: buildInterpolationLayerName(layerRecord, config),
      overlay: rasterSurface.overlay,
      objectUrl: rasterSurface.objectUrl,
      metadata,
    });
    addLayerRecord(rasterLayerRecord);
    updateInterpolationSummaryPreview();
    updateStatus(`Interpolation surface created as a new raster layer for ${layerRecord.name}.`);
    closeInterpolationModal();
  } catch (error) {
    renderInterpolationSummary(null, error.message);
    updateStatus(error.message, true);
  }
}

function clearInterpolationForLayer() {
  const layerRecord = getLayerRecordById(activeInterpolationLayerId);
  if (!layerRecord) {
    return;
  }

  removeDerivedInterpolationLayers(layerRecord.id);
  updateInterpolationSummaryPreview();
  updateStatus(`Interpolation raster layer cleared for ${layerRecord.name}.`);
}

async function applyHeatmapToLayer() {
  const layerRecord = getLayerRecordById(activeHeatmapLayerId);
  if (!layerRecord || !isVectorLayerRecord(layerRecord)) {
    return;
  }

  const config = readHeatmapConfigFromControls();

  try {
    const samples = getHeatmapSamples(layerRecord, config.field, config.sampleScope);
    if (samples.length < 2) {
      throw new Error("Heatmap needs at least two point samples.");
    }

    const projectedSamples = projectInterpolationSamples(samples);
    const gridPlan = planInterpolationGrid(projectedSamples,
      config.bypassAutoResize ? { ...config, forceExactCellSize: true } : config);
    const result = await runHeatmapWorker({
      samplePoints: projectedSamples,
      minX: gridPlan.minX,
      maxY: gridPlan.maxY,
      width: gridPlan.width,
      height: gridPlan.height,
      cellSize: gridPlan.cellSize,
      radius: Math.max(Number(config.radiusMeters) || 0, 50),
      clipPolygon: gridPlan.clipPolygon,
      minSamples: config.minSamples,
    });

    const canvas = paintHeatmapSurfaceToCanvas(gridPlan, result, config);
    const rasterSurface = createRasterOverlayFromCanvas(gridPlan, canvas, config.opacity);
    const metadata = {
      layerType: "heatmap",
      field: config.field,
      fieldLabel: getHeatmapValueLabel(config.field),
      methodLabel: "Heatmap Density",
      sampleCount: samples.length,
      minValue: result.minValue,
      maxValue: result.maxValue,
      width: gridPlan.width,
      height: gridPlan.height,
      cellSize: gridPlan.cellSize,
      scope: config.sampleScope,
      clipMode: config.clipMode,
      ramp: config.ramp,
      sourceLayerName: layerRecord.name,
    };

    removeDerivedHeatmapLayers(layerRecord.id);
    layerRecord.heatmapConfig = { ...config };
    const rasterLayerRecord = createRasterLayerRecord(layerRecord, {
      name: `${layerRecord.name.replace(/\.[^.]+$/, "")} Heatmap`,
      overlay: rasterSurface.overlay,
      objectUrl: rasterSurface.objectUrl,
      metadata,
    });
    rasterLayerRecord.sourceType = "Heatmap Raster";
    addLayerRecord(rasterLayerRecord);
    updateHeatmapSummaryPreview();
    updateStatus(`Heatmap raster layer created for ${layerRecord.name}.`);
    closeHeatmapModal();
  } catch (error) {
    renderHeatmapSummary(null, error.message);
    updateStatus(error.message, true);
  }
}

function clearHeatmapForLayer() {
  const layerRecord = getLayerRecordById(activeHeatmapLayerId);
  if (!layerRecord) {
    return;
  }

  removeDerivedHeatmapLayers(layerRecord.id);
  updateHeatmapSummaryPreview();
  updateStatus(`Heatmap raster layer cleared for ${layerRecord.name}.`);
}

function createFilterRuleMarkup(layerRecord, rule, index) {
  const fieldOptions = getLayerFieldNames(layerRecord)
    .map(
      (field) =>
        `<option value="${escapeHtml(field)}" ${rule.field === field ? "selected" : ""}>${escapeHtml(field)}</option>`
    )
    .join("");

  return `
    <div class="rule-card" data-filter-rule-index="${index}">
      <div class="rule-card-header">
        <div class="rule-card-title">Rule ${index + 1}</div>
        <button class="ghost-button remove-filter-rule-btn" type="button">Remove</button>
      </div>
      <div class="inline-field-grid">
        <label class="field-stack">
          <span class="field-label">Field</span>
          <select class="dark-input filter-rule-field">
            ${fieldOptions || '<option value="">No fields available</option>'}
          </select>
        </label>
        <label class="field-stack">
          <span class="field-label">Operator</span>
          <select class="dark-input filter-rule-operator">
            <option value="==" ${rule.operator === "==" ? "selected" : ""}>==</option>
            <option value="!=" ${rule.operator === "!=" ? "selected" : ""}>!=</option>
            <option value=">" ${rule.operator === ">" ? "selected" : ""}>&gt;</option>
            <option value="<" ${rule.operator === "<" ? "selected" : ""}>&lt;</option>
            <option value=">=" ${rule.operator === ">=" ? "selected" : ""}>&gt;=</option>
            <option value="<=" ${rule.operator === "<=" ? "selected" : ""}>&lt;=</option>
            <option value="contains" ${rule.operator === "contains" ? "selected" : ""}>contains</option>
          </select>
        </label>
        <label class="field-stack">
          <span class="field-label">Value</span>
          <input class="dark-input filter-rule-value" type="text" value="${escapeHtml(String(rule.value ?? ""))}" />
        </label>
      </div>
    </div>
  `;
}

function renderFilterRules(layerRecord) {
  if (!layerRecord) {
    return;
  }

  const filterConfig = layerRecord.filterConfig;
  if (!filterConfig.rules.length) {
    filterRulesWrap.innerHTML = '<div class="small-note">No filter rules yet. Add one to begin.</div>';
    return;
  }

  filterRulesWrap.innerHTML = filterConfig.rules
    .map((rule, index) => createFilterRuleMarkup(layerRecord, rule, index))
    .join("");

  filterRulesWrap.querySelectorAll("[data-filter-rule-index]").forEach((ruleCard) => {
    const index = Number(ruleCard.dataset.filterRuleIndex);
    const currentRule = layerRecord.filterConfig.rules[index];
    const fieldInput = ruleCard.querySelector(".filter-rule-field");
    const operatorInput = ruleCard.querySelector(".filter-rule-operator");
    const valueInput = ruleCard.querySelector(".filter-rule-value");
    const removeButton = ruleCard.querySelector(".remove-filter-rule-btn");

    fieldInput.addEventListener("change", () => {
      currentRule.field = fieldInput.value;
    });
    operatorInput.addEventListener("change", () => {
      currentRule.operator = operatorInput.value;
    });
    valueInput.addEventListener("input", () => {
      currentRule.value = valueInput.value;
    });
    removeButton.addEventListener("click", () => {
      layerRecord.filterConfig.rules.splice(index, 1);
      renderFilterRules(layerRecord);
    });
  });
}

function openFilterModal(layerId) {
  const layerRecord = getLayerRecordById(layerId);
  if (!layerRecord) {
    return;
  }

  activeFilterLayerId = layerId;
  layerRecord.filterConfig = cloneFilterConfig(layerRecord.filterConfig);
  filterLayerLabel.textContent = `Build a query to control which features of ${layerRecord.name} remain visible.`;
  filterLogicSelect.value = layerRecord.filterConfig.logic;
  renderFilterRules(layerRecord);
  showModal(filterModal);
}

function closeFilterModal() {
  hideModal(filterModal, () => {
    activeFilterLayerId = "";
  });
}

function openHelpModal() {
  showModal(helpModal);
}

function closeHelpModal() {
  hideModal(helpModal);
}

function applyFilterFromControls() {
  const layerRecord = getLayerRecordById(activeFilterLayerId);
  if (!layerRecord) {
    return;
  }

  layerRecord.filterConfig.logic = filterLogicSelect.value === "or" ? "or" : "and";
  layerRecord.filterConfig.rules = layerRecord.filterConfig.rules.filter(
    (rule) => rule.field && rule.operator
  );
  rebuildLayerFromData(layerRecord);
  if (layerRecord.id === activeEditableLayerId) {
    syncEditableWorkspace();
  }
  updateStatus(`Filter applied to ${layerRecord.name}.`);
  closeFilterModal();
}

function clearLayerFilter() {
  const layerRecord = getLayerRecordById(activeFilterLayerId);
  if (!layerRecord) {
    return;
  }

  layerRecord.filterConfig = createDefaultFilterConfig();
  filterLogicSelect.value = "and";
  renderFilterRules(layerRecord);
  rebuildLayerFromData(layerRecord);
  if (layerRecord.id === activeEditableLayerId) {
    syncEditableWorkspace();
  }
  updateStatus(`Filter cleared for ${layerRecord.name}.`);
}

function renderEditableLayerOptions() {
  // Pencil icon status is handled by renderAttributeTable
  renderAttributeTable();
}

function updateDrawToolbarForActiveLayer() {
  if (drawControl) {
    map.removeControl(drawControl);
    drawControl = null;
  }
  // Only add the draw toolbar to the map when a layer is actively being edited.
  // When no layer is in edit mode getActiveEditableLayer() returns null and we
  // leave the toolbar off entirely so the map stays uncluttered.
  const activeLayer = getActiveEditableLayer();
  if (activeLayer) {
    drawControl = createDrawControlForGeometry(activeLayer);
    map.addControl(drawControl);
  }
}

function setActiveEditableLayer(layerId) {
  if (layerId) {
    const requestedLayer = getLayerRecordById(layerId);
    if (!isEditableLayerRecord(requestedLayer)) {
      return;
    }
  }

  const previousActiveLayer = getActiveEditableLayer();
  const previousActiveLayerId = previousActiveLayer?.id || "";
  if (previousActiveLayer && previousActiveLayer.isVisible !== false) {
    previousActiveLayer.layerGroup.addTo(map);
  }

  activeEditableLayerId = layerId;
  if (layerId) selectedTableLayerId = layerId;
  selectedFeatureContext = null;
  const activeLayer = getActiveEditableLayer();

  if (activeLayer && activeLayer.isVisible === false) {
    activeLayer.isVisible = true;
    activeLayer.layerGroup.addTo(map);
  }

  if (previousActiveLayerId && previousActiveLayerId !== layerId) {
    queueEditToggleAnimation(previousActiveLayerId, "off");
  }

  if (layerId && previousActiveLayerId !== layerId) {
    queueEditToggleAnimation(layerId, "on");
  }

  renderEditableLayerOptions();
  updateDrawToolbarForActiveLayer();
  renderAttributeTable();
  renderLayerList();
  syncEditableWorkspace();

  // Manage edit history: clear on every layer switch, push baseline when starting edit
  clearEditHistory();
  if (layerId && activeLayer) {
    pushEditSnapshot(activeLayer);
  }

  if (layerId) {
    updateStatus(`Editable layer changed. Use the ${getGeometryKindLabel(getLayerGeometryKind(activeLayer)).toLowerCase()} draw tools.`);
  }
}

function getActiveEditableLayer() {
  return loadedLayers.find((layerRecord) => layerRecord.id === activeEditableLayerId && isVectorLayerRecord(layerRecord)) || null;
}

function selectTableLayer(layerId) {
  selectedTableLayerId = layerId;
  renderAttributeTable();
  renderLayerList();
}

function ensureVisibleLayersOnMap() {
  loadedLayers.forEach((layerRecord) => {
    if (layerRecord.isVisible !== false && (isRasterLayerRecord(layerRecord) || layerRecord.id !== activeEditableLayerId)) {
      layerRecord.layerGroup.addTo(map);
    }
  });
}

function syncEditableWorkspace() {
  drawWorkspace.addTo(map);
  drawWorkspace.clearLayers();
  const activeLayer = getActiveEditableLayer();
  if (activeLayer) {
    map.removeLayer(activeLayer.layerGroup);

    const filteredFeatures = getFilteredFeatures(activeLayer);
    filteredFeatures.forEach((feature) => {
      const layers = L.geoJSON(feature, {
        style: () => createFeatureStyle(activeLayer, feature),
        pointToLayer: (currentFeature, latlng) =>
          L.marker(latlng, { icon: VectorStyleManager.createPointIcon(activeLayer, feature) }),
      }).getLayers();

      layers.forEach((layer) => {
        bindFeatureBehavior(activeLayer, layer, feature, drawWorkspace);
      });
    });
  }

  ensureVisibleLayersOnMap();
}

function selectFeature(layerId, layer) {
  if (layerId === activeEditableLayerId) {
    // Already the editable layer — just update selection context
  } else if (selectedTableLayerId === layerId) {
    // Layer is shown in table but not in edit mode — don't force edit on, just highlight row
  } else {
    setActiveEditableLayer(layerId);
  }

  selectedFeatureContext = {
    layerId,
    featureId: layer.feature?.id,
  };

  renderAttributeTable();
  if (!calculatorModal.hidden) {
    renderCalculatorPreviewFeatureOptions();
    updateCalculatorPreview();
  }
}

/**
 * Flush any in-progress cell edits from the live DOM before the table is
 * re-rendered or edit mode is toggled off.  Without this, values typed into
 * <input> elements that haven't fired a "change" event yet (because the user
 * never blurred them before clicking the edit toggle) are silently discarded.
 */
function flushPendingTableEdits() {
  if (!attributeTableWrap) return;
  attributeTableWrap.querySelectorAll("[data-field][data-feature-id]").forEach((input) => {
    const { featureId, field } = input.dataset;
    if (!featureId || !field) return;
    const activeLayer = getActiveEditableLayer();
    if (!activeLayer) return;
    const feature = getFeatureById(activeLayer, featureId);
    if (!feature) return;
    const currentValue = String(feature.properties?.[field] ?? "");
    if (input.value !== currentValue) {
      updateAttributeTableCell(featureId, field, input.value);
    }
  });
}

function renderAttributeTable() {
  // Determine which layer to show: prefer selectedTableLayerId, fall back to activeEditable
  const tableLayerId = selectedTableLayerId || activeEditableLayerId;
  const tableLayer = tableLayerId
    ? loadedLayers.find((lr) => lr.id === tableLayerId && isVectorLayerRecord(lr)) || null
    : null;
  const isEditMode = tableLayer && tableLayer.id === activeEditableLayerId;

  // Update pencil icon status
  if (tableEditStatusBtn) {
    if (!tableLayer) {
      tableEditStatusBtn.disabled = true;
      tableEditStatusBtn.className = "table-edit-status edit-status-none";
      tableEditStatusBtn.title = "Select a vector layer to edit";
      tableEditStatusBtn.setAttribute("aria-label", "No layer selected");
    } else if (!isEditableLayerRecord(tableLayer)) {
      tableEditStatusBtn.disabled = true;
      tableEditStatusBtn.className = "table-edit-status edit-status-locked";
      tableEditStatusBtn.title = "This layer cannot be edited";
      tableEditStatusBtn.setAttribute("aria-label", "Layer not editable");
    } else {
      tableEditStatusBtn.disabled = false;
      tableEditStatusBtn.className = isEditMode
        ? "table-edit-status edit-status-on"
        : "table-edit-status edit-status-off";
      tableEditStatusBtn.title = isEditMode ? "Editing enabled" : "Enable editing";
      tableEditStatusBtn.setAttribute("aria-label", isEditMode ? "Edit mode on" : "Edit mode off");
    }
  }

  // Update undo/redo button states
  if (tableUndoBtn) {
    tableUndoBtn.disabled = !isEditMode || !canUndoEdit();
    tableUndoBtn.title = isEditMode ? (canUndoEdit() ? "Undo last edit" : "Nothing to undo") : "Enable edit mode to use undo";
  }
  if (tableRedoBtn) {
    tableRedoBtn.disabled = !isEditMode || !canRedoEdit();
    tableRedoBtn.title = isEditMode ? (canRedoEdit() ? "Redo" : "Nothing to redo") : "Enable edit mode to use redo";
  }

  // Update layer label
  if (tableLayerLabel) {
    tableLayerLabel.textContent = tableLayer ? tableLayer.name : "";
    tableLayerLabel.hidden = false;
  }
  if (tableLayerRenameBtn) {
    tableLayerRenameBtn.hidden = !tableLayer;
  }
  if (tableLayerRenameInput && !tableLayerRenameInput.hidden) {
    // Cancel any in-progress rename when layer changes
    tableLayerRenameInput.hidden = true;
    if (tableLayerRenameBtn) tableLayerRenameBtn.hidden = !tableLayer;
  }

  if (!tableLayer) {
    attributeTableWrap.className = "table-wrap empty-table";
    attributeTableWrap.innerHTML =
      '<div class="table-placeholder">Select a vector layer to view its attribute table.</div>';
    return;
  }

  const features = tableLayer.geojson.features;
  const fields = getLayerFieldNames(tableLayer);

  if (isLargeCsvLayerRecord(tableLayer)) {
    attributeTableWrap.className = "table-wrap empty-table";
    attributeTableWrap.innerHTML =
      '<div class="table-placeholder">Large CSV mode keeps the map responsive by skipping the raw attribute table and per-point editing.</div>';
    return;
  }

  if (!features.length) {
    attributeTableWrap.className = "table-wrap empty-table";
    attributeTableWrap.innerHTML =
      '<div class="table-placeholder">This layer has no features yet. Draw one on the map to begin.</div>';
    return;
  }

  const headerCells = ['<th>Feature</th>', '<th>Geometry</th>']
    .concat(fields.map((field) => `<th>${escapeHtml(field)}</th>`))
    .concat(['<th>Map</th>'])
    .join("");

  const bodyRows = features
    .map((feature, index) => {
      const isSelected =
        selectedFeatureContext?.layerId === tableLayer.id &&
        selectedFeatureContext?.featureId === feature.id;
      const cells = fields
        .map((field) => {
          const value = feature.properties?.[field] ?? "";
          return `
            <td>
              <input
                class="table-cell-input"
                type="text"
                data-feature-id="${escapeHtml(feature.id)}"
                data-field="${escapeHtml(field)}"
                value="${escapeHtml(String(value))}"
                ${isEditMode ? "" : "readonly"}
              />
            </td>
          `;
        })
        .join("");

      return `
        <tr class="${isSelected ? "selected-table-row" : ""}">
          <td>${index + 1}</td>
          <td>${escapeHtml(feature.geometry?.type || "Unknown")}</td>
          ${cells}
          <td>
            <button
              class="ghost-button table-row-button"
              type="button"
              data-zoom-feature-id="${escapeHtml(feature.id)}"
            >
              Locate
            </button>
            <button
              class="ghost-button table-row-button table-row-delete-btn"
              type="button"
              data-delete-feature-id="${escapeHtml(feature.id)}"
              ${isEditMode ? "" : "disabled"}
              title="${isEditMode ? "Remove this feature" : "Enable editing to remove features"}"
            >
              Remove
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  attributeTableWrap.className = `table-wrap${isEditMode ? "" : " table-readonly"}`;
  attributeTableWrap.innerHTML = `
    <table class="attribute-table">
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  `;

  attributeTableWrap.querySelectorAll("[data-field]").forEach((input) => {
    if (isEditMode) {
      input.addEventListener("change", (event) => {
        const { featureId, field } = event.target.dataset;
        updateAttributeTableCell(featureId, field, event.target.value);
      });
    }
  });

  attributeTableWrap.querySelectorAll("[data-zoom-feature-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      zoomToFeature(event.target.dataset.zoomFeatureId);
    });
  });

  attributeTableWrap.querySelectorAll("[data-delete-feature-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const featureId = event.currentTarget.dataset.deleteFeatureId;
      const activeLayer = getActiveEditableLayer();
      if (!activeLayer) return;

      // Snapshot BEFORE mutation so undo can restore this state
      pushEditSnapshot(activeLayer);

      // Remove the matching layer from drawWorkspace
      drawWorkspace.getLayers().forEach((layer) => {
        const feature = layerToFeature(layer);
        if (feature?.id === featureId) {
          drawWorkspace.removeLayer(layer);
        }
      });

      // Also remove directly from the layerGroup if not yet in drawWorkspace
      activeLayer.layerGroup.getLayers().forEach((layer) => {
        const feature = layerToFeature(layer);
        if (feature?.id === featureId) {
          activeLayer.layerGroup.removeLayer(layer);
        }
      });

      // Sync geojson and re-render
      syncActiveLayerGeoJSONFromMap();
      if (typeof onProjectDirty === "function") onProjectDirty();
      updateStatus("Feature removed.");
    });
  });
}


// ─── Inline Layer Rename ──────────────────────────────────────────────────────

function startLayerRename() {
  const tableLayerId = selectedTableLayerId || activeEditableLayerId;
  if (!tableLayerId) return;
  const layerRecord = loadedLayers.find((lr) => lr.id === tableLayerId && isVectorLayerRecord(lr));
  if (!layerRecord) return;
  if (!tableLayerLabel || !tableLayerRenameInput || !tableLayerRenameBtn) return;

  tableLayerRenameInput.value = layerRecord.name;
  tableLayerLabel.hidden = true;
  tableLayerRenameBtn.hidden = true;
  tableLayerRenameInput.hidden = false;
  tableLayerRenameInput.focus();
  tableLayerRenameInput.select();

  // Auto-size to content
  tableLayerRenameInput.style.width =
    Math.min(Math.max(layerRecord.name.length * 8 + 24, 80), 260) + "px";
}

async function commitLayerRename(layerRecord, newName) {
  newName = newName.trim();

  // Reveal label, hide input regardless
  if (tableLayerLabel) tableLayerLabel.hidden = false;
  if (tableLayerRenameBtn) tableLayerRenameBtn.hidden = false;
  if (tableLayerRenameInput) tableLayerRenameInput.hidden = true;

  if (!newName) {
    // Shake the label briefly to signal rejection
    if (tableLayerLabel) {
      tableLayerLabel.classList.add("rename-shake");
      setTimeout(() => tableLayerLabel.classList.remove("rename-shake"), 400);
    }
    return;
  }
  if (newName === layerRecord.name) return;

  const oldFileName = buildLayerFileName(layerRecord);
  layerRecord.name = newName;

  if (tableLayerLabel) tableLayerLabel.textContent = newName;
  renderLayerList();

  if (isAutoSaveAvailable()) {
    await renameLayerFile(layerRecord, oldFileName);
  } else {
    if (typeof onProjectDirty === "function") onProjectDirty();
    updateStatus("Layer renamed — save project to persist");
  }
}

function wireLayerRenameHandlers() {
  if (!tableLayerRenameBtn || !tableLayerRenameInput) return;

  tableLayerRenameBtn.addEventListener("click", () => startLayerRename());
  tableLayerLabel && tableLayerLabel.addEventListener("dblclick", () => startLayerRename());

  tableLayerRenameInput.addEventListener("keydown", (e) => {
    const tableLayerId = selectedTableLayerId || activeEditableLayerId;
    const layerRecord = tableLayerId
      ? loadedLayers.find((lr) => lr.id === tableLayerId && isVectorLayerRecord(lr))
      : null;
    if (e.key === "Enter") {
      e.preventDefault();
      if (layerRecord) commitLayerRename(layerRecord, tableLayerRenameInput.value);
    } else if (e.key === "Escape") {
      // Revert
      if (tableLayerLabel) tableLayerLabel.hidden = false;
      if (tableLayerRenameBtn) tableLayerRenameBtn.hidden = false;
      tableLayerRenameInput.hidden = true;
    }
  });

  tableLayerRenameInput.addEventListener("blur", () => {
    if (tableLayerRenameInput.hidden) return; // already handled
    const tableLayerId = selectedTableLayerId || activeEditableLayerId;
    const layerRecord = tableLayerId
      ? loadedLayers.find((lr) => lr.id === tableLayerId && isVectorLayerRecord(lr))
      : null;
    if (layerRecord) commitLayerRename(layerRecord, tableLayerRenameInput.value);
  });
}

function getActiveCalculatorMode() {
  return Array.from(calculatorModeInputs).find((input) => input.checked)?.value || "create";
}

function getCalculatorCatalogGroups() {
  return Array.isArray(window.calculatorExpressionCatalog?.groups) ? window.calculatorExpressionCatalog.groups : [];
}

function getCalculatorVariableCatalog() {
  return Array.isArray(window.calculatorExpressionCatalog?.variables) ? window.calculatorExpressionCatalog.variables : [];
}

function getSavedCalculatorExpressions() {
  try {
    const stored = JSON.parse(localStorage.getItem(CALCULATOR_SAVED_EXPRESSIONS_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}

function persistSavedCalculatorExpressions(expressions) {
  localStorage.setItem(CALCULATOR_SAVED_EXPRESSIONS_KEY, JSON.stringify(expressions));
}

function renderSavedCalculatorExpressions() {
  const savedExpressions = getSavedCalculatorExpressions();
  calculatorSavedExpressions.innerHTML = ['<option value="">Choose a saved expression</option>']
    .concat(
      savedExpressions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    )
    .join("");
}

function getActiveLayerFieldNames() {
  const activeLayer = getActiveEditableLayer();
  return getLayerFieldNames(activeLayer);
}

function renderCalculatorFieldList() {
  const fields = getActiveLayerFieldNames();
  const query = calculatorFieldSearch.value.trim().toLowerCase();
  const filtered = fields.filter((field) => field.toLowerCase().includes(query));

  if (!filtered.length) {
    calculatorFieldList.innerHTML = '<div class="calculator-empty">No matching fields.</div>';
    return;
  }

  calculatorFieldList.innerHTML = filtered
    .map(
      (field) =>
        `<button class="calculator-chip" type="button" data-insert='"${escapeHtml(field)}"' title="${escapeHtml(field)}">${escapeHtml(field)}</button>`
    )
    .join("");

  calculatorFieldList.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => insertCalculatorText(button.dataset.insert));
  });
}

function renderCalculatorVariableList() {
  const geoVars = Array.isArray(window.calculatorExpressionCatalog?.geoVars)
    ? window.calculatorExpressionCatalog.geoVars : [];

  if (!geoVars.length) {
    calculatorVariableList.innerHTML = '<div class="calculator-empty">No geometry variables available.</div>';
    return;
  }

  calculatorVariableList.innerHTML = geoVars
    .map((item) => `
      <button
        class="calculator-chip calc2-geo-chip"
        type="button"
        data-insert="${escapeHtml(item.insert)}"
      >
        <span class="calc2-chip-label">${escapeHtml(item.label)}</span>
        <span class="calc2-chip-desc">${escapeHtml(item.description)}</span>
      </button>
    `)
    .join("");

  calculatorVariableList.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => insertCalculatorText(button.dataset.insert));
  });
}

function renderCalculatorFunctionList() {
  const query = calculatorFunctionSearch.value.trim().toLowerCase();
  const groups = getCalculatorCatalogGroups()
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => {
        if (!query) return true;
        const haystack = [group.name, item.label, item.description, ...(item.keywords || [])].join(" ").toLowerCase();
        return haystack.includes(query);
      }),
    }))
    .filter((group) => group.items.length);

  if (!groups.length) {
    calculatorFunctionList.innerHTML = '<div class="calculator-empty">No matching functions.</div>';
    return;
  }

  calculatorFunctionList.innerHTML = groups
    .map(
      (group) => `
        <div class="calculator-function-group">
          <p class="calculator-group-title">${escapeHtml(group.name)}</p>
          ${group.items
            .map(
              (item) => `
                <button
                  class="calculator-function-item"
                  type="button"
                  data-insert="${escapeHtml(item.insert)}"
                  data-example="${escapeHtml(item.example || "")}"
                  title="${escapeHtml(item.description)}"
                >
                  <span class="calc2-fn-name">${escapeHtml(item.label)}</span>
                  <span class="calc2-fn-desc">${escapeHtml(item.description)}</span>
                  ${item.example ? `<span class="calc2-fn-example">${escapeHtml(item.example)}</span>` : ""}
                </button>
              `
            )
            .join("")}
        </div>
      `
    )
    .join("");

  calculatorFunctionList.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => insertCalculatorText(button.dataset.insert));
  });
}

function renderCalculatorTargetControls() {
  const mode = getActiveCalculatorMode();
  const fields = getActiveLayerFieldNames();
  const showCreate = mode === "create";

  calculatorNewFieldStack.hidden = !showCreate;
  calculatorExistingFieldStack.hidden = showCreate;
  calculatorTargetWrap.classList.toggle("single-target-mode", true);

  calculatorExistingField.innerHTML = fields.length
    ? fields.map((field) => `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`).join("")
    : '<option value="">No fields available</option>';

  if (showCreate) {
    calculatorExistingField.value = "";
  } else {
    calculatorNewFieldName.blur();
  }
}

// ── Syntax highlighting ──────────────────────────────────────────────────────

const CALC_HL_KEYWORDS = /\b(CASE|WHEN|THEN|ELSE|END|AND|OR|NOT|IS|NULL|TRUE|FALSE)\b/g;
const CALC_HL_DOLLAR   = /(\$(?:area|length|x|y))\b/gi;
const CALC_HL_STRING   = /('(?:''|[^'])*')/g;
const CALC_HL_FIELD    = /("(?:""|[^"])*")/g;
const CALC_HL_NUMBER   = /\b(\d+(?:\.\d+)?)\b/g;
const CALC_HL_FUNC     = /\b([a-z_][a-z0-9_]*)\s*(?=\()/gi;
const CALC_HL_COMMENT  = /(--[^\n]*)/g;

function highlightCalculatorExpression(raw) {
  // Escape HTML first — work on the escaped string for spans
  const esc = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // We tokenise manually to avoid overlapping replacements:
  // strings and fields must be protected first.
  const parts = [];
  let remaining = esc;

  // Helper: split on first regex match, push [before, match, ...], recurse
  const tokenize = (str, patterns) => {
    if (!str) return "";
    for (const [re, cls] of patterns) {
      re.lastIndex = 0;
      const m = re.exec(str);
      if (m) {
        const before = str.slice(0, m.index);
        const after  = str.slice(m.index + m[0].length);
        const inner  = tokenize(before, patterns);
        return inner + `<span class="${cls}">${m[0]}</span>` + tokenize(after, patterns);
      }
    }
    return str;
  };

  // Order matters: strings & fields are literal — color them first, protect from further matching
  // Simple pass: replace from left to right without overlap
  let result = esc;

  // 1. Comments
  result = result.replace(/--[^\n]*/g, (m) => `<span class="calc-hl-comment">${m}</span>`);

  // Protect already-wrapped spans from further replacement by using a placeholder approach
  // Simpler: just do sequential safe replacements on non-overlapping token classes
  result = result.replace(/'(?:''|[^'])*'/g, (m) => `<span class="calc-hl-string">${m}</span>`);
  result = result.replace(/"(?:""|[^"])*"/g, (m) => `<span class="calc-hl-field">${m}</span>`);
  result = result.replace(/\$(?:area|length|x|y)\b/gi, (m) => `<span class="calc-hl-var">${m}</span>`);
  result = result.replace(/\b(CASE|WHEN|THEN|ELSE|END|AND|OR|NOT|IS|NULL|TRUE|FALSE)\b/g, (m) => `<span class="calc-hl-keyword">${m}</span>`);
  result = result.replace(/\b([a-z_][a-z0-9_]*)\s*(?=\()/gi, (m, fn) => `<span class="calc-hl-func">${fn}</span>(`);
  result = result.replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => `<span class="calc-hl-number">${m}</span>`);

  return result;
}

let _calcHighlightEl = null;
function getCalculatorHighlightEl() {
  if (!_calcHighlightEl) _calcHighlightEl = document.getElementById("calculator-expression-highlight");
  return _calcHighlightEl;
}

function syncCalculatorHighlight() {
  const el = getCalculatorHighlightEl();
  if (!el) return;
  const raw = calculatorExpression.value;
  el.innerHTML = highlightCalculatorExpression(raw) + "\n"; // trailing \n keeps last line visible
  // Sync scroll
  el.scrollTop  = calculatorExpression.scrollTop;
  el.scrollLeft = calculatorExpression.scrollLeft;
}

// ── Debounced live preview (300 ms) ─────────────────────────────────────────

let _calcPreviewTimer = null;
function scheduleCalculatorPreview() {
  syncCalculatorHighlight();
  clearTimeout(_calcPreviewTimer);
  _calcPreviewTimer = setTimeout(updateCalculatorPreview, 300);
}

// ── Insert helper ────────────────────────────────────────────────────────────

function insertCalculatorText(text) {
  const start = calculatorExpression.selectionStart ?? calculatorExpression.value.length;
  const end   = calculatorExpression.selectionEnd   ?? calculatorExpression.value.length;
  const current = calculatorExpression.value;
  calculatorExpression.value = `${current.slice(0, start)}${text}${current.slice(end)}`;
  calculatorExpression.focus();
  const cursor = start + text.length;
  calculatorExpression.setSelectionRange(cursor, cursor);
  syncCalculatorHighlight();
  updateCalculatorPreview();
}

function normalizeLegacyCalculatorExpression(expression) {
  const fieldNormalized = expression.replace(/\[([^\]]+)\]/g, (_, fieldName) => {
    const normalizedFieldName = fieldName.trim();
    return `__fields[${JSON.stringify(normalizedFieldName)}]`;
  });
  return rewriteLegacyConcatOperators(fieldNormalized);
}

function rewriteLegacyConcatOperators(expression) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    const next = expression[index + 1];

    if ((char === '"' || char === "'") && expression[index - 1] !== "\\") {
      if (!quote) {
        quote = char;
      } else if (quote === char) {
        quote = "";
      }
      current += char;
      continue;
    }

    if (!quote) {
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth = Math.max(0, depth - 1);
      }

      if (char === "|" && next === "|" && depth === 0) {
        parts.push(current.trim());
        current = "";
        index += 1;
        continue;
      }
    }

    current += char;
  }

  parts.push(current.trim());

  if (parts.length <= 1) {
    return fieldNormalizedWhitespace(expression);
  }

  return `concat(${parts.join(", ")})`;
}

function fieldNormalizedWhitespace(expression) {
  return expression.trim();
}

function buildLegacyCalculatorScope(feature) {
  const properties = feature?.properties || {};
  const scope = {
    __fields: properties,
    ...createSpatialCalculatorHelpers(feature),
  };

  Object.entries(properties).forEach(([key, value]) => {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      scope[key] = value;
    }
  });

  return scope;
}

function evaluateLegacyCalculatorExpression(feature, expression) {
  const normalized = normalizeLegacyCalculatorExpression(expression);
  return math.evaluate(normalized, buildLegacyCalculatorScope(feature));
}

function getFriendlyCalculatorError(expression, error) {
  const errorMessage = error?.message || "Expression could not be evaluated.";
  const unknownFunction = errorMessage.match(/Unknown calculator function "([^"]+)"/i);
  if (unknownFunction) {
    return `Function "${unknownFunction[1]}" is not supported in the browser calculator yet.`;
  }
  if (/\bwith_variable\s*\(/i.test(expression)) {
    return 'The browser calculator does not support `with_variable()` yet.';
  }
  if (/\bgeometry_part_count\s*\(/i.test(expression)) {
    return 'The browser calculator does not support `geometry_part_count()` yet.';
  }
  return error?.details || errorMessage;
}

function evaluateCalculatorExpression(feature, expression, options = {}) {
  try {
    const result = evaluateCalculatorEngine(expression, {
      feature,
      layerRecord: options.layerRecord || null,
      rowIndex: Number.isInteger(options.rowIndex) ? options.rowIndex : 0,
      parent: options.parent ?? feature,
    });
    return { result, engine: "qgis" };
  } catch (error) {
    // Try legacy fallback for backwards compatibility
    try {
      return {
        result: evaluateLegacyCalculatorExpression(feature, expression),
        engine: "legacy",
      };
    } catch (_legacyError) {
      // Prefer the new engine's friendly message; it already has context
      throw new Error(error.message || error.details || String(error));
    }
  }
}

function setCalculatorError(message = "") {
  calculatorError.hidden = !message;
  calculatorError.textContent = message;
}

function resetCalculatorPreviewDetails() {
  if (!calculatorPreviewDetails) {
    return;
  }
  calculatorPreviewDetails.hidden = true;
  calculatorPreviewDetails.innerHTML = "";
}

function formatCalculatorPreviewValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}

function getExpressionReferencedFields(expression) {
  const fieldNames = new Set();
  const bracketMatches = String(expression ?? "").matchAll(/\[([^\]]+)\]/g);
  for (const match of bracketMatches) {
    const fieldName = match[1]?.trim();
    if (fieldName) {
      fieldNames.add(fieldName);
    }
  }

  const quotedMatches = String(expression ?? "").matchAll(/"([^"]+)"/g);
  const activeFieldNames = new Set(getActiveLayerFieldNames());
  for (const match of quotedMatches) {
    const fieldName = match[1]?.trim();
    if (fieldName && activeFieldNames.has(fieldName)) {
      fieldNames.add(fieldName);
    }
  }

  return Array.from(fieldNames);
}

function renderCalculatorPreviewDetails(feature, expression) {
  if (!calculatorPreviewDetails) {
    return;
  }

  const fieldNames = getExpressionReferencedFields(expression).slice(0, 4);
  if (!fieldNames.length) {
    resetCalculatorPreviewDetails();
    return;
  }

  calculatorPreviewDetails.innerHTML = fieldNames
    .map((fieldName) => {
      const rawValue = feature?.properties?.[fieldName];
      const normalizedValue = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : null;
      return `
        <div class="calculator-preview-detail">
          <strong>${escapeHtml(fieldName)}</strong>: raw ${escapeHtml(formatCalculatorPreviewValue(rawValue))}
          ${normalizedValue !== null ? `<br>normalized ${escapeHtml(formatCalculatorPreviewValue(normalizedValue))}` : ""}
        </div>
      `;
    })
    .join("");
  calculatorPreviewDetails.hidden = false;
}

function renderCalculatorPreviewFeatureOptions() {
  const activeLayer = getActiveEditableLayer();
  const features = activeLayer?.geojson?.features || [];
  const selectedFeatureId =
    selectedFeatureContext?.layerId === activeLayer?.id ? selectedFeatureContext.featureId : "";

  const options = ['<option value="__first__">Feature 1</option>'];
  if (selectedFeatureId) {
    options.push('<option value="__selected__">Selected feature</option>');
  }

  features.slice(0, 50).forEach((feature, index) => {
    const label = feature?.properties?.name || feature?.properties?.id || `Feature ${index + 1}`;
    options.push(`<option value="${escapeHtml(String(feature.id))}">${escapeHtml(label)}</option>`);
  });

  calculatorPreviewFeature.innerHTML = options.join("");
  calculatorPreviewFeature.value = selectedFeatureId ? "__selected__" : "__first__";
}

function getCalculatorPreviewTarget(activeLayer) {
  const features = activeLayer?.geojson?.features || [];
  if (!features.length) {
    return { feature: null, rowIndex: 0, label: "feature" };
  }

  if (calculatorPreviewFeature.value === "__selected__" && selectedFeatureContext?.layerId === activeLayer.id) {
    const feature = getFeatureById(activeLayer, selectedFeatureContext.featureId);
    const rowIndex = Math.max(0, features.findIndex((item) => item.id === selectedFeatureContext.featureId));
    if (feature) {
      return { feature, rowIndex, label: "selected feature" };
    }
  }

  if (calculatorPreviewFeature.value && calculatorPreviewFeature.value !== "__first__") {
    const feature = getFeatureById(activeLayer, calculatorPreviewFeature.value);
    const rowIndex = Math.max(0, features.findIndex((item) => String(item.id) === calculatorPreviewFeature.value));
    if (feature) {
      return { feature, rowIndex, label: "chosen feature" };
    }
  }

  return { feature: features[0], rowIndex: 0, label: "feature 1" };
}

function updateCalculatorPreview() {
  const activeLayer = getActiveEditableLayer();
  if (!activeLayer || !activeLayer.geojson.features.length) {
    calculatorPreviewText.textContent = "Load or draw a feature to preview the expression.";
    resetCalculatorPreviewDetails();
    setCalculatorError("");
    return;
  }

  const expression = calculatorExpression.value.trim();
  if (!expression) {
    calculatorPreviewText.textContent = "Write an expression to preview it against a feature.";
    resetCalculatorPreviewDetails();
    setCalculatorError("");
    return;
  }

  try {
    const previewTarget = getCalculatorPreviewTarget(activeLayer);
    const evaluation = evaluateCalculatorExpression(previewTarget.feature, expression, {
      layerRecord: activeLayer,
      rowIndex: previewTarget.rowIndex,
    });
    const isAreaExpression = /\barea\s*\(/i.test(expression);
    const unitSuffix = isAreaExpression && typeof evaluation.result === "number" ? " sq. meters" : "";
    calculatorPreviewText.textContent =
      `Preview result (${previewTarget.label}, ${evaluation.engine === "qgis" ? "new engine" : "legacy fallback"}): ${formatCalculatorPreviewValue(evaluation.result)}${unitSuffix}`;
    renderCalculatorPreviewDetails(previewTarget.feature, expression);
    setCalculatorError("");
  } catch (error) {
    calculatorPreviewText.textContent = "Preview unavailable.";
    resetCalculatorPreviewDetails();
    setCalculatorError(error.message);
  }
}

function saveCurrentCalculatorExpression() {
  const expression = calculatorExpression.value.trim();
  if (!expression) {
    setCalculatorError("Enter an expression before saving it.");
    return;
  }

  const name = window.prompt("Save this expression as:");
  if (!name?.trim()) {
    return;
  }

  const savedExpressions = getSavedCalculatorExpressions();
  const existingIndex = savedExpressions.findIndex((item) => item.name.toLowerCase() === name.trim().toLowerCase());
  const nextItem = {
    id: existingIndex >= 0 ? savedExpressions[existingIndex].id : crypto.randomUUID(),
    name: name.trim(),
    expression,
  };

  if (existingIndex >= 0) {
    savedExpressions.splice(existingIndex, 1, nextItem);
  } else {
    savedExpressions.push(nextItem);
  }

  persistSavedCalculatorExpressions(savedExpressions);
  renderSavedCalculatorExpressions();
  calculatorSavedExpressions.value = nextItem.id;
  updateStatus(`Saved calculator expression "${nextItem.name}".`);
}

function loadSelectedCalculatorExpression() {
  const selectedId = calculatorSavedExpressions.value;
  const selectedExpression = getSavedCalculatorExpressions().find((item) => item.id === selectedId);
  if (!selectedExpression) {
    setCalculatorError("Choose a saved expression first.");
    return;
  }

  calculatorExpression.value = selectedExpression.expression;
  updateCalculatorPreview();
}

function deleteSelectedCalculatorExpression() {
  const selectedId = calculatorSavedExpressions.value;
  if (!selectedId) {
    setCalculatorError("Choose a saved expression first.");
    return;
  }

  persistSavedCalculatorExpressions(getSavedCalculatorExpressions().filter((item) => item.id !== selectedId));
  renderSavedCalculatorExpressions();
  updateStatus("Saved calculator expression removed.");
}

function exportSavedCalculatorExpressions() {
  downloadTextFile(
    "spatial-decm-calculator-expressions.json",
    JSON.stringify(getSavedCalculatorExpressions(), null, 2),
    "application/json"
  );
  updateStatus("Saved calculator expressions exported.");
}

async function importSavedCalculatorExpressions(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported)) {
      throw new Error("Imported file must contain an array of saved expressions.");
    }

    const merged = new Map(getSavedCalculatorExpressions().map((item) => [item.id, item]));
    imported.forEach((item) => {
      if (item?.name && item?.expression) {
        const id = item.id || crypto.randomUUID();
        merged.set(id, {
          id,
          name: String(item.name),
          expression: String(item.expression),
        });
      }
    });

    persistSavedCalculatorExpressions(Array.from(merged.values()));
    renderSavedCalculatorExpressions();
    updateStatus("Saved calculator expressions imported.");
  } catch (error) {
    setCalculatorError(error.message);
  } finally {
    calculatorImportFile.value = "";
  }
}

function openCalculatorModal() {
  const activeLayer = getActiveEditableLayer();
  if (!activeLayer) {
    updateStatus("Choose an editable layer before using the field calculator.", true);
    return;
  }

  calculatorFieldSearch.value = "";
  calculatorFunctionSearch.value = "";
  showModal(calculatorModal);
  renderCalculatorFieldList();
  renderCalculatorVariableList();
  renderCalculatorFunctionList();
  renderSavedCalculatorExpressions();
  renderCalculatorTargetControls();
  renderCalculatorPreviewFeatureOptions();
  syncCalculatorHighlight();
  updateCalculatorPreview();
}

function closeCalculatorModal() {
  hideModal(calculatorModal);
}

function applyCalculatorToLayer() {
  const activeLayer = getActiveEditableLayer();
  if (!activeLayer) {
    updateStatus("Choose an editable layer before applying the calculator.", true);
    return;
  }

  const expression = calculatorExpression.value.trim();
  if (!expression) {
    setCalculatorError("Enter an expression first.");
    return;
  }

  const mode = getActiveCalculatorMode();
  const targetField =
    mode === "create"
      ? calculatorNewFieldName.value.trim()
      : calculatorExistingField.value.trim();

  if (!targetField) {
    setCalculatorError("Choose or enter a target field.");
    return;
  }

  try {
    if (mode === "create" && !activeLayer.fields.includes(targetField)) {
      activeLayer.fields.push(targetField);
      activeLayer.fields.sort();
    }

    activeLayer.geojson.features.forEach((feature, index) => {
      feature.properties = feature.properties || {};
      feature.properties[targetField] = evaluateCalculatorExpression(feature, expression, {
        layerRecord: activeLayer,
        rowIndex: index,
      }).result;
    });

    rebuildLayerFromData(activeLayer);
    renderAttributeTable();
    renderCalculatorFieldList();
    renderCalculatorTargetControls();
    updateCalculatorPreview();
    setCalculatorError("");
    updateStatus(`Field calculator updated ${targetField} for ${activeLayer.name}.`);
    if (typeof onProjectDirty === "function") onProjectDirty();
  } catch (error) {
    setCalculatorError(error.message);
  }
}

function updateAttributeTableCell(featureId, fieldName, fieldValue) {
  const activeLayer = getActiveEditableLayer();
  if (!activeLayer) {
    return;
  }

  const feature = getFeatureById(activeLayer, featureId);
  if (!feature) {
    updateStatus("Feature could not be found for table edit.", true);
    return;
  }

  // Snapshot BEFORE mutation so undo restores the old value
  pushEditSnapshot(activeLayer);

  feature.properties[fieldName] = fieldValue;
  if (!activeLayer.fields.includes(fieldName)) {
    activeLayer.fields.push(fieldName);
    activeLayer.fields.sort();
  }
  rebuildLayerFromData(activeLayer);
  renderAttributeTable();
  if (typeof onProjectDirty === "function") onProjectDirty();

  updateStatus(`Updated ${fieldName} in ${activeLayer.name}.`);
}

function zoomToFeature(featureId) {
  const tableLayerId = selectedTableLayerId || activeEditableLayerId;
  const activeLayer = tableLayerId
    ? loadedLayers.find((lr) => lr.id === tableLayerId && isVectorLayerRecord(lr)) || null
    : null;
  if (!activeLayer) {
    return;
  }

  const layer = getMapLayerByFeatureId(activeLayer, featureId);
  if (!layer) {
    return;
  }

  const bounds = getBoundsSafe(L.featureGroup([layer]));
  if (bounds) {
    map.fitBounds(bounds, { padding: [30, 30] });
  } else if (typeof layer.getLatLng === "function") {
    map.setView(layer.getLatLng(), Math.max(map.getZoom(), 14));
  }

  selectFeature(activeLayer.id, layer);
}

function createEmptyLayer(name, geometryKind = "point") {
  const layerName = name || `New Layer ${loadedLayers.length + 1}`;
  const layerRecord = createLayerRecord(
    {
      type: "FeatureCollection",
      features: [],
    },
    `${layerName}.geojson`,
    "Created Layer",
    { geometryKind: normalizeVectorGeometryKind(geometryKind, "point") }
  );

  addLayerRecord(layerRecord);
  setActiveEditableLayer(layerRecord.id);
  updateStatus(`${layerRecord.name} created as a ${getGeometryKindLabel(layerRecord.geometryKind).toLowerCase()} layer and set to edit mode.`);
  closeLayerModal();
}

function addFieldToLayer(fieldName, fieldValue) {
  const layerRecord = getActiveEditableLayer();

  if (!layerRecord) {
    updateStatus("Select an editable layer before adding a field.", true);
    return;
  }

  if (!fieldName) {
    updateStatus("Enter a field name first.", true);
    return;
  }

  if (!layerRecord.fields.includes(fieldName)) {
    layerRecord.fields.push(fieldName);
    layerRecord.fields.sort();
  }

  layerRecord.geojson.features.forEach((feature) => {
    feature.properties = feature.properties || {};
    if (!(fieldName in feature.properties)) {
      feature.properties[fieldName] = fieldValue;
    }
  });

  rebuildLayerFromData(layerRecord);
  renderAttributeTable();
  renderCalculatorFieldList();
  renderCalculatorTargetControls();
  updateStatus(`Added field "${fieldName}" to ${layerRecord.name}.`);
  if (typeof onProjectDirty === "function") onProjectDirty();
  closeFieldModal();
}

function layerToFeature(layer) {
  const feature = layer.toGeoJSON();
  feature.id = layer.feature?.id || feature.id || crypto.randomUUID();
  feature.properties = {
    ...(layer.feature?.properties || {}),
  };
  return feature;
}

function syncActiveLayerGeoJSONFromMap() {
  const activeLayer = getActiveEditableLayer();
  if (!activeLayer) {
    return;
  }

  const sourceLayers = drawWorkspace.getLayers().length
    ? drawWorkspace.getLayers()
    : activeLayer.layerGroup.getLayers();

  const editedFeatures = sourceLayers.map((layer) => layerToFeature(layer));
  const hasActiveFilter = (activeLayer.filterConfig?.rules || []).length > 0;

  if (hasActiveFilter) {
    const originalFeatures = activeLayer.geojson.features;
    const visibleIds = new Set(getFilteredFeatures(activeLayer).map((feature) => feature.id));
    const editedFeatureMap = new Map(editedFeatures.map((feature) => [feature.id, feature]));
    const mergedFeatures = [];

    originalFeatures.forEach((feature) => {
      if (!visibleIds.has(feature.id)) {
        mergedFeatures.push(feature);
        return;
      }

      if (editedFeatureMap.has(feature.id)) {
        mergedFeatures.push(editedFeatureMap.get(feature.id));
        editedFeatureMap.delete(feature.id);
      }
    });

    editedFeatureMap.forEach((feature) => {
      mergedFeatures.push(feature);
    });

    activeLayer.geojson = {
      type: "FeatureCollection",
      features: mergedFeatures,
    };
  } else {
    activeLayer.geojson = {
      type: "FeatureCollection",
      features: editedFeatures,
    };
  }

  activeLayer.fields = getLayerFieldNames(activeLayer);
  const inferredGeometryKind = inferVectorGeometryKind(activeLayer.geojson);
  if (inferredGeometryKind !== "unknown") {
    activeLayer.geometryKind = inferredGeometryKind;
  }
  activeLayer.featureCount = activeLayer.geojson.features.length;
  activeLayer.visibleFeatureCount = getFilteredFeatures(activeLayer).length;
  renderLayerList();
  renderAttributeTable();
}

async function handleFiles(files) {
  const fileList = Array.from(files);
  if (!fileList.length) {
    return;
  }

  const looseShapefileGroups = getLooseShapefileGroups(fileList);
  const imports = [
    ...looseShapefileGroups.map((group) => ({
      kind: "loose-shapefile",
      label: `${group.stem}.shp`,
      group,
    })),
    ...fileList
      .filter((file) => !isFileInLooseShapefileGroup(file, looseShapefileGroups))
      .map((file) => ({
        kind: "file",
        label: file.name,
        file,
      })),
  ];

  for (const item of imports) {
    updateStatus(`Loading ${item.label}...`);
    updateImportProgress(`Loading ${item.label}`, 4, "Preparing file");

    try {
      const { data, sourceType, importKind, fileName } = item.kind === "loose-shapefile"
        ? await parseLooseShapefileGroup(item.group)
        : await parseSpatialFile(item.file);
      const displayName = fileName || item.label;
      const layerRecord = importKind === "geotiff"
        ? createGeoTiffLayerRecord(data, displayName, sourceType)
        : importKind === "csv-dataset"
          ? (data.previewMode === "full"
            ? createLayerRecord(buildCsvPreviewGeoJSON(data), displayName, sourceType)
            : createLargeCsvLayerRecord(data, displayName, sourceType))
          : createLayerRecord(data, displayName, sourceType);
      addLayerRecord(layerRecord);
      if (isRasterLayerRecord(layerRecord) && layerRecord.rasterKind === "geotiff") {
        updateStatus(`Loaded ${displayName} as a GeoTIFF raster (${layerRecord.rasterMetadata.width} x ${layerRecord.rasterMetadata.height}, ${layerRecord.rasterMetadata.bandCount} band(s)).`);
      } else if (isLargeCsvLayerRecord(layerRecord)) {
        updateStatus(`Loaded ${displayName} in large-file mode with ${formatCompactNumber(layerRecord.featureCount, 0)} points.`);
      } else {
        updateStatus(`Loaded ${displayName} as a ${sourceType} layer.`);
      }
    } catch (error) {
      console.error(error);
      updateStatus(`Could not load ${item.label}: ${error.message}`, true);
    } finally {
      clearImportProgress();
    }
  }

  fileInput.value = "";
}

function exportLayerById(layerId, format, requestedName) {
  const layerRecord = getLayerRecordById(layerId);
  if (!layerRecord) {
    updateStatus("Layer not found for export.", true);
    return false;
  }

  if (layerId === activeEditableLayerId) {
    syncActiveLayerGeoJSONFromMap();
  }

  const safeName = requestedName || layerRecord.name.replace(/\.[^.]+$/, "") || "edited-layer";
  const exported = exportGeoJSONContent(layerRecord, sanitizeGeoJSONForExport(layerRecord.geojson), safeName, format);
  if (exported && isLargeCsvLayerRecord(layerRecord)) {
    updateStatus(`${layerRecord.name} exported from its ${layerRecord.exportMode === "grid-preview" ? "aggregated grid preview" : "sample preview"}.`);
  }
  return exported;
}

function exportGeoJSONContent(layerRecord, geojson, requestedName, format) {
  if (format === "geojson") {
    downloadTextFile(
      `${requestedName}.geojson`,
      JSON.stringify(geojson, null, 2),
      "application/geo+json"
    );
    updateStatus(`${layerRecord.name} exported as GeoJSON.`);
    return true;
  }

  if (format === "kml") {
    downloadTextFile(
      `${requestedName}.kml`,
      tokml(geojson),
      "application/vnd.google-earth.kml+xml"
    );
    updateStatus(`${layerRecord.name} exported as KML.`);
    return true;
  }

  if (format === "shapefile") {
    shpwrite.download(geojson, {
      folder: requestedName,
      filename: requestedName,
      types: {
        point: requestedName,
        polygon: requestedName,
        line: requestedName,
      },
    });
    updateStatus(`${layerRecord.name} exported as a shapefile ZIP.`);
    return true;
  }

  updateStatus(`Unsupported export format: ${format}`, true);
  return false;
}

function openExportModal(layerId) {
  const layerRecord = getLayerRecordById(layerId);
  if (!layerRecord) {
    return;
  }

  exportTargetLayerId = layerId;
  exportLayerLabel.textContent = isLargeCsvLayerRecord(layerRecord)
    ? `Export the current ${layerRecord.exportMode === "grid-preview" ? "aggregated grid preview" : "sample preview"} of ${layerRecord.name}.`
    : `Export ${layerRecord.name} without changing the original file.`;
  exportFileNameInput.value = layerRecord.name.replace(/\.[^.]+$/, "") || "edited-layer";
  exportFormatSelect.value = "geojson";
  showModal(exportModal);
}

function closeExportModal() {
  hideModal(exportModal, () => {
    exportTargetLayerId = "";
  });
}

function openLayerModal() {
  showModal(layerModal);
}

function closeLayerModal() {
  hideModal(layerModal);
}

function openFieldModal() {
  if (!getActiveEditableLayer()) {
    updateStatus("Choose an editable layer before adding a field.", true);
    return;
  }

  showModal(fieldModal);
}

function closeFieldModal() {
  hideModal(fieldModal);
}

function applyAttributeTableVisibility() {
  workspacePanel?.classList.toggle("table-collapsed", !isAttributeTableVisible);
  tablePanel?.classList.toggle("is-collapsed", !isAttributeTableVisible);

  if (toggleAttributeTableBtn) {
    const label = isAttributeTableVisible ? "Hide attribute table" : "Show attribute table";
    toggleAttributeTableBtn.setAttribute("title", label);
    toggleAttributeTableBtn.setAttribute("aria-label", label);
    toggleAttributeTableBtn.setAttribute("aria-pressed", String(isAttributeTableVisible));
  }

  window.requestAnimationFrame(() => {
    map.invalidateSize();
  });
}

function toggleAttributeTableVisibility() {
  isAttributeTableVisible = !isAttributeTableVisible;
  applyAttributeTableVisibility();
}

function resizeTableDock(clientY) {
  const appShellRect = document.querySelector(".app-shell").getBoundingClientRect();
  const bottomPadding = 20;
  const computedHeight = appShellRect.bottom - clientY - bottomPadding;
  const clamped = Math.min(Math.max(computedHeight, 220), appShellRect.height - 220);
  document.documentElement.style.setProperty("--table-height", `${clamped}px`);
}

function confirmLayerExport() {
  if (!exportTargetLayerId) {
    updateStatus("Choose a layer to export first.", true);
    return;
  }

  const requestedName = exportFileNameInput.value.trim() || "edited-layer";
  const format = exportFormatSelect.value;
  if (exportLayerById(exportTargetLayerId, format, requestedName)) {
    closeExportModal();
  }
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
