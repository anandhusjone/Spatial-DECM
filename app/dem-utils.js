/* =============================================================
   dem-utils.js — Shared DEM / Terrarium tile utilities
   Exposes globals used by both 60-viewshed.js and 70-watershed.js.
   Must be loaded BEFORE either analysis module.

   Globals exported:
     TERRARIUM_URL, TILE_SIZE,
     degToRad, latToTileY, lngToTileX, tileXToLng, tileYToLat,
     chooseZoom, fetchTileImageData, fetchGlobalDem
   ============================================================= */

// Elevation tiles from AWS Open Data (public, CORS-enabled, no auth):
//   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
//
// RGB encoding: elevation (m) = (R * 256 + G + B / 256) − 32768
// Coverage: global, ~30 m/px at zoom 12.

const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TILE_SIZE     = 256;

function degToRad(d) { return d * Math.PI / 180; }

function latToTileY(lat, z) {
  const n      = Math.pow(2, z);
  const sinLat = Math.sin(degToRad(lat));
  return n * (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI));
}

function lngToTileX(lng, z) {
  return Math.pow(2, z) * (lng + 180) / 360;
}

function tileXToLng(x, z) {
  return x / Math.pow(2, z) * 360 - 180;
}

function tileYToLat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Pick zoom so the stitched raster is ~1024 px wide, capped at z=12 (~30 m/px). */
function chooseZoom(lat, radiusM) {
  const targetMPP = radiusM / 512;
  const mpp0      = 156543 * Math.cos(degToRad(lat));
  return Math.max(2, Math.min(12, Math.round(Math.log2(mpp0 / targetMPP))));
}

async function fetchTileImageData(z, x, y) {
  const url = TERRARIUM_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y);
  const img = await new Promise((resolve, reject) => {
    const i    = new Image();
    i.crossOrigin = "anonymous";
    i.onload  = () => resolve(i);
    i.onerror = () => reject(new Error(
      `Could not load elevation tile ${z}/${x}/${y}. ` +
      `Check your internet connection or try a smaller radius.`
    ));
    i.src = url;
  });
  const c = document.createElement("canvas");
  c.width = c.height = TILE_SIZE;
  c.getContext("2d").drawImage(img, 0, 0);
  return c.getContext("2d").getImageData(0, 0, TILE_SIZE, TILE_SIZE);
}

/**
 * Fetch & stitch Terrarium tiles covering an analysis circle.
 * Returns { dem, width, height, transform, cellSizeX, cellSizeY }
 * with `transform` matching the GeoTIFF rasterTransform interface.
 *
 * @param {L.LatLng} center
 * @param {number}   radiusM    analysis radius in metres
 * @param {Function} [onStatus] optional callback(string) for progress messages
 */
async function fetchGlobalDem(center, radiusM, onStatus) {
  const z = chooseZoom(center.lat, radiusM);

  // Bounding box in degrees
  const latDeg = radiusM / 111320;
  const lngDeg = radiusM / (111320 * Math.cos(degToRad(center.lat)));
  const north  = center.lat + latDeg, south = center.lat - latDeg;
  const west   = center.lng - lngDeg, east  = center.lng + lngDeg;

  const txMin = Math.floor(lngToTileX(west,  z));
  const txMax = Math.floor(lngToTileX(east,  z));
  const tyMin = Math.floor(latToTileY(north, z));
  const tyMax = Math.floor(latToTileY(south, z));

  const nCols      = txMax - txMin + 1;
  const nRows      = tyMax - tyMin + 1;
  const totalTiles = nCols * nRows;

  if (totalTiles > 64) {
    throw new Error(
      `Radius too large at this location: would need ${totalTiles} tiles. ` +
      `Please reduce the radius (≤ ~50 km works well).`
    );
  }

  if (onStatus) onStatus(`Fetching ${totalTiles} elevation tile${totalTiles !== 1 ? "s" : ""} (zoom ${z})…`);

  // Fetch all tiles in parallel
  const jobs = [];
  for (let ry = 0; ry < nRows; ry++) {
    for (let cx = 0; cx < nCols; cx++) {
      jobs.push(fetchTileImageData(z, txMin + cx, tyMin + ry));
    }
  }
  const tileImgData = await Promise.all(jobs);

  // Stitch into one Float32Array
  const width  = nCols * TILE_SIZE;
  const height = nRows * TILE_SIZE;
  const dem    = new Float32Array(width * height);

  for (let ry = 0; ry < nRows; ry++) {
    for (let cx = 0; cx < nCols; cx++) {
      const imgd = tileImgData[ry * nCols + cx].data;
      for (let py = 0; py < TILE_SIZE; py++) {
        for (let px = 0; px < TILE_SIZE; px++) {
          const si  = (py * TILE_SIZE + px) * 4;
          const dr  = ry * TILE_SIZE + py;
          const dc  = cx * TILE_SIZE + px;
          dem[dr * width + dc] =
            (imgd[si] * 256 + imgd[si + 1] + imgd[si + 2] / 256) - 32768;
        }
      }
    }
  }

  // Geographic extent of the stitched raster
  const bboxNorth = tileYToLat(tyMin,     z);
  const bboxSouth = tileYToLat(tyMax + 1, z);
  const bboxWest  = tileXToLng(txMin,     z);
  const bboxEast  = tileXToLng(txMax + 1, z);

  const cellW = (bboxEast  - bboxWest)  / width;   // degrees per pixel
  const cellH = (bboxNorth - bboxSouth) / height;  // degrees per pixel (north-up)

  // Build a transform object matching the GeoTIFF rasterTransform interface
  const transform = {
    width,
    height,
    extent: { minX: bboxWest, maxX: bboxEast, minY: bboxSouth, maxY: bboxNorth },
    projectLatLngToRaster(latlng) { return [latlng.lng, latlng.lat]; },
    rasterToPixel(x, y) {
      return [(x - bboxWest) / cellW, (bboxNorth - y) / cellH];
    },
    unprojectRasterPoint(x, y) { return { lat: y, lng: x }; },
  };

  // Approximate cell sizes in metres
  const cellSizeX = cellW * 111320 * Math.cos(degToRad(center.lat));
  const cellSizeY = cellH * 111320;

  return { dem, width, height, transform, cellSizeX, cellSizeY };
}
