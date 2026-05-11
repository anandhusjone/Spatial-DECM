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
</ol>`,

  layers: `<h3>Layers</h3>
<p>Every file you open becomes a <strong>layer</strong> — a card in the left panel. You can load as many layers as you like at the same time.</p>
<p><strong>Supported file types:</strong></p>
<ul>
  <li><strong>GeoJSON</strong> (.geojson, .json)</li>
  <li><strong>Shapefile</strong> — either a zipped bundle (.zip) or the individual files (.shp, .dbf, .shx, .prj, .cpg) selected together</li>
  <li><strong>KML</strong> (.kml)</li>
  <li><strong>GPX</strong> (.gpx) — GPS tracks and waypoints</li>
  <li><strong>CSV</strong> (.csv) — must have columns named lat/lon, lat/lng, or x/y</li>
  <li><strong>GeoTIFF</strong> (.tif, .tiff) — satellite imagery or raster data</li>
</ul>
<p><strong>Each layer card lets you:</strong></p>
<ul>
  <li>Toggle visibility with the eye icon</li>
  <li>Open the three-dot menu for more actions (style, edit, export, remove…)</li>
  <li>Click the table icon to view and edit the layer's data table</li>
</ul>`,

  import: `<h3>Importing Data</h3>
<p>There are two ways to add data to the map:</p>
<ul>
  <li><strong>Drag and drop</strong> — drag your file from your computer and drop it anywhere on the map. A blue overlay appears to confirm the drop zone.</li>
  <li><strong>File picker</strong> — click the <strong>Import</strong> button in the toolbar and choose your file.</li>
</ul>
<p>For <strong>shapefiles</strong>, you need to open all the sidecar files together (.shp, .dbf, .shx — and optionally .prj and .cpg). Select or drag all of them at once and the app groups them automatically.</p>
<p>For <strong>large CSV files</strong> (tens of thousands of rows), the app automatically switches to a fast preview mode so the browser does not slow down. You will see a label on the layer card telling you how many points are shown.</p>
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
  <li><em>Points</em> — circle, square, triangle, star, cross, or a custom image URL. Set size, fill, stroke colour, and opacity.</li>
  <li><em>Lines</em> — colour, width, opacity, solid/dashed/dotted style, and line cap/join.</li>
  <li><em>Polygons</em> — fill colour and opacity, stroke colour, width, style. Enable "Outline only" to draw hollow polygons.</li>
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
<p>Click <strong>New Layer</strong> in the toolbar, enter a name, and choose Point, Line, or Polygon. Then enable edit mode on that new layer to start drawing.</p>
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
<p>Use the <strong>Undo</strong> and <strong>Redo</strong> buttons in the attribute table toolbar to step back or forward through your changes (up to 50 steps).</p>`,

  "attribute-table": `<h3>Attribute Table</h3>
<p>The attribute table shows the data behind any vector layer — like a spreadsheet linked to the map.</p>
<p><strong>To open it:</strong> click the <strong>Table</strong> button in the toolbar, then click the table icon on a layer card to load that layer's data.</p>
<hr/>
<p><strong>What you can do in the table:</strong></p>
<ul>
  <li><strong>Search</strong> — type in the search box to filter rows by any value.</li>
  <li><strong>Sort</strong> — click any column header to sort by that field.</li>
  <li><strong>Edit a value</strong> — click any cell and type a new value. Changes are saved instantly.</li>
  <li><strong>Zoom to a feature</strong> — click the zoom icon on a row to fly to that feature on the map.</li>
  <li><strong>Add a field</strong> — click <strong>Add Field</strong> to add a new column with a default value for all features.</li>
  <li><strong>Undo / Redo</strong> — use the undo and redo buttons in the table toolbar.</li>
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
  <li>Pick a <strong>preview feature</strong> from the dropdown and click <strong>Preview</strong> to check the result before applying.</li>
  <li>Choose where to write the result: a <strong>new field</strong> (type a name) or an <strong>existing field</strong> (select from the list).</li>
  <li>Click <strong>Apply</strong> — the formula runs on every feature and writes the values immediately.</li>
</ol>
<hr/>
<p><strong>Expression examples:</strong></p>
<ul>
  <li><code>"population" / "area"</code> — divide two fields</li>
  <li><code>upper("name")</code> — convert text to uppercase</li>
  <li><code>"first_name" || " " || "last_name"</code> — join two text fields with a space</li>
  <li><code>AREA()</code> — polygon area in square metres</li>
  <li><code>LENGTH()</code> — line length in metres</li>
  <li><code>LATITUDE()</code> / <code>LONGITUDE()</code> — point coordinates</li>
  <li><code>CASE WHEN "status" = 'active' THEN 1 ELSE 0 END</code> — conditional value</li>
</ul>
<hr/>
<p><strong>Saving expressions:</strong> click <strong>Save Expression</strong> to store a formula with a name. Use <strong>Load</strong> to recall it later. Use <strong>Export / Import</strong> to share a library of expressions as a .json file.</p>`,

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

  projects: `<h3>Projects</h3>
<p>Projects let you save your entire workspace — all layers, styles, labels, filters, and the map position — and reopen it later exactly as you left it.</p>
<hr/>
<p><strong>Saving for the first time:</strong></p>
<ol>
  <li>Click <strong>Save</strong> in the project bar at the top, or press <strong>Ctrl+S</strong> (Windows/Linux) or <strong>Cmd+S</strong> (Mac).</li>
  <li>A prompt asks you to name your project.</li>
  <li>The browser asks you to choose a folder on your computer. All project files will be saved there.</li>
</ol>
<p><strong>Saving again later:</strong> press <strong>Ctrl+S</strong> or click Save — it saves directly to the same folder with no picker.</p>
<hr/>
<p><strong>Auto-Save:</strong> click the <strong>Auto-Save</strong> button in the project bar to turn on automatic saving. The project saves itself 5 seconds after any change. Only available after you have chosen a save folder.</p>
<hr/>
<p><strong>Opening a saved project:</strong> click <strong>Open</strong> and choose the folder you saved to. All layers and settings are restored.</p>
<p><strong>After a page refresh:</strong> click <strong>Reopen</strong> to reconnect to the last saved folder without browsing for it again.</p>
<hr/>
<p><strong>Save As:</strong> saves to a new folder. Only available after saving the project at least once.</p>
<hr/>
<p><em>Browser note: folder-based saving works in Chrome and Edge. In Firefox and Safari, projects are downloaded as a single .sdecm file instead.</em></p>`
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
