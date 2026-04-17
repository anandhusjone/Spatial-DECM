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
};

let activeBasemapTheme = "dark";
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
const newLayerNameInput = document.getElementById("new-layer-name");
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
const calculatorFunctionList = document.getElementById("calculator-function-list");
const calculatorExpression = document.getElementById("calculator-expression");
const calculatorPreviewText = document.getElementById("calculator-preview-text");
const calculatorError = document.getElementById("calculator-error");
const calculatorNewFieldName = document.getElementById("calculator-new-field-name");
const calculatorExistingField = document.getElementById("calculator-existing-field");
const calculatorExistingFieldStack = document.getElementById("calculator-existing-field-stack");
const calculatorPreviewBtn = document.getElementById("calculator-preview-btn");
const calculatorApplyBtn = document.getElementById("calculator-apply-btn");
const calculatorModeInputs = document.querySelectorAll('input[name="calculator-mode"]');
const tableResizer = document.getElementById("table-resizer");
const globalDropOverlay = document.getElementById("global-drop-overlay");
const symbologyModal = document.getElementById("symbology-modal");
const closeSymbologyModalBtn = document.getElementById("close-symbology-modal-btn");
const symbologyLayerLabel = document.getElementById("symbology-layer-label");
const symbologyTypeSelect = document.getElementById("symbology-type");
const symbologyFieldSelect = document.getElementById("symbology-field");
const singleStylePanel = document.getElementById("single-style-panel");
const singleStyleColorInput = document.getElementById("single-style-color");
const categorizedStylePanel = document.getElementById("categorized-style-panel");
const categorizedValuesWrap = document.getElementById("categorized-values-wrap");
const graduatedStylePanel = document.getElementById("graduated-style-panel");
const graduatedRampSelect = document.getElementById("graduated-ramp");
const graduatedMethodSelect = document.getElementById("graduated-method");
const graduatedClassCountSelect = document.getElementById("graduated-class-count");
const graduatedBreaksWrap = document.getElementById("graduated-breaks-wrap");
const applySymbologyBtn = document.getElementById("apply-symbology-btn");
const resetSymbologyBtn = document.getElementById("reset-symbology-btn");
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

const loadedLayers = [];
let layerCount = 0;
let activeEditableLayerId = "";
let selectedFeatureContext = null;
let exportTargetLayerId = "";
let dragDepth = 0;
let isResizingTable = false;
let activeSymbologyLayerId = "";
let activeFilterLayerId = "";

const THEME_STORAGE_KEY = "geodataviewer-theme-preference";
const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

const colorRamps = {
  "teal-blue": ["#1db7a6", "#43c2ff"],
  "gold-red": ["#ffcc66", "#ff6b6b"],
  "mint-purple": ["#71d9b6", "#9a6bff"],
};

const calculatorFunctions = {
  Math: [
    { label: "ROUND(value)", insert: "round(" },
    { label: "ABS(value)", insert: "abs(" },
    { label: "SQRT(value)", insert: "sqrt(" },
    { label: "MIN(a, b)", insert: "min(" },
    { label: "MAX(a, b)", insert: "max(" },
  ],
  String: [
    { label: 'CONCAT(a, b)', insert: "concat(" },
    { label: 'a || b', insert: " || " },
    { label: "UPPER(text)", insert: "upper(" },
    { label: "LOWER(text)", insert: "lower(" },
    { label: "LENGTH(value)", insert: "length(" },
    { label: 'REPLACE(text, find, with)', insert: "replace(" },
  ],
  Spatial: [
    { label: "AREA()", insert: "area()" },
    { label: "LENGTH()", insert: "length()" },
    { label: "PERIMETER()", insert: "perimeter()" },
    { label: "LATITUDE()", insert: "latitude()" },
    { label: "LONGITUDE()", insert: "longitude()" },
    { label: "CENTROID_LAT()", insert: "centroid_lat()" },
    { label: "CENTROID_LON()", insert: "centroid_lon()" },
  ],
  Logic: [
    { label: 'IF(condition, yes, no)', insert: "if(" },
    { label: 'CASE WHEN', insert: 'if(field == "value", "yes", "no")' },
    { label: 'EQUALS', insert: " == " },
    { label: 'AND', insert: " and " },
    { label: 'OR', insert: " or " },
  ],
};

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

const drawControl = new L.Control.Draw({
  edit: {
    featureGroup: drawWorkspace,
    remove: true,
  },
  draw: {
    polyline: {
      shapeOptions: {
        color: "#43c2ff",
        weight: 3,
      },
    },
    polygon: {
      allowIntersection: false,
      showArea: true,
      shapeOptions: {
        color: "#1db7a6",
        weight: 3,
        fillColor: "#1db7a6",
        fillOpacity: 0.24,
      },
    },
    rectangle: {
      shapeOptions: {
        color: "#ffb454",
        weight: 3,
        fillColor: "#ffb454",
        fillOpacity: 0.18,
      },
    },
    circle: false,
    circlemarker: false,
    marker: true,
  },
});

map.addControl(drawControl);

const defaultStyle = (color) => ({
  color,
  weight: 3,
  opacity: 0.92,
  fillColor: color,
  fillOpacity: 0.22,
});

const EARTH_RADIUS_METERS = 6378137;

function createDefaultStyleConfig(color) {
  return {
    mode: "single",
    field: "",
    singleColor: color,
    categorized: {
      valueColors: {},
    },
    graduated: {
      ramp: "teal-blue",
      method: "equal",
      classCount: 5,
    },
  };
}

function createDefaultFilterConfig() {
  return {
    logic: "and",
    rules: [],
  };
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

function applyBasemapTheme(themeName) {
  if (activeBasemapTheme === themeName) {
    basemapLabel.textContent = themeName === "dark" ? "CartoDB Dark Matter" : "CartoDB Light Matter";
    return;
  }

  map.removeLayer(basemapLayers[activeBasemapTheme]);
  basemapLayers[themeName].addTo(map);
  activeBasemapTheme = themeName;
  basemapLabel.textContent = themeName === "dark" ? "CartoDB Dark Matter" : "CartoDB Light Matter";
}

function applyTheme(themePreference) {
  const resolvedTheme = getResolvedTheme(themePreference);
  document.documentElement.dataset.theme = resolvedTheme;
  applyBasemapTheme(resolvedTheme);
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

function updateStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "var(--status-error)" : "";
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
  return L.divIcon({
    className: "custom-point-icon",
    html: `<span style="
      display:block;
      width:14px;
      height:14px;
      border-radius:50%;
      background:${color};
      border:2px solid white;
      box-shadow:0 0 0 2px rgba(6, 12, 24, 0.45);
    "></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
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

function normalizeGeoJSON(geojson) {
  let featureCollection;

  if (geojson?.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    featureCollection = cloneGeoJSON(geojson);
  } else if (geojson?.type === "Feature") {
    featureCollection = {
      type: "FeatureCollection",
      features: [cloneGeoJSON(geojson)],
    };
  } else if (Array.isArray(geojson)) {
    featureCollection = {
      type: "FeatureCollection",
      features: cloneGeoJSON(geojson),
    };
  } else if (geojson?.type) {
    featureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: cloneGeoJSON(geojson),
          properties: {},
        },
      ],
    };
  } else {
    featureCollection = {
      type: "FeatureCollection",
      features: [],
    };
  }

  featureCollection.features.forEach((feature) => {
    feature.id = feature.id || crypto.randomUUID();
    feature.properties = feature.properties || {};
  });

  return featureCollection;
}

function getCategorizedUniqueValues(layerRecord, field) {
  if (!layerRecord || !field) {
    return [];
  }

  const values = new Set();
  layerRecord.geojson.features.forEach((feature) => {
    values.add(getDisplayValue(getNormalizedFeatureValue(feature, field)));
  });

  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function getNumericFieldValues(layerRecord, field) {
  if (!layerRecord || !field) {
    return [];
  }

  return layerRecord.geojson.features
    .map((feature) => Number(getNormalizedFeatureValue(feature, field)))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function computeGraduatedBreaks(layerRecord, field, classCount, method) {
  const values = getNumericFieldValues(layerRecord, field);
  if (!values.length) {
    return [];
  }

  const count = Math.max(1, Number.parseInt(classCount, 10) || 5);
  const breaks = [];

  if (method === "quantile") {
    for (let index = 0; index < count; index += 1) {
      const lowerIndex = Math.floor((index * values.length) / count);
      const upperIndex = Math.min(
        values.length - 1,
        Math.ceil(((index + 1) * values.length) / count) - 1
      );
      breaks.push({
        min: values[lowerIndex],
        max: values[upperIndex],
      });
    }
  } else {
    const min = values[0];
    const max = values[values.length - 1];
    const interval = count > 1 ? (max - min) / count : 0;

    for (let index = 0; index < count; index += 1) {
      breaks.push({
        min: index === 0 ? min : min + interval * index,
        max: index === count - 1 ? max : min + interval * (index + 1),
      });
    }
  }

  return breaks;
}

function passesFilterRule(feature, rule) {
  if (!rule?.field || !rule.operator) {
    return true;
  }

  const leftValue = getNormalizedFeatureValue(feature, rule.field);
  const rightValue = rule.value;
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

  if (rule.operator === "contains") {
    return String(leftValue ?? "").toLowerCase().includes(String(rightValue ?? "").toLowerCase());
  }

  if (rule.operator === "==" || rule.operator === "!=") {
    const matches = bothNumeric
      ? leftNumber === rightNumber
      : String(leftValue ?? "") === String(rightValue ?? "");
    return rule.operator === "==" ? matches : !matches;
  }

  if (!bothNumeric) {
    return false;
  }

  if (rule.operator === ">") {
    return leftNumber > rightNumber;
  }

  if (rule.operator === "<") {
    return leftNumber < rightNumber;
  }

  if (rule.operator === ">=") {
    return leftNumber >= rightNumber;
  }

  if (rule.operator === "<=") {
    return leftNumber <= rightNumber;
  }

  return true;
}

function getFilteredFeatures(layerRecord) {
  const rules = layerRecord?.filterConfig?.rules || [];
  if (!layerRecord || !rules.length) {
    return layerRecord?.geojson.features || [];
  }

  const logic = layerRecord.filterConfig.logic === "or" ? "or" : "and";

  return layerRecord.geojson.features.filter((feature) =>
    logic === "or"
      ? rules.some((rule) => passesFilterRule(feature, rule))
      : rules.every((rule) => passesFilterRule(feature, rule))
  );
}

function getFeatureColor(layerRecord, feature) {
  const styleConfig = layerRecord?.styleConfig || createDefaultStyleConfig(layerRecord?.color || "#1db7a6");

  if (styleConfig.mode === "categorized" && styleConfig.field) {
    const displayValue = getDisplayValue(getNormalizedFeatureValue(feature, styleConfig.field));
    return styleConfig.categorized.valueColors[displayValue] || styleConfig.singleColor || layerRecord.color;
  }

  if (styleConfig.mode === "graduated" && styleConfig.field) {
    const numericValue = Number(getNormalizedFeatureValue(feature, styleConfig.field));
    if (Number.isFinite(numericValue)) {
      const breaks = computeGraduatedBreaks(
        layerRecord,
        styleConfig.field,
        styleConfig.graduated.classCount,
        styleConfig.graduated.method
      );
      const rampColors = buildColorRamp(styleConfig.graduated.ramp, breaks.length || 1);
      const breakIndex = breaks.findIndex((currentBreak, index) => {
        if (index === breaks.length - 1) {
          return numericValue >= currentBreak.min && numericValue <= currentBreak.max;
        }

        return numericValue >= currentBreak.min && numericValue < currentBreak.max;
      });

      if (breakIndex >= 0) {
        return rampColors[breakIndex];
      }
    }
  }

  return styleConfig.singleColor || layerRecord?.color || "#1db7a6";
}

function createFeatureStyle(layerRecord, feature) {
  return defaultStyle(getFeatureColor(layerRecord, feature));
}

function bindFeatureBehavior(layerRecord, layer, feature, targetGroup = layerRecord.layerGroup) {
  layer.feature = feature;
  targetGroup.addLayer(layer);

  layer.on("click", () => {
    selectFeature(layerRecord.id, layer);
  });

  refreshFeaturePopup(layer);
}

function refreshFeaturePopup(layer) {
  const properties = layer.feature?.properties || {};
  const keys = Object.keys(properties);

  if (!keys.length) {
    layer.bindPopup("<strong>No attributes</strong>");
    return;
  }

  const html = keys
    .map(
      (key) =>
        `<strong>${escapeHtml(key)}</strong>: ${escapeHtml(String(properties[key] ?? ""))}`
    )
    .join("<br>");

  layer.bindPopup(html);
}

function getLayerRecordById(id) {
  return loadedLayers.find((item) => item.id === id) || null;
}

function getFeatureById(layerRecord, featureId) {
  return layerRecord?.geojson.features.find((feature) => feature.id === featureId) || null;
}

function getMapLayerByFeatureId(layerRecord, featureId) {
  if (layerRecord?.id === activeEditableLayerId) {
    const editableLayer = drawWorkspace
      .getLayers()
      .find((layer) => layer.feature?.id === featureId);
    if (editableLayer) {
      return editableLayer;
    }
  }

  return (
    layerRecord?.layerGroup
      .getLayers()
      .find((layer) => layer.feature?.id === featureId) || null
  );
}

function rebuildLayerFromData(layerRecord) {
  map.removeLayer(layerRecord.layerGroup);

  layerRecord.layerGroup = L.featureGroup();

  const filteredFeatures = getFilteredFeatures(layerRecord);

  filteredFeatures.forEach((feature) => {
    const featureColor = getFeatureColor(layerRecord, feature);
    const layers = L.geoJSON(feature, {
      style: () => createFeatureStyle(layerRecord, feature),
      pointToLayer: (currentFeature, latlng) =>
        L.marker(latlng, { icon: createMarkerIcon(featureColor) }),
    }).getLayers();

    layers.forEach((layer) => {
      bindFeatureBehavior(layerRecord, layer, feature);
    });
  });

  if (layerRecord.isVisible !== false) {
    layerRecord.layerGroup.addTo(map);
  }

  layerRecord.featureCount = layerRecord.geojson.features.length;
  layerRecord.visibleFeatureCount = filteredFeatures.length;

  if (layerRecord.id === activeEditableLayerId) {
    syncEditableWorkspace();
  }

  renderLayerList();
}

function createLayerRecord(geojson, fileName, sourceType) {
  const normalizedGeojson = normalizeGeoJSON(geojson);
  const color = palette[layerCount % palette.length];
  layerCount += 1;

  const layerRecord = {
    id: crypto.randomUUID(),
    name: fileName,
    sourceType,
    color,
    isVisible: true,
    geojson: normalizedGeojson,
    fields: collectFieldNamesFromGeoJSON(normalizedGeojson),
    styleConfig: createDefaultStyleConfig(color),
    filterConfig: createDefaultFilterConfig(),
    layerGroup: L.featureGroup(),
    featureCount: 0,
    visibleFeatureCount: 0,
  };

  rebuildLayerFromData(layerRecord);
  return layerRecord;
}

function sanitizeGeoJSONForExport(geojson) {
  const cloned = cloneGeoJSON(geojson);
  cloned.features.forEach((feature) => {
    if (feature.properties) {
      delete feature.properties.__geometryType;
    }
  });
  return cloned;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fileToText(file) {
  return file.text();
}

async function fileToArrayBuffer(file) {
  return file.arrayBuffer();
}

async function parseSpatialFile(file) {
  const fileName = file.name;
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "geojson" || extension === "json") {
    const text = await fileToText(file);
    return {
      data: JSON.parse(text),
      sourceType: "GeoJSON",
    };
  }

  if (extension === "kml") {
    const text = await fileToText(file);
    const xml = new DOMParser().parseFromString(text, "text/xml");
    if (xml.querySelector("parsererror")) {
      throw new Error("KML could not be parsed. Check that the file is valid XML.");
    }
    return {
      data: toGeoJSON.kml(xml),
      sourceType: "KML",
    };
  }

  if (extension === "gpx") {
    const text = await fileToText(file);
    const xml = new DOMParser().parseFromString(text, "text/xml");
    if (xml.querySelector("parsererror")) {
      throw new Error("GPX could not be parsed. Check that the file is valid XML.");
    }
    return {
      data: toGeoJSON.gpx(xml),
      sourceType: "GPX",
    };
  }

  if (extension === "zip") {
    const buffer = await fileToArrayBuffer(file);
    const parsed = await shp(buffer);
    const featureCollection = Array.isArray(parsed)
      ? {
          type: "FeatureCollection",
          features: parsed.flatMap((item) => item.features || []),
        }
      : parsed;

    return {
      data: featureCollection,
      sourceType: "Zipped Shapefile",
    };
  }

  if (extension === "csv") {
    const text = await fileToText(file);
    return {
      data: parseCsvAsGeoJSON(text),
      sourceType: "CSV",
    };
  }

  throw new Error(`Unsupported file type: .${extension || "unknown"}`);
}

function parseCsvAsGeoJSON(csvText) {
  const rows = parseCsvRows(csvText).filter((row) => row.some((value) => value.trim() !== ""));

  if (rows.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const headers = rows[0].map((value) => value.trim());
  const latitudeIndex = findHeaderIndex(headers, ["latitude", "lat", "y", "y_coord"]);
  const longitudeIndex = findHeaderIndex(headers, ["longitude", "lon", "lng", "x", "x_coord"]);

  if (latitudeIndex === -1 || longitudeIndex === -1) {
    throw new Error("CSV must contain latitude and longitude columns.");
  }

  const features = rows.slice(1).map((row, index) => {
    const values = row;
    const lat = Number.parseFloat(values[latitudeIndex]);
    const lon = Number.parseFloat(values[longitudeIndex]);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`Invalid latitude/longitude in row ${index + 2}.`);
    }

    const properties = {};
    headers.forEach((header, headerIndex) => {
      if (headerIndex !== latitudeIndex && headerIndex !== longitudeIndex) {
        properties[header || `column_${headerIndex + 1}`] = values[headerIndex] ?? "";
      }
    });

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lon, lat],
      },
      properties,
    };
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

function parseCsvRows(csvText) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unmatched quote.");
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function findHeaderIndex(headers, candidates) {
  return headers.findIndex((header) =>
    candidates.includes(header.trim().toLowerCase())
  );
}

function addLayerRecord(layerRecord) {
  loadedLayers.push(layerRecord);

  const bounds = getBoundsSafe(layerRecord.layerGroup);
  if (bounds) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }

  if (!activeEditableLayerId) {
    activeEditableLayerId = layerRecord.id;
    syncEditableWorkspace();
  }

  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
}

function removeLayer(id) {
  const index = loadedLayers.findIndex((item) => item.id === id);
  if (index === -1) {
    return;
  }

  map.removeLayer(loadedLayers[index].layerGroup);
  loadedLayers.splice(index, 1);

  if (activeEditableLayerId === id) {
    activeEditableLayerId = loadedLayers[0]?.id || "";
    selectedFeatureContext = null;
    syncEditableWorkspace();
  }

  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateStatus("Layer removed.");
}

function zoomToLayer(id) {
  const layerRecord = loadedLayers.find((item) => item.id === id);
  if (!layerRecord) {
    return;
  }

  const bounds = getBoundsSafe(layerRecord.layerGroup);
  if (bounds) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

function toggleLayer(id, visible) {
  const layerRecord = loadedLayers.find((item) => item.id === id);
  if (!layerRecord) {
    return;
  }

  layerRecord.isVisible = visible;

  if (visible) {
    layerRecord.layerGroup.addTo(map);
  } else {
    map.removeLayer(layerRecord.layerGroup);
    if (activeEditableLayerId === id) {
      activeEditableLayerId = "";
      selectedFeatureContext = null;
      syncEditableWorkspace();
      renderEditableLayerOptions();
      renderAttributeTable();
      renderLayerList();
      updateStatus("Editable layer was hidden. Select a visible layer to continue editing.");
    }
  }
}

function renderLayerList() {
  setEmptyState();
  layerList.innerHTML = "";

  loadedLayers.forEach((layerRecord) => {
    const wrapper = document.createElement("article");
    wrapper.className = "layer-card";

    const isVisible = layerRecord.isVisible !== false;
    const isEditable = layerRecord.id === activeEditableLayerId;

    wrapper.innerHTML = `
      <div class="layer-card-header">
        <div>
          <button class="layer-name-button" type="button">${escapeHtml(layerRecord.name)}</button>
          <div class="layer-meta">${escapeHtml(layerRecord.sourceType)} • ${layerRecord.featureCount} feature(s)</div>
          <div class="layer-meta">${layerRecord.visibleFeatureCount === layerRecord.featureCount ? "All features visible" : `${layerRecord.visibleFeatureCount} visible after filter`}</div>
          <div class="layer-meta">${isEditable ? "Edit mode active" : "View only"}</div>
        </div>
        <button class="edit-mode-toggle ${isEditable ? "active" : ""}" type="button" aria-pressed="${isEditable ? "true" : "false"}" title="${isEditable ? "Editing enabled" : "Enable editing"}">
          <span class="edit-mode-dot"></span>
        </button>
      </div>
      <div class="layer-controls">
        <label class="toggle-wrap">
          <input type="checkbox" ${isVisible ? "checked" : ""} />
          Visible
        </label>
        <div class="layer-actions">
          <button class="layer-action zoom" type="button">Zoom</button>
          <button class="layer-action style accent-action" type="button">Style</button>
          <button class="layer-action filter accent-action" type="button">Filter</button>
          <button class="layer-action export" type="button">Export</button>
          <button class="layer-action remove" type="button">Remove</button>
        </div>
      </div>
    `;

    const nameButton = wrapper.querySelector(".layer-name-button");
    const checkbox = wrapper.querySelector('input[type="checkbox"]');
    const editButton = wrapper.querySelector(".edit-mode-toggle");
    const zoomButton = wrapper.querySelector(".zoom");
    const styleButton = wrapper.querySelector(".style");
    const filterButton = wrapper.querySelector(".filter");
    const exportButton = wrapper.querySelector(".export");
    const removeButton = wrapper.querySelector(".remove");

    nameButton.addEventListener("click", () => zoomToLayer(layerRecord.id));
    checkbox.addEventListener("change", (event) =>
      toggleLayer(layerRecord.id, event.target.checked)
    );
    editButton.addEventListener("click", () =>
      setActiveEditableLayer(isEditable ? "" : layerRecord.id)
    );
    zoomButton.addEventListener("click", () => zoomToLayer(layerRecord.id));
    styleButton.addEventListener("click", () => openSymbologyModal(layerRecord.id));
    filterButton.addEventListener("click", () => openFilterModal(layerRecord.id));
    exportButton.addEventListener("click", () => openExportModal(layerRecord.id));
    removeButton.addEventListener("click", () => removeLayer(layerRecord.id));

    layerList.appendChild(wrapper);
  });
}

function getLayerFieldNames(layerRecord) {
  if (!layerRecord) {
    return [];
  }

  const fieldSet = new Set(layerRecord.fields || []);
  layerRecord.geojson.features.forEach((feature) => {
    Object.keys(feature.properties || {}).forEach((key) => fieldSet.add(key));
  });

  return Array.from(fieldSet).sort();
}

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
  symbologyModal.hidden = false;
}

function closeSymbologyModal() {
  symbologyModal.hidden = true;
  activeSymbologyLayerId = "";
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
  filterModal.hidden = false;
}

function closeFilterModal() {
  filterModal.hidden = true;
  activeFilterLayerId = "";
}

function openHelpModal() {
  helpModal.hidden = false;
}

function closeHelpModal() {
  helpModal.hidden = true;
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
  const previousActiveLayer = getActiveEditableLayer();
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

  renderEditableLayerOptions();
  renderAttributeTable();
  renderLayerList();
  syncEditableWorkspace();

  if (layerId) {
    updateStatus("Editable layer changed. Use the draw toolbar to add or edit features.");
  }
}

function getActiveEditableLayer() {
  return loadedLayers.find((layerRecord) => layerRecord.id === activeEditableLayerId) || null;
}

function ensureVisibleLayersOnMap() {
  loadedLayers.forEach((layerRecord) => {
    if (layerRecord.isVisible !== false && layerRecord.id !== activeEditableLayerId) {
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
        `<button class="calculator-chip" type="button" data-insert="[${escapeHtml(field)}]">${escapeHtml(field)}</button>`
    )
    .join("");

  calculatorFieldList.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => insertCalculatorText(button.dataset.insert));
  });
}

function renderCalculatorFunctionList() {
  calculatorFunctionList.innerHTML = Object.entries(calculatorFunctions)
    .map(
      ([group, items]) => `
        <div class="calculator-function-group">
          <p class="calculator-group-title">${escapeHtml(group)}</p>
          ${items
            .map(
              (item) => `
                <button class="calculator-function-item" type="button" data-insert="${escapeHtml(item.insert)}">
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

  calculatorExistingFieldStack.hidden = mode !== "update";
  calculatorNewFieldName.parentElement.hidden = mode !== "create";

  calculatorExistingField.innerHTML = fields.length
    ? fields.map((field) => `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`).join("")
    : '<option value="">No fields available</option>';
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

function normalizeCalculatorExpression(expression) {
  const fieldNormalized = expression.replace(/\[([^\]]+)\]/g, (_, fieldName) => {
    const normalizedFieldName = fieldName.trim();
    return `__fields[${JSON.stringify(normalizedFieldName)}]`;
  });
  return rewriteConcatOperators(fieldNormalized);
}

function rewriteConcatOperators(expression) {
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

function buildCalculatorScope(feature) {
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

function evaluateCalculatorExpression(feature, expression) {
  const normalized = normalizeCalculatorExpression(expression);
  return math.evaluate(normalized, buildCalculatorScope(feature));
}

function setCalculatorError(message = "") {
  calculatorError.hidden = !message;
  calculatorError.textContent = message;
}

function updateCalculatorPreview() {
  const activeLayer = getActiveEditableLayer();
  if (!activeLayer || !activeLayer.geojson.features.length) {
    calculatorPreviewText.textContent = "Load or draw a feature to preview the expression.";
    setCalculatorError("");
    return;
  }

  const expression = calculatorExpression.value.trim();
  if (!expression) {
    calculatorPreviewText.textContent = "Write an expression to preview it against the first feature.";
    setCalculatorError("");
    return;
  }

  try {
    const result = evaluateCalculatorExpression(activeLayer.geojson.features[0], expression);
    calculatorPreviewText.textContent = `Preview result: ${String(result)}`;
    setCalculatorError("");
  } catch (error) {
    calculatorPreviewText.textContent = "Preview unavailable.";
    setCalculatorError(error.message);
  }
}

function openCalculatorModal() {
  const activeLayer = getActiveEditableLayer();
  if (!activeLayer) {
    updateStatus("Choose an editable layer before using the field calculator.", true);
    return;
  }

  calculatorModal.hidden = false;
  renderCalculatorFieldList();
  renderCalculatorFunctionList();
  renderCalculatorTargetControls();
  updateCalculatorPreview();
}

function closeCalculatorModal() {
  calculatorModal.hidden = true;
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

    activeLayer.geojson.features.forEach((feature) => {
      feature.properties = feature.properties || {};
      feature.properties[targetField] = evaluateCalculatorExpression(feature, expression);
    });

    rebuildLayerFromData(activeLayer);
    renderAttributeTable();
    renderCalculatorFieldList();
    renderCalculatorTargetControls();
    updateCalculatorPreview();
    setCalculatorError("");
    updateStatus(`Field calculator updated ${targetField} for ${activeLayer.name}.`);
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

    try {
      const { data, sourceType } = await parseSpatialFile(file);
      const layerRecord = createLayerRecord(data, file.name, sourceType);
      addLayerRecord(layerRecord);
      updateStatus(`Loaded ${file.name} as a ${sourceType} layer.`);
    } catch (error) {
      console.error(error);
      updateStatus(`Could not load ${file.name}: ${error.message}`, true);
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
  return exportGeoJSONContent(layerRecord, sanitizeGeoJSONForExport(layerRecord.geojson), safeName, format);
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
  exportLayerLabel.textContent = `Export ${layerRecord.name} without changing the original file.`;
  exportFileNameInput.value = layerRecord.name.replace(/\.[^.]+$/, "") || "edited-layer";
  exportFormatSelect.value = "geojson";
  exportModal.hidden = false;
}

function closeExportModal() {
  exportModal.hidden = true;
  exportTargetLayerId = "";
}

function openLayerModal() {
  layerModal.hidden = false;
}

function closeLayerModal() {
  layerModal.hidden = true;
}

function openFieldModal() {
  if (!getActiveEditableLayer()) {
    updateStatus("Choose an editable layer before adding a field.", true);
    return;
  }

  fieldModal.hidden = false;
}

function closeFieldModal() {
  fieldModal.hidden = true;
}

function updateGlobalDropOverlay(visible) {
  globalDropOverlay.hidden = !visible;
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

fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  closeLayerModal();
});

document.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  updateGlobalDropOverlay(true);
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
  handleFiles(event.dataTransfer.files);
});

clearAllBtn.addEventListener("click", () => {
  loadedLayers.splice(0).forEach((layerRecord) => {
    map.removeLayer(layerRecord.layerGroup);
  });
  activeEditableLayerId = "";
  selectedFeatureContext = null;
  drawWorkspace.clearLayers();
  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateStatus("All layers cleared.");
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
calculatorFieldSearch.addEventListener("input", renderCalculatorFieldList);
calculatorExpression.addEventListener("input", updateCalculatorPreview);
calculatorPreviewBtn.addEventListener("click", updateCalculatorPreview);
calculatorApplyBtn.addEventListener("click", applyCalculatorToLayer);
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
});

map.on(L.Draw.Event.EDITED, () => {
  syncActiveLayerGeoJSONFromMap();
  updateStatus("Geometry updated. Node edits were saved into the editable layer.");
});

map.on(L.Draw.Event.DELETED, () => {
  syncActiveLayerGeoJSONFromMap();
  selectedFeatureContext = null;
  renderAttributeTable();
  updateStatus("Selected features removed from the editable layer.");
});

renderLayerList();
renderEditableLayerOptions();
renderAttributeTable();
initializeTheme();
