<div align="center">
  <br/>
  <img src="Logo1.png" alt="Spatial DECM" style="max-width: 100%; height: auto;">
  <br/><br/>
  <p><em>A lightweight, browser-based GIS viewer and editor </em></p>
</div>

<br/>

<div align="center">
  <a href="https://anandhusjone.github.io/Spatial-DECM/">
    <img src="launch-button.svg" alt="Start Using Spatial-DECM" height="48">
  </a>
</div>

<br/>

<p align="center">
  <img src="src/sdecm_v2.gif" width="800" alt="Watershed Demo">
</p>

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

Top toolbar basemap switcher · CartoDB Dark / Light · Google Satellite · OpenTopoMap · Dark / Light / System theme · Attribute table toggle

<br/>

**✏️ Editing**

Create layers · Add points, lines, polygons · Edit geometries · Attribute table editing · Add custom fields

<br/>

**🧮 Field Calculator**

QGIS-style expressions · Arithmetic · String ops (`||`) · `CASE WHEN` · Null checks · Spatial functions · Preview before applying · Save & reuse expressions

<br/>

**📐 Measure Tool**

Distance and area measurement · Live cursor preview · Multi-segment polyline · Polygon area on 3+ points

<br/>

**📍 GPS Locate**

One-click device location · Accuracy circle · Auto-zoom to position

</td>
<td width="50%" valign="top">

**📊 Spatial Functions**

`$area` · `$length` · `$x` · `$y` · `intersects()` · `within()` · `overlay_intersects()` · `overlay_nearest()` · `aggregate()`

<br/>

**🎨 Styling**

Advanced point / line / polygon symbols · Categorized · Graduated · Rule-based styling · Labels with halo/background/scale controls · Raster gray / pseudocolor · Color ramps · Query builder with `AND` / `OR` filters

<br/>

**🔥 Analysis**

Heatmap · IDW interpolation · Gaussian Kernel interpolation · Nearest Neighbor interpolation · Viewshed / Diffraction Loss Modelling · **Watershed & Channel Extraction** · Peaks & Hills

<br/>

**💾 Project Workspace**

Save / load `.sdecm` project bundles · File System Access API for live folder workspaces · Auto-save (5 s debounce) · Ctrl+S shortcut · Dirty-state tracking

<br/>

**📤 Export**

GeoJSON · KML · Zipped Shapefile

</td>
</tr>
</table>

<br/>

## Supported Formats

| Format | Notes |
|--------|-------|
| `.geojson` / `.json` | Standard GeoJSON |
| `.kml` | Keyhole Markup Language |
| `.gpx` | GPS Exchange Format |
| `.zip` | Zipped shapefile bundle — must include `.shp`, `.shx`, `.dbf` |
| `.shp` + sidecars | Loose shapefile import — select or drag the matching `.shp`, `.dbf`, `.shx`, `.prj`, and `.cpg` files together |
| `.csv` | Lat/lon columns (`lat`, `lon`, `lng`, `x`, `y`) **or** a combined column (`coordinates`, `coords`, `location`, `point`, etc.) with values like `"8.42, 77.04"`. Delimiter auto-detected: comma, semicolon, tab, or pipe. Large files (> 50 000 points) use streaming mode — see [Large CSV files](#large-csv-files). |
| `.tif` / `.tiff` | GeoTIFF raster with tiled browser rendering, raster metadata, pixel sampling, NoData handling, and WGS84 / Web Mercator / WGS84 UTM alignment. Also used as DEM input for viewshed, watershed, and peak / hill detection. |

<br/>

## Usage

```
1. Open the app
2. Drag and drop your file, or click the + button in the Layers panel
3. Use layer cards to view, edit, style, filter, analyze, or export
4. Save a project or export a layer when done
```

> All processing happens **client-side**. Your data never leaves your browser.  
> Large datasets may run slower due to browser memory limits.

<br/>

## Layer workflow

- **Add data** — drag files onto the map, or click the **+** button in the Layers panel and choose *Browse files*.
- **Create data** — click **+** → *Create new layer*, choose Point / Line / Polygon, then enable edit mode on the new layer.
- **Layer cards** — use the eye button for visibility, the opacity slider for transparency, the drag handle for ordering, and the layer name to select / zoom the layer. Long layer names and metadata are clipped or wrapped inside the card so the controls remain usable.
- **Layer actions** — right-click a layer card to zoom, enable / disable editing, style, raster-style, filter, interpolate, heatmap, export, or remove it. Available actions depend on the layer type.
- **Attribute table** — click a vector layer name to load it in the table. Enable editing with the pencil button before editing cells, deleting rows, or using the field calculator.

<br/>

## Large CSV files

CSV files are parsed in a background worker so the UI stays responsive during import. The worker reads the file in 2 MB chunks, detects the delimiter automatically, and applies a streaming reservoir-sample / tile-grid algorithm:

| Point count | Mode | What you see on the map |
|-------------|------|-------------------------|
| ≤ 50 000 | **Full vector** | Every point rendered as a normal vector layer |
| 50 001 – 250 000 | **Sample preview** | Up to 20 000 randomly sampled points (reservoir sampling) |
| > 250 000 | **Grid preview** | One polygon per map tile (zoom 8) showing the point count for that cell |

- The layer card shows the total point count from the file, not just the displayed points.
- A separate **analysis sample** of up to 50 000 points (reservoir-sampled) is kept in memory for heatmap and interpolation.
- Filtering and query-builder rules are skipped for large CSV layers (filters apply to the full dataset on re-import instead).
- Export reflects the display mode (`sample-preview` or `grid-preview`); re-import the original file and keep it under 50 000 points to export the full dataset.

<br/>

## Point Interpolation

Point interpolation creates a derived raster surface from numeric point attributes. Right-click an eligible point layer and choose **Interpolate**.

**Controls**

- **Value field** — numeric attribute to interpolate.
- **Method** — Inverse Distance Weighted, Gaussian Kernel, or Nearest Neighbor.
- **Sample scope** — use visible / filtered features only, or all point features.
- **Clip extent** — output grid clipped to the convex hull or bounding box.
- **Influence radius** — maximum point influence distance in metres.
- **Cell size** — output raster resolution in metres.
- **Power** — IDW distance falloff; higher values make nearby points dominate.
- **Minimum nearby samples** — cells need this many nearby points before a value is drawn.
- **Color ramp / Opacity** — display styling for the generated raster.

Click **Apply Interpolation** to create the raster layer, or **Clear Surface** to remove the derived surface for that source layer.

<br/>

## Point Heatmap

Point heatmap creates a density or weighted-density raster from point features. Right-click an eligible point layer and choose **Heatmap**.

**Controls**

- **Weight field** — optional numeric weight; leave as feature count for equal weighting.
- **Sample scope** — use visible / filtered features only, or all point features.
- **Clip extent** — output grid clipped to the convex hull or bounding box.
- **Radius** — heat spread distance in metres.
- **Cell size** — output raster resolution in metres.
- **Minimum nearby samples** — cells need this many nearby points before they are drawn.
- **Intensity exponent** — scales heat values up or down.
- **Exact cell size** — bypasses auto-resizing; useful only for smaller areas.
- **Color ramp / Opacity** — display styling for the generated raster.

Click **Apply Heatmap** to create the raster layer, or **Clear Heatmap** to remove the derived heatmap for that source layer.

<br/>

## Viewshed / Diffraction Loss Modelling

<p align="center">
  <img src="src/viewshed_demo.gif" width="800" alt="Watershed Demo">
</p>

Viewshed / Diffraction Loss Modelling computes which areas of the terrain are visible from one observer point or from every point in a loaded point vector layer. It can also model KED radio diffraction loss over the same DEM extent for a single observer. Click the **Viewshed / Diffraction Loss Modelling** toolbar button to open the panel.

The panel keeps **Run Viewshed** / **Run KED** visible at the bottom while the settings scroll when the content is taller than the screen.

**Elevation sources**

| Mode | Source | Resolution |
|------|--------|-----------|
| Local DEM | Any single-band GeoTIFF loaded into the layer panel | Native raster resolution |
| Global DEM | [AWS Open Data — Terrain Tiles (Terrarium)](https://registry.opendata.aws/terrain-tiles/) | ~30 m/px at zoom 12 |

When *Use Global DEM* is ticked the app fetches RGB-encoded Terrarium elevation tiles (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`) and stitches them into a single in-memory float grid before running the algorithm. A maximum of 64 tiles is fetched per run (≈ 50 km radius at most latitudes).

**Algorithm** — Radial Bresenham line-of-sight sweep (`app/60-viewshed.js`). For every pixel on the DEM perimeter a ray is cast from the observer outward. A cell is marked visible if its angle of elevation from the observer equals or exceeds the running maximum angle seen on that ray so far. Optional Earth-curvature and atmospheric-refraction correction uses k = 0.13.

**Observer sources**

- **Single Point** — pick a point on the map or paste `lat, lng`, then set **Max Radius** for that observer. A radius of `0` means unlimited for a local DEM; Global DEM requires a radius.
- **Point Layer** — select a loaded point vector layer such as GeoJSON, zipped Shapefile, KML, GPX, or CSV-derived points. Optionally select numeric **Radius Field** and **Observer Height Field** values for per-point ranges and observer heights. If a field is not selected, enter a **Common Radius** or **Common Observer Height** used by all points.

**Output** — A vector overlay layer named *Viewshed* is added to the map. Visible terrain is painted in semi-transparent green (`rgba(0, 255, 120, 0.45)`). In point-layer mode, each visible polygon part is stored as its own feature with `observer_id`, `radius_m`, `observer_height_m`, and source-point fields, and each observer is stored as a separate `view_point` feature. Invalid points or invalid radius / observer-height values are skipped and reported in the status message.

**KED diffraction mode** — Toggle *Multiple Knife-Edge Diffraction* in the Viewshed / Diffraction Loss Modelling panel, then keep the same elevation source, observer point, observer height, and maximum radius settings used for viewshed. Click *Run KED* to create a separate raster layer named *KED Diffraction Loss*.

**KED inputs**

- **Frequency (MHz)** — radio frequency used for free-space path loss and diffraction calculations.
- **Tx Power (dBm)** — transmitter power at the observer point. Accepted range: -30 to 60 dBm.
- **Rx Threshold (dBm)** — minimum usable received signal. Accepted range: -150 to 0 dBm.
- **Ray Samples** — number of elevation samples along each observer-to-cell terrain profile. Higher values capture terrain obstruction in more detail but take longer.

**KED output** — The tool estimates received signal strength with `Rx (dBm) = Tx (dBm) - free-space path loss - Epstein-Peterson diffraction loss`. It is not mathematically combined with the normal *Viewshed* layer.

**KED colors** — The KED raster uses a red opacity ramp: the highest received value is fully opaque red, and weaker / higher-loss cells become progressively more transparent.

<br/>

## Watershed & Channel Extraction

<p align="center">
  <img src="src/watershed_demo.gif" width="800" alt="Watershed Demo">
</p>

Watershed analysis delineates upstream drainage basins and extracts stream channel networks from a DEM. Click the **Watershed** toolbar button to open the panel.

**Elevation sources** — same Local / Global DEM options as Viewshed (shared tile utilities in `app/dem-utils.js`).

**AOI modes**

| Mode | How it works |
|------|-------------|
| **Pour Point** | Click a point on the map; it snaps to the nearest stream cell and delineates the full upstream basin |
| **Polygon** | Draw a freehand polygon; channels and sub-basins are clipped to that extent |
| **Canvas** | Uses the current map viewport as the analysis extent and automatically uses Global DEM |

**Parameters**

- **Flow accumulation threshold** — minimum upstream cell count to classify a cell as a stream channel. Lower values produce denser networks.
- **Minimum slope** — Wang & Liu (2006) sink-fill gradient (default 1×10⁻⁴ m/m). Prevents flat-terrain flow stagnation by imposing a gentle drainage gradient across filled depressions.
- **Sub-basins** — optional toggle to subdivide the delineated basin at channel confluences.

**Algorithm** — D8 flow direction with Wang & Liu sink-fill, GPU-accelerated via WebGL 1 where available (falls back to CPU workers automatically). Flow accumulation, basin delineation, and sub-basin extraction each run in dedicated Web Workers to keep the UI responsive. A cancel button terminates all active workers immediately.

**Output** — Two vector layers are added to the map: *Stream Channels* (polylines) and *Watershed Basin* (polygon, with optional sub-basin polygons).

<br/>

## Peaks & Hills

Peaks & Hills detects terrain summits from a DEM and creates a point layer named *Peaks & Hills*. It uses one summit-detection workflow, then automatically labels stronger local-relief features as *Peak* and lower-relief features as *Hill*.

The panel keeps **Run Peaks & Hills** visible at the bottom while the settings scroll when needed.

**Elevation sources** — Local DEM uses a loaded GeoTIFF raster. Global DEM fetches Terrarium elevation tiles around a picked centre point and radius.

**AOI modes**

| Mode | How it works |
|------|-------------|
| **Canvas** | Uses the current visible map area for Local DEM |
| **Radius** | Uses a picked or pasted centre point and radius in metres; required for Global DEM |

**Parameters**

- **Search radius** — pixel radius used to decide whether a cell is the highest point nearby.
- **Minimum relief** — minimum local height difference between a summit and surrounding lower terrain.
- **Smoothing** — optional pixel radius used to reduce noisy DEM spikes before detection.
- **Peak cutoff** — accepted summits with relief at or above this value are labelled *Peak*; the rest are labelled *Hill*.
- **Minimum elevation** — optional lower cutoff before detection.
- **Max results** — caps the ranked output.

**Algorithm** — The tool optionally smooths the DEM, finds plateau-tolerant local maxima, measures local relief against surrounding lower terrain, filters by threshold, and applies non-maximum suppression so nearby duplicates collapse to one representative summit. Results are ranked by local relief first, then elevation.

**Output** — A vector point layer with `rank`, `kind`, `elevation_m`, `relief_m`, and `label` fields. Peak markers use coral triangles; hill markers use teal domes.

<br/>

## CRS handling

Coordinate system detection, validation, transformation, and layer reprojection are centralized in `app/crs-manager.js`. The app uses Proj4 when available, includes built-in support for WGS84, Web Mercator, and WGS84 UTM zones, and exposes registration hooks for custom CRS definitions. Vector imports with declared CRS metadata are normalized to the map CRS, and GeoTIFF rasters use the same CRS service for alignment and sampling.

GeoJSON files that declare an unrecognised CRS are imported with a console warning and treated as WGS84 per RFC 7946 §4, rather than rejected.

## Styling and labeling

Vector styling and labeling are centralized in `app/vector-style-manager.js`. Point layers support circle, square, triangle, star, cross, and custom icon symbols with size, fill, stroke, and opacity controls. Line layers support width, color, opacity, dash styles, custom dash patterns, caps, and joins. Polygon layers support fill opacity, outline-only rendering, stroke color, width, opacity, and stroke styles.

Labels can be enabled per layer with a field or `{field}` template expression, font styling, text opacity, halo, background, border, offsets, rotation, priority, overlap avoidance, and min/max zoom visibility. Style and label edits are applied live and saved with project files.

<br/>

## Project Workspace

Projects are saved as `.sdecm` bundles (a JSON manifest + per-layer GeoJSON files). In browsers that support the **File System Access API** (Chrome / Edge), the app can read and write directly to a local folder — enabling Ctrl+S saves and 5-second auto-save. In other browsers a `.sdecm` zip bundle is downloaded instead. On reload, FSA workspaces are automatically re-connected with a single permission prompt.

<br/>

## Source layout

| File | Role |
|------|------|
| `app/00-core.js` | Global constants, shared helpers, theme/basemap (Dark · Light · Satellite · Topo), modal and status utilities |
| `app/10-analysis-layers.js` | Layer management, CSV parsing & streaming worker, GeoJSON normalisation, interpolation, heatmap, export |
| `app/20-tools-ui.js` | Toolbar, layer list UI, style/label panels, filter/query builder, export modal |
| `app/30-bootstrap.js` | App initialisation, file-drop handling, drag-and-drop wiring |
| `app/40-project.js` | Project save/load (`.sdecm` bundle or FSA folder), auto-save, dirty-state tracking |
| `app/50-map-tools.js` | GPS locate, distance/area measure tool |
| `app/60-viewshed.js` | Viewshed / Diffraction Loss Modelling panel, Bresenham line-of-sight algorithm, KED diffraction raster generation |
| `app/70-watershed.js` | Watershed & channel extraction — D8 flow direction, Wang & Liu sink-fill, WebGL GPU acceleration, Web Worker offloading |
| `app/80-peaks.js` | Peak & hill detection panel, plateau-tolerant summit detection, non-maximum suppression |
| `app/99-help-content.js` | In-app help text |
| `app/calculator/` | Field calculator — tokenizer, parser, AST, evaluator, built-in function catalog |
| `app/crs-manager.js` | CRS detection, Proj4 reprojection, UTM zone helpers |
| `app/dem-utils.js` | Shared DEM / Terrarium tile utilities — tile fetching, stitching, coordinate transforms (used by viewshed & watershed) |
| `app/vector-style-manager.js` | Symbol rendering, categorised/graduated/rule-based styling, label engine. |

<br/>

## Who is this for?

- Students learning GIS for the first time
- Non-GIS users who need quick access to GIS
- Developers working with spatial data
- Anyone who finds a full GIS software too heavy for simple tasks

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
