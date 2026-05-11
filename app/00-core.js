const map = L.map("map", {
  zoomControl: true,
}).setView([20, 0], 2);

const basemapLayers = {
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }),
  light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }),
  satellite: L.tileLayer("https://mt1.google.com/vt/lyrs=y&z={z}&x={x}&y={y}", {
    maxZoom: 20,
    attribution: "&copy; Google",
  }),
};

let activeBasemap = "dark";
basemapLayers.dark.addTo(map);

const palette = [
  "#1db7a6",
  "#4f8cff",
  "#ffb454",
  "#ff6b8b",
  "#b388ff",
  "#57d163",
  "#ff8a4c",
  "#43c2ff",
];

const fileInput = document.getElementById("file-input");
const layerList = document.getElementById("layer-list");
const emptyState = document.getElementById("empty-state");
const clearAllBtn = document.getElementById("clear-all-btn");
const openLayerModalBtn = document.getElementById("open-layer-modal-btn");
const statusMessage = document.getElementById("status-message");
const basemapLabel = document.getElementById("basemap-label");
const activeEditLayerName = document.getElementById("active-edit-layer-name");
const attributeTableInfo = document.getElementById("attribute-table-info");
const attributeTableWrap = document.getElementById("attribute-table-wrap");
const tableLayerLabel = document.getElementById("table-layer-label");
const tableEditStatusBtn = document.getElementById("table-edit-status-btn");
const tableUndoBtn = document.getElementById("table-undo-btn");
const tableRedoBtn = document.getElementById("table-redo-btn");
const newLayerNameInput = document.getElementById("new-layer-name");
const newLayerGeometryTypeSelect = document.getElementById("new-layer-geometry-type");
const createLayerBtn = document.getElementById("create-layer-btn");
const browseLayerBtn = document.getElementById("browse-layer-btn");
const addFieldNameInput = document.getElementById("add-field-name");
const addFieldValueInput = document.getElementById("add-field-value");
const addFieldBtn = document.getElementById("add-field-btn");
const openFieldModalBtn = document.getElementById("open-field-modal-btn");
const openCalculatorModalBtn = document.getElementById("open-calculator-modal-btn");
const exportModal = document.getElementById("export-modal");
const closeExportModalBtn = document.getElementById("close-export-modal-btn");
const exportLayerLabel = document.getElementById("export-layer-label");
const exportFileNameInput = document.getElementById("export-file-name");
const exportFormatSelect = document.getElementById("export-format");
const confirmExportBtn = document.getElementById("confirm-export-btn");
const layerModal = document.getElementById("layer-modal");
const closeLayerModalBtn = document.getElementById("close-layer-modal-btn");
const fieldModal = document.getElementById("field-modal");
const closeFieldModalBtn = document.getElementById("close-field-modal-btn");
const calculatorModal = document.getElementById("calculator-modal");
const closeCalculatorModalBtn = document.getElementById("close-calculator-modal-btn");
const calculatorFieldSearch = document.getElementById("calculator-field-search");
const calculatorFieldList = document.getElementById("calculator-field-list");
const calculatorVariableList = document.getElementById("calculator-variable-list");
const calculatorFunctionSearch = document.getElementById("calculator-function-search");
const calculatorFunctionList = document.getElementById("calculator-function-list");
const calculatorExpression = document.getElementById("calculator-expression");
const calculatorPreviewFeature = document.getElementById("calculator-preview-feature");
const calculatorPreviewText = document.getElementById("calculator-preview-text");
const calculatorPreviewDetails = document.getElementById("calculator-preview-details");
const calculatorError = document.getElementById("calculator-error");
const calculatorTargetWrap = document.getElementById("calculator-target-wrap");
const calculatorNewFieldName = document.getElementById("calculator-new-field-name");
const calculatorNewFieldStack = document.getElementById("calculator-new-field-stack");
const calculatorExistingField = document.getElementById("calculator-existing-field");
const calculatorExistingFieldStack = document.getElementById("calculator-existing-field-stack");
const calculatorSavedExpressions = document.getElementById("calculator-saved-expressions");
const calculatorSaveExpressionBtn = document.getElementById("calculator-save-expression-btn");
const calculatorLoadExpressionBtn = document.getElementById("calculator-load-expression-btn");
const calculatorDeleteExpressionBtn = document.getElementById("calculator-delete-expression-btn");
const calculatorExportExpressionsBtn = document.getElementById("calculator-export-expressions-btn");
const calculatorImportExpressionsBtn = document.getElementById("calculator-import-expressions-btn");
const calculatorImportFile = document.getElementById("calculator-import-file");
const calculatorPreviewBtn = document.getElementById("calculator-preview-btn");
const calculatorApplyBtn = document.getElementById("calculator-apply-btn");
const calculatorModeInputs = document.querySelectorAll('input[name="calculator-mode"]');
const tableResizer = document.getElementById("table-resizer");
const toggleAttributeTableBtn = document.getElementById("toggle-attribute-table-btn");
const globalDropOverlay = document.getElementById("global-drop-overlay");
const workspacePanel = document.querySelector(".workspace-panel");
const tablePanel = document.querySelector(".table-panel");
const importProgressCard = document.getElementById("import-progress-card");
const importProgressTitle = document.getElementById("import-progress-title");
const importProgressMeta = document.getElementById("import-progress-meta");
const importProgressFill = document.getElementById("import-progress-fill");
const symbologyModal = document.getElementById("symbology-modal");
const closeSymbologyModalBtn = document.getElementById("close-symbology-modal-btn");
const symbologyLayerLabel = document.getElementById("symbology-layer-label");
const symbologyStylingTab = document.getElementById("symbology-styling-tab");
const symbologyLabelingTab = document.getElementById("symbology-labeling-tab");
const symbologyStylingPanel = document.getElementById("symbology-styling-panel");
const symbologyLabelingPanel = document.getElementById("symbology-labeling-panel");
const symbologyTypeSelect = document.getElementById("symbology-type");
const symbologyFieldSelect = document.getElementById("symbology-field");
const symbologyFieldStack = document.getElementById("symbology-field-stack");
const singleStylePanel = document.getElementById("single-style-panel");
const singleStyleColorInput = document.getElementById("single-style-color");
const pointStylePanel = document.getElementById("point-style-panel");
const lineStylePanel = document.getElementById("line-style-panel");
const polygonStylePanel = document.getElementById("polygon-style-panel");
const categorizedStylePanel = document.getElementById("categorized-style-panel");
const categorizedValuesWrap = document.getElementById("categorized-values-wrap");
const graduatedStylePanel = document.getElementById("graduated-style-panel");
const graduatedRampSelect = document.getElementById("graduated-ramp");
const graduatedMethodSelect = document.getElementById("graduated-method");
const graduatedClassCountSelect = document.getElementById("graduated-class-count");
const graduatedBreaksWrap = document.getElementById("graduated-breaks-wrap");
const pointSymbolShapeSelect = document.getElementById("point-symbol-shape");
const pointSymbolSizeInput = document.getElementById("point-symbol-size");
const pointFillColorInput = document.getElementById("point-fill-color");
const pointStrokeColorInput = document.getElementById("point-stroke-color");
const pointStrokeWidthInput = document.getElementById("point-stroke-width");
const pointOpacityInput = document.getElementById("point-opacity");
const pointIconUrlInput = document.getElementById("point-icon-url");
const lineColorInput = document.getElementById("line-color");
const lineWidthInput = document.getElementById("line-width");
const lineOpacityInput = document.getElementById("line-opacity");
const lineDashStyleSelect = document.getElementById("line-dash-style");
const lineDashPatternInput = document.getElementById("line-dash-pattern");
const lineCapSelect = document.getElementById("line-cap");
const lineJoinSelect = document.getElementById("line-join");
const polygonFillColorInput = document.getElementById("polygon-fill-color");
const polygonFillOpacityInput = document.getElementById("polygon-fill-opacity");
const polygonStrokeColorInput = document.getElementById("polygon-stroke-color");
const polygonStrokeWidthInput = document.getElementById("polygon-stroke-width");
const polygonStrokeOpacityInput = document.getElementById("polygon-stroke-opacity");
const polygonStrokeStyleSelect = document.getElementById("polygon-stroke-style");
const polygonOutlineOnlyInput = document.getElementById("polygon-outline-only");
const ruleStylePanel = document.getElementById("rule-style-panel");
const ruleStyleFieldSelect = document.getElementById("rule-style-field");
const ruleStyleOperatorSelect = document.getElementById("rule-style-operator");
const ruleStyleValueInput = document.getElementById("rule-style-value");
const ruleStyleColorInput = document.getElementById("rule-style-color");
const labelEnabledInput = document.getElementById("label-enabled");
const labelOptionsWrap = document.getElementById("label-options-wrap");
const labelFieldSelect = document.getElementById("label-field");
const labelExpressionInput = document.getElementById("label-expression");
const labelFontFamilySelect = document.getElementById("label-font-family");
const labelFontSizeInput = document.getElementById("label-font-size");
const labelColorInput = document.getElementById("label-color");
const labelOpacityInput = document.getElementById("label-opacity");
const labelHaloColorInput = document.getElementById("label-halo-color");
const labelHaloSizeInput = document.getElementById("label-halo-size");
const labelBackgroundColorInput = document.getElementById("label-background-color");
const labelBorderColorInput = document.getElementById("label-border-color");
const labelBorderRadiusInput = document.getElementById("label-border-radius");
const labelPlacementSelect = document.getElementById("label-placement");
const labelLinePlacementSelect = document.getElementById("label-line-placement");
const labelPolygonPlacementSelect = document.getElementById("label-polygon-placement");
const labelOffsetXInput = document.getElementById("label-offset-x");
const labelOffsetYInput = document.getElementById("label-offset-y");
const labelRotationInput = document.getElementById("label-rotation");
const labelMinZoomInput = document.getElementById("label-min-zoom");
const labelMaxZoomInput = document.getElementById("label-max-zoom");
const labelPriorityInput = document.getElementById("label-priority");
const labelBoldInput = document.getElementById("label-bold");
const labelItalicInput = document.getElementById("label-italic");
const labelUnderlineInput = document.getElementById("label-underline");
const labelShadowInput = document.getElementById("label-shadow");
const labelAvoidOverlapInput = document.getElementById("label-avoid-overlap");
const applySymbologyBtn = document.getElementById("apply-symbology-btn");
const resetSymbologyBtn = document.getElementById("reset-symbology-btn");
const interpolationModal = document.getElementById("interpolation-modal");
const closeInterpolationModalBtn = document.getElementById("close-interpolation-modal-btn");
const interpolationLayerLabel = document.getElementById("interpolation-layer-label");
const interpolationFieldSelect = document.getElementById("interpolation-field");
const interpolationMethodSelect = document.getElementById("interpolation-method");
const interpolationScopeSelect = document.getElementById("interpolation-scope");
const interpolationClipModeSelect = document.getElementById("interpolation-clip-mode");
const interpolationRadiusInput = document.getElementById("interpolation-radius");
const interpolationCellSizeInput = document.getElementById("interpolation-cell-size");
const interpolationPowerInput = document.getElementById("interpolation-power");
const interpolationOpacityInput = document.getElementById("interpolation-opacity");
const interpolationMinSamplesInput = document.getElementById("interpolation-min-samples");
const interpolationRampSelect = document.getElementById("interpolation-ramp");
const interpolationSummary = document.getElementById("interpolation-summary");
const applyInterpolationBtn = document.getElementById("apply-interpolation-btn");
const clearInterpolationBtn = document.getElementById("clear-interpolation-btn");
const rasterStyleModal = document.getElementById("raster-style-modal");
const closeRasterStyleModalBtn = document.getElementById("close-raster-style-modal-btn");
const rasterStyleLayerLabel = document.getElementById("raster-style-layer-label");
const rasterRenderModeSelect = document.getElementById("raster-render-mode");
const rasterBandSelect = document.getElementById("raster-band");
const rasterRampSelect = document.getElementById("raster-ramp");
const rasterClassificationSelect = document.getElementById("raster-classification");
const rasterClassCountSelect = document.getElementById("raster-class-count");
const rasterMinInput = document.getElementById("raster-min");
const rasterMaxInput = document.getElementById("raster-max");
const rasterNoDataInput = document.getElementById("raster-nodata");
const rasterBrightnessInput = document.getElementById("raster-brightness");
const rasterContrastInput = document.getElementById("raster-contrast");
const rasterOpacityInput = document.getElementById("raster-opacity");
const rasterStylePreview = document.getElementById("raster-style-preview");
const rasterMetadataList = document.getElementById("raster-metadata-list");
const rasterResetStyleBtn = document.getElementById("raster-reset-style-btn");
const rasterApplyStyleBtn = document.getElementById("raster-apply-style-btn");
const heatmapModal = document.getElementById("heatmap-modal");
const closeHeatmapModalBtn = document.getElementById("close-heatmap-modal-btn");
const heatmapLayerLabel = document.getElementById("heatmap-layer-label");
const heatmapFieldSelect = document.getElementById("heatmap-field");
const heatmapScopeSelect = document.getElementById("heatmap-scope");
const heatmapClipModeSelect = document.getElementById("heatmap-clip-mode");
const heatmapRadiusInput = document.getElementById("heatmap-radius");
const heatmapCellSizeInput = document.getElementById("heatmap-cell-size");
const heatmapOpacityInput = document.getElementById("heatmap-opacity");
const heatmapMinSamplesInput = document.getElementById("heatmap-min-samples");
const heatmapIntensityInput = document.getElementById("heatmap-intensity");
const heatmapRampSelect = document.getElementById("heatmap-ramp");
const heatmapSummary = document.getElementById("heatmap-summary");
const applyHeatmapBtn = document.getElementById("apply-heatmap-btn");
const clearHeatmapBtn = document.getElementById("clear-heatmap-btn");
const filterModal = document.getElementById("filter-modal");
const closeFilterModalBtn = document.getElementById("close-filter-modal-btn");
const filterLayerLabel = document.getElementById("filter-layer-label");
const filterLogicSelect = document.getElementById("filter-logic");
const filterRulesWrap = document.getElementById("filter-rules-wrap");
const addFilterRuleBtn = document.getElementById("add-filter-rule-btn");
const clearFilterBtn = document.getElementById("clear-filter-btn");
const applyFilterBtn = document.getElementById("apply-filter-btn");
const openHelpModalBtn = document.getElementById("open-help-modal-btn");
const helpModal = document.getElementById("help-modal");
const closeHelpModalBtn = document.getElementById("close-help-modal-btn");
const themeCycleBtn = document.getElementById("theme-cycle-btn");
const brandLogoShell = document.getElementById("brand-logo-shell");

const loadedLayers = [];
let layerCount = 0;
let activeEditableLayerId = "";
let selectedTableLayerId = "";
let selectedFeatureContext = null;
let exportTargetLayerId = "";
let dragDepth = 0;
let isDraggingLayer = false; // true while a layer card reorder drag is active
let isResizingTable = false;
let activeSymbologyLayerId = "";
let activeInterpolationLayerId = "";
let activeHeatmapLayerId = "";
let activeFilterLayerId = "";
let activeRasterStyleLayerId = "";
let isDropOverlayVisible = false;
let isAttributeTableVisible = true;

const animatedLayerIds = new Set();
let pendingEditToggleAnimations = [];

const THEME_STORAGE_KEY = "geodataviewer-theme-preference";
const CALCULATOR_SAVED_EXPRESSIONS_KEY = "spatial-decm-saved-calculator-expressions";
const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
const canAnimate = typeof anime === "function";

const colorRamps = {
  "teal-blue": ["#1db7a6", "#43c2ff"],
  "gold-red": ["#ffcc66", "#ff6b6b"],
  "mint-purple": ["#71d9b6", "#9a6bff"],
};

const interpolationColorRamps = {
  "terrain-glow": ["#123b7a", "#1db7a6", "#d7d56f", "#ff7c43"],
  "viridis-edge": ["#46327e", "#365c8d", "#277f8e", "#4ac16d", "#fde725"],
  "sunset-heat": ["#2d1248", "#7c1d6f", "#d14c65", "#f28f3b", "#ffe082"],
  "ice-fire": ["#113a6b", "#2bc0c7", "#f1f5f9", "#ff8a5b", "#7b1e3f"],
  gray: ["#000000", "#ffffff"],
};

const INTERPOLATION_MAX_GRID_DIMENSION = 260;
const CSV_FULL_VECTOR_THRESHOLD = 50000;
const CSV_SAMPLE_MODE_THRESHOLD = 250000;
const CSV_ANALYSIS_SAMPLE_LIMIT = 50000;
const CSV_PREVIEW_SAMPLE_LIMIT = 20000;
const CSV_GRID_TILE_ZOOM = 8;
const CSV_CHUNK_SIZE_BYTES = 1024 * 1024 * 2;
const VECTOR_EDIT_FEATURE_LIMIT = 5000;
const VECTOR_GEOMETRY_KINDS = ["point", "line", "polygon"];

math.import(
  {
    concat: (...values) => values.map((value) => (value ?? "")).join(""),
    upper: (value) => String(value ?? "").toUpperCase(),
    lower: (value) => String(value ?? "").toLowerCase(),
    length: (value) => String(value ?? "").length,
    replace: (text, find, replacement) =>
      String(text ?? "").split(String(find ?? "")).join(String(replacement ?? "")),
    if: (condition, whenTrue, whenFalse) => (condition ? whenTrue : whenFalse),
  },
  { override: true }
);

const drawWorkspace = new L.FeatureGroup().addTo(map);

function getGeometryKindFromType(type) {
  if (typeof type !== "string") {
    return "unknown";
  }
  if (type.includes("Point")) return "point";
  if (type.includes("LineString")) return "line";
  if (type.includes("Polygon")) return "polygon";
  return "unknown";
}

function collectGeometryKindsFromGeometry(geometry, kinds = new Set()) {
  if (!geometry) {
    return kinds;
  }

  if (geometry.type === "GeometryCollection") {
    (geometry.geometries || []).forEach((item) => collectGeometryKindsFromGeometry(item, kinds));
    return kinds;
  }

  const kind = getGeometryKindFromType(geometry.type);
  if (VECTOR_GEOMETRY_KINDS.includes(kind)) {
    kinds.add(kind);
  }
  return kinds;
}

function inferVectorGeometryKind(geojson) {
  const kinds = new Set();
  (geojson?.features || []).forEach((feature) => {
    collectGeometryKindsFromGeometry(feature.geometry, kinds);
  });

  if (kinds.size === 1) {
    return Array.from(kinds)[0];
  }
  if (kinds.size > 1) {
    return "mixed";
  }
  return "unknown";
}

function normalizeVectorGeometryKind(kind, fallback = "unknown") {
  return VECTOR_GEOMETRY_KINDS.includes(kind) || kind === "mixed" || kind === "unknown"
    ? kind
    : fallback;
}

function getLayerGeometryKind(layerRecord) {
  if (!layerRecord || layerRecord.kind !== "vector") {
    return "unknown";
  }

  const storedKind = normalizeVectorGeometryKind(layerRecord.geometryKind, "");
  if (storedKind && storedKind !== "unknown") {
    return storedKind;
  }
  return inferVectorGeometryKind(layerRecord.geojson);
}

function getGeometryKindLabel(kind) {
  if (kind === "point") return "Point";
  if (kind === "line") return "Line";
  if (kind === "polygon") return "Polygon";
  if (kind === "mixed") return "Mixed geometry";
  return "Unknown geometry";
}

function isFeatureAllowedForLayer(layerRecord, feature) {
  const layerKind = getLayerGeometryKind(layerRecord);
  if (layerKind === "mixed" || layerKind === "unknown") {
    return true;
  }
  return getGeometryKindFromType(feature?.geometry?.type) === layerKind;
}

function createDrawControlForGeometry(layerRecord = null) {
  const kind = getLayerGeometryKind(layerRecord);
  const allowPoint = kind === "point" || kind === "mixed" || kind === "unknown";
  const allowLine = kind === "line" || kind === "mixed" || kind === "unknown";
  const allowPolygon = kind === "polygon" || kind === "mixed" || kind === "unknown";

  return new L.Control.Draw({
    edit: {
      featureGroup: drawWorkspace,
      remove: true,
    },
    draw: {
      polyline: allowLine
        ? {
            shapeOptions: {
              color: "#43c2ff",
              weight: 3,
            },
          }
        : false,
      polygon: allowPolygon
        ? {
            allowIntersection: false,
            showArea: true,
            shapeOptions: {
              color: "#1db7a6",
              weight: 3,
              fillColor: "#1db7a6",
              fillOpacity: 0.24,
            },
          }
        : false,
      rectangle: allowPolygon
        ? {
            shapeOptions: {
              color: "#ffb454",
              weight: 3,
              fillColor: "#ffb454",
              fillOpacity: 0.18,
            },
          }
        : false,
      circle: false,
      circlemarker: false,
      marker: allowPoint,
    },
  });
}

let drawControl = null;

// Draw toolbar is created on demand — only added to the map when a layer
// enters edit mode, so it never shows while no layer is being edited.

const interpolationLegendControl = L.control({ position: "bottomright" });

interpolationLegendControl.onAdd = () => {
  const container = L.DomUtil.create("div", "map-legend");
  container.hidden = true;
  L.DomEvent.disableClickPropagation(container);
  return container;
};

interpolationLegendControl.addTo(map);

const defaultStyle = (color) => ({
  color,
  weight: 3,
  opacity: 0.92,
  fillColor: color,
  fillOpacity: 0.22,
});

const EARTH_RADIUS_METERS = 6378137;

function createDefaultStyleConfig(color) {
  return VectorStyleManager.createDefaultStyleConfig(color);
}

function createDefaultLabelConfig() {
  return VectorStyleManager.createDefaultLabelConfig();
}

function createDefaultFilterConfig() {
  return {
    logic: "and",
    rules: [],
  };
}

function createDefaultInterpolationConfig() {
  return {
    field: "",
    method: "idw",
    sampleScope: "filtered",
    clipMode: "hull",
    radiusMeters: 2000,
    cellSizeMeters: 250,
    power: 2,
    opacity: 0.65,
    minSamples: 2,
    ramp: "terrain-glow",
  };
}

function createDefaultHeatmapConfig() {
  return {
    field: "__count__",
    sampleScope: "filtered",
    clipMode: "hull",
    radiusMeters: 1500,
    cellSizeMeters: 200,
    opacity: 0.75,
    minSamples: 1,
    intensity: 1.2,
    ramp: "sunset-heat",
  };
}

function createDefaultRasterStyleConfig(stats = {}) {
  const min = Number.isFinite(stats.min) ? stats.min : 0;
  const max = Number.isFinite(stats.max) && stats.max !== min ? stats.max : min + 1;
  return {
    mode: "gray",
    band: 1,
    ramp: "terrain-glow",
    classification: "continuous",
    classCount: 5,
    min,
    max,
    noData: stats.noData ?? null,
    brightness: 0,
    contrast: 0,
    opacity: 0.85,
    quantileBreaks: [],
  };
}

function isLargeCsvLayerRecord(layerRecord) {
  return Boolean(layerRecord?.largeCsvMode);
}

function isEditableLayerRecord(layerRecord) {
  const featureCount = layerRecord?.geojson?.features?.length || layerRecord?.featureCount || 0;
  return isVectorLayerRecord(layerRecord) && !isLargeCsvLayerRecord(layerRecord) && featureCount <= VECTOR_EDIT_FEATURE_LIMIT;
}

function getStoredThemePreference() {
  const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedPreference === "dark" || storedPreference === "light" || storedPreference === "system") {
    return storedPreference;
  }

  return "system";
}

function getResolvedTheme(themePreference) {
  if (themePreference === "dark" || themePreference === "light") {
    return themePreference;
  }

  return systemThemeMedia.matches ? "dark" : "light";
}

function applyAppBasemap(themeName) {
  if (activeBasemap === themeName) {
    return;
  }

  map.removeLayer(basemapLayers[activeBasemap]);
  basemapLayers[themeName].addTo(map);
  activeBasemap = themeName;
  if (basemapLabel) {
    basemapLabel.textContent = getBasemapLabel();
  }
}

const basemapList = ["dark", "light", "satellite"];

function cycleBasemap() {
  const idx = basemapList.indexOf(activeBasemap);
  const nextIdx = (idx + 1) % basemapList.length;
  const nextBasemap = basemapList[nextIdx];
  map.removeLayer(basemapLayers[activeBasemap]);
  basemapLayers[nextBasemap].addTo(map);
  activeBasemap = nextBasemap;
  if (basemapLabel) {
    basemapLabel.textContent = getBasemapLabel();
  }
}

function getBasemapLabel() {
  if (activeBasemap === "satellite") {
    return "Google Satellite";
  }
  if (activeBasemap === "dark") {
    return "CartoDB Dark";
  }
  if (activeBasemap === "light") {
    return "CartoDB Light";
  }
  return "Satellite";
}

function applyTheme(themePreference) {
  const resolvedTheme = getResolvedTheme(themePreference);
  document.documentElement.dataset.theme = resolvedTheme;
  applyAppBasemap(resolvedTheme);
  themeCycleBtn.textContent = `${themePreference.charAt(0).toUpperCase()}${themePreference.slice(1)}`;
}

function initializeTheme() {
  applyTheme(getStoredThemePreference());
}

function getNextThemePreference(currentTheme) {
  if (currentTheme === "dark") {
    return "light";
  }

  if (currentTheme === "light") {
    return "system";
  }

  return "dark";
}

function animateLayerEntries(elements) {
  if (!elements.length) {
    return;
  }

  if (!canAnimate) {
    elements.forEach((element) => {
      element.style.opacity = "1";
      element.style.transform = "none";
    });
    return;
  }

  anime.remove(elements);
  anime({
    targets: elements,
    opacity: [0, 1],
    translateY: [18, 0],
    scale: [0.97, 1],
    delay: anime.stagger(70),
    duration: 520,
    easing: "easeOutExpo",
  });
}

function queueEditToggleAnimation(layerId, mode) {
  if (!layerId || !mode) {
    return;
  }

  pendingEditToggleAnimations = pendingEditToggleAnimations.filter((item) => item.layerId !== layerId);
  pendingEditToggleAnimations.push({ layerId, mode });
}

function runPendingEditToggleAnimations() {
  if (!pendingEditToggleAnimations.length) {
    return;
  }

  const animations = [...pendingEditToggleAnimations];
  pendingEditToggleAnimations = [];

  animations.forEach(({ layerId, mode }) => {
    const button = layerList.querySelector(`[data-edit-toggle-id="${layerId}"]`);
    const dot = button?.querySelector(".edit-mode-dot");
    if (!button || !dot || !canAnimate) {
      return;
    }

    anime.remove([button, dot]);

    if (mode === "on") {
      anime({
        targets: button,
        scale: [1, 1.16, 1.04],
        duration: 420,
        easing: "easeOutBack",
      });
      anime({
        targets: dot,
        scale: [1, 1.38, 1],
        duration: 440,
        easing: "easeOutExpo",
      });
      return;
    }

    anime({
      targets: button,
      scale: [1.04, 0.94, 1],
      duration: 300,
      easing: "easeOutCubic",
    });
    anime({
      targets: dot,
      scale: [1, 0.72, 1],
      duration: 300,
      easing: "easeOutCubic",
    });
  });
}

const INLINE_BRAND_LOGO = `
<svg
  viewBox="0 0 168.08105 17.656544"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label="Spatial-D.E.C.M logo">
  <g transform="translate(-345.00288,-151.11921)">
    <path
      fill="currentColor"
      transform="matrix(0.26458333,0,0,0.26458333,304.14216,74.533795)"
      d="m 163.70088,340.85676 q -2.53333,0 -4.66667,-1.26667 -2.06666,-1.26666 -3.33333,-3.33333 -1.26667,-2.13334 -1.26667,-4.66667 v -3.66667 h 8.80001 v 3.26667 q 0,0.33333 0.2,0.6 0.26666,0.2 0.6,0.2 h 28.73334 q 0.33334,0 0.53334,-0.2 0.26666,-0.26667 0.26666,-0.6 v -9.13334 q 0,-0.33333 -0.26666,-0.53333 -0.2,-0.2 -0.53334,-0.2 h -29.06668 q -2.53333,0 -4.66667,-1.26667 -2.06666,-1.26667 -3.33333,-3.33333 -1.26667,-2.13334 -1.26667,-4.73334 v -9.86667 q 0,-2.53334 1.26667,-4.6 1.26667,-2.13334 3.33333,-3.40001 2.13334,-1.26666 4.66667,-1.26666 h 29.46668 q 2.53334,0 4.60001,1.26666 2.13333,1.26667 3.4,3.40001 1.26667,2.06666 1.26667,4.6 v 3.66667 h -8.86668 v -3.26667 q 0,-0.33334 -0.26666,-0.53334 -0.2,-0.26666 -0.53334,-0.26666 h -28.73334 q -0.33334,0 -0.6,0.26666 -0.2,0.2 -0.2,0.53334 v 9.13334 q 0,0.33333 0.2,0.53333 0.26666,0.2 0.6,0.2 h 29.13334 q 2.53334,0 4.60001,1.26667 2.13333,1.26666 3.4,3.4 1.26667,2.06667 1.26667,4.66667 v 9.86667 q 0,2.53333 -1.26667,4.66667 -1.26667,2.06667 -3.4,3.33333 -2.06667,1.26667 -4.60001,1.26667 z m 51.86671,15.33334 v 0 -54.00003 h 30.06668 q 2.53334,0 4.6,1.26667 2.13334,1.26667 3.33334,3.33334 1.26667,2.06666 1.26667,4.6 v 20.26668 q 0,2.53333 -1.26667,4.6 -1.2,2.06667 -3.33334,3.33333 -2.06666,1.26667 -4.6,1.26667 h -21.33334 v 15.33334 z m 9.53334,-24.06668 h 20.20001 q 0.33333,0 0.53333,-0.2 0.26667,-0.26666 0.26667,-0.6 v -19.60001 q 0,-0.33333 -0.26667,-0.53333 -0.2,-0.26667 -0.53333,-0.26667 h -20.20001 q -0.33334,0 -0.6,0.26667 -0.2,0.2 -0.2,0.53333 v 19.60001 q 0,0.33334 0.2,0.6 0.26666,0.2 0.6,0.2 z m 49.79999,8.73334 q -2.53333,0 -4.66667,-1.26667 -2.06666,-1.26666 -3.33333,-3.33333 -1.2,-2.06667 -1.2,-4.6 v -14.53334 h 30.53335 v -5.40001 q 0,-0.33333 -0.26667,-0.53333 -0.2,-0.26667 -0.53333,-0.26667 h -29.73335 v -8.73334 h 30.06668 q 2.53334,0 4.6,1.26667 2.13334,1.26667 3.33334,3.33334 1.26667,2.06666 1.26667,4.6 v 29.46668 z m 0.33334,-8.73334 h 21.00001 v -7.13333 h -21.80001 v 6.33333 q 0,0.33334 0.2,0.6 0.26666,0.2 0.6,0.2 z m 52.00004,8.73334 q -2.53334,0 -4.6,-1.26667 -2.06667,-1.26666 -3.33334,-3.33333 -1.26667,-2.06667 -1.26667,-4.6 V 290.3234 h 8.73334 v 11.86667 h 15.06668 v 8.73334 h -15.06668 v 20.40001 q 0,0.33334 0.2,0.6 0.26667,0.2 0.6,0.2 h 14.26668 v 8.73334 z m 26.06672,0 v 0 -38.66669 h 8.73333 v 38.66669 z m 0,-42.53335 v 0 -8.80001 h 8.73333 v 8.80001 z m 29.33333,42.53335 q -2.53333,0 -4.66667,-1.26667 -2.06667,-1.26666 -3.33333,-3.33333 -1.2,-2.06667 -1.2,-4.6 v -14.53334 h 30.53335 v -5.40001 q 0,-0.33333 -0.26667,-0.53333 -0.2,-0.26667 -0.53333,-0.26667 h -29.73335 v -8.73334 h 30.06668 q 2.53333,0 4.6,1.26667 2.13334,1.26667 3.33334,3.33334 1.26666,2.06666 1.26666,4.6 v 29.46668 z m 0.33334,-8.73334 h 21.00001 v -7.13333 h -21.80002 v 6.33333 q 0,0.33334 0.20001,0.6 0.26666,0.2 0.6,0.2 z m 50.46674,8.73334 q -2.53333,0 -4.6,-1.26667 -2.06667,-1.26666 -3.33334,-3.33333 -1.26666,-2.06667 -1.26666,-4.6 v -42.20003 h 8.8 v 41.86669 q 0,0.33334 0.2,0.6 0.26667,0.2 0.6,0.2 h 7.40001 v 8.73334 z m 19.00003,-15.33334 v 0 -8.73334 h 27.26668 v 8.73334 z m 40.40004,15.33334 v -48.00002 h 38.66669 q 2.53333,0 4.66667,1.26666 2.13333,1.26667 3.4,3.40001 1.26667,2.06666 1.26667,4.6 v 29.46668 q 0,2.53333 -1.26667,4.66667 -1.26667,2.06667 -3.4,3.33333 -2.13334,1.26667 -4.66667,1.26667 z m 9.53334,-8.86667 h 28.73335 q 0.33333,0 0.6,-0.2 0.26666,-0.26667 0.26666,-0.6 v -28.66668 q 0,-0.33334 -0.26666,-0.53334 -0.26667,-0.26666 -0.6,-0.26666 h -28.73335 q -0.33334,0 -0.6,0.26666 -0.2,0.2 -0.2,0.53334 v 28.66668 q 0,0.33333 0.2,0.6 0.26666,0.2 0.6,0.2 z m 51.8,8.86667 v 0 -8.73334 h 8.73334 v 8.73334 z m 21.39994,0 v -48.00002 h 44.20002 v 8.86667 h -35.33335 v 10.66667 h 28.40001 v 8.93334 h -28.40001 v 10.66667 h 35.33335 v 8.86667 z m 56.80007,0 v 0 -8.73334 h 8.73334 v 8.73334 z m 30.53331,0 q -2.53334,0 -4.66667,-1.26667 -2.06667,-1.26666 -3.33334,-3.33333 -1.26666,-2.13334 -1.26666,-4.66667 v -29.46668 q 0,-2.53334 1.26666,-4.6 1.26667,-2.13334 3.33334,-3.40001 2.13333,-1.26666 4.66667,-1.26666 h 38.60002 v 8.86667 h -36.73336 q -1.06666,0 -1.73333,0.6 -0.6,0.6 -0.6,1.73333 v 25.60002 q 0,1.06666 0.6,1.73333 0.66667,0.6 1.73333,0.6 h 36.73336 v 8.86667 z m 51.40007,0 v 0 -8.73334 h 8.73334 v 8.73334 z m 21.26664,0 v -48.00002 h 9.66667 l 17.40001,20.73334 17.33334,-20.73334 h 9.73334 v 48.00002 h -8.86667 v -35.20002 l -18.20001,21.66668 -18.26668,-21.60001 v 35.13335 z"
    />
  </g>
</svg>
`

function animateBrandLogo(shell) {
  if (!shell || !canAnimate) {
    return;
  }

  // Subtle breathing pulse on the path fill opacity
  const path = shell.querySelector("path");
  if (!path) {
    return;
  }

  anime.remove([shell, path]);
  anime({
    targets: path,
    opacity: [0.82, 1, 0.82],
    duration: 3200,
    easing: "easeInOutSine",
    loop: true,
  });
  anime({
    targets: shell,
    scale: [1, 1.006, 1],
    duration: 3200,
    easing: "easeInOutSine",
    loop: true,
  });
}

function initializeBrandLogo() {
  if (!brandLogoShell) {
    return;
  }

  const svgMarkup = INLINE_BRAND_LOGO;

  brandLogoShell.innerHTML = svgMarkup;
  animateBrandLogo(brandLogoShell);
}

function showModal(modal) {
  if (!modal || !modal.hidden && modal.dataset.open === "true") {
    return;
  }

  const backdrop = modal.querySelector(".modal-backdrop");
  const card = modal.querySelector(".modal-card");
  modal.hidden = false;
  modal.dataset.open = "true";

  if (!canAnimate || !backdrop || !card) {
    if (backdrop) {
      backdrop.style.opacity = "1";
    }
    if (card) {
      card.style.opacity = "1";
      card.style.transform = "none";
    }
    return;
  }

  anime.remove([backdrop, card]);
  anime.set(backdrop, { opacity: 0 });
  anime.set(card, { opacity: 0, translateY: 20, scale: 0.97 });
  anime
    .timeline({ easing: "easeOutCubic", duration: 240 })
    .add({
      targets: backdrop,
      opacity: [0, 1],
      duration: 200,
    })
    .add(
      {
        targets: card,
        opacity: [0, 1],
        translateY: [20, 0],
        scale: [0.97, 1],
        duration: 320,
        easing: "easeOutExpo",
      },
      40
    );
}

function hideModal(modal, onComplete) {
  if (!modal || modal.hidden || modal.dataset.closing === "true") {
    if (typeof onComplete === "function") {
      onComplete();
    }
    return;
  }

  const finalize = () => {
    modal.hidden = true;
    modal.dataset.open = "false";
    modal.dataset.closing = "false";
    if (typeof onComplete === "function") {
      onComplete();
    }
  };

  const backdrop = modal.querySelector(".modal-backdrop");
  const card = modal.querySelector(".modal-card");

  if (!canAnimate || !backdrop || !card) {
    finalize();
    return;
  }

  modal.dataset.closing = "true";
  anime.remove([backdrop, card]);
  anime
    .timeline({
      easing: "easeInCubic",
      duration: 180,
      complete: finalize,
    })
    .add({
      targets: card,
      opacity: [1, 0],
      translateY: [0, 16],
      scale: [1, 0.98],
    })
    .add(
      {
        targets: backdrop,
        opacity: [1, 0],
        duration: 160,
      },
      0
    );
}

function updateGlobalDropOverlay(visible) {
  if (visible === isDropOverlayVisible) {
    return;
  }

  isDropOverlayVisible = visible;
  const overlay = globalDropOverlay;
  const card = overlay.querySelector(".drop-overlay-card");

  if (!visible) {
    if (!canAnimate || overlay.hidden) {
      overlay.hidden = true;
      return;
    }

    anime.remove([overlay, card]);
    anime({
      targets: overlay,
      opacity: [1, 0],
      duration: 160,
      easing: "easeInQuad",
    });
    anime({
      targets: card,
      opacity: [1, 0],
      scale: [1, 0.94],
      duration: 180,
      easing: "easeInCubic",
      complete: () => {
        overlay.hidden = true;
      },
    });
    return;
  }

  overlay.hidden = false;

  if (!canAnimate || !card) {
    overlay.style.opacity = "1";
    if (card) {
      card.style.opacity = "1";
      card.style.transform = "none";
    }
    return;
  }

  anime.remove([overlay, card]);
  anime.set(overlay, { opacity: 0 });
  anime.set(card, { opacity: 0, scale: 0.94 });
  anime({
    targets: overlay,
    opacity: [0, 1],
    duration: 180,
    easing: "easeOutQuad",
  });
  anime({
    targets: card,
    opacity: [0, 1],
    scale: [0.94, 1],
    duration: 360,
    easing: "easeOutExpo",
  });
}

function updateStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "var(--status-error)" : "";
}

function updateImportProgress(title, percent, meta = "") {
  if (!importProgressCard || !importProgressTitle || !importProgressMeta || !importProgressFill) {
    return;
  }

  importProgressCard.hidden = false;
  importProgressTitle.textContent = title || "Preparing import";
  importProgressMeta.textContent = meta || "";
  importProgressFill.style.width = `${Math.max(0, Math.min(100, percent || 0))}%`;
}

function clearImportProgress() {
  if (!importProgressCard || !importProgressFill) {
    return;
  }

  importProgressCard.hidden = true;
  importProgressFill.style.width = "0%";
}

function setEmptyState() {
  emptyState.hidden = loadedLayers.length > 0;
}

function getBoundsSafe(layerGroup) {
  try {
    const bounds = layerGroup.getBounds();
    return bounds.isValid() ? bounds : null;
  } catch (error) {
    return null;
  }
}

function createFeatureCollection(features) {
  return {
    type: "FeatureCollection",
    features: Array.isArray(features) ? features : [],
  };
}

function getCsvAnalysisGeoJSON(layerRecord) {
  if (!layerRecord) {
    return createFeatureCollection([]);
  }

  return layerRecord.analysisGeojson || layerRecord.geojson || createFeatureCollection([]);
}

function getCsvDisplayLabel(layerRecord) {
  if (!isLargeCsvLayerRecord(layerRecord)) {
    return "";
  }

  if (layerRecord.largeCsvMode === "sample") {
    return `Sample preview of ${formatCompactNumber(layerRecord.featureCount, 0)} points`;
  }

  return `Grid preview of ${formatCompactNumber(layerRecord.featureCount, 0)} points`;
}

function parseHexColor(color) {
  const normalized = String(color || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return [29, 183, 166];
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function interpolateColor(startColor, endColor, factor) {
  const start = parseHexColor(startColor);
  const end = parseHexColor(endColor);
  const ratio = Math.max(0, Math.min(1, factor));

  return rgbToHex(
    start.map((component, index) => component + (end[index] - component) * ratio)
  );
}

function buildColorRamp(rampName, classCount) {
  const [startColor, endColor] = colorRamps[rampName] || colorRamps["teal-blue"];
  const count = Math.max(1, Number.parseInt(classCount, 10) || 5);

  if (count === 1) {
    return [startColor];
  }

  return Array.from({ length: count }, (_, index) =>
    interpolateColor(startColor, endColor, index / (count - 1))
  );
}

function getInterpolationRampStops(rampName) {
  return interpolationColorRamps[rampName] || interpolationColorRamps["terrain-glow"];
}

function interpolateColorStops(stops, ratio) {
  const normalizedStops = Array.isArray(stops) && stops.length ? stops : interpolationColorRamps["terrain-glow"];
  if (normalizedStops.length === 1) {
    return normalizedStops[0];
  }

  const clamped = Math.max(0, Math.min(1, ratio));
  const scaled = clamped * (normalizedStops.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(normalizedStops.length - 1, lowerIndex + 1);
  const localRatio = scaled - lowerIndex;

  return interpolateColor(normalizedStops[lowerIndex], normalizedStops[upperIndex], localRatio);
}

function formatCompactNumber(value, fractionDigits = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "n/a";
  }

  return numericValue.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
  });
}

function getNormalizedFeatureValue(feature, field) {
  return feature?.properties?.[field];
}

function getDisplayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "(empty)";
  }

  return String(value);
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function haversineDistance(coordA, coordB) {
  if (!Array.isArray(coordA) || !Array.isArray(coordB)) {
    return 0;
  }

  const [lon1, lat1] = coordA;
  const [lon2, lat2] = coordB;

  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) {
    return 0;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function getLineDistance(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return 0;
  }

  let total = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineDistance(coordinates[index - 1], coordinates[index]);
  }

  return total;
}

function getClosedRingDistance(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return 0;
  }

  const ring = coordinates.slice();
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first?.[0] !== last?.[0] || first?.[1] !== last?.[1]) {
    ring.push(first);
  }

  return getLineDistance(ring);
}

function getRingArea(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    return 0;
  }

  let total = 0;

  for (let index = 0; index < coordinates.length; index += 1) {
    const current = coordinates[index];
    const next = coordinates[(index + 1) % coordinates.length];

    if (!Array.isArray(current) || !Array.isArray(next)) {
      continue;
    }

    total +=
      (toRadians(next[0] - current[0])) *
      (2 + Math.sin(toRadians(current[1])) + Math.sin(toRadians(next[1])));
  }

  return (total * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2;
}

function getPolygonArea(coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) {
    return 0;
  }

  const outerArea = Math.abs(getRingArea(coordinates[0]));
  const holeArea = coordinates
    .slice(1)
    .reduce((sum, ring) => sum + Math.abs(getRingArea(ring)), 0);

  return Math.max(0, outerArea - holeArea);
}

function getFeatureArea(geometry) {
  if (!geometry) {
    return 0;
  }

  if (geometry.type === "Polygon") {
    return getPolygonArea(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((sum, polygon) => sum + getPolygonArea(polygon), 0);
  }

  return 0;
}

function getFeatureLength(geometry) {
  if (!geometry) {
    return 0;
  }

  if (geometry.type === "LineString") {
    return getLineDistance(geometry.coordinates);
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.reduce((sum, line) => sum + getLineDistance(line), 0);
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.reduce((sum, ring) => sum + getClosedRingDistance(ring), 0);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce(
      (sum, polygon) =>
        sum + polygon.reduce((ringSum, ring) => ringSum + getClosedRingDistance(ring), 0),
      0
    );
  }

  return 0;
}

function getFeaturePerimeter(geometry) {
  if (!geometry) {
    return 0;
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.reduce((sum, ring) => sum + getClosedRingDistance(ring), 0);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce(
      (sum, polygon) =>
        sum + polygon.reduce((ringSum, ring) => ringSum + getClosedRingDistance(ring), 0),
      0
    );
  }

  return 0;
}

function getPointCoordinate(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Point") {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiPoint" && geometry.coordinates.length) {
    return geometry.coordinates[0];
  }

  return null;
}

function getMeanCoordinate(coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) {
    return null;
  }

  const sum = coordinates.reduce(
    (accumulator, coord) => {
      if (Array.isArray(coord) && Number.isFinite(coord[0]) && Number.isFinite(coord[1])) {
        accumulator.lon += coord[0];
        accumulator.lat += coord[1];
        accumulator.count += 1;
      }
      return accumulator;
    },
    { lon: 0, lat: 0, count: 0 }
  );

  if (!sum.count) {
    return null;
  }

  return [sum.lon / sum.count, sum.lat / sum.count];
}

function getLineCentroid(coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) {
    return null;
  }

  if (coordinates.length === 1) {
    return coordinates[0];
  }

  let weightedLon = 0;
  let weightedLat = 0;
  let totalLength = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentLength = haversineDistance(start, end);

    if (!segmentLength) {
      continue;
    }

    weightedLon += ((start[0] + end[0]) / 2) * segmentLength;
    weightedLat += ((start[1] + end[1]) / 2) * segmentLength;
    totalLength += segmentLength;
  }

  if (!totalLength) {
    return coordinates[0];
  }

  return [weightedLon / totalLength, weightedLat / totalLength];
}

function getPolygonCentroid(rings) {
  const ring = Array.isArray(rings) ? rings[0] : null;
  if (!Array.isArray(ring) || ring.length < 3) {
    return getMeanCoordinate(ring || []);
  }

  let areaFactor = 0;
  let centroidLon = 0;
  let centroidLat = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = current[0] * next[1] - next[0] * current[1];

    areaFactor += cross;
    centroidLon += (current[0] + next[0]) * cross;
    centroidLat += (current[1] + next[1]) * cross;
  }

  if (!areaFactor) {
    return getMeanCoordinate(ring);
  }

  return [centroidLon / (3 * areaFactor), centroidLat / (3 * areaFactor)];
}

function getFeatureCentroidCoordinate(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Point") {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiPoint") {
    return getMeanCoordinate(geometry.coordinates);
  }

  if (geometry.type === "LineString") {
    return getLineCentroid(geometry.coordinates);
  }

  if (geometry.type === "MultiLineString") {
    const centroids = geometry.coordinates
      .map((line) => ({
        centroid: getLineCentroid(line),
        weight: getLineDistance(line),
      }))
      .filter((item) => item.centroid);

    const totalWeight = centroids.reduce((sum, item) => sum + item.weight, 0);
    if (!centroids.length) {
      return null;
    }
    if (!totalWeight) {
      return centroids[0].centroid;
    }

    const aggregate = centroids.reduce(
      (sum, item) => {
        sum.lon += item.centroid[0] * item.weight;
        sum.lat += item.centroid[1] * item.weight;
        return sum;
      },
      { lon: 0, lat: 0 }
    );

    return [aggregate.lon / totalWeight, aggregate.lat / totalWeight];
  }

  if (geometry.type === "Polygon") {
    return getPolygonCentroid(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates
      .map((polygon) => ({
        centroid: getPolygonCentroid(polygon),
        area: getPolygonArea(polygon),
      }))
      .filter((item) => item.centroid);

    const totalArea = polygons.reduce((sum, item) => sum + item.area, 0);
    if (!polygons.length) {
      return null;
    }
    if (!totalArea) {
      return polygons[0].centroid;
    }

    const aggregate = polygons.reduce(
      (sum, item) => {
        sum.lon += item.centroid[0] * item.area;
        sum.lat += item.centroid[1] * item.area;
        return sum;
      },
      { lon: 0, lat: 0 }
    );

    return [aggregate.lon / totalArea, aggregate.lat / totalArea];
  }

  return null;
}

function createSpatialCalculatorHelpers(feature) {
  const geometry = feature?.geometry || null;
  const pointCoordinate = getPointCoordinate(geometry);
  const centroidCoordinate = getFeatureCentroidCoordinate(geometry);

  const lengthValue = (value) => {
    if (typeof value === "string" || Array.isArray(value)) {
      return value.length;
    }

    if (value === undefined || value === null) {
      return getFeatureLength(geometry);
    }

    return String(value).length;
  };

  return {
    area: () => getFeatureArea(geometry),
    AREA: () => getFeatureArea(geometry),
    length: lengthValue,
    LENGTH: lengthValue,
    perimeter: () => getFeaturePerimeter(geometry),
    PERIMETER: () => getFeaturePerimeter(geometry),
    latitude: () => pointCoordinate?.[1] ?? null,
    LATITUDE: () => pointCoordinate?.[1] ?? null,
    longitude: () => pointCoordinate?.[0] ?? null,
    LONGITUDE: () => pointCoordinate?.[0] ?? null,
    centroid_lat: () => centroidCoordinate?.[1] ?? null,
    CENTROID_LAT: () => centroidCoordinate?.[1] ?? null,
    centroid_lon: () => centroidCoordinate?.[0] ?? null,
    CENTROID_LON: () => centroidCoordinate?.[0] ?? null,
  };
}

function createMarkerIcon(color) {
  return VectorStyleManager.createPointIcon(
    { color, styleConfig: createDefaultStyleConfig(color) },
    { geometry: { type: "Point" }, properties: {} }
  );
}

function cloneGeoJSON(geojson) {
  return JSON.parse(JSON.stringify(geojson));
}

function collectFieldNamesFromGeoJSON(geojson) {
  const fieldSet = new Set();

  (geojson?.features || []).forEach((feature) => {
    Object.keys(feature?.properties || {}).forEach((key) => fieldSet.add(key));
  });

  return Array.from(fieldSet).sort();
}


// ─── Edit History (Undo / Redo) ───────────────────────────────────────────────
// Lightweight per-session history stack tied to the active editable layer.
// A snapshot is a deep clone of the layer's geojson at a point in time.
// The stack is cleared whenever the active editable layer changes.

const EDIT_HISTORY_LIMIT = 50;

let _editHistoryStack = [];  // array of { layerId, geojson } snapshots
let _editHistoryCursor = -1; // points to the "current" state

function pushEditSnapshot(layerRecord) {
  if (!layerRecord) return;
  // Drop any redo states ahead of cursor
  _editHistoryStack = _editHistoryStack.slice(0, _editHistoryCursor + 1);
  _editHistoryStack.push({ layerId: layerRecord.id, geojson: cloneGeoJSON(layerRecord.geojson) });
  if (_editHistoryStack.length > EDIT_HISTORY_LIMIT) {
    _editHistoryStack.shift();
  }
  _editHistoryCursor = _editHistoryStack.length - 1;
}

function clearEditHistory() {
  _editHistoryStack = [];
  _editHistoryCursor = -1;
}

function canUndoEdit() {
  return _editHistoryCursor > 0;
}

function canRedoEdit() {
  return _editHistoryCursor < _editHistoryStack.length - 1;
}

function getEditHistoryCursor() { return _editHistoryCursor; }
function getEditHistoryStack()  { return _editHistoryStack; }

function applyEditHistorySnapshot(snapshot, layerRecord) {
  layerRecord.geojson = cloneGeoJSON(snapshot.geojson);
  layerRecord.fields = collectFieldNamesFromGeoJSON(layerRecord.geojson);
  layerRecord.featureCount = layerRecord.geojson.features.length;
}
