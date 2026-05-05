/* ── Help Modal: Cascaded Navigation ── */

const helpPages = {
  welcome: `<h3>Welcome to Spatial Data Explorer</h3>
<p>Spatial Data Explorer is a powerful web-based GIS tool built on Leaflet. It supports layers, editing, spatial analysis, and more — all in your browser with no server required.</p>
<p>Use the sidebar to jump to any topic. Click a parent topic to see its child pages.</p>`,

  layers: `<h3>Layers</h3>
<p>Layers are the building blocks of your map. This app supports:</p>
<ul>
  <li><strong>GeoJSON</strong> — Vector data with styles and popups</li>
  <li><strong>KML</strong> — Google Earth format</li>
  <li><strong>GeoTIFF</strong> — Raster images via GDAL.js</li>
  <li><strong>WMS</strong> — Web Map Service tiles from remote servers</li>
  <li><strong>TileJSON / XYZ</strong> — Custom tile sources (Mapbox, Stadia, etc.)</li>
</ul>
<p>Use the <strong>Add Layer</strong> button in the map toolbar to get started.</p>`,

  import: `<h3>Importing Data</h3>
<p>Import files directly into your map:</p>
<ul>
  <li><strong>Drag &amp; Drop</strong> — Drop files onto the map to auto-import</li>
  <li><strong>File Picker</strong> — Use the Import button in the toolbar</li>
  <li><strong>Supported formats</strong> — GeoJSON, KML, GPX, CSV, zipped Shapefile</li>
</ul>
<p>Imported data appears as a new layer in the Layers panel.</p>`,

  "attribute-table": `<h3>Attribute Table</h3>
<p>View and edit the tabular data behind any vector layer:</p>
<ul>
  <li>Click the <strong>Table</strong> icon on a layer in the Layers panel</li>
  <li>Search, sort, and filter rows</li>
  <li>Click a cell to edit its value</li>
  <li>Click <strong>Export CSV</strong> to download the data</li>
</ul>`,

  "field-calculator": `<h3>Field Calculator</h3>
<p>Perform calculations on layer attributes:</p>
<ul>
  <li>Open the Field Calculator from a layer's context menu</li>
  <li>Write expressions using field names (e.g. <code>area * 0.5</code>)</li>
  <li>Create new fields or update existing ones</li>
</ul>`,

  symbology: `<h3>Symbology</h3>
<p>Change how your layers appear on the map:</p>
<ul>
  <li><strong>Point layers</strong> — Choose icon, color, and size</li>
  <li><strong>Line layers</strong> — Set stroke width and dash pattern</li>
  <li><strong>Polygon layers</strong> — Choose fill and stroke styles</li>
  <li><strong>Choropleth</strong> — Color by attribute value with graduated scale</li>
</ul>`,

  drawing: `<h3>Drawing &amp; Editing</h3>
<p>Create and edit vector features on the map:</p>
<ul>
  <li>Click the <strong>Polygon</strong>, <strong>Line</strong>, or <strong>Point</strong> tool in the toolbar</li>
  <li>Draw on the map — features are saved automatically</li>
  <li>Right-click to finish a drawing</li>
  <li>Use <strong>Edit Mode</strong> to move, delete, or modify existing features</li>
</ul>`,

  "spatial-filter": `<h3>Spatial Filtering</h3>
<p>Select features based on their location:</p>
<ul>
  <li><strong>Box Select</strong> — Drag a rectangle on the map</li>
  <li><strong>Circle Select</strong> — Click to draw a circle</li>
  <li><strong>Polygon Select</strong> — Draw a custom shape</li>
  <li>Choose which layer to query and what to do with selected features</li>
</ul>`,

  interpolation: `<h3>Interpolation</h3>
<p>Create continuous surfaces from point data:</p>
<ul>
  <li><strong>IDW (Inverse Distance Weighting)</strong> — Fast, local influence</li>
  <li><strong>Kriging</strong> — Statistically optimal, accounts for spatial autocorrelation</li>
</ul>
<p>Specify a value field and output resolution. Result appears as a new raster layer.</p>`,

  heatmap: `<h3>Heatmap</h3>
<p>Visualize point density:</p>
<ul>
  <li>Select a point layer to convert to heatmap</li>
  <li>Adjust radius and intensity</li>
  <li>Choose a color gradient</li>
</ul>
<p>Heatmap renders as an overlay — toggle visibility in the Layers panel.</p>`,

  export: `<h3>Exporting Data</h3>
<p>Save your work in various formats:</p>
<ul>
  <li>Export GeoJSON, KML, GPX from vector layers</li>
  <li>Export CSV from attribute tables</li>
  <li>Export raster as GeoTIFF</li>
  <li>Export the entire map as an HTML file</li>
</ul>`,

  projects: `<h3>Projects</h3>
<p>Save and load your workspace:</p>
<ul>
  <li><strong>Save</strong> — Export your current map state as a JSON project file</li>
  <li><strong>Load</strong> — Import a previously saved project</li>
  <li><strong>Auto-save</strong> — The last session is restored automatically</li>
</ul>
<p>Projects save layers, view extent, and map settings — not the actual data files.</p>`
};

const parentToChildren = {
  layers: ['import', 'symbology'],
  drawing: ['attribute-table', 'field-calculator'],

  interpolation: ['heatmap'],
  export: ['projects']
};

const childrenToParent = {};
for (const [parent, children] of Object.entries(parentToChildren)) {
  children.forEach(child => { childrenToParent[child] = parent; });
}

(function () {
  const helpContentArea = document.getElementById('help-content-area');
  const helpBreadcrumbRow = document.querySelector('.help-breadcrumb-row');
  const helpBreadcrumbBack = document.getElementById('help-breadcrumb-back');
  const helpBreadcrumbCurrent = document.getElementById('help-breadcrumb-current');
  const helpNavItems = document.querySelectorAll('.help-nav-item');

  // Guard against missing DOM elements
  if (!helpModal || !helpContentArea || !helpBreadcrumbRow) return;
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

    if (childrenToParent[section]) {
      const parent = childrenToParent[section];
      helpBreadcrumbCurrent.textContent = getSectionTitle(parent);
      helpBreadcrumbBack.onclick = () => showHelpSection(parent);
      helpBreadcrumbRow.hidden = false;
    } else {
      helpBreadcrumbRow.hidden = true;
    }
  }

  function getSectionTitle(section) {
    const btn = document.querySelector(`.help-nav-item[data-help-section="${section}"]`);
    return btn ? btn.textContent.trim() : section;
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
