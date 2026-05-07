<div align="center">
  <br/>
  <img src="Logo.png" alt="Spatial DECM" style="max-width: 100%; height: auto;">
  <br/><br/>
  <p><em>A lightweight, browser-based GIS viewer and editor</em></p>
</div>

<br/>

<div align="center">
  <a href="https://anandhusjone.github.io/Spatial-DECM/">
    <img src="launch-button.svg" alt="Start Using Spatial-DECM" height="48">
  </a>
</div>

<br/>

## Why this exists

Full GIS software like QGIS or ArcGIS is powerful — but often overkill. Opening a single `.geojson` file shouldn't require a 2GB install.

**Spatial DECM is for those in-between moments.** Quick edits. Fast previews. No setup. Runs entirely in your browser.

<br/>

## Features

<table>
<tr>
<td width="50%" valign="top">

**📂 Data**

Drag-and-drop upload · File picker · Multiple vector/raster layers · Auto-zoom · Per-layer visibility

<br/>

**🗺️ Map**

Top toolbar basemap switcher · CartoDB Dark / Light basemaps · Google Satellite · Dark / Light / System theme · Attribute table toggle

<br/>

**✏️ Editing**

Create layers · Add points, lines, polygons · Edit geometries · Attribute table editing · Add custom fields

<br/>

**🧮 Field Calculator**

QGIS-style expressions · Arithmetic · String ops (`||`) · `CASE WHEN` · Null checks · Spatial functions · Preview before applying · Save & reuse expressions

</td>
<td width="50%" valign="top">

**📊 Spatial Functions**

`AREA()` · `LENGTH()` · `PERIMETER()` · `LATITUDE()` · `LONGITUDE()` · `CENTROID_LAT()` · `CENTROID_LON()`

<br/>

**🎨 Styling**

Vector single color · Categorized · Graduated · Raster gray / pseudocolor · Color ramps · Contrast / brightness / opacity · Query builder with `AND` / `OR` filters

<br/>

**🔥 Analysis**

Heatmap · IDW interpolation · Gaussian interpolation · Nearest Neighbor interpolation

<br/>

**📤 Export**

GeoJSON · KML · Zipped Shapefile

</td>
</tr>
</table>

<br/>


<br/>

## Supported Formats

| Format | Notes |
|--------|-------|
| `.geojson` / `.json` | Standard GeoJSON |
| `.kml` | Keyhole Markup Language |
| `.gpx` | GPS Exchange Format |
| `.zip` | Shapefile bundle — must include `.shp`, `.shx`, `.dbf` |
| `.csv` | Must include lat/lon columns (`lat`, `lon`, `lng`, `x`, `y`) |
| `.tif` / `.tiff` | GeoTIFF raster with tiled browser rendering, raster metadata, pixel sampling, NoData handling, and WGS84 / Web Mercator / WGS84 UTM alignment. |

<br/>


## Usage

```
1. Open the app
2. Drag and drop your file
3. View, edit, or analyze
4. Export when done
```

> All processing happens **client-side**. Your data never leaves your browser.  
> Large datasets may run slower due to browser memory limits.

## CRS handling

Coordinate system detection, validation, transformation, and layer reprojection are centralized in `app/crs-manager.js`. The app uses Proj4 when available, includes built-in support for WGS84, Web Mercator, and WGS84 UTM zones, and exposes registration hooks for custom CRS definitions. Vector imports with declared CRS metadata are normalized to the map CRS, and GeoTIFF rasters use the same CRS service for alignment and sampling.

<br/>


<br/>

## Who is this for?

- Students learning GIS for the first time
- Non-GIS users who need quick access to GIS
- Developers working with spatial data
- Anyone who finds a full GIS software too heavy for simple tasks

<br/>



<br/>

## Philosophy

 Spatial DECM is **not** a replacement for QGIS or ArcGIS.  
 It's built for the moments when those feel like overkill.

<br/>



<div align="center">
  <sub>Built for the browser. Built for simplicity.</sub>
</div>

<br/>

<div align="center">
  <a href="https://anandhusjone.github.io/Spatial-DECM/">
    <img src="launch-button.svg" alt="Start Using Spatial-DECM" height="48">
  </a>
</div>
