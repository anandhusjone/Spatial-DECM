window.calculatorExpressionCatalog = {
  // $var geometry chips — shown in the Geometry tab
  geoVars: [
    { label: "$area",   insert: "$area",   description: "Polygon area in m²",           example: "$area / 10000" },
    { label: "$length", insert: "$length", description: "Line length in metres",         example: "round($length, 1)" },
    { label: "$x",      insert: "$x",      description: "Point X coordinate (longitude)", example: "$x" },
    { label: "$y",      insert: "$y",      description: "Point Y coordinate (latitude)",  example: "$y" },
  ],

  // Function groups — shown in the Functions tab
  groups: [
    {
      name: "Conditional",
      items: [
        {
          label: "if(condition, yes, no)",
          insert: "if(",
          description: "Returns one value when the condition is true, another when false.",
          example: "if(population > 1000000, 'metro', 'rural')",
        },
        {
          label: "CASE WHEN … END",
          insert: "CASE\n  WHEN  THEN \n  ELSE \nEND",
          description: "Multi-branch conditional — like a switch statement.",
          example: "CASE WHEN $area > 5000 THEN 'large' WHEN $area > 1000 THEN 'medium' ELSE 'small' END",
        },
        {
          label: "coalesce(a, b, …)",
          insert: "coalesce(",
          description: "Returns the first non-null value from the list.",
          example: "coalesce(name, 'unnamed')",
        },
      ],
    },
    {
      name: "Math",
      items: [
        {
          label: "round(value, places)",
          insert: "round(",
          description: "Rounds a number to the given decimal places.",
          example: "round($area / 10000, 2)",
        },
      ],
    },
    {
      name: "String",
      items: [
        {
          label: "concat(a, b, …)",
          insert: "concat(",
          description: "Joins multiple values together as text.",
          example: "concat(name, ' — ', zone)",
        },
        {
          label: "replace(text, find, replacement)",
          insert: "replace(",
          description: "Replaces every occurrence of a substring.",
          example: "replace(land_use, '_', ' ')",
        },
      ],
    },
    {
      name: "Geometry",
      items: [
        {
          label: "intersects(geomA, geomB)",
          insert: "intersects(",
          description: "True when two geometries overlap or touch.",
          example: "intersects(geometry, boundary)",
        },
        {
          label: "within(geomA, geomB)",
          insert: "within(",
          description: "True when the first geometry is fully inside the second.",
          example: "within(geometry, region)",
        },
        {
          label: "overlay_intersects(layer)",
          insert: "overlay_intersects(",
          description: "True when the current feature intersects any feature in the named layer.",
          example: "overlay_intersects('flood_zones')",
        },
        {
          label: "overlay_nearest(layer, max_distance:=)",
          insert: "overlay_nearest(",
          description: "Returns the nearest feature in the named layer within an optional distance (metres).",
          example: "overlay_nearest('hospitals', max_distance := 5000)",
        },
        {
          label: "transform(geometry, fromCRS, toCRS)",
          insert: "transform(",
          description: "Reprojects a geometry between two CRS codes.",
          example: "transform(geometry, 'EPSG:4326', 'EPSG:32643')",
        },
      ],
    },
    {
      name: "Aggregate",
      items: [
        {
          label: "aggregate(layer, type, expression, filter:=)",
          insert: "aggregate(",
          description: "Computes sum, mean, minimum, maximum, count, concatenate, or array_agg across a layer's features.",
          example: "aggregate('parcels', 'sum', area, filter := zone = 'R1')",
        },
      ],
    },
  ],
};
