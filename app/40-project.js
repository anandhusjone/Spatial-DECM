// ─── Project Workspace & Persistence ─────────────────────────────────────────
//
// Workflow
// ────────
// NEW PROJECT
//   newProject()
//     → Confirms if dirty / layers exist
//     → Clears all layers and state
//     → Resets projectState to clean slate
//     → Renders project bar in "unsaved" state
//
// SAVE PROJECT  (Ctrl+S or Save button)
//   saveProject()
//     Case A — FSA workspace already open:
//       → Re-verify write permission
//       → Write layer GeoJSON files + project.sdecm manifest to the folder
//       → Clear dirty flag, update "last saved" timestamp
//     Case B — No workspace yet (first save):
//       → Calls saveProjectAs() to pick a folder first
//
// SAVE AS  (always picks a new folder / destination)
//   saveProjectAs()
//     FSA supported  → showDirectoryPicker → saveProjectToDirectory
//     FSA not supported → saveProjectAsFallback (download .sdecm bundle)
//
// OPEN PROJECT
//   openProject()
//     FSA supported  → showDirectoryPicker → openProjectFromDirectory
//     FSA not supported → trigger hidden file input → openProjectFromFile
//
// REOPEN WORKSPACE  (FSA only — after a page reload)
//   reopenWorkspace()
//     → Re-requests permission on the stored directoryHandle
//     → Falls back to openProject() if the handle is gone
//
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_MANIFEST_FILENAME = "project.sdecm";
const PROJECT_VERSION = 1;
const PROJECT_HANDLE_AVAILABLE_KEY = "spatial-decm-workspace-available";

// ─── Project state ────────────────────────────────────────────────────────────

const projectState = {
  directoryHandle: null,   // FileSystemDirectoryHandle (FSA only)
  isDirty: false,
  lastSavedAt: null,       // ISO string
  hasWorkspace: false,     // true once a directory is chosen or a bundle is loaded
  projectName: "",         // set on first save; shown in project bar
};

// Global dirty hook — existing modules call onProjectDirty() after mutations.
// Assigned once initializeProject() runs.
let onProjectDirty = null;

// ─── FSA detection ────────────────────────────────────────────────────────────

function isFsaSupported() {
  return typeof window.showDirectoryPicker === "function";
}

// ─── Dirty tracking ───────────────────────────────────────────────────────────

function markProjectDirty() {
  projectState.isDirty = true;
  updateProjectBar();
  scheduleAutoSave();
}

function clearProjectDirty() {
  projectState.isDirty = false;
  updateProjectBar();
}

// ─── Auto-save ────────────────────────────────────────────────────────────────
// Auto-save is only active when an FSA directory is open (so we have a known
// save destination). It debounces writes: after every dirty mutation, a 5-second
// timer is (re)started. If another mutation arrives before the timer fires, the
// clock resets. This prevents hammering the file system during rapid edits.

const AUTO_SAVE_DELAY_MS = 5_000;
let _autoSaveTimer = null;
let _autoSaveEnabled = false;

function isAutoSaveAvailable() {
  return !!(projectState.hasWorkspace && projectState.directoryHandle);
}

function toggleAutoSave() {
  _autoSaveEnabled = !_autoSaveEnabled;
  updateProjectBar();
  if (_autoSaveEnabled && projectState.isDirty) {
    scheduleAutoSave();
  } else if (!_autoSaveEnabled) {
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = null;
  }
}

function scheduleAutoSave() {
  if (!_autoSaveEnabled || !isAutoSaveAvailable()) return;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    _autoSaveTimer = null;
    if (!projectState.isDirty || !isAutoSaveAvailable()) return;
    try {
      const permission = await projectState.directoryHandle.requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        await saveProjectToDirectory(projectState.directoryHandle);
      }
    } catch (_) {
      // Silent fail for auto-save — do not interrupt the user
    }
  }, AUTO_SAVE_DELAY_MS);
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
    geometryKind: getLayerGeometryKind(layerRecord),
    isVisible: layerRecord.isVisible !== false,
    sourceType: layerRecord.sourceType || "GeoJSON",
    fileName,
    fields: layerRecord.fields || [],
    styleConfig: layerRecord.styleConfig || null,
    labelConfig: layerRecord.labelConfig || null,
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
    projectName: projectState.projectName || "",
    // Never persist edit mode — restoring it would silently activate a layer on open
    // without any user input, which is the bug described in the project restore comments.
    activeEditableLayerId: "",
    themePreference: localStorage.getItem(THEME_STORAGE_KEY) || "system",
    calculatorExpressions: Array.isArray(calculatorExpressions) ? calculatorExpressions : [],
    layers,
  };
}

// ─── FSA write helpers ────────────────────────────────────────────────────────

async function writeTextToDirectory(directoryHandle, fileName, text) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function saveProjectToDirectory(directoryHandle) {
  const manifest = serializeProject();
  const vectorLayers = loadedLayers.filter(
    (lr) => !isRasterLayerRecord(lr) && !isLargeCsvLayerRecord(lr)
  );

  for (const lr of vectorLayers) {
    await writeTextToDirectory(directoryHandle, buildLayerFileName(lr), serializeLayerToGeoJSON(lr));
  }

  // Write manifest last so an interrupted save does not leave a stale manifest
  await writeTextToDirectory(
    directoryHandle,
    PROJECT_MANIFEST_FILENAME,
    JSON.stringify(manifest, null, 2)
  );

  projectState.lastSavedAt = manifest.savedAt;
  clearProjectDirty();
  updateStatus(`Project saved — ${vectorLayers.length} layer(s) written.`);
}

// ─── Fallback save: download .zip (mirrors FSA directory structure) ─────────────

// ─── Live layer rename (FSA workspace only) ───────────────────────────────────

async function renameLayerFile(layerRecord, oldFileName) {
  const directoryHandle = projectState.directoryHandle;
  if (!directoryHandle) return;

  try {
    const permission = await directoryHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      // Roll back the in-memory name change
      layerRecord.name = /* recover from old filename slug isn't reliable; just warn */ layerRecord.name;
      updateStatus("Write permission denied — layer rename not saved.", true);
      return;
    }

    const newFileName = buildLayerFileName(layerRecord);

    // 1. Write GeoJSON under new name
    await writeTextToDirectory(directoryHandle, newFileName, serializeLayerToGeoJSON(layerRecord));

    // 2. Update manifest so it points to the new filename
    const manifest = serializeProject();
    await writeTextToDirectory(
      directoryHandle,
      PROJECT_MANIFEST_FILENAME,
      JSON.stringify(manifest, null, 2)
    );

    // 3. Delete the old file only after both writes succeeded
    if (oldFileName !== newFileName) {
      try {
        await directoryHandle.removeEntry(oldFileName);
      } catch (_) {
        // Old file may already be gone; not fatal
      }
    }

    updateStatus("Layer renamed and saved");
  } catch (error) {
    updateStatus(`Rename failed: ${error.message}`, true);
  }
}

async function saveProjectAsFallback() {
  const manifest = serializeProject();
  const vectorLayers = loadedLayers.filter(
    (lr) => !isRasterLayerRecord(lr) && !isLargeCsvLayerRecord(lr)
  );

  // Build a zip that mirrors the Chrome FSA directory structure:
  //   <projectName>/
  //     project.sdecm       ← manifest (same as FSA)
  //     <layer-id>.geojson  ← one file per vector layer (same as FSA)
  // This lets Firefox / Safari users get the same multi-file format.
  const projectName = (projectState.projectName || "project").replace(/[/\\:*?"<>|]/g, "_");
  const zipName = projectName + ".zip";

  if (typeof JSZip !== "undefined") {
    const zip = new JSZip();
    const folder = zip.folder(projectName);
    vectorLayers.forEach((lr) => {
      folder.file(buildLayerFileName(lr), serializeLayerToGeoJSON(lr));
    });
    folder.file(PROJECT_MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = zipName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    projectState.lastSavedAt = manifest.savedAt;
    clearProjectDirty();
    updateStatus(`Project downloaded as ${zipName} — open it to restore your project.`);
  } else {
    // JSZip not available: fall back to legacy single-file bundle
    const bundle = { ...manifest, _bundle: true, layerData: {} };
    vectorLayers.forEach((lr) => {
      bundle.layerData[buildLayerFileName(lr)] = sanitizeGeoJSONForExport(lr.geojson);
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = PROJECT_MANIFEST_FILENAME;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    projectState.lastSavedAt = manifest.savedAt;
    clearProjectDirty();
    updateStatus(`Project downloaded as ${PROJECT_MANIFEST_FILENAME}.`);
  }
}

// ─── NEW PROJECT ──────────────────────────────────────────────────────────────

function newProject() {
  if (projectState.isDirty) {
    if (!window.confirm("You have unsaved changes. Start a new project and discard them?")) return;
  } else if (loadedLayers.length > 0) {
    if (!window.confirm("Start a new project? Your current layers will be cleared.")) return;
  }

  _clearAllLayers();

  projectState.directoryHandle = null;
  projectState.isDirty = false;
  projectState.lastSavedAt = null;
  projectState.hasWorkspace = false;
  projectState.projectName = "";
  localStorage.removeItem(PROJECT_HANDLE_AVAILABLE_KEY);
  _autoSaveEnabled = false;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = null;

  setEmptyState();
  updateProjectBar();
  updateStatus("New project started.");
}

// ─── SAVE PROJECT ─────────────────────────────────────────────────────────────
// Saves into the already-open FSA folder.
// If no folder is open, delegates to Save As.

async function saveProject() {
  if (!projectState.hasWorkspace || !projectState.directoryHandle) {
    // First save: ask for a project name before picking the folder
    const name = window.prompt("Enter a project name:", projectState.projectName || "My Project");
    if (name === null) return; // user cancelled
    projectState.projectName = name.trim() || "My Project";
    await saveProjectAs();
    return;
  }

  try {
    const permission = await projectState.directoryHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      updateStatus("Write permission denied. Try Save As to pick a new folder.", true);
      return;
    }
    await saveProjectToDirectory(projectState.directoryHandle);
  } catch (error) {
    updateStatus(`Save failed: ${error.message}`, true);
  }
}

// ─── SAVE AS ──────────────────────────────────────────────────────────────────
// Always prompts for a destination regardless of current workspace state.

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
    updateProjectBar();
  } catch (error) {
    if (error.name !== "AbortError") {
      updateStatus(`Save As failed: ${error.message}`, true);
    }
  }
}

// ─── OPEN PROJECT ─────────────────────────────────────────────────────────────

async function openProject() {
  if (projectState.isDirty) {
    if (!window.confirm("You have unsaved changes. Discard them and open a different project?")) return;
  }

  if (!isFsaSupported()) {
    document.getElementById("project-open-file")?.click();
    return;
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

// ─── REOPEN WORKSPACE (FSA only) ─────────────────────────────────────────────
// Useful after a page reload when the browser still holds the handle
// but permission needs to be re-granted.

async function reopenWorkspace() {
  if (!isFsaSupported()) {
    updateStatus("Workspace reopen requires a Chromium-based browser.", true);
    return;
  }

  if (!projectState.directoryHandle) {
    await openProject();
    return;
  }

  try {
    const permission = await projectState.directoryHandle.requestPermission({ mode: "readwrite" });
    if (permission === "granted") {
      await openProjectFromDirectory(projectState.directoryHandle);
    } else {
      updateStatus("Permission denied. Use Open to pick the folder again.", true);
    }
  } catch (error) {
    updateStatus(`Reopen failed: ${error.message}`, true);
  }
}

// ─── Open from FSA directory ──────────────────────────────────────────────────

async function openProjectFromDirectory(directoryHandle) {
  let manifest;
  try {
    const fileHandle = await directoryHandle.getFileHandle(PROJECT_MANIFEST_FILENAME);
    manifest = JSON.parse(await (await fileHandle.getFile()).text());
  } catch (_) {
    updateStatus(`No ${PROJECT_MANIFEST_FILENAME} found in the selected folder.`, true);
    return;
  }

  if (manifest.version !== PROJECT_VERSION) {
    updateStatus(
      `Project version ${manifest.version} may not be fully compatible (expected ${PROJECT_VERSION}).`,
      true
    );
  }

  async function resolveGeojson(fileName) {
    const fh = await directoryHandle.getFileHandle(fileName);
    return JSON.parse(await (await fh.getFile()).text());
  }

  try {
    await restoreProjectFromManifest(manifest, resolveGeojson);
    projectState.directoryHandle = directoryHandle;
    projectState.hasWorkspace = true;
    projectState.lastSavedAt = manifest.savedAt || null;
    projectState.projectName = manifest.projectName || "";
    clearProjectDirty();
    localStorage.setItem(PROJECT_HANDLE_AVAILABLE_KEY, "1");
    updateProjectBar();
    updateStatus(`Project opened — ${loadedLayers.length} layer(s) restored.`);
  } catch (error) {
    updateStatus(`Project restore failed: ${error.message}`, true);
  }
}

// ─── Open from .zip or legacy .sdecm bundle file (fallback browsers) ───────────

async function openProjectFromFile(file) {
  if (!file) return;

  // ── ZIP format (Firefox/Safari fallback save, or manually zipped FSA export) ──
  const isZip = file.name.endsWith(".zip") || file.type === "application/zip"
    || file.type === "application/x-zip-compressed";

  if (isZip && typeof JSZip !== "undefined") {
    let zip;
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch (_) {
      updateStatus("Could not read the zip file.", true);
      return;
    }

    // The zip may contain a top-level folder (projectName/) or files at root.
    // Find project.sdecm wherever it lives.
    let manifestFile = zip.file(PROJECT_MANIFEST_FILENAME);
    let prefix = "";
    if (!manifestFile) {
      // Search one level deep inside a folder
      zip.forEach((relativePath, zipEntry) => {
        if (!manifestFile && relativePath.endsWith("/" + PROJECT_MANIFEST_FILENAME)) {
          manifestFile = zipEntry;
          prefix = relativePath.slice(0, relativePath.length - PROJECT_MANIFEST_FILENAME.length);
        }
      });
    }

    if (!manifestFile) {
      updateStatus(`No ${PROJECT_MANIFEST_FILENAME} found inside the zip.`, true);
      return;
    }

    let manifest;
    try {
      manifest = JSON.parse(await manifestFile.async("string"));
    } catch (_) {
      updateStatus("Could not parse project.sdecm inside the zip.", true);
      return;
    }

    if (manifest.version !== PROJECT_VERSION) {
      updateStatus(`Project version ${manifest.version} may not be fully compatible.`, true);
    }

    async function resolveGeojson(fileName) {
      const entry = zip.file(prefix + fileName) || zip.file(fileName);
      if (!entry) throw new Error(`Layer file "${fileName}" not found in zip.`);
      return JSON.parse(await entry.async("string"));
    }

    try {
      await restoreProjectFromManifest(manifest, resolveGeojson);
      projectState.directoryHandle = null;
      projectState.hasWorkspace = true;
      projectState.lastSavedAt = manifest.savedAt || null;
      projectState.projectName = manifest.projectName || "";
      clearProjectDirty();
      updateProjectBar();
      updateStatus(`Project opened — ${loadedLayers.length} layer(s) restored.`);
    } catch (error) {
      updateStatus(`Project restore failed: ${error.message}`, true);
    }
    return;
  }

  // ── Legacy .sdecm single-file bundle ─────────────────────────────────────────
  let bundle;
  try {
    bundle = JSON.parse(await file.text());
  } catch (_) {
    updateStatus("Could not parse the project file.", true);
    return;
  }

  if (bundle.version !== PROJECT_VERSION) {
    updateStatus(`Project version ${bundle.version} may not be fully compatible.`, true);
  }

  const layerData = bundle._bundle ? (bundle.layerData || {}) : {};

  async function resolveGeojson(fileName) {
    if (layerData[fileName]) return layerData[fileName];
    throw new Error(`Layer file "${fileName}" not found in bundle.`);
  }

  try {
    await restoreProjectFromManifest(bundle, resolveGeojson);
    projectState.directoryHandle = null;
    projectState.hasWorkspace = true;
    projectState.lastSavedAt = bundle.savedAt || null;
    projectState.projectName = bundle.projectName || "";
    clearProjectDirty();
    updateProjectBar();
    updateStatus(`Project opened — ${loadedLayers.length} layer(s) restored.`);
  } catch (error) {
    updateStatus(`Project restore failed: ${error.message}`, true);
  }
}

// ─── Restore from manifest ────────────────────────────────────────────────────

async function restoreProjectFromManifest(manifest, resolveGeojson) {
  _clearAllLayers();

  if (Array.isArray(manifest.calculatorExpressions)) {
    localStorage.setItem(
      CALCULATOR_SAVED_EXPRESSIONS_KEY,
      JSON.stringify(manifest.calculatorExpressions)
    );
  }

  // Theme is a user preference, not project data — never override it on load.

  for (const entry of (manifest.layers || [])) {
    let geojson;
    try {
      geojson = await resolveGeojson(entry.fileName);
    } catch (_) {
      updateStatus(`Could not load layer file "${entry.fileName}" — skipped.`, true);
      continue;
    }

    if (!geojson || !Array.isArray(geojson.features)) continue;

    const color = entry.color || palette[layerCount % palette.length];
    const normalized = normalizeGeoJSON(geojson);
    const inferredKind = inferVectorGeometryKind(normalized);

    const lr = {
      id: entry.id || crypto.randomUUID(),
      kind: "vector",
      name: entry.name,
      sourceType: entry.sourceType || "GeoJSON",
      color,
      geometryKind: normalizeVectorGeometryKind(entry.geometryKind || inferredKind, inferredKind),
      isVisible: entry.isVisible !== false,
      geojson: normalized,
      fields: Array.isArray(entry.fields) ? entry.fields : collectFieldNamesFromGeoJSON(normalized),
      styleConfig: entry.styleConfig || createDefaultStyleConfig(color),
      labelConfig: entry.labelConfig || createDefaultLabelConfig(),
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
    if (lr.isVisible) lr.layerGroup.addTo(map);
  }

  // Edit mode is intentionally NOT restored from the manifest.
  // activeEditableLayerId is always saved as "" to prevent a layer silently
  // entering edit mode without user input when a project is opened.
  // (The user must explicitly click the edit toggle after loading.)

  // Fit map to restored layers
  const visibleGroups = loadedLayers.filter((lr) => lr.isVisible).map((lr) => lr.layerGroup);
  if (visibleGroups.length) {
    const bounds = getBoundsSafe(L.featureGroup(visibleGroups));
    if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
  }

  renderLayerList();
  renderEditableLayerOptions();
  renderAttributeTable();
  updateInterpolationLegend();
  setEmptyState();
}

// ─── Internal: clear all layers and transient state ──────────────────────────

function _clearAllLayers() {
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
}

// ─── Keyboard shortcut: Ctrl/Cmd+S ───────────────────────────────────────────

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    if (loadedLayers.length > 0 || projectState.isDirty) {
      event.preventDefault();
      saveProject();
    }
  }
});

// ─── Beforeunload guard ───────────────────────────────────────────────────────

window.addEventListener("beforeunload", (event) => {
  if (projectState.isDirty && projectState.hasWorkspace) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// ─── UI: Project bar ──────────────────────────────────────────────────────────
//
// Button states by context:
//
//   No workspace open
//     New  |  Open  |  [Save — disabled]  |  Save As / Download
//
//   FSA folder open (dirty)
//     New  |  Open  |  Save ●  |  Save As  |  Reopen
//
//   FSA folder open (clean)
//     New  |  Open  |  Save  |  Save As  |  Reopen
//
//   Bundle loaded (no folder)
//     New  |  Open  |  [Save — disabled]  |  Save As / Download
//     + hint: "No folder linked — use Save As to keep changes"

function updateProjectBar() {
  const bar = document.getElementById("project-bar");
  if (!bar) return;

  const fsaOk        = isFsaSupported();
  const hasFsaDir    = !!(projectState.hasWorkspace && projectState.directoryHandle);
  const hasBundleOnly = projectState.hasWorkspace && !projectState.directoryHandle;
  const dirty        = projectState.isDirty;
  const canNew       = loadedLayers.length > 0 || dirty;
  const canSave      = loadedLayers.length > 0 || dirty;
  const canSaveAs    = projectState.hasWorkspace;

  // ── Status text (no pill, bare coloured text) ────────────────────────────
  let statusClass, statusText;
  if (!projectState.hasWorkspace && !dirty && !loadedLayers.length) {
    statusClass = "project-bar-status--none";
    statusText  = "";
  } else if (hasBundleOnly) {
    statusClass = "project-bar-status--warn";
    statusText  = "⚠ no folder";
  } else if (dirty) {
    statusClass = "project-bar-status--dirty";
    statusText  = "● unsaved";
  } else if (projectState.hasWorkspace) {
    statusClass = "project-bar-status--clean";
    statusText  = "✓ saved";
  } else {
    statusClass = "project-bar-status--none";
    statusText  = "";
  }

  // ── Name ────────────────────────────────────────────────────────────────
  const nameText = projectState.projectName
    ? escapeHtml(projectState.projectName)
    : "No project";
  const nameClass = projectState.projectName
    ? "project-bar-name"
    : "project-bar-name project-bar-name--empty";

  // ── Popover head: time ──────────────────────────────────────────────────
  const timeStr = projectState.lastSavedAt
    ? `Saved ${new Date(projectState.lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : dirty ? "Unsaved changes" : "";

  // ── Auto-save ────────────────────────────────────────────────────────────
  const autoSaveAvail  = isAutoSaveAvailable();
  const autoSaveActive = autoSaveAvail && _autoSaveEnabled;
  const toggleClass    = autoSaveActive
    ? "project-autosave-toggle project-autosave-toggle--on"
    : "project-autosave-toggle";
  const asTitle = autoSaveAvail
    ? (autoSaveActive ? "Auto-save on — click to disable" : "Auto-save off — click to enable")
    : "Auto-save requires an open project folder";

  // ── Save button state ────────────────────────────────────────────────────
  const saveBtnClass = dirty ? "project-bar-btn project-bar-btn--dirty" : "project-bar-btn";
  const saveTitle    = hasFsaDir
    ? `Save to current folder (Ctrl+S)${dirty ? " — unsaved changes" : ""}`
    : canSave ? "Choose a folder and save (Ctrl+S)" : "Add layers or make changes to save";

  // ── Autosave btn class ───────────────────────────────────────────────────
  const asBtnClass = autoSaveActive
    ? "project-bar-btn project-bar-btn--as-on"
    : "project-bar-btn project-bar-btn--as-off";

  // ── Menu button dirty indicator ──────────────────────────────────────────
  const menuBtnClass = dirty ? "project-menu-btn project-menu-btn--dirty" : "project-menu-btn";
  const menuDotHtml  = dirty ? `<span class="project-menu-dot" aria-hidden="true"></span>` : "";

  // ── Reopen row in popover ─────────────────────────────────────────────────
  const reopenRowHtml = hasFsaDir ? `
    <button id="project-reopen-btn" class="project-popover-row" type="button"
      title="Re-grant folder access after a page refresh">
      <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Reopen folder
    </button>` : "";

  // ── Compat note ───────────────────────────────────────────────────────────
  const compatHtml = !fsaOk
    ? `<p class="project-compat-note">Your browser doesn't support folder access — use Download to save a .zip project and Open to restore it.</p>`
    : "";

  bar.innerHTML = `
    <div class="project-action-bar">

      <!-- ·· menu trigger -->
      <button id="project-menu-btn" class="${menuBtnClass}" type="button"
        title="Project menu" aria-haspopup="true" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5"  cy="12" r="1.4" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
          <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>
        </svg>
        ${menuDotHtml}
      </button>

      <!-- name + status -->
      <span class="${nameClass}">${nameText}</span>
      ${statusText ? `<span class="project-bar-status ${statusClass}">${statusText}</span>` : ""}

      <!-- separator -->
      <span class="project-bar-sep" aria-hidden="true"></span>

      <!-- New -->
      <button id="project-new-btn" class="project-bar-btn" type="button"
        title="${canNew ? "Clear all layers and start a new project" : "Add layers or make changes to enable New"}"
        ${!canNew ? "disabled" : ""} aria-label="New project">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9"  y1="15" x2="15" y2="15"/>
        </svg>
      </button>

      <!-- Open -->
      <button id="project-open-btn" class="project-bar-btn" type="button"
        title="${fsaOk ? "Open a saved project folder" : "Open a saved project .zip"}"
        aria-label="Open project">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <!-- Save -->
      <button id="project-save-btn" class="${saveBtnClass}" type="button"
        title="${saveTitle}"
        ${!canSave ? "disabled" : ""}
        aria-label="Save project${dirty ? " — unsaved changes" : ""}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
      </button>

      <!-- Auto-save -->
      <button id="project-autosave-btn" class="${asBtnClass}" type="button"
        role="switch" aria-checked="${autoSaveActive}"
        title="${asTitle}" aria-label="${asTitle}"
        ${!autoSaveAvail ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </button>

    </div>

  `;

  // ── Wire up bar buttons ───────────────────────────────────────────────────
  document.getElementById("project-new-btn")?.addEventListener("click",  newProject);
  document.getElementById("project-open-btn")?.addEventListener("click", openProject);
  document.getElementById("project-save-btn")?.addEventListener("click", saveProject);
  document.getElementById("project-autosave-btn")?.addEventListener("click", toggleAutoSave);

  // ── Sync the body-level popover with fresh state ──────────────────────────
  _syncProjectPopover({
    nameText, timeStr, canNew, canSave, canSaveAs, fsaOk,
    saveTitle, reopenRowHtml, toggleClass, autoSaveActive,
    asTitle, autoSaveAvail, compatHtml
  });

  // ── Menu toggle — position and open popover ────────────────────────────────
  document.getElementById("project-menu-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const btn     = document.getElementById("project-menu-btn");
    const popover = document.getElementById("project-popover");
    if (!popover || !btn) return;
    const isOpen = !popover.classList.contains("is-open");
    if (isOpen) {
      // position relative to viewport, then attach to body
      const rect = btn.getBoundingClientRect();
      popover.style.top  = (rect.bottom + window.scrollY + 6) + "px";
      popover.style.left = (rect.left  + window.scrollX)      + "px";
    }
    popover.classList.toggle("is-open", isOpen);
    btn.setAttribute("aria-expanded", isOpen);
  });
}

function closeProjectPopover() {
  const popover = document.getElementById("project-popover");
  const btn     = document.getElementById("project-menu-btn");
  popover?.classList.remove("is-open");
  btn?.setAttribute("aria-expanded", "false");
}

// Build or update the body-level popover element
function _syncProjectPopover({
  nameText, timeStr, canNew, canSave, canSaveAs, fsaOk,
  saveTitle, reopenRowHtml, toggleClass, autoSaveActive,
  asTitle, autoSaveAvail, compatHtml
}) {
  let popover = document.getElementById("project-popover");
  if (!popover) {
    popover = document.createElement("div");
    popover.id = "project-popover";
    document.body.appendChild(popover);
  }
  popover.className = "project-popover";
  popover.setAttribute("role", "menu");

  popover.innerHTML = `
    <div class="project-popover-head">
      <div class="project-popover-name">${nameText}</div>
      ${timeStr ? `<div class="project-popover-time">${timeStr}</div>` : ""}
    </div>
    <div class="project-popover-list">
      <button id="project-new-btn-pop" class="project-popover-row" type="button"
        title="${canNew ? "Clear all layers and start a new project" : "Add layers or make changes to enable New"}"
        ${!canNew ? "disabled" : ""}>
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        New project
      </button>
      <button id="project-open-btn-pop" class="project-popover-row" type="button"
        title="${fsaOk ? "Open a saved project folder" : "Open a saved project .zip"}">
        <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        Open
      </button>
      <button id="project-save-btn-pop" class="project-popover-row project-popover-row--save" type="button"
        title="${saveTitle}" ${!canSave ? "disabled" : ""}>
        <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Save
        <span class="project-popover-shortcut">Ctrl S</span>
      </button>
      <button id="project-save-as-btn" class="project-popover-row" type="button"
        title="${canSaveAs
          ? (fsaOk ? "Choose a different folder and save" : "Download project as .zip")
          : "Save your project first to enable Save As"}"
        ${!canSaveAs ? "disabled" : ""}>
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${fsaOk ? "Save as…" : "Download"}
      </button>
      ${reopenRowHtml}
      <div class="project-popover-divider" aria-hidden="true"></div>
      <div class="project-popover-as-row">
        <span>Auto-save</span>
        <button
          id="project-autosave-btn-pop"
          class="${toggleClass}"
          type="button" role="switch"
          aria-checked="${autoSaveActive}"
          aria-label="${asTitle}" title="${asTitle}"
          ${!autoSaveAvail ? "disabled" : ""}
        ><span class="project-autosave-knob"></span></button>
      </div>
      ${compatHtml}
    </div>
  `;

  document.getElementById("project-new-btn-pop")?.addEventListener("click",  () => { closeProjectPopover(); newProject(); });
  document.getElementById("project-open-btn-pop")?.addEventListener("click", () => { closeProjectPopover(); openProject(); });
  document.getElementById("project-save-btn-pop")?.addEventListener("click", () => { closeProjectPopover(); saveProject(); });
  document.getElementById("project-save-as-btn")?.addEventListener("click",  () => { closeProjectPopover(); saveProjectAs(); });
  document.getElementById("project-reopen-btn")?.addEventListener("click",   () => { closeProjectPopover(); reopenWorkspace(); });
  document.getElementById("project-autosave-btn-pop")?.addEventListener("click", toggleAutoSave);
}

// Keep renderProjectBar as an alias so any existing call sites still work
function renderProjectBar() {
  updateProjectBar();
}

// ─── Initialization ───────────────────────────────────────────────────────────

function initializeProject() {
  onProjectDirty = markProjectDirty;

  updateProjectBar();

  const openFileInput = document.getElementById("project-open-file");
  if (openFileInput) {
    openFileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (file) await openProjectFromFile(file);
      openFileInput.value = "";
    });
  }
}

initializeProject();

// ── Close project popover when clicking outside ───────────────────────────
document.addEventListener("click", (e) => {
  const popover = document.getElementById("project-popover");
  const bar     = document.getElementById("project-bar");
  if (!popover?.classList.contains("is-open")) return;
  // keep open if click is inside the popover itself or the bar trigger
  if (popover.contains(e.target) || bar?.contains(e.target)) return;
  closeProjectPopover();
});

// ── Close project popover on Escape ──────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeProjectPopover();
});
