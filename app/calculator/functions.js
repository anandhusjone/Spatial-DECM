function toCalculatorNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toCalculatorBoolean(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(normalized)) {
    return true;
  }
  if (["false", "f", "no", "n", "0", ""].includes(normalized)) {
    return false;
  }
  return true;
}

function parseDateValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCalculatorCallArguments(call, context) {
  const positional = [];
  const named = {};

  call.args.forEach((argument, index) => {
    const evaluatedValue = evaluateCalculatorAst(argument.value, context);
    if (argument.name) {
      named[argument.name] = evaluatedValue;
    } else {
      positional.push(evaluatedValue);
    }
    named[index] = evaluatedValue;
  });

  return { positional, named };
}

function getCalculatorArgumentValue(args, index, names = [], fallbackValue = null) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(args.named, name)) {
      return args.named[name];
    }
  }
  if (index < args.positional.length) {
    return args.positional[index];
  }
  return fallbackValue;
}

function createDerivedCalculatorContext(context, updates = {}) {
  return {
    ...context,
    ...updates,
    fields: updates.fields || context.fields,
    variables: {
      ...(context.variables || {}),
      ...(updates.variables || {}),
    },
  };
}

function normalizeGeometryValue(value) {
  if (!value) {
    return null;
  }
  if (value.type && Array.isArray(value.coordinates)) {
    return value;
  }
  if (value.geometry?.type && Array.isArray(value.geometry.coordinates)) {
    return value.geometry;
  }
  return null;
}

function getGeometryBounds(geometry) {
  const coordinates = samplePointGeometryCoordinates({ geometry });
  if (!coordinates.length) {
    return null;
  }
  const xs = coordinates.map((item) => item[0]);
  const ys = coordinates.map((item) => item[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function boundsIntersect(leftBounds, rightBounds) {
  if (!leftBounds || !rightBounds) {
    return false;
  }
  return !(
    leftBounds.maxX < rightBounds.minX ||
    leftBounds.minX > rightBounds.maxX ||
    leftBounds.maxY < rightBounds.minY ||
    leftBounds.minY > rightBounds.maxY
  );
}

function pointsEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left[0] === right[0] && left[1] === right[1];
}

function pointOnSegment(point, start, end) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }
  const dot = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1]);
  if (dot < 0) {
    return false;
  }
  const lengthSquared = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  return dot <= lengthSquared;
}

function isPointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (pointOnSegment(point, current, previous)) {
      return true;
    }
    const intersects = current[1] > point[1] !== previous[1] > point[1] &&
      point[0] < ((previous[0] - current[0]) * (point[1] - current[1])) / ((previous[1] - current[1]) || 1e-9) + current[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointInPolygonGeometry(point, geometry) {
  if (!geometry) {
    return false;
  }

  if (geometry.type === "Polygon") {
    const [outerRing, ...holes] = geometry.coordinates || [];
    if (!Array.isArray(outerRing) || !isPointInRing(point, outerRing)) {
      return false;
    }
    return !holes.some((ring) => isPointInRing(point, ring));
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => isPointInPolygonGeometry(point, { type: "Polygon", coordinates: polygon }));
  }

  return false;
}

function getGeometrySegments(geometry) {
  if (!geometry) {
    return [];
  }

  const segments = [];
  const pushLineSegments = (coordinates, closeRing = false) => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return;
    }
    for (let index = 1; index < coordinates.length; index += 1) {
      segments.push([coordinates[index - 1], coordinates[index]]);
    }
    if (closeRing && coordinates.length > 2) {
      segments.push([coordinates[coordinates.length - 1], coordinates[0]]);
    }
  };

  if (geometry.type === "LineString") {
    pushLineSegments(geometry.coordinates);
  } else if (geometry.type === "MultiLineString") {
    geometry.coordinates.forEach((line) => pushLineSegments(line));
  } else if (geometry.type === "Polygon") {
    geometry.coordinates.forEach((ring) => pushLineSegments(ring, true));
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => pushLineSegments(ring, true)));
  }

  return segments;
}

function getSegmentOrientation(a, b, c) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-9) {
    return 0;
  }
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(first, second) {
  const [p1, q1] = first;
  const [p2, q2] = second;
  const o1 = getSegmentOrientation(p1, q1, p2);
  const o2 = getSegmentOrientation(p1, q1, q2);
  const o3 = getSegmentOrientation(p2, q2, p1);
  const o4 = getSegmentOrientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  return (
    (o1 === 0 && pointOnSegment(p2, p1, q1)) ||
    (o2 === 0 && pointOnSegment(q2, p1, q1)) ||
    (o3 === 0 && pointOnSegment(p1, p2, q2)) ||
    (o4 === 0 && pointOnSegment(q1, p2, q2))
  );
}

function geometryContains(leftGeometry, rightGeometry) {
  if (!leftGeometry || !rightGeometry) {
    return false;
  }

  if (leftGeometry.type === "Point") {
    const rightPoint = getPointCoordinate(rightGeometry);
    return pointsEqual(leftGeometry.coordinates, rightPoint);
  }

  const sampledPoints = samplePointGeometryCoordinates({ geometry: rightGeometry });
  if (!sampledPoints.length) {
    return false;
  }

  if (leftGeometry.type === "Polygon" || leftGeometry.type === "MultiPolygon") {
    return sampledPoints.every((point) => isPointInPolygonGeometry(point, leftGeometry));
  }

  return false;
}

function geometryIntersects(leftGeometry, rightGeometry) {
  if (!leftGeometry || !rightGeometry) {
    return false;
  }

  const leftPoint = getPointCoordinate(leftGeometry);
  const rightPoint = getPointCoordinate(rightGeometry);
  if (leftPoint && rightPoint) {
    return pointsEqual(leftPoint, rightPoint);
  }

  if (!boundsIntersect(getGeometryBounds(leftGeometry), getGeometryBounds(rightGeometry))) {
    return false;
  }

  if (geometryContains(leftGeometry, rightGeometry) || geometryContains(rightGeometry, leftGeometry)) {
    return true;
  }

  const leftSegments = getGeometrySegments(leftGeometry);
  const rightSegments = getGeometrySegments(rightGeometry);
  return leftSegments.some((leftSegment) => rightSegments.some((rightSegment) => segmentsIntersect(leftSegment, rightSegment)));
}

function getAggregateTargetLayer(layerArgument, context) {
  if (!layerArgument || layerArgument === "@layer_name") {
    return context.layerRecord || null;
  }

  if (typeof layerArgument === "object" && layerArgument.id) {
    return layerArgument;
  }

  const normalized = String(layerArgument ?? "").trim().toLowerCase();
  if (!normalized) {
    return context.layerRecord || null;
  }

  return loadedLayers.find((layerRecord) =>
    String(layerRecord?.id || "").toLowerCase() === normalized ||
    String(layerRecord?.name || "").toLowerCase() === normalized
  ) || null;
}

function collectAggregateValues(call, context, options = {}) {
  const args = getCalculatorCallArguments(call, context);
  const explicitLayer = options.hasLayerArgument ? getCalculatorArgumentValue(args, 0, ["layer"], null) : null;
  const targetLayer = getAggregateTargetLayer(explicitLayer, context);
  const features = targetLayer?.geojson?.features || [];
  const expressionArg = call.args[options.expressionIndex ?? 0];
  const filterArg = call.args.find((argument) => argument.name === "filter");
  const orderByArg = call.args.find((argument) => argument.name === "order_by");

  const collected = features
    .map((feature, index) => {
      const featureContext = buildCalculatorContext(feature, {
        layerRecord: targetLayer,
        rowIndex: index,
        parent: context.feature,
      });

      if (filterArg && !toCalculatorBoolean(evaluateCalculatorAst(filterArg.value, featureContext))) {
        return null;
      }

      const value = expressionArg ? evaluateCalculatorAst(expressionArg.value, featureContext) : 1;
      const orderValue = orderByArg ? evaluateCalculatorAst(orderByArg.value, featureContext) : null;
      return {
        feature,
        index,
        value,
        orderValue,
      };
    })
    .filter(Boolean);

  if (orderByArg) {
    collected.sort((left, right) => {
      if (left.orderValue === right.orderValue) {
        return left.index - right.index;
      }
      if (left.orderValue === null || left.orderValue === undefined) {
        return 1;
      }
      if (right.orderValue === null || right.orderValue === undefined) {
        return -1;
      }
      return left.orderValue > right.orderValue ? 1 : -1;
    });
  }

  return collected;
}

function aggregateNumberValues(values, reducer, fallback = null) {
  const numericValues = values
    .map((item) => toCalculatorNumber(item.value))
    .filter((value) => value !== null);

  if (!numericValues.length) {
    return fallback;
  }

  return reducer(numericValues);
}

function createCalculatorFunctionCatalog() {
  return {
    if: (call, context) => {
      const condition = evaluateCalculatorAst(call.args[0]?.value, context);
      return toCalculatorBoolean(condition)
        ? evaluateCalculatorAst(call.args[1]?.value, context)
        : evaluateCalculatorAst(call.args[2]?.value, context);
    },
    coalesce: (call, context) => {
      for (const argument of call.args) {
        const value = evaluateCalculatorAst(argument.value, context);
        if (value !== null && value !== undefined) {
          return value;
        }
      }
      return null;
    },
    try: (call, context) => {
      try {
        return evaluateCalculatorAst(call.args[0]?.value, context);
      } catch (error) {
        if (call.args[1]) {
          return evaluateCalculatorAst(call.args[1].value, context);
        }
        return null;
      }
    },
    nullif: (call, context) => {
      const leftValue = evaluateCalculatorAst(call.args[0]?.value, context);
      const rightValue = evaluateCalculatorAst(call.args[1]?.value, context);
      return leftValue === rightValue ? null : leftValue;
    },
    is_null: (call, context) => {
      const value = evaluateCalculatorAst(call.args[0]?.value, context);
      return value === null || value === undefined;
    },
    ifnull: (call, context) => {
      const value = evaluateCalculatorAst(call.args[0]?.value, context);
      return value === null || value === undefined
        ? evaluateCalculatorAst(call.args[1]?.value, context)
        : value;
    },
    concat: (call, context) =>
      call.args.map((argument) => evaluateCalculatorAst(argument.value, context)).map((value) => value ?? "").join(""),
    lower: (call, context) => String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "").toLowerCase(),
    upper: (call, context) => String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "").toUpperCase(),
    title: (call, context) =>
      String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    trim: (call, context) => String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "").trim(),
    replace: (call, context) => {
      const text = String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "");
      const find = String(evaluateCalculatorAst(call.args[1]?.value, context) ?? "");
      const replacement = String(evaluateCalculatorAst(call.args[2]?.value, context) ?? "");
      return text.split(find).join(replacement);
    },
    substr: (call, context) => {
      const text = String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "");
      const startValue = Math.max(0, Number(evaluateCalculatorAst(call.args[1]?.value, context) ?? 1) - 1);
      const lengthValue = call.args[2] ? Number(evaluateCalculatorAst(call.args[2].value, context) ?? text.length) : undefined;
      return Number.isFinite(lengthValue) ? text.substr(startValue, lengthValue) : text.substr(startValue);
    },
    strpos: (call, context) => {
      const haystack = String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "");
      const needle = String(evaluateCalculatorAst(call.args[1]?.value, context) ?? "");
      const position = haystack.indexOf(needle);
      return position === -1 ? 0 : position + 1;
    },
    regexp_match: (call, context) => {
      const text = String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "");
      const pattern = String(evaluateCalculatorAst(call.args[1]?.value, context) ?? "");
      return new RegExp(pattern).test(text);
    },
    regexp_replace: (call, context) => {
      const text = String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "");
      const pattern = String(evaluateCalculatorAst(call.args[1]?.value, context) ?? "");
      const replacement = String(evaluateCalculatorAst(call.args[2]?.value, context) ?? "");
      return text.replace(new RegExp(pattern, "g"), replacement);
    },
    abs: (call, context) => Math.abs(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    round: (call, context) => {
      const value = Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0);
      const places = Number(call.args[1] ? evaluateCalculatorAst(call.args[1].value, context) : 0);
      const multiplier = 10 ** (Number.isFinite(places) ? places : 0);
      return Math.round(value * multiplier) / multiplier;
    },
    floor: (call, context) => Math.floor(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    ceil: (call, context) => Math.ceil(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    sqrt: (call, context) => Math.sqrt(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    log: (call, context) => Math.log(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    exp: (call, context) => Math.exp(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    min: (call, context) => Math.min(...call.args.map((argument) => Number(evaluateCalculatorAst(argument.value, context) ?? 0))),
    max: (call, context) => Math.max(...call.args.map((argument) => Number(evaluateCalculatorAst(argument.value, context) ?? 0))),
    clamp: (call, context) => {
      const args = getCalculatorCallArguments(call, context);
      const minValue = Number(getCalculatorArgumentValue(args, 0, ["min"], 0));
      const value = Number(getCalculatorArgumentValue(args, 1, ["value"], 0));
      const maxValue = Number(getCalculatorArgumentValue(args, 2, ["max"], value));
      return Math.min(maxValue, Math.max(minValue, value));
    },
    sin: (call, context) => Math.sin(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    cos: (call, context) => Math.cos(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    tan: (call, context) => Math.tan(Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0)),
    radians: (call, context) => (Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0) * Math.PI) / 180,
    degrees: (call, context) => (Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0) * 180) / Math.PI,
    to_int: (call, context) => {
      const value = Number.parseInt(evaluateCalculatorAst(call.args[0]?.value, context), 10);
      return Number.isFinite(value) ? value : null;
    },
    to_real: (call, context) => toCalculatorNumber(evaluateCalculatorAst(call.args[0]?.value, context)),
    to_string: (call, context) => String(evaluateCalculatorAst(call.args[0]?.value, context) ?? ""),
    to_bool: (call, context) => toCalculatorBoolean(evaluateCalculatorAst(call.args[0]?.value, context)),
    now: () => new Date(),
    year: (call, context) => parseDateValue(evaluateCalculatorAst(call.args[0]?.value, context))?.getFullYear() ?? null,
    month: (call, context) => {
      const value = parseDateValue(evaluateCalculatorAst(call.args[0]?.value, context));
      return value ? value.getMonth() + 1 : null;
    },
    day: (call, context) => parseDateValue(evaluateCalculatorAst(call.args[0]?.value, context))?.getDate() ?? null,
    format_date: (call, context) => {
      const date = parseDateValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const pattern = String(evaluateCalculatorAst(call.args[1]?.value, context) ?? "yyyy-MM-dd");
      if (!date) {
        return null;
      }
      return pattern
        .replace(/yyyy/g, String(date.getFullYear()))
        .replace(/MM/g, String(date.getMonth() + 1).padStart(2, "0"))
        .replace(/dd/g, String(date.getDate()).padStart(2, "0"));
    },
    age: (call, context) => {
      const left = parseDateValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const right = call.args[1] ? parseDateValue(evaluateCalculatorAst(call.args[1].value, context)) : new Date();
      if (!left || !right) {
        return null;
      }
      return Math.floor((right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24));
    },
    area: (call, context) => {
      const geometry = call.args[0] ? normalizeGeometryValue(evaluateCalculatorAst(call.args[0].value, context)) : context.feature?.geometry;
      return getFeatureArea(geometry);
    },
    length: (call, context) => {
      const argumentValue = call.args[0] ? evaluateCalculatorAst(call.args[0].value, context) : undefined;
      if (typeof argumentValue === "string" || Array.isArray(argumentValue)) {
        return argumentValue.length;
      }
      const geometry = call.args[0] ? normalizeGeometryValue(argumentValue) : context.feature?.geometry;
      return getFeatureLength(geometry);
    },
    perimeter: (call, context) => {
      const geometry = call.args[0] ? normalizeGeometryValue(evaluateCalculatorAst(call.args[0].value, context)) : context.feature?.geometry;
      return getFeaturePerimeter(geometry);
    },
    x: (call, context) => {
      const geometry = call.args[0] ? normalizeGeometryValue(evaluateCalculatorAst(call.args[0].value, context)) : context.feature?.geometry;
      return getPointCoordinate(geometry)?.[0] ?? getFeatureCentroidCoordinate(geometry)?.[0] ?? null;
    },
    y: (call, context) => {
      const geometry = call.args[0] ? normalizeGeometryValue(evaluateCalculatorAst(call.args[0].value, context)) : context.feature?.geometry;
      return getPointCoordinate(geometry)?.[1] ?? getFeatureCentroidCoordinate(geometry)?.[1] ?? null;
    },
    centroid: (call, context) => {
      const geometry = call.args[0] ? normalizeGeometryValue(evaluateCalculatorAst(call.args[0].value, context)) : context.feature?.geometry;
      const coordinate = getFeatureCentroidCoordinate(geometry);
      if (!coordinate) {
        return null;
      }
      return { type: "Point", coordinates: coordinate };
    },
    bounds: (call, context) => {
      const geometry = call.args[0] ? normalizeGeometryValue(evaluateCalculatorAst(call.args[0].value, context)) : context.feature?.geometry;
      return getGeometryBounds(geometry);
    },
    distance: (call, context) => {
      const leftGeometry = normalizeGeometryValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const rightGeometry = normalizeGeometryValue(evaluateCalculatorAst(call.args[1]?.value, context));
      const left = getPointCoordinate(leftGeometry) || getFeatureCentroidCoordinate(leftGeometry);
      const right = getPointCoordinate(rightGeometry) || getFeatureCentroidCoordinate(rightGeometry);
      return left && right ? haversineDistance(left, right) : null;
    },
    intersects: (call, context) => {
      const leftGeometry = normalizeGeometryValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const rightGeometry = normalizeGeometryValue(evaluateCalculatorAst(call.args[1]?.value, context));
      return geometryIntersects(leftGeometry, rightGeometry);
    },
    contains: (call, context) => {
      const leftGeometry = normalizeGeometryValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const rightGeometry = normalizeGeometryValue(evaluateCalculatorAst(call.args[1]?.value, context));
      return geometryContains(leftGeometry, rightGeometry);
    },
    within: (call, context) => {
      const leftGeometry = normalizeGeometryValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const rightGeometry = normalizeGeometryValue(evaluateCalculatorAst(call.args[1]?.value, context));
      return geometryContains(rightGeometry, leftGeometry);
    },
    attribute: (call, context) => {
      const feature = evaluateCalculatorAst(call.args[0]?.value, context);
      const fieldName = String(evaluateCalculatorAst(call.args[1]?.value, context) ?? "");
      return feature?.properties?.[fieldName] ?? null;
    },
    array: (call, context) => call.args.map((argument) => evaluateCalculatorAst(argument.value, context)),
    array_length: (call, context) => {
      const value = evaluateCalculatorAst(call.args[0]?.value, context);
      return Array.isArray(value) ? value.length : 0;
    },
    array_get: (call, context) => {
      const value = evaluateCalculatorAst(call.args[0]?.value, context);
      const index = Number(evaluateCalculatorAst(call.args[1]?.value, context) ?? 0);
      return Array.isArray(value) && Number.isInteger(index) ? value[index] ?? null : null;
    },
    array_foreach: (call, context) => {
      const value = evaluateCalculatorAst(call.args[0]?.value, context);
      if (!Array.isArray(value) || !call.args[1]) {
        return [];
      }
      return value.map((item, index) => {
        const derivedContext = createDerivedCalculatorContext(context, {
          variables: {
            "@element": item,
            "@index": index,
            "@counter": index + 1,
          },
        });
        return evaluateCalculatorAst(call.args[1].value, derivedContext);
      });
    },
    sum: (call, context) => aggregateNumberValues(
      collectAggregateValues(call, context, { hasLayerArgument: false, expressionIndex: 0 }),
      (values) => values.reduce((sum, value) => sum + value, 0),
      0
    ),
    mean: (call, context) => aggregateNumberValues(
      collectAggregateValues(call, context, { hasLayerArgument: false, expressionIndex: 0 }),
      (values) => values.reduce((sum, value) => sum + value, 0) / values.length
    ),
    minimum: (call, context) => aggregateNumberValues(
      collectAggregateValues(call, context, { hasLayerArgument: false, expressionIndex: 0 }),
      (values) => Math.min(...values)
    ),
    maximum: (call, context) => aggregateNumberValues(
      collectAggregateValues(call, context, { hasLayerArgument: false, expressionIndex: 0 }),
      (values) => Math.max(...values)
    ),
    count: (call, context) => {
      const values = collectAggregateValues(call, context, { hasLayerArgument: false, expressionIndex: 0 });
      if (!call.args.length) {
        return values.length;
      }
      return values.filter((item) => item.value !== null && item.value !== undefined).length;
    },
    count_distinct: (call, context) => {
      const values = collectAggregateValues(call, context, { hasLayerArgument: false, expressionIndex: 0 });
      return new Set(
        values
          .map((item) => item.value)
          .filter((value) => value !== null && value !== undefined)
          .map((value) => (typeof value === "object" ? JSON.stringify(value) : String(value)))
      ).size;
    },
    concatenate: (call, context) => {
      const values = collectAggregateValues(call, context, { hasLayerArgument: false, expressionIndex: 0 });
      const args = getCalculatorCallArguments(call, context);
      const delimiter = String(getCalculatorArgumentValue(args, 1, ["delimiter"], ", "));
      return values
        .map((item) => item.value)
        .filter((value) => value !== null && value !== undefined)
        .join(delimiter);
    },
    array_agg: (call, context) => collectAggregateValues(call, context, { hasLayerArgument: false, expressionIndex: 0 }).map((item) => item.value),
    aggregate: (call, context) => {
      const args = getCalculatorCallArguments(call, context);
      const aggregateName = String(getCalculatorArgumentValue(args, 1, ["aggregate"], "")).toLowerCase();
      const values = collectAggregateValues(call, context, { hasLayerArgument: true, expressionIndex: 2 });

      if (aggregateName === "sum") {
        return aggregateNumberValues(values, (items) => items.reduce((sum, value) => sum + value, 0), 0);
      }
      if (aggregateName === "mean") {
        return aggregateNumberValues(values, (items) => items.reduce((sum, value) => sum + value, 0) / items.length);
      }
      if (aggregateName === "minimum") {
        return aggregateNumberValues(values, (items) => Math.min(...items));
      }
      if (aggregateName === "maximum") {
        return aggregateNumberValues(values, (items) => Math.max(...items));
      }
      if (aggregateName === "count") {
        return values.filter((item) => item.value !== null && item.value !== undefined).length;
      }
      if (aggregateName === "count_distinct") {
        return new Set(
          values
            .map((item) => item.value)
            .filter((value) => value !== null && value !== undefined)
            .map((value) => (typeof value === "object" ? JSON.stringify(value) : String(value)))
        ).size;
      }
      if (aggregateName === "concatenate") {
        const delimiter = String(getCalculatorArgumentValue(args, 3, ["delimiter"], ", "));
        return values.map((item) => item.value).filter((value) => value !== null && value !== undefined).join(delimiter);
      }
      if (aggregateName === "array_agg") {
        return values.map((item) => item.value);
      }

      throw new Error(`Unsupported aggregate "${aggregateName}".`);
    },
  };
}

window.createCalculatorFunctionCatalog = createCalculatorFunctionCatalog;
