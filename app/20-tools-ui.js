function cloneStyleConfig(styleConfig, fallbackColor = "#1db7a6") {
  return {
    mode: styleConfig?.mode || "single",
    field: styleConfig?.field || "",
    singleColor: styleConfig?.singleColor || fallbackColor,
    categorized: {
      valueColors: { ...(styleConfig?.categorized?.valueColors || {}) },
    },
    graduated: {
      ramp: styleConfig?.graduated?.ramp || "teal-blue",
      method: styleConfig?.graduated?.method || "equal",
      classCount: Number(styleConfig?.graduated?.classCount || 5),
    },
  };
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
  symbologyFieldSelect.innerHTML = fields.length
    ? fields.map((field) => `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`).join("")
    : '<option value="">No fields available</option>';
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

  categorizedValuesWrap.innerHTML = uniqueValues
    .map((value, index) => {
      const fallbackColor = palette[index % palette.length];
      const currentColor = styleConfig.categorized.valueColors[value] || fallbackColor;
      return `
        <div class="rule-card categorized-row">
          <div class="categorized-value-label">${escapeHtml(value)}</div>
          <input
            class="dark-input color-input categorized-color-input"
            type="color"
            data-category-value="${escapeHtml(value)}"
            value="${escapeHtml(currentColor)}"
          />
        </div>
      `;
    })
    .join("");

  categorizedValuesWrap.querySelectorAll(".categorized-color-input").forEach((input) => {
    input.addEventListener("input", () => {
      const activeLayer = getLayerRecordById(activeSymbologyLayerId);
      if (!activeLayer) {
        return;
      }

      activeLayer.styleConfig.categorized.valueColors[input.dataset.categoryValue] = input.value;
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

  singleStylePanel.hidden = styleConfig.mode !== "single";
  categorizedStylePanel.hidden = styleConfig.mode !== "categorized";
  graduatedStylePanel.hidden = styleConfig.mode !== "graduated";

  renderCategorizedValueInputs(layerRecord, styleConfig);
  renderGraduatedBreakPreview(layerRecord, styleConfig);
}

function openSymbologyModal(layerId) {
  const layerRecord = getLayerRecordById(layerId);
  if (!layerRecord) {
    return;
  }

  activeSymbologyLayerId = layerId;
  layerRecord.styleConfig = cloneStyleConfig(layerRecord.styleConfig, layerRecord.color);
  symbologyLayerLabel.textContent = `Configure how ${layerRecord.name} should be drawn on the map.`;
  ensureSymbologyFieldOptions(layerRecord);
  symbologyTypeSelect.value = layerRecord.styleConfig.mode;
  symbologyFieldSelect.value = layerRecord.styleConfig.field;
  singleStyleColorInput.value = layerRecord.styleConfig.singleColor || layerRecord.color;
  graduatedRampSelect.value = layerRecord.styleConfig.graduated.ramp;
  graduatedMethodSelect.value = layerRecord.styleConfig.graduated.method;
  graduatedClassCountSelect.value = String(layerRecord.styleConfig.graduated.classCount);
  renderSymbologyPanels(layerRecord);
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

  renderSymbologyPanels(layerRecord);
  rebuildLayerFromData(layerRecord);
}

function resetSymbology() {
  const layerRecord = getLayerRecordById(activeSymbologyLayerId);
  if (!layerRecord) {
    return;
  }

  layerRecord.styleConfig = createDefaultStyleConfig(layerRecord.color);
  symbologyTypeSelect.value = layerRecord.styleConfig.mode;
  symbologyFieldSelect.value = "";
  singleStyleColorInput.value = layerRecord.styleConfig.singleColor;
  graduatedRampSelect.value = layerRecord.styleConfig.graduated.ramp;
  graduatedMethodSelect.value = layerRecord.styleConfig.graduated.method;
  graduatedClassCountSelect.value = String(layerRecord.styleConfig.graduated.classCount);
  renderSymbologyPanels(layerRecord);
  rebuildLayerFromData(layerRecord);
  updateStatus(`Symbology reset for ${layerRecord.name}.`);
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
    const gridPlan = planInterpolationGrid(projectedSamples, config);
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
  const activeLayer = getActiveEditableLayer();
  activeEditLayerName.textContent = activeLayer
    ? `${activeLayer.name} is ready for drawing and node editing.`
    : "Use the edit toggle in the Layers panel to choose which layer is editable.";
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
  renderAttributeTable();
  renderLayerList();
  syncEditableWorkspace();

  if (layerId) {
    updateStatus("Editable layer changed. Use the draw toolbar to add or edit features.");
  }
}

function getActiveEditableLayer() {
  return loadedLayers.find((layerRecord) => layerRecord.id === activeEditableLayerId && isVectorLayerRecord(layerRecord)) || null;
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
      const featureColor = getFeatureColor(activeLayer, feature);
      const layers = L.geoJSON(feature, {
        style: () => createFeatureStyle(activeLayer, feature),
        pointToLayer: (currentFeature, latlng) =>
          L.marker(latlng, { icon: createMarkerIcon(featureColor) }),
      }).getLayers();

      layers.forEach((layer) => {
        bindFeatureBehavior(activeLayer, layer, feature, drawWorkspace);
      });
    });
  }

  ensureVisibleLayersOnMap();
}

function selectFeature(layerId, layer) {
  if (layerId !== activeEditableLayerId) {
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

function renderAttributeTable() {
  const activeLayer = getActiveEditableLayer();

  if (!activeLayer) {
    attributeTableInfo.textContent =
      "Put a layer in edit mode to view and edit its attribute table.";
    attributeTableWrap.className = "table-wrap empty-table";
    attributeTableWrap.innerHTML =
      '<div class="table-placeholder">No editable layer selected.</div>';
    return;
  }

  const features = activeLayer.geojson.features;
  const fields = getLayerFieldNames(activeLayer);
  attributeTableInfo.textContent = `${activeLayer.name} is open in edit mode. Table edits update the layer immediately.`;

  if (isLargeCsvLayerRecord(activeLayer)) {
    attributeTableInfo.textContent = `${activeLayer.name} is in large-file mode. Use preview, heatmap, interpolation, and export tools instead of direct table editing.`;
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
        selectedFeatureContext?.layerId === activeLayer.id &&
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
          </td>
        </tr>
      `;
    })
    .join("");

  attributeTableWrap.className = "table-wrap";
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
    input.addEventListener("change", (event) => {
      const { featureId, field } = event.target.dataset;
      updateAttributeTableCell(featureId, field, event.target.value);
    });
  });

  attributeTableWrap.querySelectorAll("[data-zoom-feature-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      zoomToFeature(event.target.dataset.zoomFeatureId);
    });
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
        `<button class="calculator-chip" type="button" data-insert="[${escapeHtml(field)}]" title="${escapeHtml(field)}">${escapeHtml(field)}</button>`
    )
    .join("");

  calculatorFieldList.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => insertCalculatorText(button.dataset.insert));
  });
}

function renderCalculatorVariableList() {
  const variables = getCalculatorVariableCatalog();
  if (!variables.length) {
    calculatorVariableList.innerHTML = '<div class="calculator-empty">No variables available.</div>';
    return;
  }

  calculatorVariableList.innerHTML = variables
    .map(
      (item) => `
        <button
          class="calculator-chip"
          type="button"
          data-insert="${escapeHtml(item.insert)}"
        >
          ${escapeHtml(item.label)}
        </button>
      `
    )
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
        if (!query) {
          return true;
        }
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
                >
                  ${escapeHtml(item.label)}
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

function insertCalculatorText(text) {
  const start = calculatorExpression.selectionStart ?? calculatorExpression.value.length;
  const end = calculatorExpression.selectionEnd ?? calculatorExpression.value.length;
  const current = calculatorExpression.value;
  calculatorExpression.value = `${current.slice(0, start)}${text}${current.slice(end)}`;
  calculatorExpression.focus();
  const cursor = start + text.length;
  calculatorExpression.setSelectionRange(cursor, cursor);
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
    try {
      return {
        result: evaluateLegacyCalculatorExpression(feature, expression),
        engine: "legacy",
      };
    } catch (legacyError) {
      throw new Error(getFriendlyCalculatorError(expression, error?.details ? error : legacyError));
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
    calculatorPreviewText.textContent =
      `Preview result (${previewTarget.label}, ${evaluation.engine === "qgis" ? "new engine" : "legacy fallback"}): ${formatCalculatorPreviewValue(evaluation.result)}`;
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
  const activeLayer = getActiveEditableLayer();
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

function createEmptyLayer(name) {
  const layerName = name || `New Layer ${loadedLayers.length + 1}`;
  const layerRecord = createLayerRecord(
    {
      type: "FeatureCollection",
      features: [],
    },
    `${layerName}.geojson`,
    "Created Layer"
  );

  addLayerRecord(layerRecord);
  setActiveEditableLayer(layerRecord.id);
  updateStatus(`${layerRecord.name} created and set to edit mode.`);
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

  for (const file of fileList) {
    updateStatus(`Loading ${file.name}...`);
    updateImportProgress(`Loading ${file.name}`, 4, "Preparing file");

    try {
      const { data, sourceType, importKind } = await parseSpatialFile(file);
      const layerRecord = importKind === "csv-dataset"
        ? (data.previewMode === "full"
          ? createLayerRecord(buildCsvPreviewGeoJSON(data), file.name, sourceType)
          : createLargeCsvLayerRecord(data, file.name, sourceType))
        : createLayerRecord(data, file.name, sourceType);
      addLayerRecord(layerRecord);
      if (isLargeCsvLayerRecord(layerRecord)) {
        updateStatus(`Loaded ${file.name} in large-file mode with ${formatCompactNumber(layerRecord.featureCount, 0)} points.`);
      } else {
        updateStatus(`Loaded ${file.name} as a ${sourceType} layer.`);
      }
    } catch (error) {
      console.error(error);
      updateStatus(`Could not load ${file.name}: ${error.message}`, true);
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

