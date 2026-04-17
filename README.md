# Spatial DECM

Spatial DECM is a lightweight browser-based map viewer for spatial data. Users can upload supported files directly in the webpage, visualize them on top of a dark CartoDB basemap, edit uploaded layers, draw new features, and manage multiple layers independently.

## Features

- CartoDB Dark Matter basemap powered by Leaflet
- Drag-and-drop or file-picker uploads
- Drop files anywhere on the page to import them
- Multiple uploaded layers at the same time
- Per-layer visibility toggle
- Zoom-to-layer, remove-layer, export, and edit-mode controls in the layer list
- Automatic map zoom to newly added data
- Toggle edit mode directly from any layer in the layer list
- Create a new empty layer directly from the `+` action in the Layers panel
- Add new point, line, and polygon features into the editable layer
- Edit geometry nodes on uploaded lines and polygons with the map edit tools
- Add a new field across all features in a layer from the attribute-table header
- View and edit an attribute table for the active edit layer
- Resize the attribute table vertically from its top edge
- Highlight the selected feature row inside the attribute table
- Export each layer individually to GeoJSON, KML, or zipped shapefile with a custom filename
- Field Calculator modal with field browser, function list, preview, and safe expression evaluation
- Supports arithmetic and string concatenation using `||` in calculator expressions
- Spatial calculator functions for `AREA()`, `LENGTH()`, `PERIMETER()`, `LATITUDE()`, `LONGITUDE()`, `CENTROID_LAT()`, and `CENTROID_LON()`
- Per-layer symbology with single-color, categorized, and graduated styling options
- Per-layer query builder with AND/OR logic for attribute filtering
- Theme toggle with `Dark`, `Light`, and `System` modes across the full app
- Client-side parsing for common spatial formats
- Dark interface across the whole app

## Supported formats

- `.geojson`
- `.json` containing GeoJSON
- `.kml`
- `.gpx`
- `.zip` containing a shapefile bundle
- `.csv` with latitude and longitude columns

## Run locally

Because the app is fully static, you can serve it with any simple local web server.

### Option 1: Python

```bash
cd "Spatial DECM"
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages

This project is ready to be published from the `Spatial DECM/` folder using GitHub Pages and GitHub Actions.

### Setup steps

1. Create a GitHub repository for this workspace.
2. Push the project to the `main` branch.
3. In GitHub, open `Settings -> Pages`.
4. Set `Source` to `GitHub Actions`.
5. Push again to `main`, or run the workflow manually from the `Actions` tab.

The workflow file is:

```text
.github/workflows/deploy-pages.yml
```

It deploys:

```text
Spatial DECM/
```

Your GitHub Pages URL will look like:

```text
https://<your-user-or-org>.github.io/<your-repository-name>/
```


## Notes

- Shapefile uploads should be zipped and include the related shapefile parts together, typically `.shp`, `.shx`, `.dbf`, and optionally `.prj`.
- CSV uploads should include a recognizable latitude column such as `latitude` or `lat`, and a longitude column such as `longitude`, `lon`, or `lng`.
- Use the `+` button in the Layers panel to browse for files or create a new named layer.
- To edit an uploaded dataset, enable edit mode for that layer from the Layers panel, then use the map draw and edit controls.
- The attribute table always shows the features for the layer currently in edit mode, and selecting a map feature highlights its row.
- The add-field control is a compact `+` icon in the attribute table header.
- The Field Calculator uses a safe math parser, supports arithmetic plus `||` string concatenation, and lets you preview the result on the first feature before applying it to the entire layer.
- Spatial calculator outputs use geometry from the current feature. `AREA()` returns square meters, `LENGTH()` and `PERIMETER()` return meters, `LATITUDE()` and `LONGITUDE()` read point coordinates, and centroid functions return the feature centroid coordinates.
- Symbology is configured per layer from the Layers panel. Categorized styling assigns colors to unique values, while graduated styling classifies numeric fields using equal interval or quantile breaks.
- Filtering is also configured per layer from the Layers panel and supports multiple rules joined by `AND` or `OR`.
- The theme button on the map toolbar cycles through `Dark`, `Light`, and `System`, and `System` follows the device-wide color scheme automatically.
- Exporting opens a small dialog where you can choose the output filename and format, and it never overwrites the original uploaded file.
- Very large datasets may feel slow in a pure browser-based viewer.
- The current version focuses on common client-readable spatial formats rather than every GIS format.
