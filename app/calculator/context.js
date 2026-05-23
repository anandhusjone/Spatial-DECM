function buildCalculatorContext(feature, options = {}) {
  const layerRecord = options.layerRecord || null;
  const rowIndex = Number.isInteger(options.rowIndex) ? options.rowIndex : 0;
  const fields = feature?.properties || {};
  const geometry = feature?.geometry || null;

  // Auto-compute geometry vars from the feature
  const geoVars = {
    "$area":   geometry ? (getFeatureArea?.(geometry) ?? null) : null,
    "$length": geometry ? (getFeatureLength?.(geometry) ?? null) : null,
    "$x":      geometry ? (getPointCoordinate?.(geometry)?.[0] ?? getFeatureCentroidCoordinate?.(geometry)?.[0] ?? null) : null,
    "$y":      geometry ? (getPointCoordinate?.(geometry)?.[1] ?? getFeatureCentroidCoordinate?.(geometry)?.[1] ?? null) : null,
  };

  return {
    feature,
    layerRecord,
    rowIndex,
    fields,
    geoVars,
  };
}

window.buildCalculatorContext = buildCalculatorContext;
