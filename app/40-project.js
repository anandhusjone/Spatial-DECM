// ─── Project Workspace & Persistence (Phase 9) ───────────────────────────────
// Owns: FSA workspace chooser, project serialize/save/open/restore,
//       dirty-state tracking, beforeunload guard, fallback import/export,
//       project bar UI rendering, compatibility detection.

const PROJECT_MANIFEST_FILENAME = "project.sdecm";
const PROJECT_VERSION = 1;
const PROJECT_HANDLE_AVAILABLE_KEY = "spatial-decm-workspace-available";

// ─── Project state ────────────────────────────────────────────────────────────

const projectState = {
  directoryHandle: null,   // FileSystemDirectoryHandle (FSA only)
  isDirty: false,
  lastSavedAt: null,       // ISO string
  hasWorkspace: false,     // true once a directory is chosen
};

// Expose a callback hook. Existing modules call this after mutations.
// 40-project.js assigns it once initializeProject() runs.
let onProjectDirty = null;

// ─── FSA detection ────────────────────────────────────────────────────────────

function isFsaSupported() {
  return typeof window.showDirectoryPicker === "function";
}

// ─── Dirty tracking ───────────────────────────────────────────────────────────

function markProjectDirty() {
  if (!projectState.hasWorkspace) {
    return;
  }
  projectState.isDirty = true;
  updateProjectSaveButton();
}

function clearProjectDirty() {
  projectState.isDirty = false;
  updateProjectSaveButton();
}

// ─── Serialization ────────────────────────────────────────────────────────────

function slugify(name) {
  return String(name || "layer")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "layer";
}

function buildLayerFileName(layerRecord) {
  return `layer-${slugify(layerRecord.name)}-${layerRecord.id.slice(0, 8)}.geojson`;
}

function serializeLayerToGeoJSON(layerRecord) {
  return JSON.stringify(sanitizeGeoJSONForExport(layerRecord.geojson), null, 2);
}

function buildLayerManifestEntry(layerRecord, fileName) {
  return {
    id: layerRecord.id,
    name: layerRecord.name,
    color: layerRecord.color,
    isVisible: layerRecord.isVisible !== false,
    sourceType: layerRecord.sourceType || "GeoJSON",
    fileName,
    fields: layerRecord.fields || [],
    styleConfig: layerRecord.styleConfig || null,
    filterConfig: layerRecord.filterConfig || null,
    interpolationConfig: layerRecord.interpolationConfig || null,
    heatmapConfig: layerRecord.heatmapConfig || null,
  };
}

function serializeProject() {
  const vectorLayers = loadedLayers.filter(
    (lr) => !isRasterLayerRecord(lr) && !isLargeCsvLayerRecord(lr)
  );

  const layers = vectorLayers.map((lr) => {
    const fileName = buildLayerFileName(lr);
    return buildLayerManifestEntry(lr, fileName);
  });

  let calculatorExpressions = [];
  try {
    calculatorExpressions = JSON.parse(
      localStorage.getItem(CALCULATOR_SAVED_EXPRESSIONS_KEY) || "[]"
    );
  } catch (_) {
    calculatorExpressions = [];
  }

  return {
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    activeEditableLayerId: activeEditableLayerId || "",
    themePreference: localStorage.getItem(THEME_STORAGE_KEY) || "system",
    calculatorExpressions: Array.isArray(calculatorExpressions) ? calculatorExpressions : [],
    layers,
  };
}

// ─── FSA save ─────────────────────────────────────────────────────────────────

async function writeTextToDirectory(directoryHandle, fileName, text) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function saveProjectToDirectory(directoryHandle) {
  const manifest = serializeProject();

  // Write each vector layer as a GeoJSON file
  const vectorLayers = loadedLayers.filter(
    (lr) => !isRasterLayerRecord(lr) && !isLargeCsvLayerRecord(lr)
  );

  for (const lr of vectorLayers) {
    const fileName = buildLayerFileName(lr);
    const geojsonText = serializeLayerToGeoJSON(lr);
    await writeTextToDirectory(directoryHandle, fileName, geojsonText);
  }

  // Write the manifest last
  await writeTextToDirectory(
    directoryHandle,
    PROJECT_MANIFEST_FILENAME,
    JSON.stringify(manifest, null, 2)
  );

  projectState.lastSavedAt = manifest.savedAt;
  clearProjectDirty();
  updateStatus(`Project saved — ${vectorLayers.length} layer(s) written.`);
}

// ─── Fallback save (download .sdecm bundle) ───────────────────────────────────

function saveProjectAsFallback() {
  const manifest = serializeProject();

  // Embed GeoJSON inline for the fallback bundle
  const vectorLayers = loadedLayers.filter(
    (lr) => !isRasterLayerRecord(lr) && !isLargeCsvLayerRecord(lr)
  );

  const bundle = {
    ...manifest,
    _bundle: true,
    layerData: {},
  };

  vectorLayers.forEach((lr) => {
    const fileName = buildLayerFileName(lr);
    bundle.layerData[fileName] = sanitizeGeoJSONForExport(lr.geojson);
  });

  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = PROJECT_MANIFEST_FILENAME;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  projectState.lastSavedAt = manifest.savedAt;
  clearProjectDirty();
  updateStatus(`Project downloaded as ${PROJECT_MANIFEST_FILENAME}.`);
}

// ─── Public: Save Project ─────────────────────────────────────────────────────

async function saveProject() {
  if (!projectState.hasWorkspace || !projectState.directoryHandle) {
    await saveProjectAs();
    return;
  }

  try {
    // Re-verify permission before writing
    const permission = await projectState.directoryHandle.requestPermission({
      mode: "readwrite",
    });
    if (permission !== "granted") {
      updateStatus("Write permission to the workspace was denied.", true);
      return;
    }
    await saveProjectToDirectory(projectState.directoryHandle);
  } catch (error) {
    updateStatus(`Save failed: ${error.message}`, true);
  }
}

// ─── Public: Save Project As ──────────────────────────────────────────────────

async function saveProjectAs() {
  if (!isFsaSupported()) {
    saveProjectAsFallback();
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    projectState.directoryHandle = directoryHandle;
    projectState.hasWorkspace = true;
    localStorage.setItem(PROJECT_HANDLE_AVAILABLE_KEY, "1");
    await saveProjectToDirectory(directoryHandle);
    renderProjectBar();
  } catch (error) {
    if (error.name !== "AbortError") {
      updateStatus(`Save As failed: ${error.message}`, true);
    }
  }
}

// ─── Project restore helpers ──────────────────────────────────────────────────

async function restoreProjectFromManifest(manifest, resolveGeojson) {
  // Resolve geojson for each layer entry using the provided resolver
  const layerEntries = Array.isArray(manifest.layers) ? manifest.layers : [];

  // Clear current state first
  loadedLayers.splice(0).forEach((lr) => {
    disposeLayerResources(lr);
    map.removeLayer(lr.layerGroup);
  });
  activeEditableLayerId = "";
  selectedFeatureContext = null;
  drawWorkspace.clearLayers();
  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateInterpolationLegend();

  // Restore calculator expressions
  if (Array.isArray(manifest.calculatorExpressions)) {
    localStorage.setItem(
      CALCULATOR_SAVED_EXPRESSIONS_KEY,
      JSON.stringify(manifest.calculatorExpressions)
    );
  }

  // Restore theme
  if (manifest.themePreference) {
    localStorage.setItem(THEME_STORAGE_KEY, manifest.themePreference);
    applyTheme(manifest.themePreference);
  }

  // Restore layers in order
  for (const entry of layerEntries) {
    let geojson;
    try {
      geojson = await resolveGeojson(entry.fileName);
    } catch (_) {
      updateStatus(`Could not load layer file ${entry.fileName} — skipped.`, true);
      continue;
    }

    if (!geojson || !Array.isArray(geojson.features)) {
      continue;
    }

    const color = entry.color || palette[layerCount % palette.length];
    const normalizedGeojson = normalizeGeoJSON(geojson);

    const lr = {
      id: entry.id || crypto.randomUUID(),
      kind: "vector",
      name: entry.name,
      sourceType: entry.sourceType || "GeoJSON",
      color,
      isVisible: entry.isVisible !== false,
      geojson: normalizedGeojson,
      fields: Array.isArray(entry.fields) ? entry.fields : collectFieldNamesFromGeoJSON(normalizedGeojson),
      styleConfig: entry.styleConfig || createDefaultStyleConfig(color),
      interpolationConfig: entry.interpolationConfig || createDefaultInterpolationConfig(),
      heatmapConfig: entry.heatmapConfig || createDefaultHeatmapConfig(),
      filterConfig: entry.filterConfig || createDefaultFilterConfig(),
      interpolationOverlay: null,
      interpolationObjectUrl: "",
      layerGroup: L.featureGroup(),
      featureCount: 0,
      visibleFeatureCount: 0,
    };

    layerCount += 1;
    rebuildLayerFromData(lr);
    loadedLayers.push(lr);

    if (lr.isVisible) {
      lr.layerGroup.addTo(map);
    }
  }

  // Restore active editable layer
  const preferredEditId = manifest.activeEditableLayerId;
  const editCandidate =
    loadedLayers.find((lr) => lr.id === preferredEditId && isEditableLayerRecord(lr)) ||
    loadedLayers.find((lr) => isEditableLayerRecord(lr)) ||
    null;

  if (editCandidate) {
    activeEditableLayerId = editCandidate.id;
    syncEditableWorkspace();
  }

  // Fit map to all layers
  const allLayerGroups = loadedLayers.filter((lr) => lr.isVisible).map((lr) => lr.layerGroup);
  if (allLayerGroups.length) {
    const combined = L.featureGroup(allLayerGroups);
    const bounds = getBoundsSafe(combined);
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateInterpolationLegend();
  setEmptyState();
}

// ─── Public: Open Project (FSA) ───────────────────────────────────────────────

async function openProjectFromDirectory(directoryHandle) {
  let manifestText;
  try {
    const manifestFile = await directoryHandle.getFileHandle(PROJECT_MANIFEST_FILENAME);
    const file = await manifestFile.getFile();
    manifestText = await file.text();
  } catch (_) {
    updateStatus(`No ${PROJECT_MANIFEST_FILENAME} found in the selected folder.`, true);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (_) {
    updateStatus("Project file could not be parsed.", true);
    return;
  }

  if (manifest.version !== PROJECT_VERSION) {
    updateStatus(
      `Project version ${manifest.version} may not be fully compatible (expected ${PROJECT_VERSION}).`,
      true
    );
  }

  async function resolveGeojson(fileName) {
    const fileHandle = await directoryHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  }

  try {
    await restoreProjectFromManifest(manifest, resolveGeojson);
    projectState.directoryHandle = directoryHandle;
    projectState.hasWorkspace = true;
    projectState.lastSavedAt = manifest.savedAt || null;
    clearProjectDirty();
    localStorage.setItem(PROJECT_HANDLE_AVAILABLE_KEY, "1");
    renderProjectBar();
    updateStatus(`Project opened — ${loadedLayers.length} layer(s) restored.`);
  } catch (error) {
    updateStatus(`Project restore failed: ${error.message}`, true);
  }
}

async function openProject() {
  if (!isFsaSupported()) {
    // Fallback: trigger the hidden file input
    const input = document.getElementById("project-open-file");
    if (input) {
      input.click();
    }
    return;
  }

  if (projectState.isDirty) {
    if (!window.confirm("You have unsaved changes. Discard them and open a different project?")) {
      return;
    }
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    await openProjectFromDirectory(directoryHandle);
  } catch (error) {
    if (error.name !== "AbortError") {
      updateStatus(`Open failed: ${error.message}`, true);
    }
  }
}

// ─── Fallback: Open from .sdecm file ─────────────────────────────────────────

async function openProjectFromFile(file) {
  if (!file) {
    return;
  }

  let bundle;
  try {
    const text = await file.text();
    bundle = JSON.parse(text);
  } catch (_) {
    updateStatus("Could not parse the project file.", true);
    return;
  }

  if (bundle.version !== PROJECT_VERSION) {
    updateStatus(
      `Project version ${bundle.version} may not be fully compatible.`,
      true
    );
  }

  const layerData = bundle._bundle ? (bundle.layerData || {}) : {};

  async function resolveGeojson(fileName) {
    if (layerData[fileName]) {
      return layerData[fileName];
    }
    throw new Error(`Layer file ${fileName} not found in bundle.`);
  }

  try {
    await restoreProjectFromManifest(bundle, resolveGeojson);
    // Fallback mode: no directory handle, but mark workspace present for UX
    projectState.hasWorkspace = true;
    projectState.lastSavedAt = bundle.savedAt || null;
    clearProjectDirty();
    renderProjectBar();
    updateStatus(`Project opened — ${loadedLayers.length} layer(s) restored.`);
  } catch (error) {
    updateStatus(`Project restore failed: ${error.message}`, true);
  }
}

// ─── Public: New Project ──────────────────────────────────────────────────────

function newProject() {
  if (projectState.isDirty || loadedLayers.length > 0) {
    if (!window.confirm("Start a new project? All unsaved changes will be lost.")) {
      return;
    }
  }

  loadedLayers.splice(0).forEach((lr) => {
    disposeLayerResources(lr);
    map.removeLayer(lr.layerGroup);
  });

  activeEditableLayerId = "";
  selectedFeatureContext = null;
  drawWorkspace.clearLayers();
  projectState.directoryHandle = null;
  projectState.isDirty = false;
  projectState.lastSavedAt = null;
  projectState.hasWorkspace = false;
  localStorage.removeItem(PROJECT_HANDLE_AVAILABLE_KEY);

  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateInterpolationLegend();
  setEmptyState();
  renderProjectBar();
  updateStatus("New project started.");
}

// ─── Public: Reopen Workspace ─────────────────────────────────────────────────

async function reopenWorkspace() {
  if (!isFsaSupported()) {
    updateStatus("Workspace reopen is only supported in Chromium-based browsers.", true);
    return;
  }

  if (!projectState.directoryHandle) {
    // Try to ask user to pick again since we cannot persist handles reliably
    await openProject();
    return;
  }

  try {
    const permission = await projectState.directoryHandle.requestPermission({
      mode: "readwrite",
    });
    if (permission === "granted") {
      await openProjectFromDirectory(projectState.directoryHandle);
    } else {
      updateStatus("Workspace permission was denied. Try Open Project instead.", true);
    }
  } catch (error) {
    updateStatus(`Reopen failed: ${error.message}`, true);
  }
}

// ─── beforeunload guard ───────────────────────────────────────────────────────

window.addEventListener("beforeunload", (event) => {
  if (projectState.isDirty && projectState.hasWorkspace) {
    event.preventDefault();
    // Most browsers show a generic dialog; returnValue triggers it
    event.returnValue = "";
  }
});

// ─── UI: Project bar ──────────────────────────────────────────────────────────

function renderProjectBar() {
  const bar = document.getElementById("project-bar");
  const compatNote = document.getElementById("project-compat-note");
  if (!bar) {
    return;
  }

  const fsaOk = isFsaSupported();
  const hasDir = projectState.hasWorkspace && projectState.directoryHandle;
  const savedLabel = projectState.lastSavedAt
    ? `Last saved: ${new Date(projectState.lastSavedAt).toLocaleTimeString()}`
    : "";

  bar.innerHTML = `
    <div class="project-actions">
      <button id="project-new-btn" class="project-btn ghost-button" type="button" title="New project">
        New
      </button>
      <button id="project-open-btn" class="project-btn ghost-button" type="button" title="Open project">
        Open
      </button>
      <button
        id="project-save-btn"
        class="project-btn ghost-button${projectState.isDirty ? " project-btn--dirty" : ""}"
        type="button"
        title="Save project"
        ${!projectState.hasWorkspace ? "disabled" : ""}
      >
        Save${projectState.isDirty ? " ●" : ""}
      </button>
      <button id="project-save-as-btn" class="project-btn ghost-button" type="button" title="Save project as…">
        Save As
      </button>
      ${hasDir ? `<button id="project-reopen-btn" class="project-btn ghost-button" type="button" title="Reopen workspace after reload">Reopen</button>` : ""}
    </div>
    ${savedLabel ? `<p class="project-saved-label small-note">${escapeHtml(savedLabel)}</p>` : ""}
  `;

  if (compatNote) {
    if (!fsaOk) {
      compatNote.hidden = false;
      compatNote.textContent =
        "Your browser does not support the File System Access API. " +
        "Use Save As to download a project bundle and Open to restore it.";
    } else {
      compatNote.hidden = true;
    }
  }

  // Wire project buttons
  document.getElementById("project-new-btn")?.addEventListener("click", newProject);
  document.getElementById("project-open-btn")?.addEventListener("click", openProject);
  document.getElementById("project-save-btn")?.addEventListener("click", saveProject);
  document.getElementById("project-save-as-btn")?.addEventListener("click", saveProjectAs);
  document.getElementById("project-reopen-btn")?.addEventListener("click", reopenWorkspace);
}

function updateProjectSaveButton() {
  const btn = document.getElementById("project-save-btn");
  if (!btn) {
    return;
  }

  if (projectState.isDirty) {
    btn.classList.add("project-btn--dirty");
    btn.textContent = "Save ●";
  } else {
    btn.classList.remove("project-btn--dirty");
    btn.textContent = "Save";
  }

  btn.disabled = !projectState.hasWorkspace;
}

// ─── Initialization ───────────────────────────────────────────────────────────

function initializeProject() {
  // Assign the global dirty hook so existing modules can call it
  onProjectDirty = markProjectDirty;

  renderProjectBar();

  // Wire the fallback file input (defined in index.html)
  const openFileInput = document.getElementById("project-open-file");
  if (openFileInput) {
    openFileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (file) {
        await openProjectFromFile(file);
      }
      // Reset input so the same file can be re-opened
      openFileInput.value = "";
    });
  }
}

// Run immediately when this script loads (after 30-bootstrap.js)
initializeProject();

