function collectFieldNamesFromFeatures(features) {
  const fieldSet = new Set();

  (features || []).forEach((feature) => {
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
  if (isLargeCsvLayerRecord(layerRecord)) {
    return layerRecord?.geojson?.features || [];
  }

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

function clearInterpolationOverlay(layerRecord) {
  if (!layerRecord?.interpolationOverlay) {
    return;
  }

  map.removeLayer(layerRecord.interpolationOverlay);
  layerRecord.interpolationOverlay = null;

  if (layerRecord.interpolationObjectUrl) {
    URL.revokeObjectURL(layerRecord.interpolationObjectUrl);
    layerRecord.interpolationObjectUrl = "";
  }
}

function samplePointGeometryCoordinates(feature) {
  if (!feature?.geometry) {
    return [];
  }

  if (feature.geometry.type === "Point") {
    return [feature.geometry.coordinates];
  }

  if (feature.geometry.type === "MultiPoint") {
    return feature.geometry.coordinates || [];
  }

  return [];
}

function getInterpolationPointFeatures(layerRecord) {
  if (!layerRecord) {
    return [];
  }

  return getFilteredFeatures(layerRecord).filter((feature) => {
    const geometryType = feature?.geometry?.type;
    return geometryType === "Point" || geometryType === "MultiPoint";
  });
}

function getInterpolationNumericFields(layerRecord) {
  return getLayerFieldNames(layerRecord).filter((field) => {
    const values = getInterpolationPointFeatures(layerRecord)
      .map((feature) => Number(feature?.properties?.[field]))
      .filter((value) => Number.isFinite(value));
    return values.length > 0;
  });
}

function isInterpolationEligible(layerRecord) {
  return getInterpolationPointFeatures(layerRecord).length > 1 && getInterpolationNumericFields(layerRecord).length > 0;
}

function getInterpolationSamples(layerRecord, field) {
  return getInterpolationPointFeatures(layerRecord)
    .flatMap((feature) => {
      const numericValue = Number(feature?.properties?.[field]);
      if (!Number.isFinite(numericValue)) {
        return [];
      }

      return samplePointGeometryCoordinates(feature).map((coordinates) => ({
        lon: coordinates[0],
        lat: coordinates[1],
        value: numericValue,
      }));
    })
    .filter((sample) => Number.isFinite(sample.lon) && Number.isFinite(sample.lat));
}

function getInterpolationColor(value, minValue, maxValue) {
  const denominator = maxValue - minValue || 1;
  const ratio = Math.min(Math.max((value - minValue) / denominator, 0), 1);

  if (ratio < 0.33) {
    return interpolateColor("#1a5fff", "#1db7a6", ratio / 0.33);
  }
  if (ratio < 0.66) {
    return interpolateColor("#1db7a6", "#ffcc66", (ratio - 0.33) / 0.33);
  }

  return interpolateColor("#ffcc66", "#ff6b6b", (ratio - 0.66) / 0.34);
}

function hexToRgba(color, alpha = 1) {
  const [red, green, blue] = parseHexColor(color);
  return [red, green, blue, Math.round(alpha * 255)];
}

function dataURLToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function createInterpolationOverlay(layerRecord, config) {
  const samples = getInterpolationSamples(layerRecord, config.field);
  if (samples.length < 2) {
    throw new Error("Interpolation needs at least two point samples with numeric values.");
  }

  const samplePoints = samples.map((sample) => {
    const projected = map.options.crs.project(L.latLng(sample.lat, sample.lon));
    return {
      x: projected.x,
      y: projected.y,
      value: sample.value,
    };
  });

  const radius = Math.max(Number(config.radiusMeters) || 0, 50);
  let cellSize = Math.max(Number(config.cellSizeMeters) || 0, 25);
  const power = Math.max(Number(config.power) || 2, 0.5);
  const opacity = Math.min(Math.max(Number(config.opacity) || 0.65, 0.1), 1);

  const xValues = samplePoints.map((sample) => sample.x);
  const yValues = samplePoints.map((sample) => sample.y);
  const minX = Math.min(...xValues) - radius;
  const maxX = Math.max(...xValues) + radius;
  const minY = Math.min(...yValues) - radius;
  const maxY = Math.max(...yValues) + radius;

  if (!config.bypassAutoResize) {
    const maxGridDimension = 220;
    const projectedWidth = Math.max(maxX - minX, cellSize);
    const projectedHeight = Math.max(maxY - minY, cellSize);
    const widthRatio = Math.ceil(projectedWidth / cellSize) / maxGridDimension;
    const heightRatio = Math.ceil(projectedHeight / cellSize) / maxGridDimension;
    if (widthRatio > 1 || heightRatio > 1) {
      cellSize *= Math.max(widthRatio, heightRatio);
    }
  }

  const projectedWidth = Math.max(maxX - minX, cellSize);
  const projectedHeight = Math.max(maxY - minY, cellSize);
  const width = Math.max(2, Math.ceil(projectedWidth / cellSize));
  const height = Math.max(2, Math.ceil(projectedHeight / cellSize));
  const values = [];
  let minValue = Infinity;
  let maxValue = -Infinity;

  for (let row = 0; row < height; row += 1) {
    const projectedY = maxY - row * cellSize;

    for (let column = 0; column < width; column += 1) {
      const projectedX = minX + column * cellSize;
      let weightedSum = 0;
      let weightTotal = 0;
      let coincidentValue = null;

      samplePoints.forEach((sample) => {
        const distance = Math.hypot(sample.x - projectedX, sample.y - projectedY);
        if (distance === 0) {
          coincidentValue = sample.value;
          return;
        }
        if (distance > radius) {
          return;
        }

        const weight = 1 / (distance ** power);
        weightedSum += sample.value * weight;
        weightTotal += weight;
      });

      const value = coincidentValue ?? (weightTotal ? weightedSum / weightTotal : null);
      values.push(value);

      if (Number.isFinite(value)) {
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
    }
  }

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    throw new Error("Interpolation could not create any cells within the influence radius.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(width, height);

  values.forEach((value, index) => {
    const pixelIndex = index * 4;
    if (!Number.isFinite(value)) {
      imageData.data[pixelIndex + 3] = 0;
      return;
    }

    const rgba = hexToRgba(getInterpolationColor(value, minValue, maxValue), opacity);
    imageData.data[pixelIndex] = rgba[0];
    imageData.data[pixelIndex + 1] = rgba[1];
    imageData.data[pixelIndex + 2] = rgba[2];
    imageData.data[pixelIndex + 3] = rgba[3];
  });

  context.putImageData(imageData, 0, 0);

  const southWest = map.options.crs.unproject(L.point(minX, minY));
  const northEast = map.options.crs.unproject(L.point(maxX, maxY));
  const bounds = L.latLngBounds([southWest.lat, southWest.lng], [northEast.lat, northEast.lng]);
  const objectUrl = URL.createObjectURL(dataURLToBlob(canvas.toDataURL("image/png")));
  const overlay = L.imageOverlay(objectUrl, bounds, {
    opacity,
    interactive: false,
    pane: "overlayPane",
  });

  return {
    overlay,
    objectUrl,
    summary: `${samples.length} points interpolated across ${width} × ${height} cells.`,
  };
}

function getInterpolationSourceFeatures(layerRecord, scope = "filtered") {
  if (!layerRecord) {
    return [];
  }

  if (isLargeCsvLayerRecord(layerRecord)) {
    return getCsvAnalysisGeoJSON(layerRecord).features;
  }

  return scope === "all" ? layerRecord.geojson.features : getFilteredFeatures(layerRecord);
}

function getInterpolationPointFeatures(layerRecord, scope = "filtered") {
  return getInterpolationSourceFeatures(layerRecord, scope).filter((feature) => {
    const geometryType = feature?.geometry?.type;
    return geometryType === "Point" || geometryType === "MultiPoint";
  });
}

function getInterpolationNumericFields(layerRecord, scope = "all") {
  return getLayerFieldNames(layerRecord).filter((field) => {
    const values = getInterpolationPointFeatures(layerRecord, scope)
      .map((feature) => Number(feature?.properties?.[field]))
      .filter((value) => Number.isFinite(value));
    return values.length > 0;
  });
}

function isInterpolationEligible(layerRecord) {
  return getInterpolationPointFeatures(layerRecord, "all").length > 1 && getInterpolationNumericFields(layerRecord, "all").length > 0;
}

function getInterpolationSamples(layerRecord, field, scope = "filtered") {
  return getInterpolationPointFeatures(layerRecord, scope)
    .flatMap((feature) => {
      const numericValue = Number(feature?.properties?.[field]);
      if (!Number.isFinite(numericValue)) {
        return [];
      }

      return samplePointGeometryCoordinates(feature).map((coordinates) => ({
        lon: coordinates[0],
        lat: coordinates[1],
        value: numericValue,
      }));
    })
    .filter((sample) => Number.isFinite(sample.lon) && Number.isFinite(sample.lat));
}

function getInterpolationColor(value, minValue, maxValue, rampName) {
  const denominator = maxValue - minValue || 1;
  const ratio = Math.min(Math.max((value - minValue) / denominator, 0), 1);
  return interpolateColorStops(getInterpolationRampStops(rampName), ratio);
}

function projectInterpolationSamples(samples) {
  return samples.map((sample) => {
    const projected = map.options.crs.project(L.latLng(sample.lat, sample.lon));
    return {
      x: projected.x,
      y: projected.y,
      value: sample.value,
    };
  });
}

function computeConvexHull(points) {
  if (points.length <= 3) {
    return points.map((point) => ({ x: point.x, y: point.y }));
  }

  const sorted = [...points].sort((left, right) =>
    left.x === right.x ? left.y - right.y : left.x - right.x
  );
  const cross = (origin, pointA, pointB) =>
    (pointA.x - origin.x) * (pointB.y - origin.y) - (pointA.y - origin.y) * (pointB.x - origin.x);

  const lower = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push({ x: point.x, y: point.y });
  });

  const upper = [];
  sorted.slice().reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push({ x: point.x, y: point.y });
  });

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function expandPolygon(points, paddingMeters) {
  if (!points.length || !Number.isFinite(paddingMeters) || paddingMeters <= 0) {
    return points;
  }

  const centroid = points.reduce(
    (sum, point) => {
      sum.x += point.x;
      sum.y += point.y;
      return sum;
    },
    { x: 0, y: 0 }
  );
  centroid.x /= points.length;
  centroid.y /= points.length;

  return points.map((point) => {
    const deltaX = point.x - centroid.x;
    const deltaY = point.y - centroid.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const scale = (distance + paddingMeters) / distance;
    return {
      x: centroid.x + deltaX * scale,
      y: centroid.y + deltaY * scale,
    };
  });
}

function planInterpolationGrid(projectedSamples, config) {
  const radius = Math.max(Number(config.radiusMeters) || 0, 50);
  let cellSize = Math.max(Number(config.cellSizeMeters) || 0, 25);
  const xValues = projectedSamples.map((sample) => sample.x);
  const yValues = projectedSamples.map((sample) => sample.y);
  const minX = Math.min(...xValues) - radius;
  const maxX = Math.max(...xValues) + radius;
  const minY = Math.min(...yValues) - radius;
  const maxY = Math.max(...yValues) + radius;
  const projectedWidth = Math.max(maxX - minX, cellSize);
  const projectedHeight = Math.max(maxY - minY, cellSize);
  if (!config.forceExactCellSize) {
    const widthRatio = Math.ceil(projectedWidth / cellSize) / INTERPOLATION_MAX_GRID_DIMENSION;
    const heightRatio = Math.ceil(projectedHeight / cellSize) / INTERPOLATION_MAX_GRID_DIMENSION;

    if (widthRatio > 1 || heightRatio > 1) {
      cellSize *= Math.max(widthRatio, heightRatio);
    }
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(2, Math.ceil(projectedWidth / cellSize)),
    height: Math.max(2, Math.ceil(projectedHeight / cellSize)),
    cellSize,
    clipPolygon: config.clipMode === "hull"
      ? expandPolygon(computeConvexHull(projectedSamples), radius * 0.25)
      : [],
  };
}

function computeInterpolationGridCore(payload) {
  function pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return true;
    }

    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
      const current = polygon[index];
      const previous = polygon[previousIndex];
      const intersects = current.y > point.y !== previous.y > point.y &&
        point.x < ((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y) || 1e-9) + current.x;
      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  const {
    samplePoints,
    minX,
    maxY,
    width,
    height,
    cellSize,
    radius,
    power,
    method,
    clipPolygon,
    minSamples,
  } = payload;
  const values = new Array(width * height).fill(null);
  let minValue = Infinity;
  let maxValue = -Infinity;
  let validCellCount = 0;
  let neighborAccumulation = 0;
  const gaussianSigma = radius / 3 || 1;

  for (let row = 0; row < height; row += 1) {
    const projectedY = maxY - row * cellSize;

    for (let column = 0; column < width; column += 1) {
      const projectedX = minX + column * cellSize;
      const point = { x: projectedX, y: projectedY };
      const flatIndex = row * width + column;

      if (clipPolygon?.length && !pointInPolygon(point, clipPolygon)) {
        continue;
      }

      let weightedSum = 0;
      let weightTotal = 0;
      let nearestDistance = Infinity;
      let nearestValue = null;
      let coincidentValue = null;
      let neighborCount = 0;

      for (let index = 0; index < samplePoints.length; index += 1) {
        const sample = samplePoints[index];
        const distance = Math.hypot(sample.x - projectedX, sample.y - projectedY);

        if (distance === 0) {
          coincidentValue = sample.value;
          neighborCount = Math.max(neighborCount, 1);
          break;
        }

        if (distance > radius) {
          continue;
        }

        neighborCount += 1;
        if (method === "nearest") {
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestValue = sample.value;
          }
          continue;
        }

        const weight = method === "gaussian"
          ? Math.exp(-(distance ** 2) / (2 * gaussianSigma ** 2))
          : 1 / (distance ** power);
        weightedSum += sample.value * weight;
        weightTotal += weight;
      }

      if (coincidentValue !== null) {
        values[flatIndex] = coincidentValue;
      } else if (neighborCount < minSamples) {
        values[flatIndex] = null;
      } else if (method === "nearest") {
        values[flatIndex] = nearestValue;
      } else {
        values[flatIndex] = weightTotal ? weightedSum / weightTotal : null;
      }

      if (Number.isFinite(values[flatIndex])) {
        validCellCount += 1;
        neighborAccumulation += neighborCount;
        minValue = Math.min(minValue, values[flatIndex]);
        maxValue = Math.max(maxValue, values[flatIndex]);
      }
    }
  }

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    throw new Error("Interpolation could not create any cells within the chosen radius and sample threshold.");
  }

  return {
    values,
    minValue,
    maxValue,
    validCellCount,
    averageNeighbors: validCellCount ? neighborAccumulation / validCellCount : 0,
  };
}

async function runInterpolationWorker(payload) {
  if (typeof Worker !== "function") {
    return computeInterpolationGridCore(payload);
  }

  const workerSource = `
    const computeInterpolationGridCore = ${computeInterpolationGridCore.toString()};
    self.onmessage = (event) => {
      try {
        self.postMessage({ ok: true, result: computeInterpolationGridCore(event.data) });
      } catch (error) {
        self.postMessage({ ok: false, error: error.message });
      }
    };
  `;
  const blob = new Blob([workerSource], { type: "application/javascript" });
  const workerUrl = URL.createObjectURL(blob);

  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl);
      worker.onmessage = (event) => {
        worker.terminate();
        if (event.data?.ok) {
          resolve(event.data.result);
          return;
        }
        reject(new Error(event.data?.error || "Interpolation worker failed."));
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || "Interpolation worker failed."));
      };
      worker.postMessage(payload);
    });
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

function paintInterpolationSurfaceToCanvas(gridPlan, result, config) {
  const canvas = document.createElement("canvas");
  canvas.width = gridPlan.width;
  canvas.height = gridPlan.height;
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(gridPlan.width, gridPlan.height);
  const opacity = Math.min(Math.max(Number(config.opacity) || 0.65, 0.1), 1);

  result.values.forEach((value, index) => {
    const pixelIndex = index * 4;
    if (!Number.isFinite(value)) {
      imageData.data[pixelIndex + 3] = 0;
      return;
    }

    const rgba = hexToRgba(
      getInterpolationColor(value, result.minValue, result.maxValue, config.ramp),
      opacity
    );
    imageData.data[pixelIndex] = rgba[0];
    imageData.data[pixelIndex + 1] = rgba[1];
    imageData.data[pixelIndex + 2] = rgba[2];
    imageData.data[pixelIndex + 3] = rgba[3];
  });

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function createRasterOverlayFromCanvas(gridPlan, canvas, opacity) {
  const southWest = map.options.crs.unproject(L.point(gridPlan.minX, gridPlan.minY));
  const northEast = map.options.crs.unproject(L.point(gridPlan.maxX, gridPlan.maxY));
  const bounds = L.latLngBounds([southWest.lat, southWest.lng], [northEast.lat, northEast.lng]);
  const objectUrl = URL.createObjectURL(dataURLToBlob(canvas.toDataURL("image/png")));
  const overlay = L.imageOverlay(objectUrl, bounds, {
    opacity,
    interactive: true,
    pane: "overlayPane",
  });

  return {
    overlay,
    objectUrl,
    bounds,
  };
}

function getInterpolationMethodLabel(method) {
  if (method === "nearest") {
    return "Nearest Neighbor";
  }
  if (method === "gaussian") {
    return "Gaussian Kernel";
  }
  return "Inverse Distance Weighted";
}

function buildInterpolationLayerName(layerRecord, config) {
  return `${layerRecord.name.replace(/\.[^.]+$/, "")} ${config.field} Surface`;
}

function summarizeInterpolationPlan(config, samples, gridPlan) {
  return {
    headline: `${samples.length} samples, ${(gridPlan.width * gridPlan.height).toLocaleString()} cells, ${getInterpolationMethodLabel(config.method)}.`,
    details: [
      { label: "Field", value: config.field || "n/a" },
      { label: "Scope", value: config.sampleScope === "all" ? "All point features" : "Visible filtered points" },
      { label: "Clip", value: config.clipMode === "hull" ? "Convex hull" : "Bounding box" },
      { label: "Cell size", value: `${formatCompactNumber(gridPlan.cellSize, 0)} m` },
      { label: "Radius", value: `${formatCompactNumber(config.radiusMeters, 0)} m` },
      { label: "Threshold", value: `${config.minSamples} nearby sample(s)` },
    ],
  };
}

function renderInterpolationSummary(summary, note = "") {
  if (!summary) {
    interpolationSummary.innerHTML = `
      <div class="small-note">Choose a numeric field to preview interpolation settings.</div>
      ${note ? `<div class="small-note">${escapeHtml(note)}</div>` : ""}
    `;
    return;
  }

  interpolationSummary.innerHTML = `
    <div><strong>${escapeHtml(summary.headline)}</strong></div>
    <div class="interpolation-summary-grid">
      ${summary.details
        .map(
          (item) => `
            <div class="interpolation-summary-item">
              <span class="interpolation-summary-label">${escapeHtml(item.label)}</span>
              <span class="interpolation-summary-value">${escapeHtml(item.value)}</span>
            </div>
          `
        )
        .join("")}
    </div>
    ${note ? `<div class="small-note">${escapeHtml(note)}</div>` : ""}
  `;
}

function readInterpolationConfigFromControls() {
  return {
    field: interpolationFieldSelect.value,
    method: interpolationMethodSelect.value,
    sampleScope: interpolationScopeSelect.value,
    clipMode: interpolationClipModeSelect.value,
    radiusMeters: Number(interpolationRadiusInput.value),
    cellSizeMeters: Number(interpolationCellSizeInput.value),
    power: Number(interpolationPowerInput.value),
    opacity: Number(interpolationOpacityInput.value),
    minSamples: Math.max(1, Number(interpolationMinSamplesInput.value) || 1),
    ramp: interpolationRampSelect.value,
  };
}

function updateInterpolationSummaryPreview() {
  const layerRecord = getLayerRecordById(activeInterpolationLayerId);
  if (!layerRecord) {
    renderInterpolationSummary(null);
    return;
  }

  const config = readInterpolationConfigFromControls();
  if (!config.field) {
    renderInterpolationSummary(null);
    return;
  }

  const samples = getInterpolationSamples(layerRecord, config.field, config.sampleScope);
  if (samples.length < 2) {
    renderInterpolationSummary(null, "At least two point samples with numeric values are needed.");
    return;
  }

  const gridPlan = planInterpolationGrid(projectInterpolationSamples(samples), config);
  const note = gridPlan.cellSize > config.cellSizeMeters
    ? `Cell size was increased to ${formatCompactNumber(gridPlan.cellSize, 0)} m to keep the raster responsive.`
    : "";
  renderInterpolationSummary(summarizeInterpolationPlan(config, samples, gridPlan), note);
}

function removeDerivedInterpolationLayers(sourceLayerId) {
  loadedLayers
    .filter((layerRecord) =>
      isRasterLayerRecord(layerRecord) &&
      layerRecord.sourceLayerId === sourceLayerId &&
      layerRecord.rasterMetadata?.layerType === "interpolation"
    )
    .map((layerRecord) => layerRecord.id)
    .forEach((layerId) => removeLayer(layerId));
}

function getHeatmapWeightFieldOptions(layerRecord, scope = "all") {
  return [
    { value: "__count__", label: "Point count" },
    ...getInterpolationNumericFields(layerRecord, scope).map((field) => ({
      value: field,
      label: field,
    })),
  ];
}

function getHeatmapValueLabel(field) {
  return field === "__count__" ? "Point count" : field;
}

function isHeatmapEligible(layerRecord) {
  return getInterpolationPointFeatures(layerRecord, "all").length > 1;
}

function getHeatmapSamples(layerRecord, field, scope = "filtered") {
  return getInterpolationPointFeatures(layerRecord, scope)
    .flatMap((feature) => {
      const weight = field === "__count__" ? 1 : Number(feature?.properties?.[field]);
      if (!Number.isFinite(weight) || weight <= 0) {
        return [];
      }

      return samplePointGeometryCoordinates(feature).map((coordinates) => ({
        lon: coordinates[0],
        lat: coordinates[1],
        value: weight,
      }));
    })
    .filter((sample) => Number.isFinite(sample.lon) && Number.isFinite(sample.lat));
}

function computeHeatmapGridCore(payload) {
  function pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return true;
    }

    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
      const current = polygon[index];
      const previous = polygon[previousIndex];
      const intersects = current.y > point.y !== previous.y > point.y &&
        point.x < ((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y) || 1e-9) + current.x;
      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  const {
    samplePoints,
    minX,
    maxY,
    width,
    height,
    cellSize,
    radius,
    clipPolygon,
    minSamples,
  } = payload;
  const values = new Array(width * height).fill(null);
  let minValue = Infinity;
  let maxValue = -Infinity;
  let validCellCount = 0;
  const sigma = radius / 3 || 1;

  for (let row = 0; row < height; row += 1) {
    const projectedY = maxY - row * cellSize;

    for (let column = 0; column < width; column += 1) {
      const projectedX = minX + column * cellSize;
      const point = { x: projectedX, y: projectedY };
      const flatIndex = row * width + column;

      if (clipPolygon?.length && !pointInPolygon(point, clipPolygon)) {
        continue;
      }

      let sum = 0;
      let neighborCount = 0;

      for (let index = 0; index < samplePoints.length; index += 1) {
        const sample = samplePoints[index];
        const distance = Math.hypot(sample.x - projectedX, sample.y - projectedY);
        if (distance > radius) {
          continue;
        }

        neighborCount += 1;
        const weight = Math.exp(-(distance ** 2) / (2 * sigma ** 2));
        sum += sample.value * weight;
      }

      if (neighborCount < minSamples || !Number.isFinite(sum) || sum <= 0) {
        values[flatIndex] = null;
        continue;
      }

      values[flatIndex] = sum;
      validCellCount += 1;
      minValue = Math.min(minValue, sum);
      maxValue = Math.max(maxValue, sum);
    }
  }

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    throw new Error("Heatmap could not create any cells within the chosen radius and sample threshold.");
  }

  return {
    values,
    minValue,
    maxValue,
    validCellCount,
  };
}

async function runHeatmapWorker(payload) {
  if (typeof Worker !== "function") {
    return computeHeatmapGridCore(payload);
  }

  const workerSource = `
    const computeHeatmapGridCore = ${computeHeatmapGridCore.toString()};
    self.onmessage = (event) => {
      try {
        self.postMessage({ ok: true, result: computeHeatmapGridCore(event.data) });
      } catch (error) {
        self.postMessage({ ok: false, error: error.message });
      }
    };
  `;
  const blob = new Blob([workerSource], { type: "application/javascript" });
  const workerUrl = URL.createObjectURL(blob);

  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl);
      worker.onmessage = (event) => {
        worker.terminate();
        if (event.data?.ok) {
          resolve(event.data.result);
          return;
        }
        reject(new Error(event.data?.error || "Heatmap worker failed."));
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || "Heatmap worker failed."));
      };
      worker.postMessage(payload);
    });
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

function paintHeatmapSurfaceToCanvas(gridPlan, result, config) {
  const canvas = document.createElement("canvas");
  canvas.width = gridPlan.width;
  canvas.height = gridPlan.height;
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(gridPlan.width, gridPlan.height);
  const opacity = Math.min(Math.max(Number(config.opacity) || 0.75, 0.1), 1);
  const exponent = Math.max(Number(config.intensity) || 1.2, 0.2);

  result.values.forEach((value, index) => {
    const pixelIndex = index * 4;
    if (!Number.isFinite(value)) {
      imageData.data[pixelIndex + 3] = 0;
      return;
    }

    const denominator = result.maxValue - result.minValue || 1;
    const ratio = Math.min(Math.max((value - result.minValue) / denominator, 0), 1);
    const contrastRatio = ratio ** (1 / exponent);
    const rgba = hexToRgba(
      interpolateColorStops(getInterpolationRampStops(config.ramp), contrastRatio),
      opacity
    );
    imageData.data[pixelIndex] = rgba[0];
    imageData.data[pixelIndex + 1] = rgba[1];
    imageData.data[pixelIndex + 2] = rgba[2];
    imageData.data[pixelIndex + 3] = rgba[3];
  });

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function readHeatmapConfigFromControls() {
  return {
    field: heatmapFieldSelect.value,
    sampleScope: heatmapScopeSelect.value,
    clipMode: heatmapClipModeSelect.value,
    radiusMeters: Number(heatmapRadiusInput.value),
    cellSizeMeters: Number(heatmapCellSizeInput.value),
    opacity: Number(heatmapOpacityInput.value),
    minSamples: Math.max(1, Number(heatmapMinSamplesInput.value) || 1),
    intensity: Math.max(0.2, Number(heatmapIntensityInput.value) || 1.2),
    ramp: heatmapRampSelect.value,
    bypassAutoResize: document.getElementById("heatmap-exact-cellsize")?.checked ?? false,
  };
}

function renderHeatmapSummary(summary, note = "") {
  if (!summary) {
    heatmapSummary.innerHTML = `
      <div class="small-note">Choose a weight field to preview heatmap settings.</div>
      ${note ? `<div class="small-note">${escapeHtml(note)}</div>` : ""}
    `;
    return;
  }

  heatmapSummary.innerHTML = `
    <div><strong>${escapeHtml(summary.headline)}</strong></div>
    <div class="interpolation-summary-grid">
      ${summary.details
        .map(
          (item) => `
            <div class="interpolation-summary-item">
              <span class="interpolation-summary-label">${escapeHtml(item.label)}</span>
              <span class="interpolation-summary-value">${escapeHtml(item.value)}</span>
            </div>
          `
        )
        .join("")}
    </div>
    ${note ? `<div class="small-note">${escapeHtml(note)}</div>` : ""}
  `;
}

function updateHeatmapSummaryPreview() {
  const layerRecord = getLayerRecordById(activeHeatmapLayerId);
  if (!layerRecord) {
    renderHeatmapSummary(null);
    return;
  }

  const config = readHeatmapConfigFromControls();
  const samples = getHeatmapSamples(layerRecord, config.field, config.sampleScope);
  if (samples.length < 2) {
    renderHeatmapSummary(null, "At least two point samples are needed for a heatmap.");
    return;
  }

  const projectedSamples = projectInterpolationSamples(samples);
  const gridPlan = config.bypassAutoResize
    ? planInterpolationGrid(projectedSamples, { ...config, forceExactCellSize: true })
    : planInterpolationGrid(projectedSamples, config);
  const note = gridPlan.cellSize > config.cellSizeMeters
    ? `Cell size was increased to ${formatCompactNumber(gridPlan.cellSize, 0)} m to keep the raster responsive.`
    : "";
  renderHeatmapSummary(
    {
      headline: `${samples.length} samples, ${(gridPlan.width * gridPlan.height).toLocaleString()} cells, Heatmap Density.`,
      details: [
        { label: "Weight", value: getHeatmapValueLabel(config.field) },
        { label: "Scope", value: config.sampleScope === "all" ? "All point features" : "Visible filtered points" },
        { label: "Clip", value: config.clipMode === "hull" ? "Convex hull" : "Bounding box" },
        { label: "Cell size", value: `${formatCompactNumber(gridPlan.cellSize, 0)} m` },
        { label: "Radius", value: `${formatCompactNumber(config.radiusMeters, 0)} m` },
        { label: "Intensity", value: formatCompactNumber(config.intensity, 2) },
      ],
    },
    note
  );
}

function removeDerivedHeatmapLayers(sourceLayerId) {
  loadedLayers
    .filter((layerRecord) =>
      isRasterLayerRecord(layerRecord) &&
      layerRecord.sourceLayerId === sourceLayerId &&
      layerRecord.rasterMetadata?.layerType === "heatmap"
    )
    .map((layerRecord) => layerRecord.id)
    .forEach((layerId) => removeLayer(layerId));
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

function isRasterLayerRecord(layerRecord) {
  return layerRecord?.kind === "raster";
}

function isVectorLayerRecord(layerRecord) {
  return Boolean(layerRecord) && !isRasterLayerRecord(layerRecord);
}

function disposeLayerResources(layerRecord) {
  if (!layerRecord) {
    return;
  }

  clearInterpolationOverlay(layerRecord);

  if (layerRecord.rasterObjectUrl) {
    URL.revokeObjectURL(layerRecord.rasterObjectUrl);
    layerRecord.rasterObjectUrl = "";
  }
}

function buildInterpolationPopupHtml(layerRecord) {
  const metadata = layerRecord?.rasterMetadata;
  if (!metadata) {
    return "<strong>Raster surface</strong>";
  }

  return [
    `<strong>${escapeHtml(layerRecord.name)}</strong>`,
    `Field: ${escapeHtml(metadata.fieldLabel || metadata.field)}`,
    `Method: ${escapeHtml(metadata.methodLabel)}`,
    `Samples: ${escapeHtml(String(metadata.sampleCount))}`,
    `Range: ${escapeHtml(formatCompactNumber(metadata.minValue))} to ${escapeHtml(formatCompactNumber(metadata.maxValue))}`,
    `Grid: ${escapeHtml(String(metadata.width))} x ${escapeHtml(String(metadata.height))}`,
  ].join("<br>");
}

function updateInterpolationLegend() {
  const container = interpolationLegendControl.getContainer();
  if (!container) {
    return;
  }

  const visibleRasterLayer = [...loadedLayers]
    .reverse()
    .find((layerRecord) => isRasterLayerRecord(layerRecord) && layerRecord.isVisible !== false && layerRecord.rasterMetadata);

  if (!visibleRasterLayer) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const metadata = visibleRasterLayer.rasterMetadata;
  const rampStops = getInterpolationRampStops(metadata.ramp);
  const gradient = `linear-gradient(90deg, ${rampStops.join(", ")})`;
  container.hidden = false;
  container.innerHTML = `
    <div class="map-legend-title">${escapeHtml(metadata.fieldLabel || metadata.field)}</div>
    <div class="map-legend-subtitle">${escapeHtml(metadata.methodLabel)} from ${escapeHtml(metadata.sourceLayerName)}</div>
    <div class="map-legend-gradient" style="background:${gradient}"></div>
    <div class="map-legend-range">
      <span>${escapeHtml(formatCompactNumber(metadata.minValue))}</span>
      <span>${escapeHtml(formatCompactNumber(metadata.maxValue))}</span>
    </div>
  `;
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
  if (isRasterLayerRecord(layerRecord)) {
    if (layerRecord.isVisible !== false) {
      layerRecord.layerGroup.addTo(map);
    } else {
      map.removeLayer(layerRecord.layerGroup);
    }
    updateInterpolationLegend();
    return;
  }

  map.removeLayer(layerRecord.layerGroup);
  if (layerRecord.interpolationOverlay) {
    map.removeLayer(layerRecord.interpolationOverlay);
  }

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
    if (layerRecord.interpolationOverlay) {
      layerRecord.interpolationOverlay.addTo(map);
    }
    layerRecord.layerGroup.addTo(map);
  }

  if (isLargeCsvLayerRecord(layerRecord)) {
    layerRecord.featureCount = Number(layerRecord.datasetStats?.pointCount) || layerRecord.featureCount || 0;
    layerRecord.visibleFeatureCount = layerRecord.featureCount;
  } else {
    layerRecord.featureCount = layerRecord.geojson.features.length;
    layerRecord.visibleFeatureCount = filteredFeatures.length;
  }

  if (layerRecord.id === activeEditableLayerId) {
    syncEditableWorkspace();
  }

  renderLayerList();
  updateInterpolationLegend();
}

function createLayerRecord(geojson, fileName, sourceType) {
  const normalizedGeojson = normalizeGeoJSON(geojson);
  const color = palette[layerCount % palette.length];
  layerCount += 1;

  const layerRecord = {
    id: crypto.randomUUID(),
    kind: "vector",
    name: fileName,
    sourceType,
    color,
    isVisible: true,
    geojson: normalizedGeojson,
    fields: collectFieldNamesFromGeoJSON(normalizedGeojson),
    styleConfig: createDefaultStyleConfig(color),
    interpolationConfig: createDefaultInterpolationConfig(),
    heatmapConfig: createDefaultHeatmapConfig(),
    filterConfig: createDefaultFilterConfig(),
    interpolationOverlay: null,
    interpolationObjectUrl: "",
    layerGroup: L.featureGroup(),
    featureCount: 0,
    visibleFeatureCount: 0,
  };

  rebuildLayerFromData(layerRecord);
  return layerRecord;
}

function createLargeCsvLayerRecord(csvDataset, fileName, sourceType) {
  const color = palette[layerCount % palette.length];
  layerCount += 1;
  const displayFeatures = csvDataset.previewMode === "grid"
    ? csvDataset.gridFeatures
    : csvDataset.previewFeatures;
  const previewGeojson = normalizeGeoJSON(createFeatureCollection(displayFeatures));
  const analysisGeojson = normalizeGeoJSON(createFeatureCollection(csvDataset.analysisFeatures));
  const fields = Array.from(new Set([
    ...collectFieldNamesFromFeatures(csvDataset.previewFeatures),
    ...collectFieldNamesFromFeatures(csvDataset.gridFeatures),
    ...(csvDataset.fields || []),
  ])).sort();

  const layerRecord = {
    id: crypto.randomUUID(),
    kind: "vector",
    name: fileName,
    sourceType,
    color,
    isVisible: true,
    geojson: previewGeojson,
    analysisGeojson,
    fields,
    styleConfig: createDefaultStyleConfig(color),
    interpolationConfig: createDefaultInterpolationConfig(),
    heatmapConfig: createDefaultHeatmapConfig(),
    filterConfig: createDefaultFilterConfig(),
    interpolationOverlay: null,
    interpolationObjectUrl: "",
    layerGroup: L.featureGroup(),
    featureCount: csvDataset.pointCount,
    visibleFeatureCount: csvDataset.pointCount,
    largeCsvMode: csvDataset.previewMode,
    datasetStats: {
      rowCount: csvDataset.rowCount,
      pointCount: csvDataset.pointCount,
      skippedRows: csvDataset.skippedRows,
      invalidRows: csvDataset.invalidRows,
      previewFeatureCount: displayFeatures.length,
      analysisSampleCount: csvDataset.analysisFeatures.length,
      numericFieldSummaries: csvDataset.numericFieldSummaries || {},
    },
    exportMode: csvDataset.previewMode === "grid" ? "grid-preview" : "sample-preview",
  };

  rebuildLayerFromData(layerRecord);
  return layerRecord;
}

function createRasterLayerRecord(sourceLayerRecord, rasterResult) {
  const layerGroup = L.featureGroup();
  rasterResult.overlay.bindPopup(buildInterpolationPopupHtml({
    name: rasterResult.name,
    rasterMetadata: rasterResult.metadata,
  }));
  layerGroup.addLayer(rasterResult.overlay);

  return {
    id: crypto.randomUUID(),
    kind: "raster",
    name: rasterResult.name,
    sourceType: `Interpolation Raster (${rasterResult.metadata?.methodLabel || "Surface"})`,
    color: sourceLayerRecord?.color || "#43c2ff",
    isVisible: true,
    geojson: {
      type: "FeatureCollection",
      features: [],
    },
    fields: [],
    styleConfig: createDefaultStyleConfig(sourceLayerRecord?.color || "#43c2ff"),
    interpolationConfig: null,
    heatmapConfig: null,
    filterConfig: createDefaultFilterConfig(),
    interpolationOverlay: null,
    interpolationObjectUrl: "",
    layerGroup,
    featureCount: 1,
    visibleFeatureCount: 1,
    rasterObjectUrl: rasterResult.objectUrl,
    rasterMetadata: rasterResult.metadata,
    sourceLayerId: sourceLayerRecord?.id || "",
    isDerived: true,
  };
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
    return {
      data: await parseCsvInWorker(file),
      sourceType: "CSV",
      importKind: "csv-dataset",
    };
  }

  throw new Error(`Unsupported file type: .${extension || "unknown"}`);
}

function parseCsvAsGeoJSON(csvText) {
  const rows = parseCsvRows(csvText).filter((row) => row.some((value) => value.trim() !== ""));

  if (rows.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const headers = rows[0].map((value) => sanitizeCsvHeader(value));
  const latitudeIndex = findHeaderIndex(headers, [
    "latitude",
    "lat",
    "y",
    "y_coord",
    "ycoord",
    "lat_dd",
    "latitude_dd",
  ]);
  const longitudeIndex = findHeaderIndex(headers, [
    "longitude",
    "long",
    "lon",
    "lng",
    "x",
    "x_coord",
    "xcoord",
    "lon_dd",
    "longitude_dd",
  ]);

  if (latitudeIndex === -1 || longitudeIndex === -1) {
    throw new Error("CSV must contain latitude and longitude columns.");
  }

  const features = rows.slice(1).flatMap((row, index) => {
    const values = headers.map((_, headerIndex) => row[headerIndex] ?? "");
    const latitudeValue = String(values[latitudeIndex] ?? "").trim();
    const longitudeValue = String(values[longitudeIndex] ?? "").trim();

    if (!latitudeValue && !longitudeValue) {
      return [];
    }

    const lat = Number.parseFloat(latitudeValue);
    const lon = Number.parseFloat(longitudeValue);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`Invalid latitude/longitude in row ${index + 2}.`);
    }

    const properties = {};
    headers.forEach((header, headerIndex) => {
      if (headerIndex !== latitudeIndex && headerIndex !== longitudeIndex) {
        properties[header || `column_${headerIndex + 1}`] = values[headerIndex] ?? "";
      }
    });

    return [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lon, lat],
        },
        properties,
      },
    ];
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

function buildCsvPreviewGeoJSON(csvDataset) {
  if (!csvDataset || typeof csvDataset !== "object") {
    return createFeatureCollection([]);
  }

  return createFeatureCollection(
    csvDataset.previewMode === "grid" ? csvDataset.gridFeatures : csvDataset.previewFeatures
  );
}

function getLargeCsvWorkerSource() {
  return `
    const CSV_FULL_VECTOR_THRESHOLD = ${CSV_FULL_VECTOR_THRESHOLD};
    const CSV_SAMPLE_MODE_THRESHOLD = ${CSV_SAMPLE_MODE_THRESHOLD};
    const CSV_ANALYSIS_SAMPLE_LIMIT = ${CSV_ANALYSIS_SAMPLE_LIMIT};
    const CSV_PREVIEW_SAMPLE_LIMIT = ${CSV_PREVIEW_SAMPLE_LIMIT};
    const CSV_GRID_TILE_ZOOM = ${CSV_GRID_TILE_ZOOM};
    const CSV_CHUNK_SIZE_BYTES = ${CSV_CHUNK_SIZE_BYTES};
    const LATITUDE_HEADERS = ["latitude", "lat", "y", "y_coord", "ycoord", "lat_dd", "latitude_dd"];
    const LONGITUDE_HEADERS = ["longitude", "long", "lon", "lng", "x", "x_coord", "xcoord", "lon_dd", "longitude_dd"];

    function sanitizeCsvHeader(value) {
      return String(value ?? "").replace(/^\\uFEFF/, "").trim().toLowerCase().replace(/\\s+/g, "_");
    }

    function findHeaderIndex(headers, candidates) {
      return headers.findIndex((header) => candidates.includes(header.trim().toLowerCase()));
    }

    function detectCsvDelimiter(csvText) {
      const previewLine = String(csvText ?? "").split(/\\r\\n|\\n|\\r/).find((line) => line.trim() !== "");
      if (!previewLine) {
        return ",";
      }

      const candidates = [",", ";", "\\t", "|"];
      let inQuotes = false;
      const counts = new Map(candidates.map((candidate) => [candidate, 0]));

      for (let index = 0; index < previewLine.length; index += 1) {
        const char = previewLine[index];
        const nextChar = previewLine[index + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }

        if (!inQuotes && counts.has(char)) {
          counts.set(char, counts.get(char) + 1);
        }
      }

      let bestDelimiter = ",";
      let bestCount = -1;
      candidates.forEach((candidate) => {
        const count = counts.get(candidate);
        if (count > bestCount) {
          bestDelimiter = candidate;
          bestCount = count;
        }
      });

      return bestCount > 0 ? bestDelimiter : ",";
    }

    function tileXFromLon(lon, zoom) {
      return Math.floor(((lon + 180) / 360) * 2 ** zoom);
    }

    function tileYFromLat(lat, zoom) {
      const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
      const radians = (clampedLat * Math.PI) / 180;
      return Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom);
    }

    function tileBounds(tileX, tileY, zoom) {
      const scale = 2 ** zoom;
      const west = (tileX / scale) * 360 - 180;
      const east = ((tileX + 1) / scale) * 360 - 180;
      const northRadians = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / scale)));
      const southRadians = Math.atan(Math.sinh(Math.PI * (1 - (2 * (tileY + 1)) / scale)));
      return {
        west,
        east,
        north: (northRadians * 180) / Math.PI,
        south: (southRadians * 180) / Math.PI,
      };
    }

    function pushReservoirItem(bucket, limit, item, seenCount) {
      if (bucket.length < limit) {
        bucket.push(item);
        return;
      }

      const replaceIndex = Math.floor(Math.random() * seenCount);
      if (replaceIndex < limit) {
        bucket[replaceIndex] = item;
      }
    }

    self.onmessage = async (event) => {
      try {
        const file = event.data?.file;
        if (!file) {
          throw new Error("CSV file payload was missing.");
        }

        const firstChunk = await file.slice(0, Math.min(CSV_CHUNK_SIZE_BYTES, file.size || CSV_CHUNK_SIZE_BYTES)).text();
        const delimiter = detectCsvDelimiter(firstChunk);
        let headers = null;
        let latitudeIndex = -1;
        let longitudeIndex = -1;
        let rowCount = 0;
        let pointCount = 0;
        let skippedRows = 0;
        let invalidRows = 0;
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLon = Infinity;
        let maxLon = -Infinity;
        let currentRow = [];
        let currentValue = "";
        let inQuotes = false;
        const previewFeatures = [];
        const vectorFeatures = [];
        const analysisFeatures = [];
        const gridBins = new Map();
        const numericFieldSummaries = new Map();

        function flushRow() {
          const row = currentRow.concat([currentValue]);
          currentRow = [];
          currentValue = "";

          if (!row.some((value) => String(value ?? "").trim() !== "")) {
            return;
          }

          if (!headers) {
            headers = row.map((value) => sanitizeCsvHeader(value));
            latitudeIndex = findHeaderIndex(headers, LATITUDE_HEADERS);
            longitudeIndex = findHeaderIndex(headers, LONGITUDE_HEADERS);
            if (latitudeIndex === -1 || longitudeIndex === -1) {
              throw new Error("CSV must contain latitude and longitude columns.");
            }
            return;
          }

          rowCount += 1;
          const values = headers.map((_, index) => String(row[index] ?? ""));
          const latitudeValue = String(values[latitudeIndex] ?? "").trim();
          const longitudeValue = String(values[longitudeIndex] ?? "").trim();

          if (!latitudeValue && !longitudeValue) {
            skippedRows += 1;
            return;
          }

          const lat = Number.parseFloat(latitudeValue);
          const lon = Number.parseFloat(longitudeValue);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            invalidRows += 1;
            return;
          }

          const properties = {};
          headers.forEach((header, headerIndex) => {
            if (headerIndex === latitudeIndex || headerIndex === longitudeIndex) {
              return;
            }

            const key = header || "column_" + (headerIndex + 1);
            const rawValue = values[headerIndex] ?? "";
            properties[key] = rawValue;
            const numericValue = Number.parseFloat(String(rawValue).trim());
            if (String(rawValue).trim() !== "" && Number.isFinite(numericValue)) {
              const summary = numericFieldSummaries.get(key) || { min: Infinity, max: -Infinity, count: 0 };
              summary.min = Math.min(summary.min, numericValue);
              summary.max = Math.max(summary.max, numericValue);
              summary.count += 1;
              numericFieldSummaries.set(key, summary);
            }
          });

          pointCount += 1;
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);

          const feature = {
            type: "Feature",
            id: "csv-point-" + pointCount,
            geometry: {
              type: "Point",
              coordinates: [lon, lat],
            },
            properties,
          };

          if (pointCount <= CSV_FULL_VECTOR_THRESHOLD) {
            vectorFeatures.push(feature);
          }

          pushReservoirItem(previewFeatures, CSV_PREVIEW_SAMPLE_LIMIT, feature, pointCount);
          pushReservoirItem(analysisFeatures, CSV_ANALYSIS_SAMPLE_LIMIT, feature, pointCount);

          const tileX = tileXFromLon(lon, CSV_GRID_TILE_ZOOM);
          const tileY = tileYFromLat(lat, CSV_GRID_TILE_ZOOM);
          const tileKey = tileX + ":" + tileY;
          const bin = gridBins.get(tileKey) || { count: 0, sumLat: 0, sumLon: 0 };
          bin.count += 1;
          bin.sumLat += lat;
          bin.sumLon += lon;
          gridBins.set(tileKey, bin);
        }

        for (let offset = 0; offset < file.size; offset += CSV_CHUNK_SIZE_BYTES) {
          const chunkText = await file.slice(offset, Math.min(file.size, offset + CSV_CHUNK_SIZE_BYTES)).text();

          for (let index = 0; index < chunkText.length; index += 1) {
            const char = chunkText[index];
            const nextChar = chunkText[index + 1];

            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                currentValue += '"';
                index += 1;
              } else {
                inQuotes = !inQuotes;
              }
              continue;
            }

            if (char === delimiter && !inQuotes) {
              currentRow.push(currentValue);
              currentValue = "";
              continue;
            }

            if ((char === "\\n" || char === "\\r") && !inQuotes) {
              if (char === "\\r" && nextChar === "\\n") {
                index += 1;
              }
              flushRow();
              continue;
            }

            currentValue += char;
          }

          self.postMessage({
            type: "progress",
            percent: Math.min(99, Math.round((Math.min(file.size, offset + CSV_CHUNK_SIZE_BYTES) / Math.max(file.size || 1, 1)) * 100)),
            rows: rowCount,
            points: pointCount,
          });
        }

        if (inQuotes) {
          throw new Error("CSV contains an unmatched quote.");
        }

        if (currentValue.length > 0 || currentRow.length > 0) {
          flushRow();
        }

        const previewMode = pointCount <= CSV_FULL_VECTOR_THRESHOLD
          ? "full"
          : pointCount <= CSV_SAMPLE_MODE_THRESHOLD
            ? "sample"
            : "grid";

        const gridFeatures = Array.from(gridBins.entries()).map(([tileKey, bin]) => {
          const [tileX, tileY] = tileKey.split(":").map((value) => Number.parseInt(value, 10));
          const bounds = tileBounds(tileX, tileY, CSV_GRID_TILE_ZOOM);
          return {
            type: "Feature",
            id: "grid-" + tileKey,
            geometry: {
              type: "Polygon",
              coordinates: [[
                [bounds.west, bounds.south],
                [bounds.east, bounds.south],
                [bounds.east, bounds.north],
                [bounds.west, bounds.north],
                [bounds.west, bounds.south],
              ]],
            },
            properties: {
              point_count: bin.count,
              sample_lat: bin.sumLat / bin.count,
              sample_lon: bin.sumLon / bin.count,
            },
          };
        });

        self.postMessage({
          type: "result",
          rowCount,
          pointCount,
          skippedRows,
          invalidRows,
          fields: (headers || []).filter((_, index) => index !== latitudeIndex && index !== longitudeIndex),
          bounds: Number.isFinite(minLat) && Number.isFinite(minLon) && Number.isFinite(maxLat) && Number.isFinite(maxLon)
            ? { minLat, minLon, maxLat, maxLon }
            : null,
          previewMode,
          previewFeatures: previewMode === "full" ? vectorFeatures : previewFeatures,
          analysisFeatures,
          gridFeatures,
          numericFieldSummaries: Object.fromEntries(
            Array.from(numericFieldSummaries.entries()).map(([key, value]) => [key, value])
          ),
        });
      } catch (error) {
        self.postMessage({
          type: "error",
          error: error?.message || "CSV worker failed.",
        });
      }
    };
  `;
}

function parseCsvInWorker(file) {
  const workerSource = getLargeCsvWorkerSource();
  const blob = new Blob([workerSource], { type: "application/javascript" });
  const workerUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);

    worker.onmessage = (event) => {
      const payload = event.data || {};

      if (payload.type === "progress") {
        const meta = `${formatCompactNumber(payload.rows || 0, 0)} rows scanned, ${formatCompactNumber(payload.points || 0, 0)} valid points`;
        updateImportProgress(`Parsing ${file.name}`, payload.percent || 0, meta);
        return;
      }

      worker.terminate();
      URL.revokeObjectURL(workerUrl);

      if (payload.type === "result") {
        updateImportProgress(`Finishing ${file.name}`, 100, `${formatCompactNumber(payload.pointCount || 0, 0)} points ready`);
        resolve(payload);
        return;
      }

      reject(new Error(payload.error || "CSV worker failed."));
    };

    worker.onerror = (event) => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      reject(new Error(event.message || "CSV worker failed."));
    };

    worker.postMessage({ file });
  });
}

function parseCsvRows(csvText) {
  const normalizedText = String(csvText ?? "").replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(normalizedText);
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
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

function detectCsvDelimiter(csvText) {
  const previewLine = String(csvText ?? "")
    .split(/\r\n|\n|\r/)
    .find((line) => line.trim() !== "");

  if (!previewLine) {
    return ",";
  }

  const candidates = [",", ";", "\t", "|"];
  let inQuotes = false;
  const counts = new Map(candidates.map((candidate) => [candidate, 0]));

  for (let index = 0; index < previewLine.length; index += 1) {
    const char = previewLine[index];
    const nextChar = previewLine[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && counts.has(char)) {
      counts.set(char, counts.get(char) + 1);
    }
  }

  let bestDelimiter = ",";
  let bestCount = -1;
  candidates.forEach((candidate) => {
    const count = counts.get(candidate);
    if (count > bestCount) {
      bestDelimiter = candidate;
      bestCount = count;
    }
  });

  return bestCount > 0 ? bestDelimiter : ",";
}

function sanitizeCsvHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function findHeaderIndex(headers, candidates) {
  return headers.findIndex((header) =>
    candidates.includes(header.trim().toLowerCase())
  );
}

function addLayerRecord(layerRecord) {
  loadedLayers.push(layerRecord);

  if (layerRecord.isVisible) {
    layerRecord.layerGroup.addTo(map);
  }

  const bounds = getBoundsSafe(layerRecord.layerGroup);
  if (bounds) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }

  if (!activeEditableLayerId && isEditableLayerRecord(layerRecord)) {
    activeEditableLayerId = layerRecord.id;
    syncEditableWorkspace();
  }

  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateInterpolationLegend();
  if (typeof onProjectDirty === "function") onProjectDirty();
}

function removeLayer(id) {
  const index = loadedLayers.findIndex((item) => item.id === id);
  if (index === -1) {
    return;
  }

  const layerRecord = loadedLayers[index];
  disposeLayerResources(layerRecord);
  map.removeLayer(layerRecord.layerGroup);
  loadedLayers.splice(index, 1);

  if (activeEditableLayerId === id) {
    activeEditableLayerId = loadedLayers.find((item) => isEditableLayerRecord(item))?.id || "";
    selectedFeatureContext = null;
    syncEditableWorkspace();
  }

  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateInterpolationLegend();
  updateStatus("Layer removed.");
  if (typeof onProjectDirty === "function") onProjectDirty();
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
    if (activeEditableLayerId === id && isVectorLayerRecord(layerRecord)) {
      activeEditableLayerId = "";
      selectedFeatureContext = null;
      syncEditableWorkspace();
      renderEditableLayerOptions();
      renderAttributeTable();
      renderLayerList();
      updateStatus("Editable layer was hidden. Select a visible layer to continue editing.");
    }
  }

  updateInterpolationLegend();
}

let layerContextMenuElement = null;

function closeLayerContextMenu() {
  if (!layerContextMenuElement) {
    return;
  }

  layerContextMenuElement.hidden = true;
  layerContextMenuElement.dataset.layerId = "";
  layerContextMenuElement.innerHTML = "";
}

function ensureLayerContextMenu() {
  if (layerContextMenuElement) {
    return layerContextMenuElement;
  }

  layerContextMenuElement = document.createElement("div");
  layerContextMenuElement.className = "layer-context-menu";
  layerContextMenuElement.hidden = true;
  document.body.appendChild(layerContextMenuElement);
  return layerContextMenuElement;
}

function runLayerCardAction(layerRecord, actionName, closeDetailsMenu = null) {
  if (!layerRecord || !actionName) {
    return;
  }

  if (typeof closeDetailsMenu === "function") {
    closeDetailsMenu();
  }
  closeLayerContextMenu();

  if (actionName === "zoom") {
    zoomToLayer(layerRecord.id);
    return;
  }

  if (actionName === "toggle-visibility") {
    toggleLayer(layerRecord.id, layerRecord.isVisible === false);
    return;
  }

  if (actionName === "toggle-edit" && isEditableLayerRecord(layerRecord)) {
    const isCurrentEditable = layerRecord.id === activeEditableLayerId;
    setActiveEditableLayer(isCurrentEditable ? "" : layerRecord.id);
    return;
  }

  if (actionName === "style" && isVectorLayerRecord(layerRecord)) {
    openSymbologyModal(layerRecord.id);
    return;
  }

  if (actionName === "interpolate" && isVectorLayerRecord(layerRecord) && isInterpolationEligible(layerRecord)) {
    openInterpolationModal(layerRecord.id);
    return;
  }

  if (actionName === "heatmap" && isVectorLayerRecord(layerRecord) && isHeatmapEligible(layerRecord)) {
    openHeatmapModal(layerRecord.id);
    return;
  }

  if (actionName === "filter" && isEditableLayerRecord(layerRecord)) {
    openFilterModal(layerRecord.id);
    return;
  }

  if (actionName === "export" && isVectorLayerRecord(layerRecord)) {
    openExportModal(layerRecord.id);
    return;
  }

  if (actionName === "remove") {
    removeLayer(layerRecord.id);
  }
}

function openLayerContextMenu(event, layerRecord) {
  if (!layerRecord) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const canEdit = isEditableLayerRecord(layerRecord);
  const canStyle = isVectorLayerRecord(layerRecord);
  const canInterpolate = isVectorLayerRecord(layerRecord) && isInterpolationEligible(layerRecord);
  const canHeatmap = isVectorLayerRecord(layerRecord) && isHeatmapEligible(layerRecord);
  const isEditable = canEdit && layerRecord.id === activeEditableLayerId;
  const isVisible = layerRecord.isVisible !== false;
  const menu = ensureLayerContextMenu();

  menu.dataset.layerId = layerRecord.id;
  menu.innerHTML = `
    <button class="layer-context-action" type="button" data-layer-context-action="zoom">Zoom</button>
    <button class="layer-context-action" type="button" data-layer-context-action="toggle-visibility">${isVisible ? "Hide layer" : "Show layer"}</button>
    ${canEdit ? `<button class="layer-context-action" type="button" data-layer-context-action="toggle-edit">${isEditable ? "Disable edit mode" : "Enable edit mode"}</button>` : ""}
    ${canStyle ? '<button class="layer-context-action accent-action" type="button" data-layer-context-action="style">Style</button>' : ""}
    ${canInterpolate ? '<button class="layer-context-action accent-action interpolation" type="button" data-layer-context-action="interpolate">Interpolate</button>' : ""}
    ${canHeatmap ? '<button class="layer-context-action accent-action heatmap" type="button" data-layer-context-action="heatmap">Heatmap</button>' : ""}
    ${canEdit ? '<button class="layer-context-action accent-action" type="button" data-layer-context-action="filter">Filter</button>' : ""}
    ${isVectorLayerRecord(layerRecord) ? '<button class="layer-context-action" type="button" data-layer-context-action="export">Export</button>' : ""}
    <button class="layer-context-action remove" type="button" data-layer-context-action="remove">Remove</button>
  `;

  menu.querySelectorAll("[data-layer-context-action]").forEach((button) => {
    button.addEventListener("click", () => runLayerCardAction(layerRecord, button.dataset.layerContextAction));
  });

  menu.hidden = false;

  const viewportPadding = 12;
  const { innerWidth, innerHeight } = window;
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(event.clientX, innerWidth - menuRect.width - viewportPadding);
  const top = Math.min(event.clientY, innerHeight - menuRect.height - viewportPadding);
  menu.style.left = `${Math.max(viewportPadding, left)}px`;
  menu.style.top = `${Math.max(viewportPadding, top)}px`;
}

function renderLayerList() {
  setEmptyState();
  layerList.innerHTML = "";
  const nextAnimatedLayerIds = new Set();
  const newlyAddedCards = [];

  loadedLayers.forEach((layerRecord) => {
    const wrapper = document.createElement("article");
    wrapper.className = "layer-card";
    wrapper.dataset.layerId = layerRecord.id;

    const isVisible = layerRecord.isVisible !== false;
    const isEditable = isEditableLayerRecord(layerRecord) && layerRecord.id === activeEditableLayerId;
    const canEdit = isEditableLayerRecord(layerRecord);
    const canStyle = isVectorLayerRecord(layerRecord);
    const canInterpolate = isVectorLayerRecord(layerRecord) && isInterpolationEligible(layerRecord);
    const canHeatmap = isVectorLayerRecord(layerRecord) && isHeatmapEligible(layerRecord);
    const rasterMetadata = layerRecord.rasterMetadata;
    const primaryMeta = isRasterLayerRecord(layerRecord)
      ? `${escapeHtml(layerRecord.sourceType)} • ${escapeHtml(rasterMetadata?.methodLabel || "Surface")}`
      : `${escapeHtml(layerRecord.sourceType)} • ${layerRecord.featureCount} feature(s)`;
    const secondaryMeta = isRasterLayerRecord(layerRecord)
      ? `Source: ${escapeHtml(rasterMetadata?.sourceLayerName || "Derived layer")}`
      : isLargeCsvLayerRecord(layerRecord)
        ? `${escapeHtml(getCsvDisplayLabel(layerRecord))} • ${formatCompactNumber(layerRecord.datasetStats?.analysisSampleCount || 0, 0)} analysis samples`
      : layerRecord.visibleFeatureCount === layerRecord.featureCount
        ? "All features visible"
        : `${layerRecord.visibleFeatureCount} visible after filter`;
    const tertiaryMeta = isRasterLayerRecord(layerRecord)
      ? `${formatCompactNumber(rasterMetadata?.minValue)} to ${formatCompactNumber(rasterMetadata?.maxValue)}`
      : isLargeCsvLayerRecord(layerRecord)
        ? "Large-file mode: table editing and direct point edits are disabled"
      : isEditable
        ? "Edit mode active"
        : "View only";

    wrapper.innerHTML = `
      <div class="layer-card-header">
        <div class="layer-card-primary">
          <button class="layer-name-button" type="button">${escapeHtml(layerRecord.name)}</button>
          <button class="edit-mode-toggle ${isEditable ? "active" : ""}" data-edit-toggle-id="${layerRecord.id}" type="button" aria-pressed="${isEditable ? "true" : "false"}" title="${canEdit ? (isEditable ? "Editing enabled" : "Enable editing") : (isLargeCsvLayerRecord(layerRecord) ? "Large-file mode is view and analysis only" : "Raster layers cannot be edited")}" ${canEdit ? "" : "disabled"}>
            <span class="edit-mode-dot"></span>
          </button>
        </div>
        <div class="layer-card-details">
          <div class="layer-meta layer-meta-strong">${escapeHtml(layerRecord.sourceType)} • ${formatCompactNumber(layerRecord.featureCount, 0)} feature(s)</div>
          <div class="layer-meta">${secondaryMeta}</div>
          <div class="layer-meta">${escapeHtml(tertiaryMeta)}</div>
        </div>
        <div class="layer-card-footer">
          <label class="toggle-wrap layer-visibility-toggle">
            <input type="checkbox" ${isVisible ? "checked" : ""} />
            <span>Visible</span>
          </label>
          <details class="layer-menu-shell">
            <summary class="layer-menu-toggle" aria-label="Layer actions" title="Layer actions">...</summary>
            <div class="layer-menu" role="menu">
              <button class="layer-menu-action zoom" type="button" role="menuitem">Zoom</button>
              ${canStyle ? '<button class="layer-menu-action style accent-action" type="button" role="menuitem">Style</button>' : ""}
              ${canInterpolate ? '<button class="layer-menu-action interpolation accent-action" type="button" role="menuitem">Interpolate</button>' : ""}
              ${canHeatmap ? '<button class="layer-menu-action heatmap accent-action" type="button" role="menuitem">Heatmap</button>' : ""}
              ${canEdit ? '<button class="layer-menu-action filter accent-action" type="button" role="menuitem">Filter</button>' : ""}
              ${isVectorLayerRecord(layerRecord) ? '<button class="layer-menu-action export" type="button" role="menuitem">Export</button>' : ""}
              <button class="layer-menu-action remove" type="button" role="menuitem">Remove</button>
            </div>
          </details>
        </div>
      </div>
    `;

    const nameButton = wrapper.querySelector(".layer-name-button");
    const checkbox = wrapper.querySelector('input[type="checkbox"]');
    const editButton = wrapper.querySelector(".edit-mode-toggle");
    const menuShell = wrapper.querySelector(".layer-menu-shell");
    const zoomButton = wrapper.querySelector(".zoom");
    const styleButton = wrapper.querySelector(".style");
    const interpolationButton = wrapper.querySelector(".interpolation");
    const heatmapButton = wrapper.querySelector(".heatmap");
    const filterButton = wrapper.querySelector(".filter");
    const exportButton = wrapper.querySelector(".export");
    const removeButton = wrapper.querySelector(".remove");

    nameButton.addEventListener("click", () => zoomToLayer(layerRecord.id));
    checkbox.addEventListener("change", () => runLayerCardAction(layerRecord, "toggle-visibility"));
    if (canEdit) {
      editButton.addEventListener("click", () => runLayerCardAction(layerRecord, "toggle-edit"));
    }
    const closeMenu = () => {
      if (menuShell) {
        menuShell.open = false;
      }
    };
    wrapper.addEventListener("contextmenu", (event) => openLayerContextMenu(event, layerRecord));
    zoomButton.addEventListener("click", () => runLayerCardAction(layerRecord, "zoom", closeMenu));
    styleButton?.addEventListener("click", () => runLayerCardAction(layerRecord, "style", closeMenu));
    interpolationButton?.addEventListener("click", () => runLayerCardAction(layerRecord, "interpolate", closeMenu));
    heatmapButton?.addEventListener("click", () => runLayerCardAction(layerRecord, "heatmap", closeMenu));
    filterButton?.addEventListener("click", () => runLayerCardAction(layerRecord, "filter", closeMenu));
    exportButton?.addEventListener("click", () => runLayerCardAction(layerRecord, "export", closeMenu));
    removeButton.addEventListener("click", () => runLayerCardAction(layerRecord, "remove", closeMenu));

    layerList.appendChild(wrapper);
    nextAnimatedLayerIds.add(layerRecord.id);
    if (!animatedLayerIds.has(layerRecord.id)) {
      newlyAddedCards.push(wrapper);
    }
  });

  animatedLayerIds.clear();
  nextAnimatedLayerIds.forEach((id) => animatedLayerIds.add(id));
  animateLayerEntries(newlyAddedCards);
  runPendingEditToggleAnimations();
}

function getLayerFieldNames(layerRecord) {
  if (!layerRecord) {
    return [];
  }

  if (isLargeCsvLayerRecord(layerRecord)) {
    return Array.from(new Set(layerRecord.fields || [])).sort();
  }

  const fieldSet = new Set(layerRecord.fields || []);
  layerRecord.geojson.features.forEach((feature) => {
    Object.keys(feature.properties || {}).forEach((key) => fieldSet.add(key));
  });

  return Array.from(fieldSet).sort();
}

