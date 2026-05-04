function buildCalculatorContext(feature, options = {}) {
  const layerRecord = options.layerRecord || null;
  const rowIndex = Number.isInteger(options.rowIndex) ? options.rowIndex : 0;
  const fields = feature?.properties || {};

  return {
    feature,
    layerRecord,
    rowIndex,
    fields,
    variables: {
      "@feature": feature,
      "@geometry": feature?.geometry || null,
      "@id": feature?.id || null,
      "@layer_name": layerRecord?.name || "",
      "@row_number": rowIndex + 1,
      "@parent": options.parent ?? feature,
    },
  };
}

window.buildCalculatorContext = buildCalculatorContext;
