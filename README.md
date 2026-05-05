# Spatial DECM

![logo](Logo.svg)

**Spatial DECM** is a lightweight, browser-based GIS viewer and editor built for quick, simple spatial tasks — no installation required.

👉 **Live App:** https://anandhusjone.github.io/Spatial-DECM/

---

## Why this exists

This project was inspired by a few common situations:

- GIS software like QGIS or ArcGIS can feel too heavy for beginners or occasional users  
- Many people uninstall these tools after learning because of size or complexity  
- Opening a simple GIS file often requires installing full desktop software  
- Sometimes, you just want to quickly view or make small edits to spatial data  

**Spatial DECM solves this by running entirely in your browser.**

---

## What it does

Spatial DECM is designed as a **quick-access GIS tool** for:

- Visualizing spatial data  
- Making small edits  
- Performing lightweight analysis  

No setup. No installs. Just open and use.

---

## Features

### 📂 Data Handling
- Drag-and-drop file upload
- File picker support
- Multiple layers at once
- Auto zoom to uploaded data
- Per-layer visibility control

### 🗺️ Map & Basemap
- CartoDB basemaps (Dark / Light)
- Google Satellite option
- Theme-aware UI (Dark / Light / System)

### ✏️ Editing Tools
- Create new layers
- Add points, lines, polygons
- Edit geometries directly on the map
- Attribute table editing
- Add new fields to layers

### 🧮 Field Calculator
- QGIS-style expressions
- Supports:
  - Arithmetic
  - String operations (`||`)
  - `CASE WHEN` logic
  - Null checks (`IS NULL`)
  - Spatial functions
- Preview before applying
- Save and reuse expressions

### 📊 Spatial Functions
- `AREA()`
- `LENGTH()`
- `PERIMETER()`
- `LATITUDE()`, `LONGITUDE()`
- `CENTROID_LAT()`, `CENTROID_LON()`

### 🎨 Styling & Filtering
- Single color styling
- Categorized styling
- Graduated styling
- Query builder with AND / OR filters

### 🔥 Analysis Tools
- Heatmap (point density)
- Point interpolation:
  - IDW
  - Gaussian
  - Nearest Neighbor

### 📤 Export Options
- GeoJSON
- KML
- Zipped Shapefile

---

## Supported Formats

- `.geojson`
- `.json` (GeoJSON)
- `.kml`
- `.gpx`
- `.zip` (Shapefile bundle)
- `.csv` (with latitude & longitude columns)

---

## Usage

1. Open the app  
2. Drag and drop your file  
3. View, edit, or analyze your data  
4. Export if needed  

---

## Notes

- Shapefiles must be uploaded as `.zip` including:
  - `.shp`, `.shx`, `.dbf` (and optionally `.prj`)
- CSV files should include latitude and longitude fields  
  (e.g., `lat`, `lon`, `lng`, `x`, `y`)
- All processing happens **client-side**
- Large datasets may be slower due to browser limitations

---

## Who is this for?

- Students learning GIS  
- Non-GIS users who need quick access  
- Developers working with spatial data  
- Anyone who wants a simple alternative to heavy GIS tools  

---

## Philosophy

Spatial DECM is **not a replacement** for full GIS software like QGIS or ArcGIS.

It’s built for the moments when those tools feel like overkill.

---

## License

MIT License (or update based on your repo)

---
