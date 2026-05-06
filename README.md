<div align="center">
  <br/>
  <img src="Logo.png" alt="Spatial DECM" width="560">
  <br/><br/>
  <p><em>A lightweight, browser-based GIS viewer and editor — no installation required.</em></p>
  <img src="https://img.shields.io/badge/Client--Side-No_Server-4a9d87?style=for-the-badge" alt="Client Side">
  &nbsp;
  <img src="https://img.shields.io/badge/License-MIT-6b7280?style=for-the-badge" alt="MIT License">
  <br/><br/>
  ---
</div>

<br/>

<div align="center">
  <a href="https://anandhusjone.github.io/Spatial-DECM/">
    <img src="https://img.shields.io/badge/%E2%80%8B%20%E2%80%8B%20%E2%80%8B%20%E2%80%8B%20%E2%80%8B%20%E2%86%92%20%20Start%20Using%20It%20Here%20%20%20%20%20%20%20%20%20%20-000000?style=for-the-badge" alt="→ Start Using It Here" height="40">
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

Drag-and-drop upload · File picker · Multiple layers · Auto-zoom · Per-layer visibility

<br/>

**🗺️ Map**

CartoDB Dark / Light basemaps · Google Satellite · Dark / Light / System theme

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

Single color · Categorized · Graduated · Query builder with `AND` / `OR` filters

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

---

<br/>

## Supported Formats

| Format | Notes |
|--------|-------|
| `.geojson` / `.json` | Standard GeoJSON |
| `.kml` | Keyhole Markup Language |
| `.gpx` | GPS Exchange Format |
| `.zip` | Shapefile bundle — must include `.shp`, `.shx`, `.dbf` |
| `.csv` | Must include lat/lon columns (`lat`, `lon`, `lng`, `x`, `y`) |

<br/>

---

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

<br/>

---

<br/>

## Who is this for?

- Students learning GIS for the first time
- Non-GIS users who need quick spatial access
- Developers working with spatial data
- Anyone who finds full GIS software too heavy for simple tasks

<br/>

---

<br/>

## Philosophy

> Spatial DECM is **not** a replacement for QGIS or ArcGIS.  
> It's built for the moments when those feel like overkill.

<br/>

---

<div align="center">
  <sub>Built for the browser. Built for simplicity.</sub>
</div>
