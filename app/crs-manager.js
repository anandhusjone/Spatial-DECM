(function initCrsManager(global) {
  const DEFAULT_CRS = "EPSG:4326";
  const WEB_MERCATOR = "EPSG:3857";
  const crsRegistry = new Map();

  function normalizeCode(code) {
    if (code == null || code === "") {
      return "";
    }

    const text = String(code).trim();

    // OGC URN: urn:ogc:def:crs:EPSG::4326 or urn:ogc:def:crs:EPSG:6.18.3:4326
    // Produced by QGIS, ArcGIS, GDAL, GeoServer exports.
    const urnEpsgMatch = text.match(/urn:ogc:def:crs:EPSG:[^:]*:(\d+)/i);
    if (urnEpsgMatch) {
      return `EPSG:${urnEpsgMatch[1]}`;
    }

    // OGC URN: urn:ogc:def:crs:OGC:1.3:CRS84
    const urnOgcMatch = text.match(/urn:ogc:def:crs:OGC:[^:]*:(CRS\d+|CRS84)/i);
    if (urnOgcMatch) {
      return `OGC:${urnOgcMatch[1].toUpperCase()}`;
    }

    // OGC HTTP URL: http://www.opengis.net/def/crs/EPSG/0/4326
    // Used by GeoServer WFS, MapServer, and OGC API outputs.
    const httpEpsgMatch = text.match(/opengis\.net\/def\/crs\/EPSG\/[^/]*\/(\d+)/i);
    if (httpEpsgMatch) {
      return `EPSG:${httpEpsgMatch[1]}`;
    }

    // OGC HTTP URL: http://www.opengis.net/def/crs/OGC/1.3/CRS84
    const httpOgcMatch = text.match(/opengis\.net\/def\/crs\/OGC\/[^/]*\/(CRS\d+|CRS84)/i);
    if (httpOgcMatch) {
      return `OGC:${httpOgcMatch[1].toUpperCase()}`;
    }

    // SRID=4326 (PostGIS, SQLite/SpatiaLite)
    const sridMatch = text.match(/^SRID=(\d+)$/i);
    if (sridMatch) {
      return `EPSG:${sridMatch[1]}`;
    }

    // Bare EPSG number or EPSG:N / EPSG/N
    const epsgMatch = text.match(/EPSG[:/ ]?(\d+)/i);
    if (epsgMatch) {
      return `EPSG:${epsgMatch[1]}`;
    }

    // Plain integer → treat as EPSG code
    if (/^\d+$/.test(text)) {
      return `EPSG:${text}`;
    }

    return text.toUpperCase();
  }

  function getEpsgNumber(code) {
    const normalized = normalizeCode(code);
    const match = normalized.match(/^EPSG:(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function getUtmInfo(code) {
    const epsg = getEpsgNumber(code);
    if (epsg >= 32601 && epsg <= 32660) {
      return { zone: epsg - 32600, hemisphere: "N" };
    }
    if (epsg >= 32701 && epsg <= 32760) {
      return { zone: epsg - 32700, hemisphere: "S" };
    }
    return null;
  }

  function getProj4() {
    return global.proj4 || null;
  }

  function buildUtmDefinition(zone, hemisphere) {
    return `+proj=utm +zone=${zone} ${hemisphere === "S" ? "+south " : ""}+datum=WGS84 +units=m +no_defs +type=crs`;
  }

  function registerCrs(code, definition, metadata = {}) {
    const normalized = normalizeCode(code);
    if (!normalized) {
      throw new Error("CRS code is required.");
    }

    const entry = {
      code: normalized,
      definition: definition || "",
      name: metadata.name || normalized,
      type: metadata.type || "custom",
      units: metadata.units || "",
      area: metadata.area || "",
      aliases: metadata.aliases || [],
      isSupported: true,
    };

    crsRegistry.set(normalized, entry);
    entry.aliases.forEach((alias) => crsRegistry.set(normalizeCode(alias), entry));

    const proj4 = getProj4();
    if (proj4 && definition) {
      proj4.defs(normalized, definition);
    }

    return entry;
  }

  function ensureKnownCrs(code) {
    const normalized = normalizeCode(code || DEFAULT_CRS);
    if (crsRegistry.has(normalized)) {
      return crsRegistry.get(normalized);
    }

    const utmInfo = getUtmInfo(normalized);
    if (utmInfo) {
      return registerCrs(normalized, buildUtmDefinition(utmInfo.zone, utmInfo.hemisphere), {
        name: `WGS 84 / UTM zone ${utmInfo.zone}${utmInfo.hemisphere}`,
        type: "projected",
        units: "m",
      });
    }

    const epsg = getEpsgNumber(normalized);
    if (epsg) {
      const proj4 = getProj4();
      const existingDefinition = proj4?.defs?.(normalized);
      if (existingDefinition) {
        return registerCrs(normalized, "", {
          name: normalized,
          type: "projected",
        });
      }
    }

    return {
      code: normalized,
      definition: "",
      name: normalized || "Unknown CRS",
      type: "unknown",
      units: "",
      area: "",
      aliases: [],
      isSupported: false,
    };
  }

  function getCrsMetadata(code) {
    return ensureKnownCrs(code);
  }

  function validateCrs(code) {
    const metadata = ensureKnownCrs(code);
    if (!metadata.isSupported) {
      throw new Error(`Unsupported CRS: ${metadata.code || code || "unknown"}. Register a Proj4 definition before using it.`);
    }
    return metadata;
  }

  function parseCrs(value) {
    if (!value) {
      return getCrsMetadata(DEFAULT_CRS);
    }

    if (typeof value === "string" || typeof value === "number") {
      return getCrsMetadata(value);
    }

    if (value.code || value.epsg) {
      return getCrsMetadata(value.code || value.epsg);
    }

    if (value.properties?.name) {
      return getCrsMetadata(value.properties.name);
    }

    if (value.type === "name" && value.properties?.name) {
      return getCrsMetadata(value.properties.name);
    }

    return getCrsMetadata(DEFAULT_CRS);
  }

  function detectGeoJsonCrs(geojson) {
    return parseCrs(geojson?.crs || DEFAULT_CRS);
  }

  function detectGeoTiffCrs(image) {
    const keys = image?.getGeoKeys?.() || {};
    const projected = Number(keys.ProjectedCSTypeGeoKey || keys.ProjectedCRSGeoKey);
    const geographic = Number(keys.GeographicTypeGeoKey || keys.GeographicCRSGeoKey);

    if (Number.isFinite(projected)) {
      return getCrsMetadata(`EPSG:${projected}`);
    }

    if (Number.isFinite(geographic)) {
      return getCrsMetadata(`EPSG:${geographic}`);
    }

    return getCrsMetadata(DEFAULT_CRS);
  }

  function latLngToWebMercator(lat, lon) {
    const radius = 6378137;
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
    return [
      radius * (Number(lon) * Math.PI / 180),
      radius * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI / 180) / 2)),
    ];
  }

  function webMercatorToLatLng(x, y) {
    const radius = 6378137;
    return [
      (Number(x) / radius) * 180 / Math.PI,
      (2 * Math.atan(Math.exp(Number(y) / radius)) - Math.PI / 2) * 180 / Math.PI,
    ];
  }

  function latLngToUtm(lat, lon, zone, hemisphere) {
    const a = 6378137;
    const f = 1 / 298.257223563;
    const k0 = 0.9996;
    const e = Math.sqrt(f * (2 - f));
    const eSquared = e * e;
    const ePrimeSquared = eSquared / (1 - eSquared);
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    const lonOrigin = (zone - 1) * 6 - 180 + 3;
    const lonOriginRad = (lonOrigin * Math.PI) / 180;
    const n = a / Math.sqrt(1 - eSquared * Math.sin(latRad) ** 2);
    const t = Math.tan(latRad) ** 2;
    const c = ePrimeSquared * Math.cos(latRad) ** 2;
    const angle = Math.cos(latRad) * (lonRad - lonOriginRad);
    const meridionalArc = a * (
      (1 - eSquared / 4 - (3 * eSquared ** 2) / 64 - (5 * eSquared ** 3) / 256) * latRad
      - ((3 * eSquared) / 8 + (3 * eSquared ** 2) / 32 + (45 * eSquared ** 3) / 1024) * Math.sin(2 * latRad)
      + ((15 * eSquared ** 2) / 256 + (45 * eSquared ** 3) / 1024) * Math.sin(4 * latRad)
      - ((35 * eSquared ** 3) / 3072) * Math.sin(6 * latRad)
    );
    const easting = k0 * n * (
      angle
      + ((1 - t + c) * angle ** 3) / 6
      + ((5 - 18 * t + t ** 2 + 72 * c - 58 * ePrimeSquared) * angle ** 5) / 120
    ) + 500000;
    let northing = k0 * (
      meridionalArc
      + n * Math.tan(latRad) * (
        angle ** 2 / 2
        + ((5 - t + 9 * c + 4 * c ** 2) * angle ** 4) / 24
        + ((61 - 58 * t + t ** 2 + 600 * c - 330 * ePrimeSquared) * angle ** 6) / 720
      )
    );

    if (hemisphere === "S") {
      northing += 10000000;
    }

    return [easting, northing];
  }

  function utmToLatLng(easting, northing, zone, hemisphere) {
    const a = 6378137;
    const f = 1 / 298.257223563;
    const k0 = 0.9996;
    const e = Math.sqrt(f * (2 - f));
    const eSquared = e * e;
    const ePrimeSquared = eSquared / (1 - eSquared);
    const x = easting - 500000;
    let y = northing;

    if (hemisphere === "S") {
      y -= 10000000;
    }

    const lonOrigin = (zone - 1) * 6 - 180 + 3;
    const meridionalArc = y / k0;
    const mu = meridionalArc / (a * (1 - eSquared / 4 - (3 * eSquared ** 2) / 64 - (5 * eSquared ** 3) / 256));
    const e1 = (1 - Math.sqrt(1 - eSquared)) / (1 + Math.sqrt(1 - eSquared));
    const phi1 = mu
      + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
      + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
      + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
      + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
    const n1 = a / Math.sqrt(1 - eSquared * Math.sin(phi1) ** 2);
    const t1 = Math.tan(phi1) ** 2;
    const c1 = ePrimeSquared * Math.cos(phi1) ** 2;
    const r1 = (a * (1 - eSquared)) / ((1 - eSquared * Math.sin(phi1) ** 2) ** 1.5);
    const d = x / (n1 * k0);
    const lat = phi1 - (n1 * Math.tan(phi1) / r1) * (
      d ** 2 / 2
      - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ePrimeSquared) * d ** 4) / 24
      + ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ePrimeSquared - 3 * c1 ** 2) * d ** 6) / 720
    );
    const lon = (lonOrigin * Math.PI) / 180 + (
      d
      - ((1 + 2 * t1 + c1) * d ** 3) / 6
      + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ePrimeSquared + 24 * t1 ** 2) * d ** 5) / 120
    ) / Math.cos(phi1);

    return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
  }

  function transformCoordinate(coordinate, sourceCrs = DEFAULT_CRS, targetCrs = DEFAULT_CRS) {
    const source = validateCrs(sourceCrs);
    const target = validateCrs(targetCrs);
    const normalizedSource = source.code;
    const normalizedTarget = target.code;
    const point = [Number(coordinate[0]), Number(coordinate[1])];

    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new Error("Coordinate contains invalid numeric values.");
    }

    if (normalizedSource === normalizedTarget) {
      return point;
    }

    const proj4 = getProj4();
    if (proj4?.defs?.(normalizedSource) && proj4?.defs?.(normalizedTarget)) {
      return proj4(normalizedSource, normalizedTarget, point);
    }

    if (normalizedSource === DEFAULT_CRS && normalizedTarget === WEB_MERCATOR) {
      return latLngToWebMercator(point[1], point[0]);
    }

    if (normalizedSource === WEB_MERCATOR && normalizedTarget === DEFAULT_CRS) {
      return webMercatorToLatLng(point[0], point[1]);
    }

    const sourceUtm = getUtmInfo(normalizedSource);
    const targetUtm = getUtmInfo(normalizedTarget);
    if (normalizedSource === DEFAULT_CRS && targetUtm) {
      return latLngToUtm(point[1], point[0], targetUtm.zone, targetUtm.hemisphere);
    }
    if (sourceUtm && normalizedTarget === DEFAULT_CRS) {
      return utmToLatLng(point[0], point[1], sourceUtm.zone, sourceUtm.hemisphere);
    }

    throw new Error(`No transformation path from ${normalizedSource} to ${normalizedTarget}.`);
  }

  function transformLatLngToCrs(latLng, targetCrs) {
    return transformCoordinate([latLng.lng, latLng.lat], DEFAULT_CRS, targetCrs);
  }

  function transformCrsToLatLng(coordinate, sourceCrs) {
    const [lng, lat] = transformCoordinate(coordinate, sourceCrs, DEFAULT_CRS);
    return { lat, lng };
  }

  function transformGeometryCoordinates(coordinates, sourceCrs, targetCrs) {
    if (!Array.isArray(coordinates)) {
      return coordinates;
    }

    if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      return transformCoordinate(coordinates, sourceCrs, targetCrs).concat(coordinates.slice(2));
    }

    return coordinates.map((item) => transformGeometryCoordinates(item, sourceCrs, targetCrs));
  }

  function reprojectGeoJSON(geojson, sourceCrs = DEFAULT_CRS, targetCrs = DEFAULT_CRS) {
    if (!geojson || normalizeCode(sourceCrs) === normalizeCode(targetCrs)) {
      return geojson;
    }

    const clone = JSON.parse(JSON.stringify(geojson));
    const reprojectGeometry = (geometry) => {
      if (!geometry?.coordinates) {
        return geometry;
      }
      geometry.coordinates = transformGeometryCoordinates(geometry.coordinates, sourceCrs, targetCrs);
      return geometry;
    };

    if (clone.type === "FeatureCollection") {
      clone.features = (clone.features || []).map((feature) => ({
        ...feature,
        geometry: reprojectGeometry(feature.geometry),
      }));
      delete clone.crs;
      return clone;
    }

    if (clone.type === "Feature") {
      clone.geometry = reprojectGeometry(clone.geometry);
      delete clone.crs;
      return clone;
    }

    return reprojectGeometry(clone);
  }

  function assignCrs(layerLike, crsCode) {
    const metadata = validateCrs(crsCode);
    if (layerLike && typeof layerLike === "object") {
      layerLike.crs = metadata.code;
      layerLike.crsMetadata = metadata;
    }
    return metadata;
  }

  function createRasterTransform(image) {
    const width = image.getWidth();
    const height = image.getHeight();
    const crs = detectGeoTiffCrs(image);
    validateCrs(crs.code);
    const tiePoints = image.getTiePoints?.() || [];
    const fileDirectory = image.getFileDirectory?.() || {};
    const pixelScale = fileDirectory.ModelPixelScale;
    const transformation = fileDirectory.ModelTransformation;
    let origin = null;
    let resolution = null;

    if (Array.isArray(transformation) && transformation.length >= 16) {
      origin = [Number(transformation[3]), Number(transformation[7])];
      resolution = [Number(transformation[0]), Number(transformation[5])];
    }

    if (!origin || !resolution) {
      try {
        origin = image.getOrigin();
        resolution = image.getResolution();
      } catch (_) {
        origin = null;
        resolution = null;
      }
    }

    if ((!origin || !resolution) && tiePoints.length && pixelScale?.length >= 2) {
      const tiePoint = tiePoints[0];
      origin = [
        Number(tiePoint.x) - Number(tiePoint.i || 0) * Number(pixelScale[0]),
        Number(tiePoint.y) + Number(tiePoint.j || 0) * Number(pixelScale[1]),
      ];
      resolution = [Number(pixelScale[0]), -Math.abs(Number(pixelScale[1]))];
    }

    if (!origin || !resolution || !Number.isFinite(origin[0]) || !Number.isFinite(origin[1])) {
      throw new Error("Raster is missing georeferencing metadata.");
    }

    const xResolution = Number(resolution[0]);
    const yResolution = Number(resolution[1]);
    if (!Number.isFinite(xResolution) || !Number.isFinite(yResolution) || xResolution === 0 || yResolution === 0) {
      throw new Error("Raster has invalid pixel resolution.");
    }

    const minX = Math.min(origin[0], origin[0] + width * xResolution);
    const maxX = Math.max(origin[0], origin[0] + width * xResolution);
    const minY = Math.min(origin[1], origin[1] + height * yResolution);
    const maxY = Math.max(origin[1], origin[1] + height * yResolution);

    return {
      width,
      height,
      crs,
      projection: crs,
      origin,
      resolution: [xResolution, yResolution],
      extent: { minX, minY, maxX, maxY },
      projectLatLngToRaster: (latLng) => transformLatLngToCrs(latLng, crs.code),
      unprojectRasterPoint: (x, y) => transformCrsToLatLng([x, y], crs.code),
      rasterToPixel: (x, y) => [
        Math.floor((x - origin[0]) / xResolution),
        Math.floor((y - origin[1]) / yResolution),
      ],
    };
  }

  function reprojectRasterLayer(layerRecord, targetCrs = DEFAULT_CRS) {
    if (!layerRecord?.rasterImage) {
      throw new Error("Raster layer does not expose a source raster image.");
    }
    const transform = createRasterTransform(layerRecord.rasterImage);
    if (normalizeCode(transform.crs.code) !== normalizeCode(targetCrs)) {
      validateCrs(targetCrs);
    }
    return {
      ...layerRecord,
      rasterTransform: transform,
      rasterMetadata: {
        ...(layerRecord.rasterMetadata || {}),
        crs: transform.crs.name,
        epsg: getEpsgNumber(transform.crs.code),
        extent: transform.extent,
      },
    };
  }

  function reprojectVectorLayer(layerRecord, targetCrs = DEFAULT_CRS) {
    const sourceCrs = layerRecord?.crs || detectGeoJsonCrs(layerRecord?.geojson).code;
    return {
      ...layerRecord,
      geojson: reprojectGeoJSON(layerRecord.geojson, sourceCrs, targetCrs),
      crs: normalizeCode(targetCrs),
      crsMetadata: getCrsMetadata(targetCrs),
    };
  }

  registerCrs(DEFAULT_CRS, "+proj=longlat +datum=WGS84 +no_defs +type=crs", {
    name: "WGS 84",
    type: "geographic",
    units: "degrees",
    aliases: [
      "CRS:84",
      "OGC:CRS84",
      "WGS84",
      "WGS 84",
      "GCS_WGS_1984",        // ArcGIS / Esri naming
      "GEOGRAPHIC CS: GCS_WGS_1984",
    ],
  });
  registerCrs(WEB_MERCATOR, "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs", {
    name: "WGS 84 / Pseudo-Mercator",
    type: "projected",
    units: "m",
    aliases: ["EPSG:900913", "EPSG:102100"],
  });
  registerCrs("EPSG:4269", "+proj=longlat +datum=NAD83 +no_defs +type=crs", {
    name: "NAD83",
    type: "geographic",
    units: "degrees",
  });

  global.CRSManager = {
    DEFAULT_CRS,
    WEB_MERCATOR,
    normalizeCode,
    parseCrs,
    detectGeoJsonCrs,
    detectGeoTiffCrs,
    getCrsMetadata,
    validateCrs,
    registerCrs,
    assignCrs,
    transformCoordinate,
    transformLatLngToCrs,
    transformCrsToLatLng,
    reprojectGeoJSON,
    reprojectVectorLayer,
    reprojectRasterLayer,
    createRasterTransform,
  };
})(window);
