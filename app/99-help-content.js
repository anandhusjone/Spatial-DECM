/* ── Help Modal: Cascaded Navigation ── */

const helpPages = {
  welcome: `<h3>Welcome to Spatial DECM</h3>
<p>Spatial DECM is a free, browser-based map tool. You can open spatial files, view and edit your data, run analysis, and export results — all without installing any software.</p>
<p><strong>Everything runs in your browser. Your files never leave your device.</strong></p>
<p>Use the sidebar on the left to jump to any topic.</p>
<hr/>
<p><strong>Quick start:</strong></p>
<ol>
  <li>Drag a file onto the map — or click <strong>Import</strong> in the toolbar.</li>
  <li>Your data appears as a layer in the left panel.</li>
  <li>Click the three-dot menu on a layer to style, filter, analyse, or export it.</li>
</ol>
<hr/>
<p><strong>New here?</strong> Download our sample dataset to explore the app straight away.</p>
<a href="https://raw.githubusercontent.com/anandhusjone/Spatial-DECM/refs/heads/main/Sample_project.zip" download style="display:inline-flex;align-items:center;gap:8px;margin-top:4px;padding:9px 18px;background:#2563eb;color:#fff;border-radius:7px;text-decoration:none;font-weight:600;font-size:0.95em;">
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  Download Sample Data
</a>`,

  layers: `<h3>Layers</h3>
<p>Every file you open becomes a <strong>layer</strong> — a card in the left panel. You can load as many layers as you like at the same time.</p>
<p><strong>Supported file types:</strong></p>
<ul>
  <li><strong>GeoJSON</strong> (.geojson, .json)</li>
  <li><strong>Shapefile</strong> — either a zipped bundle (.zip) or the individual files (.shp, .dbf, .shx, .prj, .cpg) selected together</li>
  <li><strong>KML</strong> (.kml)</li>
  <li><strong>GPX</strong> (.gpx) — GPS tracks and waypoints</li>
  <li><strong>CSV</strong> (.csv) — must have columns named lat/lon, lat/lng, or x/y — or a single combined column (e.g. <em>Coordinates</em>) containing values like <code>8.42, 77.04</code></li>
  <li><strong>GeoTIFF</strong> (.tif, .tiff) — satellite imagery or elevation raster. GeoTIFF layers are raster layers: they have no attribute table, but you can style them via <strong>Raster Style</strong> and use them as elevation sources for Viewshed and Watershed.</li>
</ul>
<p><strong>Each layer card lets you:</strong></p>
<ul>
  <li>Toggle visibility with the eye icon</li>
  <li>Click the layer name to rename it in place</li>
  <li>Open the three-dot menu for more actions — see below</li>
</ul>
<p><strong>Three-dot menu actions (vary by layer type):</strong></p>
<ul>
  <li><strong>Zoom</strong> — fly the map to fit the layer's extent</li>
  <li><strong>Enable / Disable edit mode</strong> — turns on the draw toolbar for vector layers</li>
  <li><strong>Style</strong> — open the symbology and labeling panel (vector layers)</li>
  <li><strong>Raster Style</strong> — open the raster symbology panel (GeoTIFF layers)</li>
  <li><strong>Filter</strong> — show only features that match a set of rules (vector layers)</li>
  <li><strong>Interpolate</strong> — create a continuous surface from point values</li>
  <li><strong>Heatmap</strong> — create a point-density heatmap</li>
  <li><strong>Export</strong> — save the layer to a file (vector layers)</li>
  <li><strong>Remove</strong> — delete the layer from the map</li>
</ul>`,

  import: `<h3>Importing Data</h3>
<p>There are three ways to add data to the map:</p>
<ul>
  <li><strong>Drag and drop</strong> — drag your file from your computer and drop it anywhere on the map. A blue overlay appears to confirm the drop zone.</li>
  <li><strong>File picker</strong> — click the <strong>Import</strong> button in the toolbar, then choose <strong>Browse files</strong> and select your file.</li>
  <li><strong>Create a new empty layer</strong> — click <strong>Import</strong>, then choose <strong>Create new layer</strong>. Enter a name and pick a geometry type (Point, Line, or Polygon). The new layer appears in the panel ready for drawing.</li>
</ul>
<p>For <strong>shapefiles</strong>, you need to open all the sidecar files together (.shp, .dbf, .shx — and optionally .prj and .cpg). Select or drag all of them at once and the app groups them automatically. A single .zip containing the shapefile also works.</p>
<p>For <strong>large CSV files</strong> (tens of thousands of rows), the app automatically switches to a fast preview mode so the browser does not slow down. You will see a label on the layer card telling you how many points are shown.</p>
<p>For <strong>GeoTIFF files</strong>, the layer appears as a raster card. It has no attribute table, but you can style it with <strong>Raster Style</strong> and use it as an elevation source in Viewshed or Watershed.</p>
<p>After import, the map automatically zooms to fit your new layer.</p>`,

  symbology: `<h3>Styling Your Layer</h3>
<p>To change how a layer looks, open its three-dot menu and choose <strong>Style</strong>.</p>
<p>The Style panel has two tabs: <strong>Styling</strong> and <strong>Labeling</strong>.</p>
<hr/>
<p><strong>Styling tab — choose a mode:</strong></p>
<ul>
  <li><strong>Single Color</strong> — all features share one colour. Pick the colour and (for points) the shape, size, and outline.</li>
  <li><strong>Categorized</strong> — pick an attribute field. Each unique value in that field gets its own colour automatically. You can change any colour individually.</li>
  <li><strong>Graduated</strong> — pick a numeric field. The values are split into classes (you choose how many) and coloured along a ramp from light to dark. Good for showing quantities like population or rainfall.</li>
  <li><strong>Rule Based</strong> — highlight features that match a specific condition (e.g. status = active). Non-matching features use the default colour.</li>
</ul>
<hr/>
<p><strong>Shape options by layer type:</strong></p>
<ul>
  <li><em>Points</em> — circle, square, triangle, star, cross, or a custom image URL. Set size, fill colour, stroke colour, and opacity.</li>
  <li><em>Lines</em> — colour, width, opacity, solid/dashed/dotted style, line cap (round, square, or butt), and line join (round, miter, or bevel).</li>
  <li><em>Polygons</em> — fill colour and opacity, stroke colour, width, style. Enable <strong>Outline only</strong> to draw hollow polygons.</li>
</ul>
<hr/>
<p><strong>Labeling tab:</strong></p>
<ul>
  <li>Tick <strong>Enable labels</strong> to turn on labels.</li>
  <li>Pick a field to use as the label text, or write a template like <code>{name} — {type}</code>.</li>
  <li>Adjust font, size, colour, halo, and background to make labels readable over the map.</li>
  <li>Set minimum and maximum zoom levels so labels only appear when they fit on screen.</li>
  <li>Enable <strong>Avoid overlap</strong> to prevent labels from drawing on top of each other.</li>
</ul>
<p>Click <strong>Apply Symbology</strong> to save your changes. Click <strong>Reset</strong> to go back to the last saved style.</p>`,

  drawing: `<h3>Drawing & Editing Features</h3>
<p>You can draw new map features or edit existing ones on any vector layer.</p>
<hr/>
<p><strong>Step 1 — Enable Edit Mode</strong></p>
<p>Open a layer's three-dot menu and choose <strong>Enable edit mode</strong>. The draw toolbar appears on the map. Layers with more than 5 000 features cannot be edited.</p>
<hr/>
<p><strong>Step 2 — Create a new empty layer (optional)</strong></p>
<p>Click <strong>Import</strong> in the toolbar, then choose <strong>Create new layer</strong>. Enter a name and choose Point, Line, or Polygon. Then enable edit mode on that new layer to start drawing.</p>
<hr/>
<p><strong>Step 3 — Draw</strong></p>
<ul>
  <li><strong>Point</strong> — click the map once to place a point.</li>
  <li><strong>Line</strong> — click to add each vertex. Double-click to finish.</li>
  <li><strong>Polygon</strong> — click to add each corner. Click the first point again, or double-click, to close the shape.</li>
  <li><strong>Rectangle</strong> — click and drag a box (polygon layers only).</li>
</ul>
<p>Newly drawn features are added to the active layer immediately.</p>
<hr/>
<p><strong>Step 4 — Edit or delete existing features</strong></p>
<ul>
  <li>Click the <strong>Edit layers</strong> tool in the draw toolbar, then drag any vertex to move it. Click <strong>Save</strong> to confirm.</li>
  <li>Click the <strong>Delete layers</strong> tool, click the features to remove, then click <strong>Save</strong>.</li>
</ul>
<hr/>
<p><strong>Undo / Redo</strong></p>
<p>Use the <strong>Undo</strong> and <strong>Redo</strong> buttons in the attribute table toolbar to step back or forward through your changes (up to 50 steps).</p>
<hr/>
<p><strong>Rename a layer</strong></p>
<p>Click the layer name in the attribute table header, or click the pencil icon next to the layer card name, to rename it. The new name is saved immediately.</p>`,

  "attribute-table": `<h3>Attribute Table</h3>
<p>The attribute table shows the data behind any vector layer — like a spreadsheet linked to the map.</p>
<p><strong>To open it:</strong> click the <strong>Table</strong> button in the toolbar, then click the table icon on a layer card to load that layer's data.</p>
<hr/>
<p><strong>What you can do in the table:</strong></p>
<ul>
  <li><strong>Search</strong> — type in the search box to filter rows by any value.</li>
  <li><strong>Sort</strong> — click any column header to sort by that field.</li>
  <li><strong>Edit a value</strong> — enable edit mode first (the pencil button in the table toolbar), then click any cell and type a new value. Changes are saved instantly.</li>
  <li><strong>Zoom to a feature</strong> — click the zoom icon on a row to fly to that feature on the map.</li>
  <li><strong>Add a field</strong> — click <strong>Add Field</strong> (the + icon in the table toolbar). Enter a field name and an optional default value that will be written to every existing feature.</li>
  <li><strong>Rename the layer</strong> — click the layer name in the table header to edit it in place.</li>
  <li><strong>Undo / Redo</strong> — use the undo and redo buttons in the table toolbar (available in edit mode).</li>
  <li><strong>Export</strong> — download the layer in GeoJSON, KML, or Shapefile format.</li>
</ul>
<p>Resize the table panel by dragging the handle between the map and the table.</p>`,

  "field-calculator": `<h3>Field Calculator</h3>
<p>The Field Calculator lets you fill a field automatically using a formula — similar to a spreadsheet formula that runs on every row at once.</p>
<p><strong>To open it:</strong> click <strong>Field Calculator</strong> in the attribute table toolbar, or choose it from a layer's three-dot menu.</p>
<hr/>
<p><strong>How to use it:</strong></p>
<ol>
  <li>Write an expression in the editor. Click a field name in the left panel or a function name in the right panel to insert it.</li>
  <li>Pick a <strong>preview feature</strong> from the dropdown and click <strong>Preview</strong> to check the result for that one row before applying to all.</li>
  <li>Choose where to write the result: a <strong>new field</strong> (type a name) or an <strong>existing field</strong> (select from the list).</li>
  <li>Click <strong>Apply to layer</strong> — the formula runs on every feature and writes the values immediately.</li>
</ol>
<hr/>
<p><strong>Expression examples:</strong></p>
<ul>
  <li><code>"population" / "area"</code> — divide two fields</li>
  <li><code>upper("name")</code> — convert text to uppercase</li>
  <li><code>"first_name" || " " || "last_name"</code> — join two text fields with a space</li>
  <li><code>AREA()</code> — polygon area in square metres (polygon layers only)</li>
  <li><code>LENGTH()</code> — line length in metres (line layers only)</li>
  <li><code>LATITUDE()</code> / <code>LONGITUDE()</code> — point coordinates (point layers only)</li>
  <li><code>CASE WHEN "status" = 'active' THEN 1 ELSE 0 END</code> — conditional value</li>
</ul>
<hr/>
<p><strong>Saving and sharing expressions:</strong></p>
<ul>
  <li>Click <strong>Save Expression</strong> to store a formula with a name.</li>
  <li>Select a saved expression and click <strong>Load</strong> to recall it, or <strong>Delete</strong> to remove it.</li>
  <li>Click the <strong>⋯</strong> menu to <strong>Export all</strong> saved expressions as a .json file, or <strong>Import</strong> a previously exported library to restore them.</li>
</ul>`,

  interpolation: `<h3>Interpolation</h3>
<p>Interpolation fills in a smooth, continuous surface from scattered point measurements — for example, turning weather station readings into a full temperature map.</p>
<p><strong>To use it:</strong> open a point layer's three-dot menu and choose <strong>Interpolate</strong>.</p>
<hr/>
<p><strong>Settings:</strong></p>
<ul>
  <li><strong>Value field</strong> — the numeric attribute to interpolate (e.g. temperature, elevation, rainfall).</li>
  <li><strong>Method</strong>:
    <ul>
      <li><em>IDW</em> — fast; nearby points have more influence. Good general choice.</li>
      <li><em>Gaussian</em> — produces smoother, more gradual surfaces.</li>
      <li><em>Nearest Neighbor</em> — assigns each area the value of the closest point. Creates a sharp patchwork look.</li>
    </ul>
  </li>
  <li><strong>Radius</strong> — how far (in metres) each point influences the surface around it.</li>
  <li><strong>Cell size</strong> — output resolution in metres. Smaller = finer detail but slower to compute.</li>
  <li><strong>Color ramp</strong> — the colour scheme for the result (e.g. Terrain-Glow, Sunset-Heat).</li>
  <li><strong>Opacity</strong> — how transparent the result overlay is on the map.</li>
</ul>
<p>The summary card shows how many points will be used and the output grid size before you apply.</p>
<p>Click <strong>Apply</strong> to create the surface — it appears as a coloured raster layer, with a legend in the bottom-right corner of the map.</p>
<p>Click <strong>Clear</strong> to remove it.</p>`,

  heatmap: `<h3>Heatmap</h3>
<p>A heatmap shows where points are densely clustered. Hot colours (red, yellow) mean many points close together; cool colours (blue) mean few.</p>
<p><strong>To use it:</strong> open a point layer's three-dot menu and choose <strong>Heatmap</strong>.</p>
<hr/>
<p><strong>Settings:</strong></p>
<ul>
  <li><strong>Weight field</strong> — optionally scale each point by a numeric attribute (e.g. incident severity). Leave as "Feature count" for equal weight.</li>
  <li><strong>Radius</strong> — how far each point's heat spreads outward (in metres).</li>
  <li><strong>Cell size</strong> — output grid resolution in metres. Smaller = finer detail but slower.</li>
  <li><strong>Intensity</strong> — scale the overall heat values up or down.</li>
  <li><strong>Color ramp</strong> — colour scheme for the output.</li>
  <li><strong>Opacity</strong> — transparency of the heatmap overlay on the map.</li>
</ul>
<p>Click <strong>Apply</strong> — a heatmap overlay layer is created on the map.</p>
<p>Click <strong>Clear</strong> to remove it.</p>`,

  export: `<h3>Exporting Data</h3>
<p>You can save any vector layer to a file on your computer.</p>
<p><strong>To export:</strong> open the layer's three-dot menu and choose <strong>Export</strong>.</p>
<hr/>
<p><strong>Available formats:</strong></p>
<ul>
  <li><strong>GeoJSON</strong> — open format, widely supported by web tools and other GIS software.</li>
  <li><strong>KML</strong> — opens in Google Earth and Google My Maps.</li>
  <li><strong>Zipped Shapefile</strong> — standard format for desktop GIS software like QGIS or ArcGIS.</li>
</ul>
<p>Edit the filename if you want, choose a format, and click <strong>Export</strong>. The file downloads immediately.</p>
<p><em>Note: styles, labels, and filters are not saved inside the exported file — only the geometry and attribute data.</em></p>`,

  viewshed: `<h3>Viewshed Analysis</h3>
<p>Viewshed analysis shows which areas on the ground are <strong>visible</strong> from a chosen observer point — accounting for terrain elevation. Visible areas are highlighted in green on the map.</p>
<hr/>
<p><strong>Step 1 — Open the panel</strong></p>
<p>Click <strong>Viewshed</strong> button in the toolbar (eye-with-rays icon). A floating panel appears. You can drag it by its title bar to reposition it on the map.</p>
<hr/>
<p><strong>Step 2 — Choose an elevation source</strong></p>
<p>There are two options:</p>
<ul>
  <li><strong>Local DEM</strong> — load a GeoTIFF elevation raster (e.g. SRTM, ALOS, or any single-band DEM) using Import. Once loaded it appears in the <em>Elevation raster</em> dropdown.</li>
  <li><strong>Global DEM</strong> — tick <em>Use Global DEM</em>. The app fetches Terrarium RGB-encoded elevation tiles from AWS Open Data automatically. No file needed. A radius is required (5 000 – 50 000 m). Resolution is approximately 30 m/pixel at zoom 12.</li>
</ul>
<hr/>
<p><strong>Step 3 — Set the observer</strong></p>
<p>Click <strong>Pick from Map</strong>, then click the location on the map where the observer stands. A green marker and a dashed radius circle appear to confirm. You can also type coordinates directly. Drag the panel out of the way if needed.</p>
<hr/>
<p><strong>Step 4 — Configure parameters</strong></p>
<ul>
  <li><strong>Observer height</strong> — height of the observer's eyes above the ground (metres). Use 1.7 m for a standing person, 20 m for a tower, etc.</li>
  <li><strong>Target height</strong> — minimum height of a target above ground for it to count as visible (metres). Leave at 0 to test ground-level visibility.</li>
  <li><strong>Max radius</strong> — only analyse terrain within this distance from the observer (metres). Set to 0 for unlimited extent (local DEM only). Required when using the Global DEM.</li>
  <li><strong>Earth curvature &amp; refraction</strong> — tick this for long-distance analyses (&gt; 5 km). Accounts for the curvature of the Earth and atmospheric bending of light, which would otherwise make distant terrain appear more visible than it really is.</li>
</ul>
<hr/>
<p><strong>Step 5 — Run the analysis</strong></p>
<p>Click <strong>Compute Viewshed</strong>. A progress bar appears while tiles are fetched and the algorithm runs. The result appears as a new <strong>Viewshed</strong> layer in the layer panel.</p>
<hr/>
<p><strong>Reading the result</strong></p>
<ul>
  <li><strong>Green areas</strong> — terrain visible from the observer point.</li>
  <li><strong>Transparent areas</strong> — terrain hidden from view (behind hills or ridges).</li>
</ul>
<p>A legend in the bottom-right corner labels the two categories. Running the analysis again replaces the previous Viewshed layer.</p>`,

  watershed: `<h3>Watershed &amp; Channel Extraction</h3>
<p>The Watershed tool delineates drainage basins and extracts stream channel networks from an elevation model. It uses D8 flow routing and Strahler stream ordering to produce a <strong>basin raster</strong> and a <strong>stream channel vector layer</strong>.</p>
<hr/>
<p><strong>Step 1 — Open the panel</strong></p>
<p>Click the <strong>Watershed</strong> button in the toolbar (water-drop icon). A floating panel appears. You can drag it anywhere on the map.</p>
<hr/>
<p><strong>Step 2 — Choose an elevation source</strong></p>
<ul>
  <li><strong>Local GeoTIFF</strong> — import a single-band DEM (SRTM, ALOS, etc.) and select it from the dropdown.</li>
  <li><strong>Global DEM</strong> — fetches Terrarium RGB tiles from AWS automatically (~30 m resolution). Set an analysis radius (5 000 – 50 000 m).</li>
</ul>
<hr/>
<p><strong>Step 3 — Set delineation input</strong></p>
<ul>
  <li><strong>Pour Point</strong> — click <em>Pick from Map</em>, then click the outlet point of the basin (e.g. the mouth of a river). The tool traces all terrain draining to that point.</li>
  <li><strong>Draw Polygon</strong> — click <em>Draw Polygon</em> on the map to sketch a boundary polygon. The tool analyses all terrain and drainage <em>within</em> that polygon, regardless of where water flows to. Useful when you want to study a specific region rather than trace upstream from a single outlet.</li>
</ul>
<hr/>
<p><strong>Step 4 — Configure parameters</strong></p>
<ul>
  <li><strong>Channel Threshold</strong> — minimum number of upstream cells required for a cell to be classified as a channel. Lower values produce denser networks; higher values show only major rivers.</li>
  <li><strong>Delineate sub-basins</strong> — tick to split the watershed into smaller sub-basins coloured by drainage order. Set the <em>Minimum sub-basin area</em> to filter out tiny basins.</li>
</ul>
<hr/>
<p><strong>Step 5 — Run the analysis</strong></p>
<p>Click <strong>Run Watershed</strong>. The tool runs pit-filling, flow direction, flow accumulation, and stream ordering, then adds two layers:</p>
<ul>
  <li><strong>Watershed Basins</strong> — a raster overlay colour-coded from blue (headwaters) to purple (larger basins).</li>
  <li><strong>Stream Channels</strong> — a vector layer of stream lines. Line weight and colour reflect stream order (thicker = larger, higher-order stream).</li>
</ul>
<p>A <strong>Cancel</strong> button appears during processing — click it to stop a long-running analysis.</p>`,

  projects: `<h3>Projects</h3>
<p>Projects let you save your entire workspace — all layers, styles, labels, filters, and the map position — and reopen it later exactly as you left it.</p>
<hr/>
<p><strong>Saving for the first time:</strong></p>
<ol>
  <li>Click <strong>Save</strong> in the project bar at the top, or press <strong>Ctrl+S</strong> (Windows/Linux) or <strong>Cmd+S</strong> (Mac).</li>
  <li>A prompt asks you to name your project.</li>
  <li>The browser asks you to choose a folder on your computer. All project files will be saved there — a manifest file plus one GeoJSON file per layer.</li>
</ol>
<p><strong>Saving again later:</strong> press <strong>Ctrl+S</strong> or click Save — it saves directly to the same folder with no picker.</p>
<hr/>
<p><strong>Auto-Save:</strong> click the <strong>Auto-Save</strong> button in the project bar to turn on automatic saving. The project saves itself 5 seconds after any change. Only available after you have chosen a save folder.</p>
<hr/>
<p><strong>Opening a saved project:</strong> click <strong>Open</strong> and choose the folder you saved to. All layers and settings are restored.</p>
<p><strong>After a page refresh:</strong> click <strong>Reopen</strong> to reconnect to the last saved folder without browsing for it again.</p>
<hr/>
<p><strong>Save As:</strong> saves to a new folder, creating a fresh copy of the project. Only available after saving at least once.</p>
<hr/>
<p><strong>New Project:</strong> clears all layers and resets the workspace. You will be asked to confirm if you have unsaved changes.</p>
<hr/>
<p><em>Browser note: folder-based saving works in Chrome and Edge. In Firefox and Safari, projects are downloaded as a single .sdecm file (a zip containing the manifest and all layer data) instead.</em></p>`,

  filter: `<h3>Layer Filter</h3>
<p>The Filter tool lets you hide features that do not match a set of conditions, so you can focus on just the data you care about. Filtered-out features are hidden on the map and excluded from analysis tools like Interpolation and Heatmap.</p>
<p><strong>To open it:</strong> open a vector layer's three-dot menu and choose <strong>Filter</strong>.</p>
<hr/>
<p><strong>How to use it:</strong></p>
<ol>
  <li>Click <strong>Add Rule</strong> to create a condition. Each rule has three parts: a <strong>field</strong>, an <strong>operator</strong> (equals, not equals, contains, greater than, less than, etc.), and a <strong>value</strong>.</li>
  <li>If you add more than one rule, choose whether features must match <strong>ALL</strong> rules (AND) or <strong>ANY</strong> rule (OR) using the logic selector at the top.</li>
  <li>Click <strong>Apply Filter</strong>. Features that do not match are hidden immediately.</li>
</ol>
<p>A filter indicator appears on the layer card to show that a filter is active.</p>
<hr/>
<p><strong>Removing a filter:</strong> open the Filter panel again and click <strong>Clear Filter</strong>. All features become visible again.</p>`,

  "raster-style": `<h3>Raster Symbology</h3>
<p>Raster Symbology lets you control how a GeoTIFF layer is displayed — its colour scheme, value range, brightness, contrast, and opacity. You can also inspect the file's metadata here.</p>
<p><strong>To open it:</strong> open a GeoTIFF layer's three-dot menu and choose <strong>Raster Style</strong>.</p>
<hr/>
<p><strong>Render type:</strong></p>
<ul>
  <li><strong>Singleband gray</strong> — maps pixel values to a greyscale or colour ramp.</li>
  <li><strong>Singleband pseudocolor</strong> — applies a multi-colour ramp across the value range for more visual contrast.</li>
</ul>
<hr/>
<p><strong>Settings:</strong></p>
<ul>
  <li><strong>Band</strong> — choose which band to display (for multi-band files).</li>
  <li><strong>Color ramp</strong> — Terrain Glow, Viridis Edge, Sunset Heat, Ice Fire, or Black to White.</li>
  <li><strong>Classification</strong> — how values are divided into colour steps: Continuous (smooth), Equal Interval, or Quantile.</li>
  <li><strong>Classes</strong> — number of colour steps (3, 5, 7, or 9). Only applies to Equal Interval and Quantile modes.</li>
  <li><strong>Minimum / Maximum</strong> — clamp the colour ramp to a specific value range. Useful for excluding outliers.</li>
  <li><strong>NoData value</strong> — pixels with this value are rendered transparent. Leave blank to detect automatically.</li>
  <li><strong>Brightness / Contrast</strong> — adjust the visual appearance of the rendered layer (−100 to +100).</li>
  <li><strong>Opacity</strong> — transparency of the raster overlay on the map.</li>
</ul>
<hr/>
<p><strong>Metadata panel:</strong> the right side of the dialog shows source information about the file — CRS, dimensions, band count, and value statistics.</p>
<p>Click <strong>Apply Raster Style</strong> to save your changes. Click <strong>Reset</strong> to revert to the last applied style.</p>`,

  locate: `<h3>Find My Location</h3>
<p>The Locate tool uses your device's GPS or network position to show where you are on the map.</p>
<p><strong>To use it:</strong> click the <strong>Locate</strong> button in the map toolbar (crosshair/dot icon).</p>
<hr/>
<p><strong>How it works:</strong></p>
<ul>
  <li><strong>First click</strong> — requests your location. A pulsing blue dot appears at your position, surrounded by a dashed circle showing the accuracy radius. A popup shows your coordinates and the accuracy in metres.</li>
  <li><strong>Second click</strong> — cancels a pending location request if it has not yet resolved.</li>
  <li><strong>Third click</strong> (after a location is shown) — clears the dot and accuracy circle from the map.</li>
</ul>
<p>The map zooms to your location automatically (at least to zoom level 14).</p>
<p><em>Note: your browser will ask for permission to access your location the first time you use this tool. If you deny permission, the tool will not work.</em></p>`,

  measure: `<h3>Measure Distance & Area</h3>
<p>The Measure tool lets you click out a path or polygon on the map and read its distance and area in real time.</p>
<p><strong>To use it:</strong> click the <strong>Measure</strong> button in the map toolbar (ruler icon).</p>
<hr/>
<p><strong>How to measure:</strong></p>
<ol>
  <li>Click anywhere on the map to place the first point. A dashed orange line follows your cursor as you move.</li>
  <li>Click again to add more points. The running total distance updates with each click.</li>
  <li>Once you have three or more points, an area figure also appears alongside the distance.</li>
  <li>To finish, either:
    <ul>
      <li><strong>Double-click</strong> the last point, or</li>
      <li><strong>Click the first point</strong> (highlighted in white) to close the shape as a polygon.</li>
    </ul>
  </li>
</ol>
<p>A result popup appears showing the total distance and area. Click the popup's close button to dismiss it.</p>
<hr/>
<p><strong>Units:</strong></p>
<ul>
  <li>Distance — metres (m) under 1 km, kilometres (km) above.</li>
  <li>Area — square metres (m²) under 1 ha, hectares (ha) under 1 km², square kilometres (km²) above.</li>
</ul>
<hr/>
<p><strong>To cancel mid-measurement:</strong> click the Measure button again, or press <strong>Escape</strong>. The in-progress drawing is cleared.</p>`,

  basemap: `<h3>Basemap & Theme</h3>
<p>Spatial DECM has three independent display controls: the <strong>basemap</strong> (the background map tiles), the <strong>app theme</strong> (dark or light UI), and an optional <strong>Global DEM</strong> overlay.</p>
<hr/>
<p><strong>Basemap switcher</strong></p>
<p>Click the <strong>layers icon</strong> button at the bottom-right of the map to open the basemap picker. Four options are available:</p>
<ul>
  <li><strong>Dark</strong> — CartoDB Dark Matter. Good for bright data layers.</li>
  <li><strong>Light</strong> — CartoDB Positron. Good for print-style output.</li>
  <li><strong>Satellite</strong> — aerial/satellite imagery.</li>
  <li><strong>Topo</strong> — topographic map with contour context.</li>
</ul>
<p>Click any option to switch immediately. The current basemap name is shown in the button label.</p>
<hr/>
<p><strong>App theme</strong></p>
<p>Click the <strong>Dark / Light / System</strong> button (floating at the bottom-right of the map) to cycle the interface theme. <em>System</em> follows your operating system's dark/light preference.</p>
<hr/>
<p><strong>Global DEM overlay</strong></p>
<p>When enabled, the app overlays Terrarium RGB-encoded elevation tiles (~30 m resolution) from AWS Open Data. This overlay is used automatically by the Viewshed and Watershed tools when <em>Use Global DEM</em> is selected in those panels — you do not need to enable it manually for analysis.</p>`
};

(function () {
  const helpContentArea = document.getElementById('help-content-area');
  const helpNavItems = document.querySelectorAll('.help-nav-item');

  // Guard against missing DOM elements
  if (!helpModal || !helpContentArea) return;
  if (helpNavItems.length === 0) return;

  let currentHelpSection = 'welcome';

  function showHelpSection(section) {
    currentHelpSection = section;

    const content = helpPages[section];
    if (!content) return;
    helpContentArea.innerHTML = content;

    helpNavItems.forEach(btn => {
      btn.classList.toggle('help-nav-item-active', btn.dataset.helpSection === section);
    });
  }

  // Initialize content
  showHelpSection('welcome');

  // Backdrop close (open/close buttons handled in 30-bootstrap.js)
  helpModal.querySelector('.modal-backdrop')?.addEventListener('click', closeHelpModal);

  // Nav item listeners
  helpNavItems.forEach(btn => {
    btn.addEventListener('click', () => showHelpSection(btn.dataset.helpSection));
  });

  // Expose so external code can navigate programmatically if needed
  window.showHelpSection = showHelpSection;
}());
