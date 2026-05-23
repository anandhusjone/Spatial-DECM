// ── Utilities ────────────────────────────────────────────────────────────────

function toCalculatorNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toCalculatorBoolean(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(s)) return true;
  if (["false", "f", "no", "n", "0", ""].includes(s)) return false;
  return true;
}

function getCalculatorCallArguments(call, context) {
  const positional = [];
  const named = {};
  call.args.forEach((arg, i) => {
    const v = evaluateCalculatorAst(arg.value, context);
    if (arg.name) named[arg.name] = v;
    else positional.push(v);
    named[i] = v;
  });
  return { positional, named };
}

function getCalculatorArgumentValue(args, index, names = [], fallback = null) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(args.named, name)) return args.named[name];
  }
  return index < args.positional.length ? args.positional[index] : fallback;
}

// ── Geometry helpers (reused from geometry module) ───────────────────────────

function normalizeGeometryValue(value) {
  if (!value) return null;
  if (value.type && Array.isArray(value.coordinates)) return value;
  if (value.geometry?.type && Array.isArray(value.geometry.coordinates)) return value.geometry;
  return null;
}

function getGeometryBounds(geometry) {
  const coords = samplePointGeometryCoordinates({ geometry });
  if (!coords.length) return null;
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function boundsIntersect(a, b) {
  if (!a || !b) return false;
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function pointsEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

function pointOnSegment(p, s, e) {
  const cross = (p[1] - s[1]) * (e[0] - s[0]) - (p[0] - s[0]) * (e[1] - s[1]);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (p[0] - s[0]) * (e[0] - s[0]) + (p[1] - s[1]) * (e[1] - s[1]);
  if (dot < 0) return false;
  return dot <= (e[0] - s[0]) ** 2 + (e[1] - s[1]) ** 2;
}

function isPointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i++) {
    const ci = ring[i], cj = ring[j];
    if (pointOnSegment(point, ci, cj)) return true;
    const crosses = ci[1] > point[1] !== cj[1] > point[1] &&
      point[0] < ((cj[0] - ci[0]) * (point[1] - ci[1])) / ((cj[1] - ci[1]) || 1e-9) + ci[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function isPointInPolygonGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates || [];
    if (!Array.isArray(outer) || !isPointInRing(point, outer)) return false;
    return !holes.some((h) => isPointInRing(point, h));
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((p) => isPointInPolygonGeometry(point, { type: "Polygon", coordinates: p }));
  }
  return false;
}

function getGeometrySegments(geometry) {
  if (!geometry) return [];
  const segments = [];
  const pushLine = (coords, close = false) => {
    if (!Array.isArray(coords) || coords.length < 2) return;
    for (let i = 1; i < coords.length; i++) segments.push([coords[i - 1], coords[i]]);
    if (close && coords.length > 2) segments.push([coords[coords.length - 1], coords[0]]);
  };
  if (geometry.type === "LineString") pushLine(geometry.coordinates);
  else if (geometry.type === "MultiLineString") geometry.coordinates.forEach((l) => pushLine(l));
  else if (geometry.type === "Polygon") geometry.coordinates.forEach((r) => pushLine(r, true));
  else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((p) => p.forEach((r) => pushLine(r, true)));
  return segments;
}

function segmentOrientation(a, b, c) {
  const v = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  return Math.abs(v) < 1e-9 ? 0 : v > 0 ? 1 : 2;
}

function segmentsIntersect(s1, s2) {
  const [p1, q1] = s1, [p2, q2] = s2;
  const o1 = segmentOrientation(p1, q1, p2), o2 = segmentOrientation(p1, q1, q2);
  const o3 = segmentOrientation(p2, q2, p1), o4 = segmentOrientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && pointOnSegment(p2, p1, q1)) || (o2 === 0 && pointOnSegment(q2, p1, q1)) ||
         (o3 === 0 && pointOnSegment(p1, p2, q2)) || (o4 === 0 && pointOnSegment(q1, p2, q2));
}

function geometryContains(outer, inner) {
  if (!outer || !inner) return false;
  if (outer.type === "Point") return pointsEqual(outer.coordinates, getPointCoordinate(inner));
  const pts = samplePointGeometryCoordinates({ geometry: inner });
  if (!pts.length) return false;
  if (outer.type === "Polygon" || outer.type === "MultiPolygon")
    return pts.every((p) => isPointInPolygonGeometry(p, outer));
  return false;
}

function geometryIntersects(a, b) {
  if (!a || !b) return false;
  const pa = getPointCoordinate(a), pb = getPointCoordinate(b);
  if (pa && pb) return pointsEqual(pa, pb);
  if (!boundsIntersect(getGeometryBounds(a), getGeometryBounds(b))) return false;
  if (geometryContains(a, b) || geometryContains(b, a)) return true;
  const sa = getGeometrySegments(a), sb = getGeometrySegments(b);
  return sa.some((s1) => sb.some((s2) => segmentsIntersect(s1, s2)));
}

// ── Aggregate helpers ────────────────────────────────────────────────────────

function getAggregateTargetLayer(layerArg, context) {
  if (!layerArg) return context.layerRecord || null;
  if (typeof layerArg === "object" && layerArg.id) return layerArg;
  const normalized = String(layerArg).trim().toLowerCase();
  if (!normalized) return context.layerRecord || null;
  return loadedLayers.find((l) =>
    String(l?.id || "").toLowerCase() === normalized ||
    String(l?.name || "").toLowerCase() === normalized
  ) || null;
}

function collectAggregateValues(call, context, options = {}) {
  const args = getCalculatorCallArguments(call, context);
  const explicitLayer = options.hasLayerArgument ? getCalculatorArgumentValue(args, 0, ["layer"], null) : null;
  const targetLayer = getAggregateTargetLayer(explicitLayer, context);
  const features = targetLayer?.geojson?.features || [];
  const exprArg = call.args[options.expressionIndex ?? 0];
  const filterArg = call.args.find((a) => a.name === "filter");
  const orderArg  = call.args.find((a) => a.name === "order_by");

  const collected = features.map((feature, i) => {
    const ctx = buildCalculatorContext(feature, { layerRecord: targetLayer, rowIndex: i, parent: context.feature });
    if (filterArg && !toCalculatorBoolean(evaluateCalculatorAst(filterArg.value, ctx))) return null;
    return { value: exprArg ? evaluateCalculatorAst(exprArg.value, ctx) : 1, orderValue: orderArg ? evaluateCalculatorAst(orderArg.value, ctx) : null, index: i };
  }).filter(Boolean);

  if (orderArg) {
    collected.sort((a, b) => {
      if (a.orderValue === b.orderValue) return a.index - b.index;
      if (a.orderValue == null) return 1;
      if (b.orderValue == null) return -1;
      return a.orderValue > b.orderValue ? 1 : -1;
    });
  }
  return collected;
}

function aggregateNumbers(values, reducer, fallback = null) {
  const nums = values.map((v) => toCalculatorNumber(v.value)).filter((v) => v !== null);
  return nums.length ? reducer(nums) : fallback;
}

// ── Function catalog ─────────────────────────────────────────────────────────

function createCalculatorFunctionCatalog() {
  return {
    // Conditional
    if: (call, context) => {
      const cond = evaluateCalculatorAst(call.args[0]?.value, context);
      return toCalculatorBoolean(cond)
        ? evaluateCalculatorAst(call.args[1]?.value, context)
        : evaluateCalculatorAst(call.args[2]?.value, context);
    },
    coalesce: (call, context) => {
      for (const arg of call.args) {
        const v = evaluateCalculatorAst(arg.value, context);
        if (v !== null && v !== undefined) return v;
      }
      return null;
    },
    is_null: (call, context) => {
      const v = evaluateCalculatorAst(call.args[0]?.value, context);
      return v === null || v === undefined;
    },

    // String
    concat: (call, context) =>
      call.args.map((a) => evaluateCalculatorAst(a.value, context)).map((v) => v ?? "").join(""),
    replace: (call, context) => {
      const text = String(evaluateCalculatorAst(call.args[0]?.value, context) ?? "");
      const find = String(evaluateCalculatorAst(call.args[1]?.value, context) ?? "");
      const rep  = String(evaluateCalculatorAst(call.args[2]?.value, context) ?? "");
      return text.split(find).join(rep);
    },

    // Math
    round: (call, context) => {
      const v = Number(evaluateCalculatorAst(call.args[0]?.value, context) ?? 0);
      const p = Number(call.args[1] ? evaluateCalculatorAst(call.args[1].value, context) : 0);
      const m = 10 ** (Number.isFinite(p) ? p : 0);
      return Math.round(v * m) / m;
    },

    // Geometry predicates
    intersects: (call, context) => {
      const a = normalizeGeometryValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const b = normalizeGeometryValue(evaluateCalculatorAst(call.args[1]?.value, context));
      return geometryIntersects(a, b);
    },
    within: (call, context) => {
      const a = normalizeGeometryValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const b = normalizeGeometryValue(evaluateCalculatorAst(call.args[1]?.value, context));
      return geometryContains(b, a);
    },
    overlay_intersects: (call, context) => {
      const args = getCalculatorCallArguments(call, context);
      const layerName = String(getCalculatorArgumentValue(args, 0, ["layer"], ""));
      const targetLayer = getAggregateTargetLayer(layerName, context);
      const features = targetLayer?.geojson?.features || [];
      const geom = context.feature?.geometry;
      if (!geom) return false;
      return features.some((f) => geometryIntersects(geom, normalizeGeometryValue(f)));
    },
    overlay_nearest: (call, context) => {
      const args = getCalculatorCallArguments(call, context);
      const layerName = String(getCalculatorArgumentValue(args, 0, ["layer"], ""));
      const maxDist   = Number(getCalculatorArgumentValue(args, 1, ["max_distance"], Infinity));
      const targetLayer = getAggregateTargetLayer(layerName, context);
      const features = targetLayer?.geojson?.features || [];
      const geom = context.feature?.geometry;
      if (!geom) return null;
      const origin = getPointCoordinate(geom) || getFeatureCentroidCoordinate(geom);
      if (!origin) return null;
      let nearest = null, nearestDist = Infinity;
      for (const f of features) {
        const fg = normalizeGeometryValue(f);
        const fp = getPointCoordinate(fg) || getFeatureCentroidCoordinate(fg);
        if (!fp) continue;
        const d = haversineDistance(origin, fp);
        if (d < nearestDist && d <= maxDist) { nearestDist = d; nearest = f; }
      }
      return nearest;
    },
    aggregate: (call, context) => {
      const args = getCalculatorCallArguments(call, context);
      const agg  = String(getCalculatorArgumentValue(args, 1, ["aggregate"], "")).toLowerCase();
      const vals = collectAggregateValues(call, context, { hasLayerArgument: true, expressionIndex: 2 });

      if (agg === "sum")           return aggregateNumbers(vals, (ns) => ns.reduce((s, n) => s + n, 0), 0);
      if (agg === "mean")          return aggregateNumbers(vals, (ns) => ns.reduce((s, n) => s + n, 0) / ns.length);
      if (agg === "minimum")       return aggregateNumbers(vals, (ns) => Math.min(...ns));
      if (agg === "maximum")       return aggregateNumbers(vals, (ns) => Math.max(...ns));
      if (agg === "count")         return vals.filter((v) => v.value !== null && v.value !== undefined).length;
      if (agg === "count_distinct") return new Set(vals.map((v) => v.value).filter((v) => v != null).map((v) => typeof v === "object" ? JSON.stringify(v) : String(v))).size;
      if (agg === "concatenate") {
        const delim = String(getCalculatorArgumentValue(args, 3, ["delimiter"], ", "));
        return vals.map((v) => v.value).filter((v) => v != null).join(delim);
      }
      if (agg === "array_agg") return vals.map((v) => v.value);
      throw createCalculatorError(`'${agg}' is not a supported aggregate — use sum, mean, minimum, maximum, count, count_distinct, concatenate, or array_agg`, null);
    },
    transform: (call, context) => {
      // Geometry reprojection — delegate to existing helper if available
      const geom = normalizeGeometryValue(evaluateCalculatorAst(call.args[0]?.value, context));
      const fromCrs = String(evaluateCalculatorAst(call.args[1]?.value, context) ?? "");
      const toCrs   = String(evaluateCalculatorAst(call.args[2]?.value, context) ?? "");
      if (typeof reprojectGeometry === "function") return reprojectGeometry(geom, fromCrs, toCrs);
      return geom; // passthrough when reprojection isn't available
    },
  };
}

window.createCalculatorFunctionCatalog = createCalculatorFunctionCatalog;
window.toCalculatorBoolean = toCalculatorBoolean;
window.toCalculatorNumber = toCalculatorNumber;
