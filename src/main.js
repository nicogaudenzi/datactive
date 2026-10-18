import {GridStack} from "gridstack";
import * as d3 from "d3";
import "gridstack/dist/gridstack.min.css";
import "./styles.css";
import {CsvSourceAdapter} from "./data/csv.js";
import {XlsxSourceAdapter} from "./data/xlsx.js";
import {validateRawTable} from "./data/data-source.js";
import {DataSourceRegistry} from "./data/data-source-registry.js";
import {DataPreparationPipeline} from "./data/preparation/pipeline.js";
import {validateTransformationDefinitions} from "./data/preparation/transform-registry.js";
import {getDimensionColumns, getMeasureColumns, getDateColumns} from "./data/dataset-schema.js";
import {applyColumnMetadataOverrides, validateColumnMetadataOverrides, COLUMN_TYPES, COLUMN_ROLES, COLUMN_GEOGRAPHIC_ROLES} from "./data/column-metadata-overrides.js";
import {DataEngine} from "./engine/data-engine.js";
import {FilterStore} from "./state/filter-store.js";
import {ColorStore} from "./state/color-store.js";
import {BarChart} from "./visualizations/bar-chart.js";
import {LineChart} from "./visualizations/line-chart.js";
import {AreaChart} from "./visualizations/area-chart.js";
import {ScatterChart} from "./visualizations/scatter-chart.js";
import {TableChart} from "./visualizations/table-chart.js";
import {PieChart} from "./visualizations/pie-chart.js";
import {RangeFilterWidget} from "./visualizations/range-filter.js";
import {HistogramChart} from "./visualizations/histogram-chart.js";
import {DensityChart} from "./visualizations/density-chart.js";
import {StackedBarChart} from "./visualizations/stacked-bar-chart.js";
import {BoxPlotChart} from "./visualizations/box-plot-chart.js";
import {ViolinPlotChart} from "./visualizations/violin-plot-chart.js";
import {HeatmapChart} from "./visualizations/heatmap-chart.js";
import {TreemapChart} from "./visualizations/treemap-chart.js";
import {ComboChart} from "./visualizations/combo-chart.js";
import {WaterfallChart} from "./visualizations/waterfall-chart.js";
import {FunnelChart} from "./visualizations/funnel-chart.js";
import {RadarChart} from "./visualizations/radar-chart.js";
import {MapChart} from "./visualizations/map-chart.js";
import {applyChartInteraction} from "./interactions/chart-interaction-contract.js";
import {createVisualizationTransaction, replaceVisualizationTransaction} from "./dashboard/visualization-transactions.js";
import {validateVisualizationConfig} from "./dashboard/visualization-config.js";
import {parseDashboardState, reconcileDashboardVisualizations} from "./dashboard/dashboard-state.js";
import {applyInlineQueryEdit, titleAfterInlineEdit, titleAfterDialogEdit} from "./dashboard/visualization-editing.js";
import {serializeDashboard, parseDashboardImport, getDataSourceCompatibility, serializeRawTableToCsv} from "./dashboard/dashboard-persistence.js";
import {mountDataInspectionView} from "./data/data-inspection-view.js";
import {mountCleaningEditor} from "./data/preparation/cleaning-editor.js";
import {validateGeographyConfiguration} from "./maps/map-data-contract.js";
import {geographyStorageKey, loadGeographyConfiguration, saveGeographyConfiguration, initializeGeographyConfiguration, flushGeographyPersistence} from "./maps/geography-persistence.js";
import {suggestGeographicMappings} from "./maps/geography-matching.js";
import {BUILT_IN_MAPS} from "./maps/builtin-maps.js";
import {getAllMaps, getMapDefinition, getCustomMapDetails, findDuplicateCustomMap, registerCustomMap, removeCustomMap, updateCustomMapProperties, serializeCustomMaps, restoreCustomMapCollection, initializeCustomMapStorage, flushCustomMapPersistence} from "./maps/map-catalog.js";
import {validateCustomGeoJSON, inspectCustomGeoJSONFeatures} from "./maps/custom-geojson.js";
import {getPersistentValue, setPersistentValue, deletePersistentValue, requestPersistentStorage} from "./storage/indexeddb.js";
import {createPerformanceMetrics} from "./performance/performance-metrics.js";

const performanceMetrics = createPerformanceMetrics();
// Diagnostic timings are intentionally in-memory only and contain no row values.
window.__datactivePerformance = Object.freeze({snapshot: () => performanceMetrics.snapshot(), clear: () => performanceMetrics.clear()});

async function readStoredPayload(key, migrateSession = false) {
  try {
    const value = await getPersistentValue(key);
    if (value != null) return value;
  } catch (error) { console.warn(`IndexedDB read failed for ${key}; checking legacy session storage.`, error); }
  let raw = null;
  try { raw = sessionStorage.getItem(key); } catch { /* storage may be unavailable */ }
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw);
    if (migrateSession) {
      try { await setPersistentValue(key, value); sessionStorage.removeItem(key); }
      catch (error) { console.warn(`Could not migrate ${key} to IndexedDB; retaining the session copy.`, error); }
    }
    return value;
  } catch {
    try { sessionStorage.removeItem(key); } catch { /* unavailable */ }
    return null;
  }
}

async function writeStoredPayload(key, value) {
  try {
    await setPersistentValue(key, value);
    try { sessionStorage.removeItem(key); } catch { /* legacy cleanup is best-effort */ }
    return true;
  } catch (error) {
    // Blob/File payloads cannot safely fall back to JSON/Web Storage: JSON would
    // silently lose their bytes and large values can exceed Web Storage quotas.
    if (value?.fileBlob && typeof value.fileBlob.size === "number") {
      throw new Error(`Could not save the source file in IndexedDB. The browser may be out of storage space or may not support this operation. ${error.message}`);
    }
    // Keep a best-effort fallback for small settings on browsers with unavailable IndexedDB.
    try { sessionStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { throw new Error(`Could not save this data in IndexedDB or session storage. The browser may be out of storage space. ${error.message}`); }
  }
}

async function removeStoredPayload(key) {
  try { await deletePersistentValue(key); } catch { /* also clear any legacy copy */ }
  try { sessionStorage.removeItem(key); } catch { /* unavailable */ }
}

function requestImportRestoreOnNextStartup() {
  // Carry the one-shot intent in both session storage and the navigation URL.
  // The URL marker survives the exact reload initiated by an explicit import,
  // even if sessionStorage is unavailable or cleared by a browser/test harness.
  sessionStorage.setItem(IMPORT_RESTORE_INTENT_KEY, "1");
  const url = new URL(window.location.href);
  url.searchParams.set("restore-import", "1");
  history.replaceState(null, "", url);
}

const sourceRegistry = new DataSourceRegistry().register(new CsvSourceAdapter()).register(new XlsxSourceAdapter());
const IMPORT_SESSION_KEY = "dashboard-builder.imported-csv.v1";
const IMPORT_RESTORE_INTENT_KEY = "dashboard-builder.restore-import-once.v1";
const WORKSPACE_SESSION_KEY = "dashboard-builder.next-workspace.v1";
const PENDING_PROJECT_KEY = "dashboard-builder.pending-project-import.v1";
// Register the file picker before startup reaches its first top-level await.
// Otherwise Playwright (or a fast user) can select a file while IndexedDB/sample
// initialization is pending, before the handler is attached, and the selection is lost.
document.querySelector("#csv-file").addEventListener("change", handleCsvFile);
window.__datactiveImportHandlerReady = true;
// Keep workspace navigation responsive while startup awaits IndexedDB and loads
// the current source. Module-level awaits can delay the rest of this module's
// event-handler setup even though the page's navigation controls are already
// visible and interactive.
let workspaceRequestedDuringStartup = null;
let workspaceHandlersReady = false;
function showWorkspaceShellDuringStartup(workspace) {
  workspaceRequestedDuringStartup = workspace;
  const workspaces = {
    import: document.querySelector("#import-workspace"),
    data: document.querySelector("#data-workspace"),
    annotate: document.querySelector("#annotate-workspace"),
    maps: document.querySelector("#maps-workspace"),
    dashboard: document.querySelector("#dashboard-workspace")
  };
  for (const [name, element] of Object.entries(workspaces)) if (element) element.hidden = name !== workspace;
  const dashboardFloatingActions = document.querySelector("#dashboard-floating-actions");
  if (dashboardFloatingActions) dashboardFloatingActions.hidden = workspace !== "dashboard";
  const buttons = {
    import: document.querySelector("#show-import-workspace"),
    data: document.querySelector("#show-data-workspace"),
    annotate: document.querySelector("#show-annotate-workspace"),
    maps: document.querySelector("#show-maps-workspace"),
    dashboard: document.querySelector("#show-dashboard-workspace")
  };
  for (const [name, button] of Object.entries(buttons)) {
    if (!button) continue;
    const active = name === workspace;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  }
}
function runPreparationInWorker(rawTable, definitions) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("./data/preparation-worker.js", import.meta.url), {type: "module"}); }
    catch (error) { reject(error); return; }
    let settled = false;
    const finish = () => { if (settled) return; settled = true; worker.terminate(); };
    worker.onmessage = event => {
      const message = event.data;
      if (message?.type === "result") { finish(); resolve(message.dataset); }
      else if (message?.type === "error") { finish(); reject(new Error(message.message || "Background data preparation failed.")); }
    };
    worker.onerror = event => { finish(); reject(new Error(event.message || "Background data preparation worker failed.")); };
    try { worker.postMessage({rawTable, definitions}); }
    catch (error) { finish(); reject(error); }
  });
}

function requestWorkspace(workspace) {
  if (workspaceHandlersReady) {
    if (workspace === "maps" && !hasGeographicColumns()) return;
    setWorkspace(workspace);
  } else {
    showWorkspaceShellDuringStartup(workspace);
  }
}
document.querySelector("#show-import-workspace").addEventListener("click", () => requestWorkspace("import"));
document.querySelector("#show-dashboard-workspace").addEventListener("click", () => requestWorkspace("dashboard"));
document.querySelector("#show-data-workspace").addEventListener("click", () => requestWorkspace("data"));
document.querySelector("#show-annotate-workspace").addEventListener("click", () => requestWorkspace("annotate"));
document.querySelector("#show-maps-workspace").addEventListener("click", () => requestWorkspace("maps"));
for (const [buttonId, dialogId] of [["help-button", "help-dialog"], ["about-button", "about-dialog"]]) {
  document.querySelector(`#${buttonId}`).addEventListener("click", () => document.querySelector(`#${dialogId}`).showModal());
}
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
});
// Capture and consume the one-shot import intent before any asynchronous startup
// work. This keeps it tied to the navigation that immediately follows an explicit
// import/restore action, and prevents unrelated startup work from changing the
// decision about whether to load a saved source.
const startupUrl = new URL(window.location.href);
const urlRestoreIntent = startupUrl.searchParams.get("restore-import") === "1";
const restoreImportRequested = urlRestoreIntent || sessionStorage.getItem(IMPORT_RESTORE_INTENT_KEY) === "1";
sessionStorage.removeItem(IMPORT_RESTORE_INTENT_KEY);
if (urlRestoreIntent) {
  startupUrl.searchParams.delete("restore-import");
  history.replaceState(null, "", startupUrl);
}
// Request persistent origin storage where the browser supports it. IndexedDB still
// remains quota-managed, so every write is handled as a fallible operation.
void requestPersistentStorage();
const savedImportRecord = await readStoredPayload(IMPORT_SESSION_KEY, true);
let savedImportMetadata = null;
try { savedImportMetadata = JSON.parse(localStorage.getItem("dashboard-builder.import-metadata.v1") || "null"); } catch { /* ignore invalid optional metadata */ }
await initializeCustomMapStorage();
let importedCsv = restoreImportRequested ? savedImportRecord : null;
if (restoreImportRequested && !savedImportRecord) {
  console.error("An explicit import restore was requested, but the saved source record could not be read from IndexedDB.");
}

if (importedCsv?.sourceKind === "file" && importedCsv?.sourceType === "csv" && !importedCsv?.fileBlob && !importedCsv?.rawTable) {
  throw new Error("The saved CSV import record is missing its original file data. Please return to Import Data and select the file again.");
}
// Persisting a full row-object table can cost much more memory than the source
// file and can stall the tab while IndexedDB structured-clones it. Cache parsed
// tables only for small CSVs; large files keep the original Blob and are parsed
// in the worker on reload instead.
const PARSED_TABLE_CACHE_LIMIT = 5 * 1024 * 1024;
const parsedCacheKey = importedCsv?.sourceKind === "file" && importedCsv?.sourceType === "csv"
  && Number.isFinite(importedCsv.fileBlob?.size) && importedCsv.fileBlob.size <= PARSED_TABLE_CACHE_LIMIT
  ? `dashboard-builder.parsed-csv.v1:${encodeURIComponent(importedCsv.name || "unnamed")}:${importedCsv.fileBlob.size}`
  : null;
const sourceLoadStartedAt = performance.now();
const cachedParsedTable = parsedCacheKey ? await readStoredPayload(parsedCacheKey) : null;
const rawTable = cachedParsedTable?.columns && cachedParsedTable?.rows
  ? validateRawTable(cachedParsedTable, {cloneRows: false, validateRows: false})
  : importedCsv?.rawTable
    ? validateRawTable(importedCsv.rawTable, {cloneRows: false, validateRows: false})
    : importedCsv?.fileBlob
      ? (await sourceRegistry.loadFile("csv", importedCsv.fileBlob instanceof File
          ? importedCsv.fileBlob
          : new File([importedCsv.fileBlob], importedCsv.name || "local-file.csv", {type: importedCsv.fileBlob.type || "text/csv"}), {
          retainText: false,
          onProgress: progress => {
            const status = document.querySelector("#csv-import-status");
            if (!status) return;
            if (progress.stage === "reading") status.textContent = `Reading ${importedCsv.name} in background…`;
            else {
              const percent = Number.isFinite(progress.bytesRead) && Number.isFinite(progress.fileSize) && progress.fileSize > 0
                ? ` ${Math.min(100, Math.floor(progress.bytesRead / progress.fileSize * 100))}%`
                : "";
              const rowCount = Number.isFinite(progress.rowsParsed) ? ` · ${progress.rowsParsed.toLocaleString()} rows` : "";
              status.textContent = `Parsing ${importedCsv.name} in background…${percent}${rowCount}`;
            }
          }
        })).table
      : importedCsv?.text
        ? sourceRegistry.loadText("csv", importedCsv.text, importedCsv.name || "local-file.csv")
        : await sourceRegistry.load("csv", new URL("/data/sales.csv", window.location.origin).href);
performanceMetrics.record("source-load-and-parse", sourceLoadStartedAt, {rows: rawTable.rows.length, columns: rawTable.columns.length, cached: Boolean(cachedParsedTable)});
// Parsing is complete, but canonical dataset construction and analysis still
// remain. Do not leave the import UI reporting Parsing 100% during those phases.
if (importedCsv?.name) {
  const status = document.querySelector("#csv-import-status");
  if (status) status.textContent = `Preparing ${importedCsv.name}…${rawTable.rows.length.toLocaleString()} rows`;
}
if (parsedCacheKey && !cachedParsedTable) {
  // Cache the parsed table separately from the original file. Subsequent page
  // loads restore structured rows instead of reparsing the same CSV each time.
  try { await writeStoredPayload(parsedCacheKey, rawTable); }
  catch (error) { console.warn("Could not cache parsed CSV; the original file will be reparsed on reload.", error); }
}
// Keep the imported raw table separate from prepared output. Serializable definitions
// are replayed from raw input on every startup; no transformation mutates rawTable.
const sourceIdentity = importedCsv?.url || importedCsv?.name || "sample";
const PREPARATION_KEY = `dashboard-builder.preparation.v1:${encodeURIComponent(sourceIdentity)}:${rawTable.columns.join("|")}`;
let pendingProject = restoreImportRequested ? await readStoredPayload(PENDING_PROJECT_KEY, true) : null;
if (pendingProject?.processing?.transformations) {
  try { sessionStorage.setItem(PREPARATION_KEY, JSON.stringify(validateTransformationDefinitions(pendingProject.processing.transformations, rawTable.columns))); }
  catch (error) { sessionStorage.removeItem(PENDING_PROJECT_KEY); throw new Error(`The imported project has invalid preparation steps: ${error.message}`); }
}
// Dashboard configuration is keyed to the source identity, not the prepared schema,
// so it survives transformation edits that add or remove derived columns.
const DASHBOARD_STATE_KEY = `dashboard-builder.dashboard-state.v1:${encodeURIComponent(sourceIdentity)}`;
const defaultDefinitions = !importedCsv && rawTable.columns.includes("date")
  ? [{id: "sample-month-from-date", type: "derive-column", expression: "FORMAT_MONTH([date])", resultType: "text", targetColumn: "month"}]
  : [];
function readPreparationDefinitions() {
  try {
    const stored = sessionStorage.getItem(PREPARATION_KEY);
    return validateTransformationDefinitions(stored == null ? defaultDefinitions : JSON.parse(stored), rawTable.columns);
  } catch {
    sessionStorage.removeItem(PREPARATION_KEY);
    return defaultDefinitions;
  }
}
const preparationDefinitions = readPreparationDefinitions();
// Persist the normalized, serializable plan for this source in the current tab.
// Future cleaning UI will edit this definition list rather than mutate prepared rows.
try { sessionStorage.setItem(PREPARATION_KEY, JSON.stringify(preparationDefinitions)); } catch { /* session storage can be unavailable or full */ }
const preparationPipeline = new DataPreparationPipeline({definitions: preparationDefinitions});
const preparationStartedAt = performance.now();
let dataset;
if (typeof Worker !== "undefined") {
  const status = document.querySelector("#csv-import-status");
  if (status && importedCsv?.name) status.textContent = `Preparing ${importedCsv.name} in background…${rawTable.rows.length.toLocaleString()} rows`;
  try {
    dataset = await runPreparationInWorker(rawTable, preparationDefinitions);
  } catch (error) {
    console.error("Background data preparation failed.", error);
    if (status && importedCsv?.name) {
      status.classList.add("error");
      status.textContent = `Preparation failed: ${error.message}`;
    }
    // Do not retry a large dataset synchronously on the main thread: that would
    // recreate the browser freeze this worker is intended to prevent.
    if (Number(importedCsv?.fileBlob?.size) > PARSED_TABLE_CACHE_LIMIT) throw error;
    dataset = await preparationPipeline.run(rawTable);
  }
  if (status && importedCsv?.name) status.textContent = `Initializing dashboard for ${importedCsv.name}…${rawTable.rows.length.toLocaleString()} rows`;
} else {
  dataset = await preparationPipeline.run(rawTable);
}
performanceMetrics.record("preparation", preparationStartedAt, {rows: dataset.rows.length, columns: dataset.columns.length, worker: typeof Worker !== "undefined"});
const preparationProvenance = dataset.preparation;
const metadataOverrideKey = `dashboard-builder.column-metadata-overrides.v1:${encodeURIComponent(sourceIdentity)}:${dataset.columns.join("|")}`;
const ANNOTATIONS_KEY = `dashboard-builder.column-annotations.v1:${encodeURIComponent(sourceIdentity)}:${dataset.columns.join("|")}`;
const ANNOTATION_STATUS_KEY = `${ANNOTATIONS_KEY}:status`;
const GEOGRAPHY_KEY = geographyStorageKey(sourceIdentity, dataset.columns);
await initializeGeographyConfiguration(GEOGRAPHY_KEY, dataset.columns);
if (pendingProject) {
  try {
    // Validate every project-owned setting before mutating either catalog or storage.
    // This prevents an invalid later section (for example metadata overrides) from
    // leaving the custom-map catalog replaced by only part of an import operation.
    const annotations = pendingProject.processing?.annotations ?? {};
    if (!annotations || typeof annotations !== "object" || Array.isArray(annotations)) throw new Error("Project annotations must be an object.");
    const validatedOverrides = validateColumnMetadataOverrides(dataset, pendingProject.processing?.metadataOverrides ?? {});
    const validatedGeography = validateGeographyConfiguration(pendingProject.processing?.geography, dataset.columns);
    const projectCustomMaps = pendingProject.processing?.customMaps;

    // Restore project-owned map definitions before geography mappings that reference them.
    // Older project documents omit customMaps and leave the local catalog untouched.
    if (projectCustomMaps != null) restoreCustomMapCollection(projectCustomMaps);
    sessionStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations));
    sessionStorage.setItem(metadataOverrideKey, JSON.stringify(validatedOverrides));
    if (!saveGeographyConfiguration(GEOGRAPHY_KEY, validatedGeography, dataset.columns)) throw new Error("Could not queue geography mappings for storage.");
    await flushGeographyPersistence();
    await flushCustomMapPersistence();
    sessionStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify({version: 1, visualizations: pendingProject.visualizations ?? []}));
    sessionStorage.setItem(WORKSPACE_SESSION_KEY, "dashboard");
    sessionStorage.setItem(ANNOTATION_STATUS_KEY, "Imported project metadata and preparation settings.");
    await removeStoredPayload(PENDING_PROJECT_KEY);
  } catch (error) {
    throw new Error(`Could not apply imported project metadata: ${error.message}`);
  }
}
function readAnnotations() {
  try {
    const value = JSON.parse(sessionStorage.getItem(ANNOTATIONS_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function columnDescription(column) {
  const description = readAnnotations()[column]?.description;
  return typeof description === "string" ? description.trim() : "";
}
function columnOption(column) {
  const description = columnDescription(column);
  return `<option value="${esc(column)}"${description ? ` title="${esc(description)}"` : ""}>${esc(column)}</option>`;
}
function readMetadataOverrides() {
  try { return JSON.parse(sessionStorage.getItem(metadataOverrideKey) ?? "{}"); } catch { return {}; }
}
function readGeographyConfiguration() {
  const saved = loadGeographyConfiguration(GEOGRAPHY_KEY, dataset.columns);
  if (saved.mappings.length) return saved;
  // Migrate mappings from the previous tab-session store so an upgrade does not
  // discard assignments already present in the current browser tab.
  try {
    const legacy = sessionStorage.getItem(GEOGRAPHY_KEY);
    if (legacy != null) {
      const migrated = validateGeographyConfiguration(JSON.parse(legacy), dataset.columns);
      saveGeographyConfiguration(GEOGRAPHY_KEY, migrated, dataset.columns);
      sessionStorage.removeItem(GEOGRAPHY_KEY);
      return migrated;
    }
  } catch { try { sessionStorage.removeItem(GEOGRAPHY_KEY); } catch { /* unavailable */ } }
  return saved;
}
function writeGeographyConfiguration(configuration) {
  const validated = validateGeographyConfiguration(configuration, dataset.columns);
  if (!saveGeographyConfiguration(GEOGRAPHY_KEY, validated, dataset.columns)) throw new Error("IndexedDB is unavailable; geography mappings cannot be saved across reloads.");
  return validated;
}
const inferredMetadata = Object.fromEntries(dataset.columns.map(column => [column, {...dataset.columnMetadata[column]}]));
let metadataOverrides = readMetadataOverrides();
try {
  metadataOverrides = validateColumnMetadataOverrides(dataset, metadataOverrides);
  dataset = applyColumnMetadataOverrides(dataset, metadataOverrides);
} catch {
  metadataOverrides = {};
  sessionStorage.removeItem(metadataOverrideKey);
}
// Metadata overrides are applied through the canonical validator; retain the separate
// preparation record so the active dataset still exposes its reproducible lineage.
dataset.preparation = preparationProvenance;
const dimensionColumns = getDimensionColumns(dataset);
const numericColumns = getMeasureColumns(dataset);
const dateColumns = getDateColumns(dataset);

GridStack.renderCB = (el, w) => {
  el.innerHTML = w.content ?? "";
};

const dashboardInitializationStartedAt = performance.now();
const dataEngine = new DataEngine(dataset);
const filterStore = new FilterStore();
const colorStore = new ColorStore(dataset);
const dashboard = GridStack.init(
  {
    column: 12,
    cellHeight: 80,
    margin: 8,
    float: false,
    animate: false,
    draggable: {
      handle: ".chart-header",
      cancel: "button, input, select, textarea"
    }
  },
  "#dashboard"
);

const visualizations = new Map();
let dashboardStateReady = false;
let nextId = 1;
let editingId = null;
let rangeWidget = null;

const hasSampleSchema = ["month", "revenue", "cost", "profit"].every(column => dataset.columns.includes(column));
const initial = hasSampleSchema ? {
  id: "chart-1", type: "bar", title: "Revenue, Cost & Profit by Month",
  query: {dimensions: ["month"], measures: [
    {column: "revenue", aggregation: "sum"},
    {column: "cost", aggregation: "sum"},
    {column: "profit", aggregation: "sum"}
  ]}, layout: {x: 0, y: 0, w: 12, h: 5}
} : {
  id: "chart-1", type: "table", title: "Imported data preview",
  query: {columns: [...dataset.columns]}, layout: {x: 0, y: 0, w: 12, h: 5}
};

const storedDashboardState = readDashboardState();
if (storedDashboardState) {
  const reconciled = reconcileDashboardVisualizations(storedDashboardState.visualizations, dataset, validateVisualizationConfig);
  if (reconciled.valid.length) loadLayout(reconciled.valid);
  if (reconciled.removed.length) showDashboardStateNotice(reconciled.removed);
} else {
  renderVisualization(initial);
}
dashboardStateReady = true;
performanceMetrics.record("dashboard-initialization", dashboardInitializationStartedAt, {rows: dataset.rows.length, columns: dataset.columns.length, visualizations: visualizations.size});
persistDashboardState();
dashboard.on("change", () => persistDashboardState());

filterStore.subscribe(filters => {
  dataEngine.applyFilters(filters);

  // Keep dashboard refresh independent from the range-filter UI. A range
  // control is a secondary visual representation of state and must never be
  // able to prevent charts from receiving the new filtered data.
  try {
    renderFilterPanel(filters);
  } catch (error) {
    console.error("Filter panel update failed:", error);
  }

  // Range controls are another view of FilterStore state. Keep them synchronized
  // from the store rather than from the control that originated the filter.
  // This means chart brushes, chart clicks, range sliders, and Clear All all
  // drive the same visual state.
  try {
    rangeWidget?.update(filters);
  } catch (error) {
    console.error("Range filter synchronization failed:", error);
  }

  const filterUpdateStartedAt = performance.now();
  refreshDashboard();
  performanceMetrics.record("filter-and-dashboard-refresh", filterUpdateStartedAt, {rows: dataEngine.filteredRows().length, filters: filters.length, visualizations: visualizations.size});
});

document.querySelector("#add-chart").addEventListener("click", () => openAddDialog());
document.querySelector("#cancel-chart").addEventListener("click", closeChartDialog);
document.querySelector("#clear-filters-floating").addEventListener("click", () => filterStore.clear());
document.querySelector("#start-fresh").addEventListener("click", () => {
  const confirmed = window.confirm("Start fresh? This will permanently clear Datactive data saved in this browser origin, including the imported dataset, preparation steps, annotations, quality-finding statuses, and dashboard layout. Export your data project first if you want to keep it.");
  if (!confirmed) return;
  try { localStorage.clear(); } catch { /* local storage may be unavailable */ }
  try { sessionStorage.clear(); } catch { /* session storage may be unavailable */ }
  window.location.reload();
});
document.querySelector("#clear-active-filters").addEventListener("click", () => filterStore.clear());
document.querySelector("#filter-panel-toggle").addEventListener("click", () => toggleCollapsiblePanel("#filter-panel-toggle", "#filter-panel-body", "#filter-panel-chevron"));
document.querySelector("#ranges-panel-toggle").addEventListener("click", () => toggleCollapsiblePanel("#ranges-panel-toggle", "#ranges-panel-body", "#ranges-panel-chevron"));
document.querySelector("#export-layout").addEventListener("click", exportLayout);
document.querySelector("#load-layout").addEventListener("click", () => document.querySelector("#layout-file").click());
document.querySelector("#xlsx-file").addEventListener("change", handleXlsxFile);
document.querySelector("#xlsx-import-sheet").addEventListener("click", handleXlsxSheetImport);
document.querySelector("#csv-url-form").addEventListener("submit", handleCsvUrl);
document.querySelector("#reset-to-sample").addEventListener("click", async () => {
  sessionStorage.removeItem(IMPORT_RESTORE_INTENT_KEY);
  await removeStoredPayload(IMPORT_SESSION_KEY);
  try { localStorage.removeItem("dashboard-builder.import-metadata.v1"); } catch { /* storage unavailable */ }
  await removeStoredPayload(PENDING_PROJECT_KEY);
  location.reload();
});
document.querySelector("#restore-saved-import").addEventListener("click", () => {
  requestImportRestoreOnNextStartup();
  location.reload();
});
renderCsvImportStatus();
document.querySelector("#layout-file").addEventListener("change", handleLayoutFile);
document.querySelector("#project-source-file").addEventListener("change", handleProjectSourceFile);
document.querySelector("#chart-form").addEventListener("submit", handleChartSubmit);
document.querySelector("#chart-type").addEventListener("change", updateChartTypeFields);

populateForm();
renderFilterPanel(filterStore.getFilters());
const FINDING_STATUS_KEY = `dashboard-builder.finding-status.v1:${encodeURIComponent(sourceIdentity)}:${dataset.columns.join("|")}`;
// Keep asynchronous inspection and the transformation editor in separate hosts.
// mountDataInspectionView replaces its own host's children after profiling; sharing
// the workspace root would erase the editor when that async work completes.
const dataWorkspace = document.querySelector("#data-workspace");
dataWorkspace.innerHTML = '<div id="data-inspection-host"></div><div id="data-cleaning-host"></div>';
void mountDataInspectionView(document.querySelector("#data-inspection-host"), dataset, {
  statusStorageKey: FINDING_STATUS_KEY,
  getColumnDescription: columnDescription,
  onProgress: ({stage, rowCount}) => {
    const status = document.querySelector("#csv-import-status");
    if (!status || !importedCsv?.name) return;
    const rows = Number.isFinite(rowCount) ? ` · ${rowCount.toLocaleString()} rows` : "";
    status.classList.remove("error");
    status.textContent = stage === "profiling" ? `Profiling ${importedCsv.name}…${rows}`
      : stage === "quality" ? `Checking data quality for ${importedCsv.name}…${rows}`
      : `Ready: ${importedCsv.name}${rows}`;
  }
}).catch(error => {
  console.error("Could not inspect the imported dataset:", error);
  const status = document.querySelector("#csv-import-status");
  if (status) { status.classList.add("error"); status.textContent = `Data inspection failed: ${error.message}`; }
});
mountCleaningEditor(document.querySelector("#data-cleaning-host"), {
  rawTable, dataset, definitions: preparationDefinitions,
  onApply: definitions => {
    try {
      const validated = validateTransformationDefinitions(definitions, rawTable.columns);
      sessionStorage.setItem(PREPARATION_KEY, JSON.stringify(validated));
      sessionStorage.setItem(WORKSPACE_SESSION_KEY, "data");
      // This is an intentional state-changing reload, not an ordinary page visit.
      // Restore the current source so the saved transformation is applied to the
      // dataset the user was working with instead of falling back to the sample.
      requestImportRestoreOnNextStartup();
      location.reload();
    } catch (error) {
      const host = document.querySelector("#cleaning-preview");
      if (host) { host.replaceChildren(); const message = document.createElement("p"); message.className = "annotation-help error"; message.textContent = `Could not update preparation steps: ${error.message}`; host.append(message); }
    }
  }
});
renderAnnotations();
setupCustomGeoJSONPreview();
renderCustomMapCatalog();
renderGeographyEditor();
updateMapsTabAvailability();
const requestedWorkspace = sessionStorage.getItem(WORKSPACE_SESSION_KEY);
sessionStorage.removeItem(WORKSPACE_SESSION_KEY);
const validRequestedWorkspace = ["import", "data", "annotate", "maps", "dashboard"].includes(requestedWorkspace) && (requestedWorkspace !== "maps" || hasGeographicColumns()) ? requestedWorkspace : "import";
const startupWorkspace = workspaceRequestedDuringStartup ?? validRequestedWorkspace;
workspaceHandlersReady = true;
setWorkspace(startupWorkspace === "maps" && !hasGeographicColumns() ? "annotate" : startupWorkspace);

async function handleCsvFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const status = document.querySelector("#csv-import-status");
  status.classList.remove("error");
  status.textContent = `Checking ${file.name}…`;
  try {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') throw new Error("Choose a .csv file.");
    // Persist the original File/Blob first. IndexedDB can store it without
    // expanding the CSV into millions of JavaScript row objects before save.
    // Startup parses it in a Worker after reload, so parsing doesn't block UI.
    status.textContent = `Saving ${file.name} for background import…`;
    // Persist a plain Blob rather than relying on File metadata surviving every
    // browser's IndexedDB structured-clone implementation. The original filename
    // is stored separately and restored as a File when loading the dataset.
    const fileBlob = new Blob([file], {type: file.type || "text/csv"});
    const importRecord = {name: file.name, fileBlob, sourceKind: "file", sourceType: "csv"};
    await writeStoredPayload(IMPORT_SESSION_KEY, importRecord);
    // Verify the source can actually be read back before navigating away. This
    // catches storage implementations that acknowledge a write but fail to retain
    // a Blob, avoiding a silent fallback to the sample dataset after reload.
    const savedRecord = await readStoredPayload(IMPORT_SESSION_KEY);
    if (!savedRecord?.fileBlob || savedRecord.name !== file.name) {
      throw new Error("The source file could not be verified in browser storage. Please try importing it again.");
    }
    // Keep only small display metadata outside IndexedDB so the restore choice
    // remains visible after an ordinary reload; the actual file bytes stay in IDB.
    try { localStorage.setItem("dashboard-builder.import-metadata.v1", JSON.stringify({name: file.name, sourceType: "csv", sourceKind: "file"})); } catch { /* optional UI metadata */ }
    requestImportRestoreOnNextStartup();
    location.reload();
  } catch (error) {
    status.textContent = `Import failed: ${error.message}`;
    status.classList.add("error");
    event.target.value = "";
  }
}

let pendingXlsxFile = null;

async function handleXlsxFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const status = document.querySelector("#csv-import-status");
  const sheetControls = document.querySelector("#xlsx-sheet-controls");
  const sheetSelect = document.querySelector("#xlsx-sheet");
  const importButton = document.querySelector("#xlsx-import-sheet");
  sheetControls.hidden = true;
  pendingXlsxFile = null;
  status.classList.remove("error");
  status.textContent = `Reading ${file.name}…`;
  try {
    const result = await sourceRegistry.loadFile("xlsx", file);
    if (result.sheetNames.length > 1) {
      pendingXlsxFile = file;
      sheetSelect.replaceChildren(...result.sheetNames.map(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        return option;
      }));
      sheetSelect.value = result.selectedSheet;
      sheetControls.hidden = false;
      status.textContent = `${file.name}: choose a worksheet to import.`;
      return;
    }
    await commitXlsxImport(file, result.selectedSheet, result.table);
  } catch (error) {
    status.textContent = `Import failed: ${error.message}`;
    status.classList.add("error");
  }
}

async function handleXlsxSheetImport() {
  if (!pendingXlsxFile) return;
  const file = pendingXlsxFile;
  const sheetName = document.querySelector("#xlsx-sheet").value;
  const button = document.querySelector("#xlsx-import-sheet");
  const status = document.querySelector("#csv-import-status");
  button.disabled = true;
  status.classList.remove("error");
  status.textContent = `Importing worksheet ${sheetName}…`;
  try {
    const {table} = await sourceRegistry.loadFile("xlsx", file, {sheetName});
    await commitXlsxImport(file, sheetName, table);
  } catch (error) {
    status.textContent = `Import failed: ${error.message}`;
    status.classList.add("error");
    button.disabled = false;
  }
}

async function commitXlsxImport(file, sheetName, raw) {
  if (!raw.columns.length) throw new Error("No columns were found in the worksheet.");
  if (!raw.rows.length) throw new Error("The worksheet has headers but no data rows.");
  await writeStoredPayload(IMPORT_SESSION_KEY, {name: file.name, sourceType: "xlsx", sheetName, rawTable: raw, sourceKind: "file"});
  requestImportRestoreOnNextStartup();
  location.reload();
}

async function handleCsvUrl(event) {
  event.preventDefault();
  const input = document.querySelector("#csv-url");
  const status = document.querySelector("#csv-import-status");
  const button = event.submitter ?? event.currentTarget.querySelector('button[type="submit"]');
  const url = input.value.trim();
  button.disabled = true;
  status.classList.remove("error");
  status.textContent = "Fetching CSV…";
  try {
    const {table: raw, text, reference, name} = await sourceRegistry.loadResource("csv", url);
    if (!raw.columns.length) throw new Error("No columns were found in the CSV.");
    if (!raw.rows.length) throw new Error("The CSV has headers but no data rows.");
    await writeStoredPayload(IMPORT_SESSION_KEY, {name, text, url: reference, sourceKind: "url"});
    requestImportRestoreOnNextStartup();
    location.reload();
  } catch (error) {
    const corsHint = error instanceof TypeError ? " The request may have been blocked by CORS or a network error; try a direct CSV URL or upload the file instead." : "";
    status.textContent = `Import failed: ${error.message}${corsHint}`;
    status.classList.add("error");
  } finally { button.disabled = false; }
}

function renderCsvImportStatus() {
  const status = document.querySelector("#csv-import-status");
  if (!status) return;
  const resetButton = document.querySelector("#reset-to-sample");
  const restoreButton = document.querySelector("#restore-saved-import");
  const detail = document.querySelector("#import-source-detail");
  if (importedCsv?.name) {
    status.textContent = `Loaded: ${importedCsv.name}${importedCsv.sheetName ? ` — ${importedCsv.sheetName}` : ""}`;
    if (detail) detail.textContent = importedCsv.url ? `Source URL: ${importedCsv.url}` : `Local ${importedCsv.sourceType === "xlsx" ? "Excel workbook" : "CSV file"}: ${importedCsv.name}${importedCsv.sheetName ? ` · Worksheet: ${importedCsv.sheetName}` : ""}`;
    resetButton.hidden = false;
    restoreButton.hidden = true;
  } else {
    status.textContent = "Sample dataset loaded";
    const savedName = savedImportRecord?.name || savedImportMetadata?.name;
    const hasSavedImport = Boolean(savedName);
    if (detail) detail.textContent = hasSavedImport
      ? `A previous import (${savedName}) may be stored in this browser but has not been loaded. Restore it explicitly, or forget it.`
      : "Using the bundled sales example until you import another dataset.";
    resetButton.hidden = !hasSavedImport;
    resetButton.textContent = hasSavedImport ? "Forget saved import" : "Use sample data";
    restoreButton.hidden = !hasSavedImport;
    if (hasSavedImport) restoreButton.textContent = `Restore saved dataset: ${savedName}`;
  }
}

function readDashboardState() {
  const raw = sessionStorage.getItem(DASHBOARD_STATE_KEY);
  const parsed = parseDashboardState(raw);
  if (raw != null && parsed == null) sessionStorage.removeItem(DASHBOARD_STATE_KEY);
  return parsed;
}

function persistDashboardState() {
  if (!dashboardStateReady) return;
  try {
    sessionStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify({version: 1, visualizations: getCurrentVisualizations()}));
  } catch (error) {
    console.warn("Could not preserve dashboard configuration for this tab:", error);
  }
}

function showDashboardStateNotice(removed) {
  const notice = document.querySelector("#dashboard-state-notice");
  if (!notice) return;
  notice.hidden = false;
  notice.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = `${removed.length} chart${removed.length === 1 ? " was" : "s were"} removed because the prepared dataset no longer supports ${removed.length === 1 ? "its configuration" : "their configurations"}.`;
  const list = document.createElement("ul");
  for (const item of removed) {
    const li = document.createElement("li");
    li.textContent = `${item.title}: ${item.reason}`;
    list.append(li);
  }
  notice.append(heading, list);
}

function setWorkspace(workspace) {
  const workspaces = {
    import: document.querySelector("#import-workspace"),
    data: document.querySelector("#data-workspace"),
    annotate: document.querySelector("#annotate-workspace"),
    maps: document.querySelector("#maps-workspace"),
    dashboard: document.querySelector("#dashboard-workspace")
  };
  if (workspace === "maps" && !hasGeographicColumns()) workspace = "annotate";
  for (const [name, element] of Object.entries(workspaces)) element.hidden = name !== workspace;
  const dashboardFloatingActions = document.querySelector("#dashboard-floating-actions");
  if (dashboardFloatingActions) dashboardFloatingActions.hidden = workspace !== "dashboard";
  const buttons = {
    import: document.querySelector("#show-import-workspace"),
    data: document.querySelector("#show-data-workspace"),
    annotate: document.querySelector("#show-annotate-workspace"),
    maps: document.querySelector("#show-maps-workspace"),
    dashboard: document.querySelector("#show-dashboard-workspace")
  };
  for (const [name, button] of Object.entries(buttons)) {
    const active = name === workspace;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  }
  if (workspace === "dashboard") refreshDashboard();
}

function renderAnnotations() {
  const host = document.querySelector("#annotation-editor");
  if (!host) return;
  const annotations = readAnnotations();
  host.replaceChildren();
  const intro = document.createElement("p");
  intro.className = "annotation-help";
  intro.textContent = "Describe columns and override inferred types or roles. Descriptions appear in column profiles and as help text in chart field selectors. Type and role overrides affect available chart fields but never convert or clean source values. Edit any columns, then save everything once.";
  host.append(intro);
  const status = document.createElement("p");
  status.className = "annotation-help";
  status.setAttribute("role", "status");
  const savedMessage = sessionStorage.getItem(ANNOTATION_STATUS_KEY);
  if (savedMessage) { status.textContent = savedMessage; sessionStorage.removeItem(ANNOTATION_STATUS_KEY); }
  host.append(status);
  const edits = new Map();
  for (const column of dataset.columns) {
    const card = document.createElement("section"); card.className = "annotation-row";
    const heading = document.createElement("div"); heading.className = "annotation-column-name";
    const title = document.createElement("strong"); title.textContent = column;
    const meta = dataset.columnMetadata?.[column];
    const inferred = inferredMetadata[column] ?? meta;
    const type = document.createElement("span"); type.textContent = `Current: ${meta?.type ?? "unknown"} · ${meta?.role ?? "unassigned"}`;
    heading.append(title, type);

    const descriptionLabel = document.createElement("label"); descriptionLabel.textContent = "Description";
    const descriptionInput = document.createElement("textarea"); descriptionInput.rows = 2; descriptionInput.value = annotations[column]?.description ?? ""; descriptionInput.placeholder = `Describe ${column}…`;
    descriptionLabel.append(descriptionInput);

    const metadataControls = document.createElement("div"); metadataControls.className = "metadata-override-controls";
    const typeLabel = document.createElement("label"); typeLabel.textContent = `Type (automatically inferred: ${inferred.type})`;
    const typeSelect = document.createElement("select"); typeSelect.setAttribute("aria-label", `${column} type`);
    for (const optionValue of COLUMN_TYPES) { const option = document.createElement("option"); option.value = optionValue; option.textContent = optionValue; typeSelect.append(option); }
    typeSelect.value = meta.type;
    typeLabel.append(typeSelect);

    const roleLabel = document.createElement("label"); roleLabel.textContent = `Role (automatically suggested: ${inferred.role})`;
    const roleSelect = document.createElement("select"); roleSelect.setAttribute("aria-label", `${column} role`);
    for (const optionValue of COLUMN_ROLES) { const option = document.createElement("option"); option.value = optionValue; option.textContent = optionValue; roleSelect.append(option); }
    roleSelect.value = meta.role;
    roleLabel.append(roleSelect);

    const geographicLabel = document.createElement("label"); geographicLabel.textContent = "Geographic role";
    const geographicSelect = document.createElement("select"); geographicSelect.setAttribute("aria-label", `${column} geographic role`);
    const noGeographicRole = document.createElement("option"); noGeographicRole.value = ""; noGeographicRole.textContent = "Not geographic"; geographicSelect.append(noGeographicRole);
    const geographicLabels = {country: "Country", "state-province": "State / province", "county-district": "County / district", city: "City", "postal-code": "Postal code", "custom-region": "Custom region"};
    for (const optionValue of COLUMN_GEOGRAPHIC_ROLES) { const option = document.createElement("option"); option.value = optionValue; option.textContent = geographicLabels[optionValue] ?? optionValue; geographicSelect.append(option); }
    geographicSelect.value = meta.geographicRole ?? "";
    geographicLabel.append(geographicSelect);

    edits.set(column, {descriptionInput, typeSelect, roleSelect, geographicSelect});
    metadataControls.append(typeLabel, roleLabel, geographicLabel);
    card.append(heading, descriptionLabel, metadataControls); host.append(card);
  }
  const actions = document.createElement("div"); actions.className = "annotation-save-actions";
  const saveAll = document.createElement("button"); saveAll.type = "button"; saveAll.textContent = "Save all metadata";
  saveAll.addEventListener("click", () => {
    const nextAnnotations = {...readAnnotations()};
    const nextOverrides = {...readMetadataOverrides()};
    for (const [column, fields] of edits) {
      nextAnnotations[column] = {...(nextAnnotations[column] ?? {}), description: fields.descriptionInput.value.trim()};
      const override = {...(nextOverrides[column] ?? {}), type: fields.typeSelect.value, role: fields.roleSelect.value};
      if (fields.geographicSelect.value) override.geographicRole = fields.geographicSelect.value;
      else delete override.geographicRole;
      nextOverrides[column] = override;
    }
    try {
      const validatedAnnotations = {};
      for (const column of dataset.columns) {
        const description = nextAnnotations[column]?.description;
        if (description !== undefined && typeof description !== "string") throw new TypeError(`Description for "${column}" must be text.`);
        validatedAnnotations[column] = {description: description ?? ""};
      }
      const validatedOverrides = validateColumnMetadataOverrides(dataset, nextOverrides);
      sessionStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(validatedAnnotations));
      sessionStorage.setItem(metadataOverrideKey, JSON.stringify(validatedOverrides));
      sessionStorage.setItem(WORKSPACE_SESSION_KEY, "annotate");
      sessionStorage.setItem(ANNOTATION_STATUS_KEY, "All column metadata saved. Type and role changes have been applied.");
      // Preserve the active source for this intentional metadata-save reload.
      requestImportRestoreOnNextStartup();
      location.reload();
    } catch (error) {
      status.className = "annotation-help error";
      status.textContent = `Could not save metadata: ${error.message}`;
    }
  });
  actions.append(saveAll); host.append(actions);
}

function hasGeographicColumns() {
  return dataset.columns.some(column => Boolean(dataset.columnMetadata?.[column]?.geographicRole));
}

function updateMapsTabAvailability() {
  const button = document.querySelector("#show-maps-workspace");
  if (!button) return;
  const available = hasGeographicColumns();
  button.disabled = !available;
  button.title = available ? "Map values from a geographic column to map regions" : "Annotate at least one column with a geographic role first";
}

function distinctColumnValues(column) {
  const values = new Map();
  for (const row of dataset.rows) {
    const value = row[column] ?? null;
    const key = JSON.stringify(value);
    if (!values.has(key)) values.set(key, value);
  }
  return [...values.entries()].map(([key, value]) => ({key, value}));
}

function displayGeographicValue(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return "(blank / missing)";
  return String(value);
}

function samplePropertyValues(geojson, property) {
  const values = [];
  const seen = new Set();
  for (const feature of geojson.features ?? []) {
    const value = feature.properties?.[property];
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const text = String(value).trim();
    if (!seen.has(text)) { seen.add(text); values.push(text); }
    if (values.length >= 3) break;
  }
  return values.length ? values.join(", ") : "(no sample values)";
}

function propertyOptions(geojson, selected = "") {
  const names = [...new Set((geojson.features ?? []).flatMap(feature => Object.keys(feature.properties ?? {})))];
  return names.map(name => `<option value="${esc(name)}" ${name === selected ? "selected" : ""}>${esc(name)} — e.g. ${esc(samplePropertyValues(geojson, name))}</option>`).join("");
}

function mapCatalogOptionLabel(map) {
  const mappings = readGeographyConfiguration().mappings.filter(mapping => mapping.mapId === map.id);
  const columns = [...new Set(mappings.map(mapping => mapping.column))];
  return columns.length ? `${map.name} — mapped from: ${columns.join(", ")}` : `${map.name} — no region mapping`;
}

function refreshMapSelectors(selectedMapId = "") {
  const chartSelect = document.querySelector("#map-definition");
  if (chartSelect) {
    chartSelect.innerHTML = getAllMaps().map(map => `<option value="${esc(map.id)}">${esc(mapCatalogOptionLabel(map))}</option>`).join("");
    if (selectedMapId && getMapDefinition(selectedMapId)) chartSelect.value = selectedMapId;
  }
}

function renderCustomMapCatalog() {
  const host = document.querySelector("#custom-map-catalog-list");
  if (!host) return;
  host.replaceChildren();
  const customMaps = getAllMaps().filter(map => map.id.startsWith("custom-"));
  if (!customMaps.length) { const empty = document.createElement("p"); empty.className = "annotation-help"; empty.textContent = "No custom maps have been added yet."; host.append(empty); return; }
  for (const map of customMaps) {
    const details = getCustomMapDetails(map.id);
    const card = document.createElement("article"); card.className = "custom-map-catalog-item";
    const heading = document.createElement("h4"); heading.textContent = `${map.name} · ${map.regions.length} regions`; card.append(heading);
    const controls = document.createElement("div"); controls.className = "custom-geojson-controls";
    const idLabel = document.createElement("label"); idLabel.textContent = "Region ID property";
    const idSelect = document.createElement("select"); idSelect.setAttribute("aria-label", `${map.name} region ID property`); idSelect.innerHTML = propertyOptions(details.sourceGeoJSON, details.idProperty); idLabel.append(idSelect);
    const nameLabel = document.createElement("label"); nameLabel.textContent = "Display label property";
    const nameSelect = document.createElement("select"); nameSelect.setAttribute("aria-label", `${map.name} display label property`); nameSelect.innerHTML = propertyOptions(details.sourceGeoJSON, details.labelProperty); nameLabel.append(nameSelect);
    controls.append(idLabel, nameLabel); card.append(controls);
    const aliasesHeading = document.createElement("h5"); aliasesHeading.textContent = "Region aliases for matching source values"; card.append(aliasesHeading);
    const aliasesHelp = document.createElement("p"); aliasesHelp.className = "annotation-help"; aliasesHelp.textContent = "Add alternate names or codes, one per line. Matching is exact after case, accent, punctuation, and whitespace normalization. Conflicting aliases are reported as ambiguous, never auto-assigned."; card.append(aliasesHelp);
    const aliasesEditor = document.createElement("div"); aliasesEditor.className = "custom-map-alias-editor";
    const aliasInputs = new Map();
    for (const region of map.regions) {
      const row = document.createElement("label"); row.className = "custom-map-alias-row";
      const label = document.createElement("span"); label.textContent = `${region.name} (${region.id})`;
      const textarea = document.createElement("textarea"); textarea.rows = 2; textarea.setAttribute("aria-label", `Aliases for ${region.name}`); textarea.placeholder = "e.g. North Zone\nN-Zone";
      textarea.value = (details.aliasesByRegion?.[region.id] ?? region.aliases ?? []).join("\n");
      aliasInputs.set(region.id, textarea); row.append(label, textarea); aliasesEditor.append(row);
    }
    card.append(aliasesEditor);
    const actions = document.createElement("div"); actions.className = "custom-geojson-actions";
    const save = document.createElement("button"); save.type = "button"; save.className = "secondary-button"; save.textContent = "Save property changes";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary-button"; remove.textContent = "Remove map";
    const message = document.createElement("span"); message.className = "annotation-help"; message.setAttribute("role", "status");
    save.addEventListener("click", async () => {
      try {
        const previousDetails = getCustomMapDetails(map.id);
        const aliasesByRegion = Object.fromEntries([...aliasInputs].map(([regionId, input]) => [regionId, input.value.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean)]));
        updateCustomMapProperties(map.id, {idProperty: idSelect.value, labelProperty: nameSelect.value, aliasesByRegion});
        await flushCustomMapPersistence();
        let mappingReset = false;
        if (previousDetails.idProperty !== idSelect.value) {
          const current = readGeographyConfiguration();
          const next = validateGeographyConfiguration({version: 1, mappings: current.mappings.filter(mapping => mapping.mapId !== map.id)}, dataset.columns);
          writeGeographyConfiguration(next);
          await flushGeographyPersistence();
          for (const entry of visualizations.values()) if (entry.visualization.type === "map") entry.chart.geographyConfiguration = next;
          mappingReset = true;
        }
        renderCustomMapCatalog(); refreshMapSelectors(map.id); renderGeographyEditor();
        for (const [visualizationId, entry] of visualizations) if (entry.visualization.type === "map" && entry.visualization.query.mapId === map.id) refreshVisualization(visualizationId);
        if (mappingReset) message.textContent = "Properties saved. Region IDs changed, so prior assignments for this map were cleared; remap the source values.";
      } catch (error) { message.textContent = error instanceof Error ? error.message : "Could not update map properties."; }
    });
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Remove “${map.name}” from the custom map catalog? Existing charts using it will be switched to the default map.`)) return;
      removeCustomMap(map.id);
      await flushCustomMapPersistence();
      const current = readGeographyConfiguration();
      const next = validateGeographyConfiguration({version: 1, mappings: current.mappings.filter(mapping => mapping.mapId !== map.id)}, dataset.columns);
      writeGeographyConfiguration(next);
      await flushGeographyPersistence();
      for (const [visualizationId, entry] of visualizations) if (entry.visualization.type === "map" && entry.visualization.query.mapId === map.id) {
        entry.visualization.query.mapId = BUILT_IN_MAPS[0]?.id ?? "north-america-countries";
        entry.chart.visualization = entry.visualization;
        entry.chart.geographyConfiguration = next;
        refreshVisualization(visualizationId);
      }
      renderCustomMapCatalog(); refreshMapSelectors(BUILT_IN_MAPS[0]?.id); renderGeographyEditor();
    });
    actions.append(save, remove, message); card.append(actions); host.append(card);
  }
}

function setupCustomGeoJSONPreview() {
  const fileInput = document.querySelector("#custom-geojson-file");
  const nameInput = document.querySelector("#custom-map-name");
  const status = document.querySelector("#custom-geojson-status");
  const propertyControls = document.querySelector("#custom-geojson-property-controls");
  const idSelect = document.querySelector("#custom-geojson-id-property");
  const labelSelect = document.querySelector("#custom-geojson-label-property");
  const summary = document.querySelector("#custom-geojson-preview-summary");
  const preview = document.querySelector("#custom-geojson-preview");
  const addButton = document.querySelector("#custom-geojson-add-map");
  const addStatus = document.querySelector("#custom-geojson-add-status");
  if (!fileInput || fileInput.dataset.initialized) return;
  fileInput.dataset.initialized = "true";
  let validated = null;
  const clear = () => { preview.replaceChildren(); summary.textContent = ""; propertyControls.hidden = true; validated = null; addButton.disabled = true; addStatus.textContent = ""; };
  const renderPreview = () => {
    if (!validated) return;
    const idProperty = idSelect.value;
    const labelProperty = labelSelect.value;
    const inspection = inspectCustomGeoJSONFeatures(validated.geojson, idProperty, labelProperty);
    const width = 760, height = 390, padding = 18;
    const svg = d3.create("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", `${nameInput.value.trim() || "Custom map"} GeoJSON preview`);
    const projection = d3.geoMercator().fitExtent([[padding, padding], [width-padding, height-padding]], validated.geojson);
    const path = d3.geoPath(projection);
    svg.selectAll("path").data(validated.geojson.features).join("path")
      .attr("class", "custom-geojson-feature").attr("d", path)
      .append("title").text(feature => {
        const id = feature.properties?.[idProperty];
        const label = feature.properties?.[labelProperty];
        return `${label == null ? "(no label)" : String(label)} · ID: ${id == null ? "(missing)" : String(id)}`;
      });
    preview.replaceChildren(svg.node());
    const issues = [];
    if (inspection.missingIds.length) issues.push(`${inspection.missingIds.length} feature(s) missing an ID`);
    if (inspection.duplicateIds.length) issues.push(`${inspection.duplicateIds.length} duplicate ID(s)`);
    if (inspection.labelsMissing) issues.push(`${inspection.labelsMissing} feature(s) missing a label`);
    summary.textContent = `${validated.featureCount} polygon features · ${inspection.uniqueIds} unique IDs${issues.length ? ` · Review: ${issues.join(", ")}` : " · IDs and labels look complete"}.`;
    const validIds = !inspection.missingIds.length && !inspection.duplicateIds.length;
    summary.dataset.valid = String(validIds);
    addButton.disabled = !validIds;
  };
  fileInput.addEventListener("change", async () => {
    clear();
    const file = fileInput.files?.[0];
    if (!file) { status.textContent = "Choose a GeoJSON FeatureCollection to begin."; return; }
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("File exceeds the 10 MB size limit.");
      const result = validateCustomGeoJSON(await file.text());
      validated = result;
      const props = result.propertyNames;
      if (!props.length) throw new Error("No feature properties were found. Add a property that uniquely identifies each region.");
      for (const select of [idSelect, labelSelect]) {
        select.replaceChildren();
        for (const property of props) { const option = document.createElement("option"); option.value = property; option.textContent = `${property} — e.g. ${samplePropertyValues(result.geojson, property)}`; select.append(option); }
      }
      const idCandidate = props.find(p => /(^id$|_id$|code|iso|fips)/i.test(p)) ?? props[0];
      const labelCandidate = props.find(p => /name|label|title/i.test(p)) ?? idCandidate;
      idSelect.value = idCandidate; labelSelect.value = labelCandidate;
      propertyControls.hidden = false;
      if (!nameInput.value.trim()) nameInput.value = file.name.replace(/\.(geo)?json$/i, "").slice(0, 80);
      status.textContent = `GeoJSON validated: ${result.featureCount} polygon features. Select the ID and label properties and inspect the preview below.`;
      renderPreview();
    } catch (error) {
      clear(); status.textContent = error instanceof Error ? error.message : "Could not read this GeoJSON file.";
    }
  });
  idSelect.addEventListener("change", renderPreview);
  labelSelect.addEventListener("change", renderPreview);
  addButton.addEventListener("click", async () => {
    try {
      if (!validated) throw new Error("Validate a GeoJSON file before adding it.");
      const inspection = inspectCustomGeoJSONFeatures(validated.geojson, idSelect.value, labelSelect.value);
      if (inspection.missingIds.length || inspection.duplicateIds.length) throw new Error("Resolve missing or duplicate IDs before adding this map.");
      const duplicate = findDuplicateCustomMap(validated.geojson);
      if (duplicate) throw new Error(`This GeoJSON is already in the catalog as “${duplicate.name}”.`);
      const definition = registerCustomMap({name: nameInput.value, geojson: validated.geojson, idProperty: idSelect.value, labelProperty: labelSelect.value});
      await flushCustomMapPersistence();
      refreshMapSelectors(definition.id);
      renderCustomMapCatalog();
      // Refresh the Maps workspace selector too, preserving the newly registered map.
      renderGeographyEditor();
      const geographyMapSelect = document.querySelector("#geography-map");
      if (geographyMapSelect) { geographyMapSelect.value = definition.id; geographyMapSelect.dispatchEvent(new Event("change", {bubbles: true})); }
      addStatus.textContent = `Added “${definition.name}” (${definition.regions.length} regions) to your saved custom-map catalog.`;
      status.textContent = `Map added: ${definition.name}. It is now available in the Dashboard choropleth selector and Maps workspace.`;
      mapSelect.dispatchEvent(new Event("change", {bubbles: true}));
    } catch (error) {
      addStatus.textContent = error instanceof Error ? error.message : "Could not add this map.";
    }
  });
  nameInput.addEventListener("input", () => { const svg = preview.querySelector("svg"); if (svg) svg.setAttribute("aria-label", `${nameInput.value.trim() || "Custom map"} GeoJSON preview`); });
}

function renderGeographyEditor() {
  const host = document.querySelector("#geography-editor");
  if (!host) return;
  host.replaceChildren();
  if (!hasGeographicColumns()) {
    const empty = document.createElement("p");
    empty.className = "annotation-help";
    empty.textContent = "No geographic columns are annotated yet. Go to Annotate, choose a geographic role for at least one column, and save the metadata to enable this workspace.";
    host.append(empty);
    return;
  }

  let configuration = readGeographyConfiguration();
  const geographicColumns = dataset.columns.filter(column => dataset.columnMetadata[column]?.geographicRole);
  const preferredMapping = configuration.mappings.find(mapping => geographicColumns.includes(mapping.column) && getMapDefinition(mapping.mapId));
  const initialColumn = preferredMapping?.column ?? geographicColumns[0];
  const initialMap = preferredMapping?.mapId ?? BUILT_IN_MAPS[0]?.id;

  const controls = document.createElement("div"); controls.className = "geography-controls";
  const columnLabel = document.createElement("label"); columnLabel.textContent = "Geographic column";
  const columnSelect = document.createElement("select"); columnSelect.id = "geography-column"; columnSelect.setAttribute("aria-label", "Geographic column");
  for (const column of geographicColumns) {
    const option = document.createElement("option"); option.value = column;
    const role = dataset.columnMetadata[column].geographicRole;
    option.textContent = `${column} · ${role.replaceAll("-", " / ")}`;
    columnSelect.append(option);
  }
  columnSelect.value = initialColumn;
  columnLabel.append(columnSelect);

  const mapLabel = document.createElement("label"); mapLabel.textContent = "Map";
  const mapSelect = document.createElement("select"); mapSelect.id = "geography-map"; mapSelect.setAttribute("aria-label", "Map");
  for (const map of getAllMaps()) {
    const option = document.createElement("option"); option.value = map.id; option.textContent = map.name; mapSelect.append(option);
  }
  mapSelect.value = initialMap;
  mapLabel.append(mapSelect);
  controls.append(columnLabel, mapLabel);
  host.append(controls);

  const mapNote = document.createElement("p"); mapNote.className = "annotation-help";
  mapNote.textContent = "Choose the target geography that matches your data: countries, US states, Mexican states, or Canadian provinces and territories. Suggestions use exact normalized names, aliases, postal abbreviations, and ISO subdivision codes. Ambiguous and unmatched values are never assigned automatically; review suggestions before saving.";
  host.append(mapNote);

  const matchingActions = document.createElement("div"); matchingActions.className = "geography-matching-actions";
  const suggest = document.createElement("button"); suggest.type = "button"; suggest.className = "secondary-button"; suggest.textContent = "Suggest exact matches";
  matchingActions.append(suggest); host.append(matchingActions);
  const summary = document.createElement("p"); summary.className = "geography-summary annotation-help"; summary.setAttribute("role", "status"); host.append(summary);
  const report = document.createElement("p"); report.className = "geography-match-report annotation-help"; report.setAttribute("role", "status"); host.append(report);
  const tableWrap = document.createElement("div"); tableWrap.className = "geography-table-wrap"; host.append(tableWrap);
  const status = document.createElement("p"); status.className = "annotation-help"; status.setAttribute("role", "status"); host.append(status);

  let rowControls = [];
  let matchResults = new Map();
  function renderRows() {
    tableWrap.replaceChildren();
    const column = columnSelect.value;
    const map = getMapDefinition(mapSelect.value);
    const mapping = configuration.mappings.find(entry => entry.column === column && entry.mapId === map.id);
    const assigned = new Map((mapping?.values ?? []).map(entry => [JSON.stringify(entry.sourceValue), entry.regionId]));
    const values = distinctColumnValues(column);
    rowControls = [];
    matchResults = new Map();
    const table = document.createElement("table"); table.className = "geography-mapping-table";
    const thead = document.createElement("thead"); const header = document.createElement("tr");
    for (const text of ["Source value", "Map region", "Match status"]) { const th = document.createElement("th"); th.textContent = text; header.append(th); }
    thead.append(header); table.append(thead);
    const tbody = document.createElement("tbody");
    values.forEach(({key, value}, index) => {
      const tr = document.createElement("tr");
      const valueCell = document.createElement("td"); valueCell.textContent = displayGeographicValue(value); valueCell.title = `Source value type: ${value === null ? "null" : typeof value}`;
      const regionCell = document.createElement("td");
      const select = document.createElement("select"); select.setAttribute("aria-label", `Map ${displayGeographicValue(value)} to region`); select.dataset.sourceKey = key;
      const unassigned = document.createElement("option"); unassigned.value = ""; unassigned.textContent = "Unmapped"; select.append(unassigned);
      for (const region of map.regions) { const option = document.createElement("option"); option.value = region.id; option.textContent = region.name; select.append(option); }
      select.value = assigned.get(key) ?? "";
      const statusCell = document.createElement("td"); statusCell.className = "geography-match-status";
      statusCell.textContent = select.value ? "Saved assignment" : "Not checked";
      select.addEventListener("change", () => {
        statusCell.textContent = select.value ? "Assigned · review selection" : (matchResults.get(key)?.status === "ambiguous" ? "Ambiguous" : matchResults.get(key)?.status === "unmatched" ? "Unmatched" : "Unmapped");
        updateSummary();
      });
      regionCell.append(select); tr.append(valueCell, regionCell, statusCell); tbody.append(tr);
      rowControls.push({key, value, select, statusCell});
    });
    if (!values.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 3; td.textContent = "This column has no values to map."; tr.append(td); tbody.append(tr); }
    table.append(tbody); tableWrap.append(table);
    updateSummary();
  }

  function updateSummary() {
    const assignedCount = rowControls.filter(item => item.select.value).length;
    summary.textContent = `${assignedCount} of ${rowControls.length} distinct values mapped · ${rowControls.length - assignedCount} unmapped`;
    if (matchResults.size) {
      const results = [...matchResults.values()];
      const matched = results.filter(result => result.status === "matched" || result.status === "mapped").length;
      const ambiguous = results.filter(result => result.status === "ambiguous").length;
      const unmatched = results.filter(result => result.status === "unmatched").length;
      report.textContent = `Matching report: ${matched} unique exact match${matched === 1 ? "" : "es"} · ${ambiguous} ambiguous · ${unmatched} unmatched`;
    }
  }

  suggest.addEventListener("click", () => {
    const column = columnSelect.value;
    const map = getMapDefinition(mapSelect.value);
    const mapping = configuration.mappings.find(entry => entry.column === column && entry.mapId === map.id);
    const results = suggestGeographicMappings(rowControls.map(item => item.value), mapping, map);
    matchResults = new Map(results.map(result => [JSON.stringify(result.sourceValue), result]));
    for (const item of rowControls) {
      const result = matchResults.get(item.key);
      const alreadyAssigned = Boolean(item.select.value);
      if (!alreadyAssigned && result?.status === "matched") item.select.value = result.regionId;
      if (alreadyAssigned) item.statusCell.textContent = "Existing assignment";
      else if (result?.status === "matched") item.statusCell.textContent = `Suggested · ${result.matchType}`;
      else if (result?.status === "ambiguous") item.statusCell.textContent = `Ambiguous · ${result.candidates.map(candidate => candidate.regionName).join(", ")}`;
      else if (result?.status === "blank") item.statusCell.textContent = "Blank / missing";
      else item.statusCell.textContent = "Unmatched · assign manually";
    }
    const matched = results.filter(result => result.status === "matched").length;
    const ambiguous = results.filter(result => result.status === "ambiguous").length;
    const unmatched = results.filter(result => result.status === "unmatched").length;
    report.textContent = `Suggestions: ${matched} unique exact match${matched === 1 ? "" : "es"} · ${ambiguous} ambiguous · ${unmatched} unmatched. Review assignments and save to persist them.`;
    updateSummary();
  });

  const actions = document.createElement("div"); actions.className = "geography-save-actions";
  const save = document.createElement("button"); save.type = "button"; save.className = "primary-button"; save.textContent = "Save region mappings";
  save.addEventListener("click", async () => {
    try {
      const current = readGeographyConfiguration();
      const column = columnSelect.value;
      const mapId = mapSelect.value;
      const values = rowControls.filter(item => item.select.value).map(item => ({sourceValue: item.value, regionId: item.select.value}));
      const mappings = current.mappings.filter(mapping => !(mapping.mapId === mapId && mapping.column === column));
      mappings.push({mapId, column, values});
      const next = validateGeographyConfiguration({version: 1, mappings}, dataset.columns);
      writeGeographyConfiguration(next);
      await flushGeographyPersistence();
      configuration = next;
      refreshMapSelectors(document.querySelector("#map-definition")?.value);
      renderCustomMapCatalog();
      for (const [visualizationId, entry] of visualizations) {
        if (entry.visualization.type === "map") {
          entry.chart.geographyConfiguration = next;
          refreshVisualization(visualizationId);
        }
      }
      status.className = "annotation-help";
      status.textContent = `Saved ${values.length} region assignment${values.length === 1 ? "" : "s"} for ${column}. These settings will be included in data project exports.`;
    } catch (error) {
      status.className = "annotation-help error";
      status.textContent = `Could not save region mappings: ${error.message}`;
    }
  });
  actions.append(save); host.append(actions);
  columnSelect.addEventListener("change", renderRows);
  mapSelect.addEventListener("change", renderRows);
  renderRows();
}

function renderFilterPanel(filters) {
  const list = document.querySelector("#active-filters");
  const count = document.querySelector("#filter-count");
  const clearButton = document.querySelector("#clear-active-filters");
  const rowCount = document.querySelector("#filtered-row-count");
  if (!list || !count || !clearButton) return;

  count.textContent = String(filters.length);
  if (rowCount) rowCount.textContent = `${dataEngine.filteredRows().length} / ${dataset.rows.length} rows`;
  clearButton.hidden = filters.length === 0;

  // Always rebuild the active-filter list from the FilterStore snapshot.
  // Chart/table filters use the same store as range filters, so they should be
  // represented here as chips regardless of which control created them.
  list.replaceChildren();

  if (!filters.length) {
    const empty = document.createElement("span");
    empty.className = "filter-empty";
    empty.textContent = "No filters applied";
    list.appendChild(empty);
  } else {
    for (const [index, filter] of filters.entries()) {
      const chip = document.createElement("span");
      chip.className = "filter-chip";

      const label = document.createElement("span");
      label.className = "filter-chip-label";
      label.textContent = `${filter.column}:`;

      const value = document.createElement("span");
      value.className = "filter-chip-value";
      value.textContent = formatFilterValue(filter);

      const remove = document.createElement("button");
      remove.className = "remove-filter-button";
      remove.type = "button";
      remove.dataset.removeFilter = String(index);
      remove.setAttribute("aria-label", `Remove filter for ${filter.column}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        filterStore.removeFilter(filter.column);
      });

      chip.append(label, value, remove);
      list.appendChild(chip);
    }
  }

}

function formatFilterValue(filter) {
  if (filter.operator === "range" || filter.operator === "dateRange") {
    if (!Array.isArray(filter.value)) return String(filter.value ?? "");

    if (filter.operator === "dateRange") {
      const [start, end] = filter.value.map(Number);
      return `${formatFilterDate(start)} – ${formatFilterDate(end)}`;
    }

    return `${formatFilterNumber(filter.value[0])} – ${formatFilterNumber(filter.value[1])}`;
  }

  if (filter.operator === "in") {
    return Array.isArray(filter.value)
      ? filter.value.map(value => String(value)).join(", ")
      : String(filter.value ?? "");
  }

  return String(filter.value ?? "");
}

function formatFilterNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number) : String(value ?? "");
}

function formatFilterDate(value) {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date)
    : String(value ?? "");
}

function toggleCollapsiblePanel(toggleSelector, bodySelector, chevronSelector) {
  const toggle = document.querySelector(toggleSelector);
  const body = document.querySelector(bodySelector);
  const chevron = document.querySelector(chevronSelector);
  if (!toggle || !body || !chevron) return;

  const expanded = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!expanded));
  body.hidden = expanded;
  chevron.textContent = expanded ? "▼" : "▲";
}

const rangeHost = document.querySelector("#numeric-range-filters");
if (rangeHost) {
  rangeWidget = new RangeFilterWidget(rangeHost, dataset, filterStore);
  rangeHost._rangeWidget = rangeWidget;
  // Initialize the visual state immediately. With no active filters, each
  // range starts at its full dataset extent. All later changes come through
  // the FilterStore subscription above.
  rangeWidget.update(filterStore.getFilters());
}

function populateForm() {
  const dimensionSelect = document.querySelector("#chart-dimension");
  const measureSelect = document.querySelector("#chart-measure");
  const scatterXSelect = document.querySelector("#scatter-x");
  const scatterYSelect = document.querySelector("#scatter-y");
  const scatterColorSelect = document.querySelector("#scatter-color");
  const scatterSizeSelect = document.querySelector("#scatter-size");
  const tableColumnsSelect = document.querySelector("#table-columns");
  const pieDimensionSelect = document.querySelector("#pie-dimension");
  const pieMeasureSelect = document.querySelector("#pie-measure");
  const histogramColumnSelect = document.querySelector("#histogram-column");
  const densityColumnSelect = document.querySelector("#density-column");
  const stackedDimensionSelect = document.querySelector("#stacked-dimension");
  const stackedPrimaryDimensionSelect = document.querySelector("#stacked-primary-dimension");
  const stackedMeasureSelect = document.querySelector("#stacked-measure");
  const stackedAggregationSelect = document.querySelector("#stacked-aggregation");
  const boxPlotDimensionSelect = document.querySelector("#box-plot-dimension");
  const boxPlotMeasureSelect = document.querySelector("#box-plot-measure");
  const violinDimensionSelect = document.querySelector("#violin-plot-dimension");
  const violinMeasureSelect = document.querySelector("#violin-plot-measure");
  const heatmapXSelect = document.querySelector("#heatmap-x-dimension");
  const heatmapYSelect = document.querySelector("#heatmap-y-dimension");
  const heatmapMeasureSelect = document.querySelector("#heatmap-measure");
  const treemapDimensionSelect = document.querySelector("#treemap-dimension");
  const treemapMeasureSelect = document.querySelector("#treemap-measure");
  const comboDimensionSelect = document.querySelector("#combo-dimension");
  const comboMeasure1Select = document.querySelector("#combo-measure-1");
  const comboMeasure2Select = document.querySelector("#combo-measure-2");
  const waterfallDimensionSelect = document.querySelector("#waterfall-dimension");
  const waterfallMeasureSelect = document.querySelector("#waterfall-measure");
  const funnelDimensionSelect = document.querySelector("#funnel-dimension");
  const funnelMeasureSelect = document.querySelector("#funnel-measure");
  const funnelAggregationSelect = document.querySelector("#funnel-aggregation");
  const mapColumnSelect = document.querySelector("#map-geographic-column");
  const mapDefinitionSelect = document.querySelector("#map-definition");
  const mapMeasureSelect = document.querySelector("#map-measure");
  const mapAggregationSelect = document.querySelector("#map-aggregation");

  dimensionSelect.innerHTML = dimensionColumns
    .map(column => columnOption(column))
    .join("");

  measureSelect.innerHTML = numericColumns
    .map(column => columnOption(column))
    .join("");

  pieDimensionSelect.innerHTML = dimensionColumns
    .map(column => columnOption(column))
    .join("");

  const numericOptions = numericColumns
    .map(column => columnOption(column))
    .join("");
  pieMeasureSelect.innerHTML = numericOptions;
  pieDimensionSelect.value = "month";
  histogramColumnSelect.innerHTML = numericOptions;
  densityColumnSelect.innerHTML = numericOptions;
  densityColumnSelect.value = "revenue";
  stackedPrimaryDimensionSelect.innerHTML = dimensionColumns
    .map(column => columnOption(column))
    .join("");
  stackedDimensionSelect.innerHTML = dimensionColumns
    .map(column => columnOption(column))
    .join("");
  stackedMeasureSelect.innerHTML = numericColumns
    .map(column => columnOption(column))
    .join("");
  stackedPrimaryDimensionSelect.value = "month";
  stackedDimensionSelect.value = "country";
  stackedMeasureSelect.value = "revenue";
  stackedAggregationSelect.value = "sum";
  boxPlotDimensionSelect.innerHTML = dimensionColumns
    .map(column => columnOption(column))
    .join("");
  boxPlotMeasureSelect.innerHTML = numericColumns
    .map(column => columnOption(column))
    .join("");
  violinDimensionSelect.innerHTML = dimensionColumns.map(column => columnOption(column)).join("");
  violinMeasureSelect.innerHTML = numericColumns.map(column => columnOption(column)).join("");
  const dimensionOptions = dimensionColumns
    .map(column => columnOption(column))
    .join("");
  heatmapXSelect.innerHTML = dimensionOptions;
  heatmapYSelect.innerHTML = dimensionOptions;
  heatmapMeasureSelect.innerHTML = numericOptions;
  boxPlotDimensionSelect.value = "month";
  boxPlotMeasureSelect.value = "revenue";
  violinDimensionSelect.value = "month";
  violinMeasureSelect.value = "revenue";
  heatmapXSelect.value = "month";
  heatmapYSelect.value = "country";
  heatmapMeasureSelect.value = "revenue";
  treemapDimensionSelect.innerHTML = dimensionOptions;
  treemapMeasureSelect.innerHTML = numericOptions;
  treemapDimensionSelect.value = "country";
  treemapMeasureSelect.value = "revenue";
  comboDimensionSelect.innerHTML = dimensionOptions;
  comboMeasure1Select.innerHTML = numericOptions;
  comboMeasure2Select.innerHTML = numericOptions;
  comboDimensionSelect.value = "month";
  comboMeasure1Select.value = "revenue";
  comboMeasure2Select.value = "profit";
  waterfallDimensionSelect.innerHTML = dimensionOptions;
  waterfallMeasureSelect.innerHTML = numericOptions;
  waterfallDimensionSelect.value = "month";
  waterfallMeasureSelect.value = "profit";
  funnelDimensionSelect.innerHTML = dimensionOptions;
  funnelMeasureSelect.innerHTML = numericOptions;
  funnelDimensionSelect.value = "country";
  funnelMeasureSelect.value = "revenue";
  funnelAggregationSelect.value = "sum";
  const geographicColumns = dataset.columns.filter(column => dataset.columnMetadata?.[column]?.geographicRole);
  mapColumnSelect.innerHTML = geographicColumns.map(column => columnOption(column)).join("");
  mapColumnSelect.value = geographicColumns.includes("country") ? "country" : (geographicColumns[0] ?? "");
  refreshMapSelectors();
  mapDefinitionSelect.value = BUILT_IN_MAPS[0]?.id ?? "";
  mapMeasureSelect.innerHTML = numericOptions;
  mapMeasureSelect.value = numericColumns.includes("revenue") ? "revenue" : (numericColumns[0] ?? "");
  mapAggregationSelect.value = "sum";
  scatterXSelect.innerHTML = numericOptions;
  scatterYSelect.innerHTML = numericOptions;
  const colorOptions = dataset.columns
    .map(column => columnOption(column))
    .join("");
  scatterColorSelect.innerHTML = `<option value="">None</option>${colorOptions}`;
  scatterSizeSelect.innerHTML = `<option value="">None</option>${numericOptions}`;
  histogramColumnSelect.value = "revenue";
  scatterXSelect.value = "units";
  scatterYSelect.value = "revenue";
  tableColumnsSelect.innerHTML = dataset.columns
    .map(column => columnOption(column))
    .join("");
  for (const option of tableColumnsSelect.options) option.selected = true;
}

function updateChartTypeFields() {
  const type = document.querySelector("#chart-type").value;
  const isScatter = type === "scatter";
  const isTable = type === "table";
  const isPie = type === "pie";
  const isHistogram = type === "histogram";
  const isDensity = type === "density";
  const isStackedBar = type === "stackedBar";
  const isBoxPlot = type === "boxPlot";
  const isViolinPlot = type === "violinPlot";
  const isHeatmap = type === "heatmap";
  const isTreemap = type === "treemap";
  const isCombo = type === "combo";
  const isWaterfall = type === "waterfall";
  const isFunnel = type === "funnel";
  const isRadar = type === "radar";
  const isMap = type === "map";
  document.querySelector("#standard-chart-fields").hidden = isScatter || isTable || isPie || isHistogram || isDensity || isStackedBar || isBoxPlot || isViolinPlot || isHeatmap || isTreemap || isCombo || isWaterfall || isFunnel || isMap;
  document.querySelector("#pie-chart-fields").hidden = !isPie;
  document.querySelector("#scatter-chart-fields").hidden = !isScatter;
  document.querySelector("#table-chart-fields").hidden = !isTable;
  document.querySelector("#histogram-chart-fields").hidden = !isHistogram;
  document.querySelector("#density-chart-fields").hidden = !isDensity;
  document.querySelector("#stacked-bar-chart-fields").hidden = !isStackedBar;
  document.querySelector("#box-plot-chart-fields").hidden = !isBoxPlot;
  document.querySelector("#violin-plot-chart-fields").hidden = !isViolinPlot;
  document.querySelector("#heatmap-chart-fields").hidden = !isHeatmap;
  document.querySelector("#treemap-chart-fields").hidden = !isTreemap;
  document.querySelector("#combo-chart-fields").hidden = !isCombo;
  document.querySelector("#waterfall-chart-fields").hidden = !isWaterfall;
  document.querySelector("#funnel-chart-fields").hidden = !isFunnel;
  document.querySelector("#map-chart-fields").hidden = !isMap;
}

function humanizeColumn(column) {
  if (!column) return "";
  return String(column)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, match => match.toUpperCase());
}

function defaultChartTitle(type, query) {
  if (type === "map") return `${humanizeColumn(query.measureColumn ?? query.measures?.[0]?.column)} by ${humanizeColumn(query.geographicColumn)} — Map`;
  if (type === "histogram") {
    return `${humanizeColumn(query.histogramColumn)}'s Histogram`;
  }
  if (type === "density") return `${humanizeColumn(query.densityColumn)} Density (KDE)`;

  if (type === "pie") {
    const dimension = humanizeColumn(query.dimensions?.[0]);
    const measure = humanizeColumn(query.measures?.[0]?.column);
    return measure && dimension ? `${measure} by ${dimension}` : "Pie Chart";
  }

  if (type === "scatter") {
    const x = humanizeColumn(query.xColumn);
    const y = humanizeColumn(query.yColumn);
    const size = humanizeColumn(query.sizeColumn);
    if (!x || !y) return "Scatter Plot";
    return size ? `${x} vs. ${y} (size = ${size})` : `${x} vs. ${y}`;
  }

  if (type === "stackedBar") {
    const x = humanizeColumn(query.dimensions?.[0]);
    const stack = humanizeColumn(query.dimensions?.[1]);
    const measure = humanizeColumn(query.measures?.[0]?.column);
    if (x && measure && stack) return `${x} vs. ${measure} by ${stack}`;
    if (x && measure) return `${x} vs. ${measure}`;
    return "Stacked Bar Chart";
  }

  if (type === "violinPlot") {
    const dimension = humanizeColumn(query.violinPlotDimension);
    const measure = humanizeColumn(query.violinPlotMeasure);
    return dimension && measure ? `${measure} Distribution by ${dimension}` : "Violin Plot";
  }

  if (type === "boxPlot") {
    const dimension = humanizeColumn(query.boxPlotDimension);
    const measure = humanizeColumn(query.boxPlotMeasure);
    return dimension && measure ? `${dimension} vs. ${measure}` : "Box Plot";
  }

  if (type === "treemap") {
    const dimension = humanizeColumn(query.dimensions?.[0]);
    const measure = humanizeColumn(query.measures?.[0]?.column);
    return measure && dimension ? `${measure} by ${dimension}` : "Treemap";
  }

  if (type === "combo") {
    const dimension = humanizeColumn(query.dimensions?.[0]);
    const measures = (query.series ?? []).map(series => humanizeColumn(series.measure)).filter(Boolean);
    return dimension && measures.length ? `${dimension} vs. ${measures.join(", ")}` : "Combo Chart";
  }

  if (type === "waterfall") {
    const dimension = humanizeColumn(query.dimensions?.[0]);
    const measure = humanizeColumn(query.measures?.[0]?.column);
    return dimension && measure ? `${measure} Waterfall by ${dimension}` : "Waterfall Chart";
  }

  if (type === "radar") {
    const dimension = humanizeColumn(query.dimensions?.[0]);
    const measures = (query.measures ?? []).map(measure => humanizeColumn(measure.column)).filter(Boolean);
    return dimension && measures.length ? `${measures.join(", ")} by ${dimension} (Radar)` : "Radar Chart";
  }

  if (type === "funnel") {
    const dimension = humanizeColumn(query.dimensions?.[0]);
    const measure = humanizeColumn(query.measures?.[0]?.column);
    return dimension && measure ? `${measure} by ${dimension}` : "Funnel";
  }

  if (type === "heatmap") {
    const x = humanizeColumn(query.dimensions?.[0]);
    const y = humanizeColumn(query.dimensions?.[1]);
    const measure = humanizeColumn(query.measures?.[0]?.column);
    return measure && x && y ? `${measure} by ${x} and ${y}` : "Heatmap";
  }

  if (type === "table") {
    return "Data Table";
  }

  const x = humanizeColumn(query.dimensions?.[0]);
  const measures = (query.measures ?? []).map(measure => humanizeColumn(measure.column)).filter(Boolean);
  const y = measures.join(", ");
  return x && y ? `${x} vs. ${y}` : type === "area" ? "Area Chart" : type === "line" ? "Line Chart" : "Bar Chart";
}

function isAutoTitle(title) {
  return !title.trim() || title.trim() === "New chart";
}

function openAddDialog() {
  editingId = null;
  document.querySelector("#chart-dialog-title").textContent = "Add chart";
  document.querySelector("#chart-submit").textContent = "Add chart";
  document.querySelector("#chart-type").value = "bar";
  updateChartTypeFields();

  const form = document.querySelector("#chart-form");
  form.reset();

  document.querySelector("#chart-title").value = "";
  document.querySelector("#chart-title").placeholder = "Leave blank for an automatic name";
  document.querySelector("#chart-dimension").value = "month";
  document.querySelector("#pie-dimension").value = "month";
  document.querySelector("#histogram-column").value = "revenue";
  document.querySelector("#density-column").value = "revenue";
  document.querySelector("#histogram-bins").value = "10";
  document.querySelector("#stacked-primary-dimension").value = "month";
  document.querySelector("#stacked-dimension").value = "country";
  document.querySelector("#stacked-measure").value = "revenue";
  document.querySelector("#stacked-aggregation").value = "sum";
  document.querySelector("#box-plot-dimension").value = "month";
  document.querySelector("#box-plot-measure").value = "revenue";
  document.querySelector("#violin-plot-dimension").value = "month";
  document.querySelector("#violin-plot-measure").value = "revenue";
  document.querySelector("#heatmap-x-dimension").value = "month";
  document.querySelector("#heatmap-y-dimension").value = "country";
  document.querySelector("#heatmap-measure").value = "revenue";
  document.querySelector("#heatmap-aggregation").value = "sum";
  document.querySelector("#combo-dimension").value = "month";
  document.querySelector("#combo-measure-1").value = "revenue";
  document.querySelector("#combo-measure-2").value = "profit";
  document.querySelector("#combo-style-1").value = "bar";
  document.querySelector("#combo-style-2").value = "line";
  document.querySelector("#combo-aggregation").value = "sum";
  document.querySelector("#waterfall-dimension").value = "month";
  document.querySelector("#waterfall-measure").value = "profit";
  document.querySelector("#waterfall-aggregation").value = "sum";
  document.querySelector("#funnel-dimension").value = "country";
  document.querySelector("#funnel-measure").value = "revenue";
  document.querySelector("#funnel-aggregation").value = "sum";
  const geographicColumns = dataset.columns.filter(column => dataset.columnMetadata?.[column]?.geographicRole);
  document.querySelector("#map-geographic-column").value = geographicColumns.includes("country") ? "country" : (geographicColumns[0] ?? "");
  document.querySelector("#map-definition").value = BUILT_IN_MAPS[0]?.id ?? "";
  document.querySelector("#map-measure").value = numericColumns.includes("revenue") ? "revenue" : (numericColumns[0] ?? "");
  document.querySelector("#map-aggregation").value = "sum";

  const measureSelect = document.querySelector("#chart-measure");
  for (const option of measureSelect.options) {
    option.selected = ["revenue", "cost", "profit"].includes(option.value);
  }

  document.querySelector("#chart-aggregation").value = "sum";

  for (const option of document.querySelector("#table-columns").options) option.selected = true;

  document.querySelector("#chart-dialog").showModal();
}

function openEditDialog(id) {
  const entry = visualizations.get(id);
  if (!entry) return;

  editingId = id;
  const visualization = entry.visualization;
  const dimension = visualization.query.dimensions?.[0] ?? "";
  const measures = visualization.query.measures ?? [];

  document.querySelector("#chart-dialog-title").textContent = "Edit chart";
  document.querySelector("#chart-submit").textContent = "Save changes";
  document.querySelector("#chart-title").value = visualization.title ?? "";
  document.querySelector("#chart-title").placeholder = "Leave blank for an automatic name";
  document.querySelector("#chart-type").value = visualization.type ?? "bar";
  updateChartTypeFields();
  document.querySelector("#chart-dimension").value = dimension;
  document.querySelector("#pie-dimension").value = dimension;
  document.querySelector("#pie-measure").value = measures[0]?.column ?? "";
  document.querySelector("#pie-aggregation").value = measures[0]?.aggregation ?? "sum";
  document.querySelector("#histogram-column").value = visualization.query.histogramColumn ?? "revenue";
  document.querySelector("#density-column").value = visualization.query.densityColumn ?? "revenue";
  document.querySelector("#histogram-bins").value = String(visualization.query.bins ?? 10);
  document.querySelector("#stacked-primary-dimension").value = dimension;
  document.querySelector("#stacked-dimension").value = visualization.query.dimensions?.[1] ?? "country";
  document.querySelector("#stacked-measure").value = measures[0]?.column ?? "revenue";
  document.querySelector("#stacked-aggregation").value = measures[0]?.aggregation ?? "sum";
  document.querySelector("#box-plot-dimension").value = visualization.query.boxPlotDimension ?? "month";
  document.querySelector("#box-plot-measure").value = visualization.query.boxPlotMeasure ?? "revenue";
  document.querySelector("#violin-plot-dimension").value = visualization.query.violinPlotDimension ?? "month";
  document.querySelector("#violin-plot-measure").value = visualization.query.violinPlotMeasure ?? "revenue";
  document.querySelector("#heatmap-x-dimension").value = visualization.query.dimensions?.[0] ?? "month";
  document.querySelector("#heatmap-y-dimension").value = visualization.query.dimensions?.[1] ?? "country";
  document.querySelector("#heatmap-measure").value = measures[0]?.column ?? "revenue";
  document.querySelector("#heatmap-aggregation").value = measures[0]?.aggregation ?? "sum";
  document.querySelector("#treemap-dimension").value = visualization.query.dimensions?.[0] ?? "country";
  document.querySelector("#treemap-measure").value = measures[0]?.column ?? "revenue";
  document.querySelector("#treemap-aggregation").value = measures[0]?.aggregation ?? "sum";
  document.querySelector("#combo-dimension").value = visualization.query.dimensions?.[0] ?? "month";
  document.querySelector("#combo-measure-1").value = visualization.query.series?.[0]?.measure ?? "revenue";
  document.querySelector("#combo-measure-2").value = visualization.query.series?.[1]?.measure ?? "profit";
  document.querySelector("#combo-style-1").value = visualization.query.series?.[0]?.style ?? "bar";
  document.querySelector("#combo-style-2").value = visualization.query.series?.[1]?.style ?? "line";
  document.querySelector("#combo-aggregation").value = visualization.query.aggregation ?? "sum";
  document.querySelector("#waterfall-dimension").value = visualization.query.dimensions?.[0] ?? "month";
  document.querySelector("#waterfall-measure").value = measures[0]?.column ?? "profit";
  document.querySelector("#waterfall-aggregation").value = measures[0]?.aggregation ?? "sum";
  document.querySelector("#funnel-dimension").value = visualization.query.dimensions?.[0] ?? "country";
  document.querySelector("#funnel-measure").value = measures[0]?.column ?? "revenue";
  document.querySelector("#funnel-aggregation").value = measures[0]?.aggregation ?? "sum";
  document.querySelector("#map-geographic-column").value = visualization.query.geographicColumn ?? "";
  document.querySelector("#map-definition").value = visualization.query.mapId ?? BUILT_IN_MAPS[0]?.id ?? "";
  document.querySelector("#map-measure").value = measures[0]?.column ?? "";
  document.querySelector("#map-aggregation").value = measures[0]?.aggregation ?? "sum";

  document.querySelector("#scatter-x").value = visualization.query.xColumn ?? "units";
  document.querySelector("#scatter-y").value = visualization.query.yColumn ?? "revenue";
  document.querySelector("#scatter-color").value = visualization.query.colorColumn ?? "";
  document.querySelector("#scatter-size").value = visualization.query.sizeColumn ?? "";

  const tableColumns = new Set(visualization.query.columns ?? dataset.columns);
  for (const option of document.querySelector("#table-columns").options) {
    option.selected = tableColumns.has(option.value);
  }

  const measureSelect = document.querySelector("#chart-measure");
  const selectedColumns = new Set(measures.map(measure => measure.column));
  for (const option of measureSelect.options) {
    option.selected = selectedColumns.has(option.value);
  }

  // The current editor uses one aggregation for all measures.
  document.querySelector("#chart-aggregation").value = measures[0]?.aggregation ?? "sum";
  document.querySelector("#pie-donut").checked = Boolean(visualization.query.donut);

  document.querySelector("#chart-dialog").showModal();
}

function closeChartDialog() {
  editingId = null;
  document.querySelector("#chart-dialog").close();
}

function handleChartSubmit(event) {
  event.preventDefault();

  const requestedTitle = document.querySelector("#chart-title").value.trim();
  const type = document.querySelector("#chart-type").value;
  const isScatter = type === "scatter";
  const isPie = type === "pie";
  const isHistogram = type === "histogram";
  const isDensity = type === "density";
  const isStackedBar = type === "stackedBar";
  const isBoxPlot = type === "boxPlot";
  const isViolinPlot = type === "violinPlot";
  const isHeatmap = type === "heatmap";
  const isTreemap = type === "treemap";
  const isCombo = type === "combo";
  const isWaterfall = type === "waterfall";
  const isFunnel = type === "funnel";
  const isRadar = type === "radar";
  const isMap = type === "map";
  const dimension = document.querySelector("#chart-dimension").value;
  const pieDimension = document.querySelector("#pie-dimension").value;
  const aggregation = document.querySelector("#chart-aggregation").value;
  const pieMeasure = document.querySelector("#pie-measure").value;
  const pieAggregation = document.querySelector("#pie-aggregation").value;
  const histogramColumn = document.querySelector("#histogram-column").value;
  const densityColumn = document.querySelector("#density-column").value;
  const histogramBins = Math.max(2, Math.min(100, Number(document.querySelector("#histogram-bins").value) || 10));
  const stackedPrimaryDimension = document.querySelector("#stacked-primary-dimension").value;
  const stackedDimension = document.querySelector("#stacked-dimension").value;
  const stackedMeasure = document.querySelector("#stacked-measure").value;
  const stackedAggregation = document.querySelector("#stacked-aggregation").value;
  const boxPlotDimension = document.querySelector("#box-plot-dimension").value;
  const boxPlotMeasure = document.querySelector("#box-plot-measure").value;
  const violinPlotDimension = document.querySelector("#violin-plot-dimension").value;
  const violinPlotMeasure = document.querySelector("#violin-plot-measure").value;
  const heatmapX = document.querySelector("#heatmap-x-dimension").value;
  const heatmapY = document.querySelector("#heatmap-y-dimension").value;
  const heatmapMeasure = document.querySelector("#heatmap-measure").value;
  const heatmapAggregation = document.querySelector("#heatmap-aggregation").value;
  const treemapDimension = document.querySelector("#treemap-dimension").value;
  const treemapMeasure = document.querySelector("#treemap-measure").value;
  const treemapAggregation = document.querySelector("#treemap-aggregation").value;
  const comboDimension = document.querySelector("#combo-dimension").value;
  const comboMeasure1 = document.querySelector("#combo-measure-1").value;
  const comboMeasure2 = document.querySelector("#combo-measure-2").value;
  const comboStyle1 = document.querySelector("#combo-style-1").value;
  const comboStyle2 = document.querySelector("#combo-style-2").value;
  const comboAggregation = document.querySelector("#combo-aggregation").value;
  const waterfallDimension = document.querySelector("#waterfall-dimension").value;
  const waterfallMeasure = document.querySelector("#waterfall-measure").value;
  const waterfallAggregation = document.querySelector("#waterfall-aggregation").value;
  const funnelDimension = document.querySelector("#funnel-dimension").value;
  const funnelMeasure = document.querySelector("#funnel-measure").value;
  const funnelAggregation = document.querySelector("#funnel-aggregation").value;
  const mapGeographicColumn = document.querySelector("#map-geographic-column").value;
  const mapId = document.querySelector("#map-definition").value;
  const mapMeasure = document.querySelector("#map-measure").value;
  const mapAggregation = document.querySelector("#map-aggregation").value;
  const selectedColumns = [...document.querySelector("#chart-measure").selectedOptions]
    .map(option => option.value)
    .filter(Boolean);
  const xColumn = document.querySelector("#scatter-x").value;
  const yColumn = document.querySelector("#scatter-y").value;
  const colorColumn = document.querySelector("#scatter-color").value;
  const sizeColumn = document.querySelector("#scatter-size").value;
  const donut = document.querySelector("#pie-donut").checked;
  const tableColumns = [...document.querySelector("#table-columns").selectedOptions]
    .map(option => option.value)
    .filter(Boolean);

  const query = isMap
    ? {geographicColumn: mapGeographicColumn, mapId, measureColumn: mapMeasure, aggregation: mapAggregation, columns: [mapGeographicColumn, mapMeasure]}
    : isHistogram
    ? {histogramColumn, bins: histogramBins}
    : isDensity
      ? {densityColumn, columns: [densityColumn]}
    : isBoxPlot
      ? {boxPlotDimension, boxPlotMeasure}
    : isViolinPlot
      ? {violinPlotDimension, violinPlotMeasure, columns: [violinPlotDimension, violinPlotMeasure]}
    : isHeatmap
      ? {dimensions: [heatmapX, heatmapY], measures: [{column: heatmapMeasure, aggregation: heatmapAggregation}]}
    : isTreemap
      ? {dimensions: [treemapDimension], measures: [{column: treemapMeasure, aggregation: treemapAggregation}]}
    : isCombo
      ? {dimensions: [comboDimension], aggregation: comboAggregation, series: [
          {measure: comboMeasure1, style: comboStyle1},
          {measure: comboMeasure2, style: comboStyle2}
        ]}
    : isWaterfall
      ? {dimensions: [waterfallDimension], measures: [{column: waterfallMeasure, aggregation: waterfallAggregation}]}
    : isFunnel
      ? {dimensions: [funnelDimension], measures: [{column: funnelMeasure, aggregation: funnelAggregation}]}
    : isStackedBar
      ? {dimensions: [stackedPrimaryDimension, stackedDimension], measures: [{column: stackedMeasure, aggregation: stackedAggregation}]}
    : isScatter
    ? {xColumn, yColumn, ...(colorColumn ? {colorColumn, colorType: numericColumns.includes(colorColumn) ? "numeric" : "categorical"} : {}), ...(sizeColumn ? {sizeColumn} : {})}
    : type === "table"
      ? {columns: tableColumns}
      : isPie
        ? {dimensions: [pieDimension], measures: [{column: pieMeasure, aggregation: pieAggregation}], donut}
        : {dimensions: [dimension], measures: selectedColumns.map(column => ({column, aggregation}))};

  const configurationError = validateVisualizationConfig(type, query, dataset);
  if (configurationError) {
    window.alert(`Could not save chart: ${configurationError}`);
    return;
  }

  const generatedTitle = defaultChartTitle(type, query);
  const title = requestedTitle || generatedTitle;
  const titleCustom = Boolean(requestedTitle);

  if (editingId) {
    const entry = visualizations.get(editingId);
    if (!entry) return;

    const titleState = titleAfterDialogEdit({
      currentTitle: entry.visualization.title ?? "",
      currentTitleCustom: entry.visualization.titleCustom,
      requestedTitle,
      generatedTitle
    });
    const nextVisualization = {...entry.visualization, ...titleState, type, query};

    const widget = dashboard.el
      .querySelector(`[data-widget-id="dashboard-widget-${editingId}"]`)
      ?.closest(".grid-stack-item");
    const content = widget?.querySelector(".chart-content");
    if (!content) {
      window.alert("Could not update this chart because its dashboard widget is missing.");
      return;
    }

    try {
      // Treat every edit as a transaction, even when the chart type stays the
      // same. A renderer can fail while updating data, so never commit the new
      // query/title until the replacement has rendered successfully.
      replaceVisualizationTransaction({
        previousEntry: entry,
        nextVisualization,
        content,
        createRenderer: (container, visualization) => {
          const ChartClass = getChartClass(visualization.type);
          return new ChartClass(container, visualization, {
            onFilter: filter => queueFilterToggle(filter),
            colorStore,
            geographyConfiguration: readGeographyConfiguration()
          });
        },
        render: (chart, visualization) => chart.renderData(dataEngine.query(
      visualization.type === "table" ? {...visualization.query, rawRows: true} : visualization.query
    )),
        commit: ({visualization, chart}) => {
          visualizations.set(editingId, {visualization, chart});
          updateChartHeader(editingId);
          persistDashboardState();
        },
        removeUnrecoverable: () => {
          visualizations.delete(editingId);
          if (widget) dashboard.removeWidget(widget);
          persistDashboardState();
        }
      });
    } catch (error) {
      console.error("Failed to replace chart renderer:", error);
      window.alert(error.recovered
        ? "Could not apply the chart changes. The previous chart has been restored."
        : "Could not apply the chart changes, and the previous chart could not be restored. The unusable chart was removed.");
      if (!error.recovered) closeChartDialog();
      return;
    }

    closeChartDialog();
    return;
  }

  try {
    renderVisualization({
      id: `chart-${++nextId}`,
      type,
      title,
      titleCustom,
      query,
      layout: {w: 6, h: 5}
    });
  } catch (error) {
    console.error("Failed to render new chart:", error);
    window.alert("The chart could not be created and has been cleaned up. Check the browser console for details.");
  } finally {
    // Rendering a chart can trigger D3/layout code that may throw after the
    // GridStack widget has already been created. Always close the modal once
    // the add operation has been attempted, otherwise the user can click Add
    // repeatedly and create duplicate charts without realizing it.
    closeChartDialog();
  }
}

function renderVisualization(v) {
  const widgetId = `dashboard-widget-${v.id}`;

  const result = createVisualizationTransaction({
    visualization: v,
    createWidget: () => dashboard.addWidget({
      ...(v.layout.x != null ? {x: v.layout.x} : {}),
      ...(v.layout.y != null ? {y: v.layout.y} : {}),
      w: v.layout.w,
      h: v.layout.h,
      content: `<div class="chart-card" data-widget-id="${widgetId}"><div class="chart-header"><div class="chart-title-row"><h2 class="chart-display-title">${esc(v.title)}</h2><div class="chart-header-actions"><button class="edit-chart-button" type="button" data-edit-chart="${esc(v.id)}" aria-label="Edit chart">Edit</button><button class="delete-chart-button" type="button" data-delete-chart="${esc(v.id)}" aria-label="Remove chart">Remove</button></div></div>${renderInlineHeader(v)}</div><div class="chart-content"></div></div>`
    }),
    getContent: widget => {
      const content = widget.querySelector(".chart-content");
      if (!content) return null;
      widget.querySelector("[data-edit-chart]")?.addEventListener("click", () => openEditDialog(v.id));
      widget.querySelector("[data-delete-chart]")?.addEventListener("click", () => removeVisualization(v.id));
      bindInlineControls(widget, v.id);
      return content;
    },
    createRenderer: (content, visualization) => {
      const ChartClass = getChartClass(visualization.type);
      return new ChartClass(content, visualization, {
        onFilter: filter => queueFilterToggle(filter),
        colorStore,
        geographyConfiguration: readGeographyConfiguration()
      });
    },
    render: (chart, visualization) => chart.renderData(dataEngine.query(
      visualization.type === "table" ? {...visualization.query, rawRows: true} : visualization.query
    )),
    commit: ({visualization, chart}) => visualizations.set(visualization.id, {visualization, chart}),
    rollbackWidget: widget => {
      const gridWidget = widget.matches?.(".grid-stack-item")
        ? widget
        : widget.closest?.(".grid-stack-item");
      if (gridWidget) dashboard.removeWidget(gridWidget);
    }
  });
  persistDashboardState();
  return result;
}

function getChartClass(type) {
  return type === "map" ? MapChart
    : type === "line" ? LineChart
    : type === "area" ? AreaChart
    : type === "scatter" ? ScatterChart
    : type === "table" ? TableChart
    : type === "pie" ? PieChart
    : type === "histogram" ? HistogramChart
    : type === "density" ? DensityChart
    : type === "stackedBar" ? StackedBarChart
    : type === "boxPlot" ? BoxPlotChart
    : type === "violinPlot" ? ViolinPlotChart
    : type === "heatmap" ? HeatmapChart
    : type === "treemap" ? TreemapChart
    : type === "combo" ? ComboChart
    : type === "waterfall" ? WaterfallChart
    : type === "funnel" ? FunnelChart
    : type === "radar" ? RadarChart
    : BarChart;
}

function queueFilterToggle(payload) {
  // Keep the app bootstrap thin: the shared interaction contract owns payload
  // validation and consistent click/brush/compound-selection semantics.
  applyChartInteraction(payload, filterStore);
}

function removeVisualization(id) {
  const entry = visualizations.get(id);
  if (!entry) return;

  const confirmed = window.confirm(`Remove "${entry.visualization.title}" from the dashboard?`);
  if (!confirmed) return;

  entry.chart.destroy();

  const widget = dashboard.el
    .querySelector(`[data-widget-id="dashboard-widget-${id}"]`)
    ?.closest(".grid-stack-item");
  if (widget) dashboard.removeWidget(widget);

  visualizations.delete(id);
  persistDashboardState();
}

function selectOptions(columns, selected, {numericOnly = false, emptyLabel = null} = {}) {
  const options = (numericOnly ? numericColumns : columns).map(column =>
    `<option value="${esc(column)}"${columnDescription(column) ? ` title="${esc(columnDescription(column))}"` : ""} ${column === selected ? "selected" : ""}>${esc(humanizeColumn(column))}</option>`
  ).join("");
  return `${emptyLabel ? `<option value="">${esc(emptyLabel)}</option>` : ""}${options}`;
}

function inlineSelect(field, label, options) {
  return `<label class="inline-control-label"><span class="sr-only">${esc(label)}</span><select data-inline-field="${esc(field)}" aria-label="${esc(label)}">${options}</select></label>`;
}

function inlineNumber(field, label, value, min, max) {
  return `<label class="inline-control-label inline-number-label"><span>${esc(label)}</span><input type="number" data-inline-field="${esc(field)}" aria-label="${esc(label)}" value="${esc(value)}" min="${min}" max="${max}" step="1" inputmode="numeric"></label>`;
}

function renderInlineHeader(visualization) {
  if (visualization.type === "map") {
    const q = visualization.query;
    const measureOptions = selectOptions(numericColumns, q.measureColumn);
    const aggregations = [{value:"sum",label:"Sum"},{value:"average",label:"Average"},{value:"min",label:"Minimum"},{value:"max",label:"Maximum"},{value:"count",label:"Count"}]
      .map(option => `<option value="${option.value}" ${option.value === (q.aggregation ?? "sum") ? "selected" : ""}>${option.label}</option>`).join("");
    return `<div class="chart-inline-controls"><label class="inline-control-label"><span class="sr-only">Map value</span><select data-inline-field="mapMeasure" aria-label="Map value">${measureOptions}</select></label><label class="inline-control-label"><span class="sr-only">Aggregation</span><select data-inline-field="mapAggregation" aria-label="Aggregation">${aggregations}</select></label></div>`;
  }
  if (visualization.type === "bar") return renderInlineBarHeader(visualization);
  const v = visualization;
  const q = v.query;
  const dimension = (index = 0) => selectOptions(dimensionColumns, q.dimensions?.[index]);
  const measure = (column, aggregation = "sum") => selectOptions(numericColumns, column ?? numericColumns[0]);
  const aggOptions = [{value:"sum",label:"Sum"},{value:"average",label:"Average"},{value:"min",label:"Minimum"},{value:"max",label:"Maximum"},{value:"count",label:"Count"}]
    .map(option => `<option value="${option.value}" ${option.value === (q.measures?.[0]?.aggregation ?? q.aggregation ?? "sum") ? "selected" : ""}>${option.label}</option>`).join("");
  let controls = "";
  const addAggregation = () => { controls += inlineSelect("aggregation", "Aggregation", aggOptions); };
  const addMeasure = (field, column) => { controls += inlineSelect(field, "Measure", measure(column)); };
  const addDimension = (field, column) => { controls += inlineSelect(field, "Dimension", selectOptions(dimensionColumns, column)); };

  if (["line", "area", "pie", "treemap", "waterfall", "funnel", "radar", "stackedBar", "heatmap"].includes(v.type)) {
    addDimension("dimension", q.dimensions?.[0]);
    if (["stackedBar", "heatmap"].includes(v.type)) addDimension("dimension2", q.dimensions?.[1]);
    if (["line", "area", "radar"].includes(v.type)) {
      const measures = q.measures ?? [];
      const selectedMeasures = new Set(measures.map(item => item.column));
      const label = measures.length === 1 ? humanizeColumn(measures[0].column) : `${measures.length} measures selected`;
      const options = numericColumns.map(column => `<label class="inline-measure-option"${columnDescription(column) ? ` title="${esc(columnDescription(column))}"` : ""}><input type="checkbox" data-inline-measure-option value="${esc(column)}" ${selectedMeasures.has(column) ? "checked" : ""}><span>${esc(humanizeColumn(column))}</span></label>`).join("");
      controls += `<details class="inline-measure-picker"><summary aria-label="Choose chart measures">${esc(label)}</summary><div class="inline-measure-menu" role="group" aria-label="Chart measures">${options}</div></details>`;
    } else {
      addMeasure("measure", q.measures?.[0]?.column);
    }
    addAggregation();
  } else if (v.type === "boxPlot") {
    addDimension("dimension", q.boxPlotDimension);
    addMeasure("measure", q.boxPlotMeasure);
  } else if (v.type === "violinPlot") {
    addDimension("dimension", q.violinPlotDimension);
    addMeasure("measure", q.violinPlotMeasure);
  } else if (v.type === "scatter") {
    controls += inlineSelect("xColumn", "X axis", selectOptions(numericColumns, q.xColumn));
    controls += inlineSelect("yColumn", "Y axis", selectOptions(numericColumns, q.yColumn));
    controls += inlineSelect("colorColumn", "Color", selectOptions(dataset.columns, q.colorColumn, {emptyLabel:"No color"}));
    controls += inlineSelect("sizeColumn", "Size", selectOptions(numericColumns, q.sizeColumn, {emptyLabel:"No size"}));
  } else if (v.type === "histogram" || v.type === "density") {
    const field = v.type === "histogram" ? "histogramColumn" : "densityColumn";
    controls += inlineSelect(field, "Value", selectOptions(numericColumns, q[field]));
    if (v.type === "histogram") controls += inlineNumber("bins", "Bins", q.bins ?? 10, 2, 100);
  } else if (v.type === "table") {
    const selected = new Set(q.columns ?? []);
    const options = dataset.columns.map(column => `<label class="inline-measure-option"><input type="checkbox" data-inline-table-column value="${esc(column)}" ${selected.has(column) ? "checked" : ""}><span>${esc(humanizeColumn(column))}</span></label>`).join("");
    const label = `${selected.size} columns`;
    controls += `<details class="inline-measure-picker"><summary aria-label="Choose table columns">${label}</summary><div class="inline-measure-menu" role="group" aria-label="Table columns">${options}</div></details>`;
  } else if (v.type === "combo") {
    addDimension("dimension", q.dimensions?.[0]);
    controls += inlineSelect("series0", "First series", measure(q.series?.[0]?.measure));
    controls += inlineSelect("series1", "Second series", measure(q.series?.[1]?.measure));
    addAggregation();
  }
  return controls ? `<div class="chart-inline-controls">${controls}</div>` : "";
}

function renderInlineBarHeader(visualization) {
  const dimension = visualization.query.dimensions?.[0] ?? dimensionColumns[0] ?? "";
  const measures = visualization.query.measures ?? [];
  const selectedMeasures = new Set(measures.map(measure => measure.column));
  const dimensionOptions = selectOptions(dimensionColumns, dimension);
  const measureLabel = measures.length === 1 ? humanizeColumn(measures[0].column) : `${measures.length} measures selected`;
  const measureOptions = numericColumns.map(column => `<label class="inline-measure-option"${columnDescription(column) ? ` title="${esc(columnDescription(column))}"` : ""}><input type="checkbox" data-inline-measure-option value="${esc(column)}" ${selectedMeasures.has(column) ? "checked" : ""}><span>${esc(humanizeColumn(column))}</span></label>`).join("");
  const aggregation = measures[0]?.aggregation ?? "sum";
  const aggregationOptions = [{value:"sum",label:"Sum"},{value:"average",label:"Average"},{value:"min",label:"Minimum"},{value:"max",label:"Maximum"},{value:"count",label:"Count"}].map(option => `<option value="${option.value}" ${option.value === aggregation ? "selected" : ""}>${option.label}</option>`).join("");
  return `<div class="chart-inline-controls"><details class="inline-measure-picker"><summary aria-label="Choose chart measures">${esc(measureLabel)}</summary><div class="inline-measure-menu" role="group" aria-label="Chart measures">${measureOptions}</div></details><label class="inline-control-label"><span class="sr-only">Aggregation</span><select data-inline-aggregation aria-label="Aggregation">${aggregationOptions}</select></label><span class="chart-title-by">by</span><label class="inline-control-label"><span class="sr-only">Dimension</span><select data-inline-dimension aria-label="Chart dimension">${dimensionOptions}</select></label></div>`;
}

function bindInlineControls(root, id) {
  root.querySelector("[data-inline-dimension]")?.addEventListener("change", event => applyInlineBarSelection(id, "dimension", event.target.value));
  root.querySelector("[data-inline-aggregation]")?.addEventListener("change", event => applyInlineBarSelection(id, "aggregation", event.target.value));
  root.querySelectorAll("[data-inline-measure-option]").forEach(input => input.addEventListener("change", event => applyInlineBarSelection(id, "measure", event.target.value, event.target.checked)));
  root.querySelectorAll("[data-inline-field]").forEach(control => control.addEventListener("change", event => {
    const {inlineField} = event.target.dataset;
    if (inlineField === "bins") {
      const value = Number(event.target.value);
      if (!Number.isInteger(value) || value < 2 || value > 100) {
        window.alert("Histogram bins must be an integer between 2 and 100.");
        updateChartHeader(id);
        return;
      }
    }
    applyInlineBarSelection(id, inlineField, event.target.value);
  }));
  root.querySelectorAll("[data-inline-table-column]").forEach(input => input.addEventListener("change", event => applyInlineBarSelection(id, "tableColumn", event.target.value, event.target.checked)));
}

function applyInlineBarSelection(id, field, value, checked = true) {
  const entry = visualizations.get(id);
  if (!entry || !value && !["colorColumn", "sizeColumn", "tableColumn"].includes(field)) return;
  const previous = entry.visualization;
  const type = previous.type;
  if (type === "map" && (field === "mapMeasure" || field === "mapAggregation")) {
    const query = {...previous.query, ...(field === "mapMeasure" ? {measureColumn: value, columns: [previous.query.geographicColumn, value]} : {aggregation: value})};
    const validationError = validateVisualizationConfig(type, query, dataset);
    if (validationError) { window.alert(`Could not update chart: ${validationError}`); updateChartHeader(id); return; }
    const autoTitle = `${humanizeColumn(query.measureColumn)} by ${humanizeColumn(query.geographicColumn)} map`;
    const nextVisualization = {...titleAfterInlineEdit(previous, autoTitle), query};
    const widget = dashboard.el.querySelector(`[data-widget-id="dashboard-widget-${id}"]`)?.closest(".grid-stack-item");
    const content = widget?.querySelector(".chart-content");
    if (!content) return;
    try {
      replaceVisualizationTransaction({
        previousEntry: entry, nextVisualization, content,
        createRenderer: (container, visualization) => { const ChartClass = getChartClass(visualization.type); return new ChartClass(container, visualization, {onFilter: filter => queueFilterToggle(filter), colorStore, geographyConfiguration: readGeographyConfiguration()}); },
        render: (chart, visualization) => chart.renderData(dataEngine.query(
      visualization.type === "table" ? {...visualization.query, rawRows: true} : visualization.query
    )),
        commit: ({visualization, chart}) => { visualizations.set(id, {visualization, chart}); updateChartHeader(id); persistDashboardState(); },
        removeUnrecoverable: () => { visualizations.delete(id); if (widget) dashboard.removeWidget(widget); persistDashboardState(); }
      });
    } catch (error) { console.error("Inline map update failed:", error); if (error.recovered) updateChartHeader(id); else window.alert("The map update failed and the unusable chart was removed."); }
    return;
  }
  const result = applyInlineQueryEdit(type, previous.query, field, value, {checked, measureColumns: numericColumns});
  const query = result.query;
  if (result.error) {
    if (result.error === "empty-measures") window.alert(`A ${type === "bar" ? "bar" : type === "line" ? "line" : type === "area" ? "area" : "radar"} chart must have at least one measure selected.`);
    else if (result.error === "empty-columns") window.alert("A table must have at least one column selected.");
    updateChartHeader(id);
    return;
  }
  if (field === "unsupported-field") return;
  const validationError = validateVisualizationConfig(type, query, dataset);
  if (validationError) { window.alert(`Could not update chart: ${validationError}`); updateChartHeader(id); return; }
  const autoTitle = defaultChartTitle(type, query);
  const nextVisualization = {...titleAfterInlineEdit(previous, autoTitle), query};
  const widget = dashboard.el.querySelector(`[data-widget-id="dashboard-widget-${id}"]`)?.closest(".grid-stack-item");
  const content = widget?.querySelector(".chart-content");
  if (!content) return;
  try {
    replaceVisualizationTransaction({
      previousEntry: entry, nextVisualization, content,
      createRenderer: (container, visualization) => { const ChartClass = getChartClass(visualization.type); return new ChartClass(container, visualization, {onFilter: filter => queueFilterToggle(filter), colorStore}); },
      render: (chart, visualization) => chart.renderData(dataEngine.query(
      visualization.type === "table" ? {...visualization.query, rawRows: true} : visualization.query
    )),
      commit: ({visualization, chart}) => { visualizations.set(id, {visualization, chart}); updateChartHeader(id); persistDashboardState(); },
      removeUnrecoverable: () => { visualizations.delete(id); if (widget) dashboard.removeWidget(widget); persistDashboardState(); }
    });
  } catch (error) {
    console.error("Inline chart update failed:", error);
    if (error.recovered) updateChartHeader(id); else window.alert("The chart update failed and the unusable chart was removed.");
  }
}

function updateChartHeader(id) {
  const entry = visualizations.get(id);
  if (!entry) return;
  const widget = dashboard.el.querySelector(`[data-widget-id="dashboard-widget-${id}"]`)?.closest(".grid-stack-item");
  const header = widget?.querySelector(".chart-header");
  if (!header) return;
  let title = header.querySelector(".chart-display-title");
  if (!title) { title = document.createElement("h2"); title.className = "chart-display-title"; const titleRow = header.querySelector(".chart-title-row"); (titleRow ?? header).prepend(title); }
  title.textContent = entry.visualization.title ?? "";
  const replacement = document.createElement("div");
  replacement.innerHTML = renderInlineHeader(entry.visualization);
  const current = header.querySelector(".chart-inline-controls");
  if (replacement.firstElementChild) { if (current) current.replaceWith(replacement.firstElementChild); else header.append(replacement.firstElementChild); }
  else current?.remove();
  bindInlineControls(header, id);
}

function refreshDashboard() {
  for (const id of visualizations.keys()) refreshVisualization(id);
}

function refreshVisualization(id) {
  const entry = visualizations.get(id);
  if (!entry) return;
  const query = entry.visualization.type === "table"
    ? {...entry.visualization.query, rawRows: true}
    : entry.visualization.query;
  const queryStartedAt = performance.now();
  const data = dataEngine.query(query);
  const queryMs = performance.now() - queryStartedAt;
  const renderStartedAt = performance.now();
  entry.chart.renderData(data);
  performanceMetrics.record("chart-query-and-render", queryStartedAt, {queryMs, renderMs: performance.now() - renderStartedAt, rows: dataEngine.filteredRows().length, resultCount: Array.isArray(data) ? data.length : 0, chartType: entry.visualization.type});
}

function getCurrentVisualizations() {
  return [...visualizations.values()].map(({visualization}) => {
    const widget = dashboard.el
      .querySelector(`[data-widget-id="dashboard-widget-${visualization.id}"]`)
      ?.closest(".grid-stack-item");
    const node = widget?.gridstackNode;

    return {
      ...structuredClone(visualization),
      layout: {
        x: node?.x ?? visualization.layout.x,
        y: node?.y ?? visualization.layout.y,
        w: node?.w ?? visualization.layout.w,
        h: node?.h ?? visualization.layout.h
      }
    };
  });
}

function exportLayout() {
  try {
    const includeSource = confirm("Include a copy of the raw source data in this export?\n\nOK: include a copy of the raw source data (larger, self-contained file).\nCancel: export the processing steps, annotations, and dashboard, with a reference to the data instead.");
    const sourceText = importedCsv?.text ?? serializeRawTableToCsv(rawTable);
    const payload = serializeDashboard({
      name: "Untitled data project",
      dataSource: {
        type: importedCsv?.sourceType || "csv",
        reference: importedCsv?.url || importedCsv?.name || "/data/sales.csv",
        ...(importedCsv?.sheetName ? {sheetName: importedCsv.sheetName} : {}),
        expectedSchema: {columns: [...rawTable.columns]}
      },
      sourceData: includeSource
        ? importedCsv?.sourceType === "xlsx"
          ? {format: "table", name: importedCsv.name, table: rawTable, sheetName: importedCsv.sheetName}
          : {format: "csv", name: importedCsv?.name || "sales.csv", text: sourceText}
        : null,
      processing: {
        transformations: preparationDefinitions,
        annotations: readAnnotations(),
        metadataOverrides: readMetadataOverrides(),
        geography: readGeographyConfiguration(),
        customMaps: serializeCustomMaps()
      },
      visualizations: getCurrentVisualizations(),
      grid: {columns: 12, cellHeight: 80, margin: 8}
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dashboard-data-project.json";
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    alert(`Could not export data project: ${error.message}`);
  }
}

async function handleLayoutFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const importedDocument = parseDashboardImport(await file.text());
    if (importedDocument.sourceData?.format === "csv" && typeof importedDocument.sourceData.text === "string") {
      const sourceName = importedDocument.sourceData.name || "project-source.csv";
      const candidate = sourceRegistry.loadText("csv", importedDocument.sourceData.text, sourceName);
      assertExpectedSourceSchema(importedDocument.dataSource, candidate.columns);
      await writeStoredPayload(IMPORT_SESSION_KEY, {name: sourceName, sourceType: "csv", text: importedDocument.sourceData.text, sourceKind: "project-embedded"});
      await writeStoredPayload(PENDING_PROJECT_KEY, importedDocument);
      requestImportRestoreOnNextStartup();
      location.reload();
      return;
    }
    if (importedDocument.sourceData?.format === "table" && importedDocument.sourceData.table) {
      const sourceName = importedDocument.sourceData.name || "project-source.xlsx";
      const candidate = validateRawTable(importedDocument.sourceData.table);
      assertExpectedSourceSchema(importedDocument.dataSource, candidate.columns);
      await writeStoredPayload(IMPORT_SESSION_KEY, {name: sourceName, sourceType: "xlsx", sheetName: importedDocument.sourceData.sheetName || importedDocument.dataSource.sheetName, rawTable: candidate, sourceKind: "project-embedded"});
      await writeStoredPayload(PENDING_PROJECT_KEY, importedDocument);
      requestImportRestoreOnNextStartup();
      location.reload();
      return;
    }

    const compatibility = getDataSourceCompatibility(importedDocument.dataSource, rawTable.columns);
    if (compatibility.compatible === false) {
      pendingProjectForSource = importedDocument;
      alert(`${compatibility.message}\n\nChoose the original source file, or another compatible CSV/Excel file with the expected columns, to continue importing this project.`);
      document.getElementById("project-source-file").click();
      return;
    }
    const useCurrent = confirm(`${compatibility.message}\n\nThis project does not contain a copy of the source data. Use the currently loaded data (${importedCsv?.name || "sample dataset"}) and apply the project's transformations and annotations? Choose Cancel to select a compatible CSV/Excel file instead.`);
    if (useCurrent) {
      await writeStoredPayload(PENDING_PROJECT_KEY, importedDocument);
      location.reload();
    } else {
      pendingProjectForSource = importedDocument;
      document.getElementById("project-source-file").click();
    }
  } catch (error) {
    console.error(error);
    alert(`Could not import data project: ${error.message}`);
  }
}

let pendingProjectForSource = null;
function assertExpectedSourceSchema(dataSource, columns) {
  const expected = dataSource?.expectedSchema?.columns;
  if (!Array.isArray(expected)) return;
  const missing = expected.filter(column => !columns.includes(column));
  if (missing.length) throw new Error(`The selected source is missing expected columns: ${missing.join(", ")}.`);
}

async function handleProjectSourceFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !pendingProjectForSource) return;
  try {
    const type = file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
    const result = await sourceRegistry.loadFile(type, file, {sheetName: pendingProjectForSource.dataSource?.sheetName});
    const candidate = result.table;
    assertExpectedSourceSchema(pendingProjectForSource.dataSource, candidate.columns);
    const importedSource = type === "csv"
      ? {name: file.name, sourceType: "csv", text: result.text, sourceKind: "project-linked"}
      : {name: file.name, sourceType: "xlsx", sheetName: result.selectedSheet, rawTable: candidate, sourceKind: "project-linked"};
    await writeStoredPayload(IMPORT_SESSION_KEY, importedSource);
    await writeStoredPayload(PENDING_PROJECT_KEY, pendingProjectForSource);
    pendingProjectForSource = null;
    requestImportRestoreOnNextStartup();
    location.reload();
  } catch (error) {
    alert(`Could not use that source CSV: ${error.message}`);
  }
}

function loadLayout(layouts) {
  for (const entry of visualizations.values()) entry.chart.destroy();
  visualizations.clear();
  dashboard.removeAll();
  nextId = 1;

  for (const visualization of layouts) {
    const id = String(visualization.id || `chart-${++nextId}`);
    const numericPart = Number(id.replace(/^chart-/i, ""));
    if (Number.isFinite(numericPart)) nextId = Math.max(nextId, numericPart);

    renderVisualization({
      ...visualization,
      id,
      layout: {
        x: visualization.layout?.x ?? 0,
        ...(visualization.layout?.y != null ? {y: visualization.layout.y} : {}),
        w: visualization.layout?.w ?? 6,
        h: visualization.layout?.h ?? 5
      }
    });
  }

  refreshDashboard();
  persistDashboardState();
}

function esc(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
