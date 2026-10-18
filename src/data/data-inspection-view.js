
const PAGE_SIZE = 25;

/** Extract source row indices from the different evidence shapes used by E2. */
export function getFindingRowIndices(finding) {
  const evidence = finding?.evidence ?? {};
  let indices = [];
  if (Number.isInteger(evidence.rowIndex)) indices = [evidence.rowIndex];
  if (Array.isArray(evidence.rowIndices)) indices = evidence.rowIndices;
  if (Array.isArray(evidence.variants)) indices = evidence.variants.flatMap(variant => variant.rowIndices ?? []);
  if (evidence.examples && typeof evidence.examples === 'object') {
    indices = [...indices, ...Object.values(evidence.examples).flatMap(examples =>
      Array.isArray(examples) ? examples.map(example => example.rowIndex).filter(Number.isInteger) : [])];
  }
  return [...new Set(indices.filter(index => Number.isInteger(index) && index >= 0))].sort((a, b) => a - b);
}

/** Mount a read-only dataset inspection workspace into the supplied element. */
export async function mountDataInspectionView(host, dataset, {statusStorageKey = "dashboard-builder.finding-status.v1:default", getColumnDescription = () => "", onProgress = () => {}} = {}) {
  if (!host) throw new TypeError('A host element is required.');
  // Run CPU-heavy profiling and quality analysis in a dedicated worker. A yield
  // before synchronous work is not enough: it lets the status paint, then still
  // blocks input and rendering for the entire analysis pass.
  const {profile, quality} = await analyzeDataset(dataset, onProgress);
  onProgress({stage: 'ready', rowCount: dataset.rowCount, columnCount: dataset.columns.length});
  let selectedColumn = profile.columns[0]?.name ?? null;
  let selectedFindingId = null;
  let page = 0;
  let showAffectedOnly = false;
  let findingStatuses = {};
  try {
    const stored = JSON.parse(sessionStorage.getItem(statusStorageKey) ?? "{}");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) findingStatuses = stored;
  } catch { findingStatuses = {}; }

  host.replaceChildren();
  host.innerHTML = `
    <div class="inspection-heading"><div><h2>Data / Prepare</h2><p>Inspect the loaded dataset. Type and role overrides are managed in Annotate; values are not changed here.</p></div><div class="inspection-summary" id="inspection-summary"></div></div>
    <section class="inspection-panel" data-panel="column-profiles"><div class="inspection-panel-heading"><button type="button" class="inspection-panel-toggle" aria-expanded="true" aria-controls="column-profiles-content"><span class="panel-chevron" aria-hidden="true">⌄</span><h3>Column profiles</h3></button><span>Choose a column to inspect its statistics and observed values.</span></div><div class="inspection-panel-content" id="column-profiles-content"><div class="profile-table-wrap"><table class="inspection-table"><thead><tr><th>Column</th><th>Description</th><th>Column type</th><th>Role</th><th>Missing</th><th>Distinct</th><th>Observed types</th></tr></thead><tbody id="profile-rows"></tbody></table></div><div id="profile-detail" class="profile-detail"></div></div></section>
    <section class="inspection-panel" data-panel="quality-findings"><div class="inspection-panel-heading"><button type="button" class="inspection-panel-toggle" aria-expanded="false" aria-controls="quality-findings-content"><span class="panel-chevron" aria-hidden="true">›</span><h3>Data-quality findings</h3></button><span>Potential issues to investigate, not automatic corrections.</span></div><div class="inspection-panel-content" id="quality-findings-content" hidden><div class="finding-layout"><div id="finding-list" class="finding-list"></div><div id="finding-detail" class="finding-detail"><p class="inspection-empty">Select a finding to inspect its evidence and affected rows.</p></div></div></div></section>
    <section class="inspection-panel" data-panel="row-preview"><div class="inspection-panel-heading"><button type="button" class="inspection-panel-toggle" aria-expanded="false" aria-controls="row-preview-content"><span class="panel-chevron" aria-hidden="true">›</span><h3>Row preview</h3></button><span id="row-preview-caption"></span><button type="button" id="preview-filter-toggle" hidden>Show all rows</button></div><div class="inspection-panel-content" id="row-preview-content" hidden><div class="inspection-table-wrap"><table class="inspection-table row-preview-table"><thead id="preview-head"></thead><tbody id="preview-body"></tbody></table></div><div class="preview-pagination"><button type="button" id="preview-prev">Previous</button><span id="preview-page"></span><button type="button" id="preview-next">Next</button></div></div></section>`;

  const $ = selector => host.querySelector(selector);
  for (const toggle of host.querySelectorAll('.inspection-panel-toggle')) {
    toggle.addEventListener('click', () => {
      const content = document.getElementById(toggle.getAttribute('aria-controls'));
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      content.hidden = expanded;
      const chevron = toggle.querySelector('.panel-chevron');
      if (chevron) chevron.textContent = expanded ? '›' : '⌄';
      const panel = toggle.closest('.inspection-panel');
      if (panel) panel.classList.toggle('is-collapsed', expanded);
    });
  }
  const summary = $('#inspection-summary');
  updateSummary();

  const profileRows = $('#profile-rows');
  for (const item of profile.columns) {
    const tr = document.createElement('tr');
    tr.dataset.column = item.name;
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    const observed = Object.entries(item.typeDistribution).filter(([, count]) => count > 0).map(([type, count]) => `${type}: ${count}`).join(', ') || '—';
    for (const value of [item.name, getColumnDescription(item.name) || "—", item.inferredType, item.suggestedRole, `${item.missingCount} (${item.missingPercent.toFixed(1)}%)`, item.distinctCount, observed]) {
      const td = document.createElement('td'); td.textContent = value; tr.appendChild(td);
    }
    const choose = () => { selectedColumn = item.name; renderProfileDetail(); renderPreview(); };
    tr.addEventListener('click', choose);
    tr.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    profileRows.appendChild(tr);
  }

  const findingList = $('#finding-list');
  const findingItems = document.createDocumentFragment();
  for (const finding of quality.findings) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'finding-item'; button.dataset.findingId = finding.id;
    const type = document.createElement('span'); type.className = 'finding-type'; type.textContent = finding.type.replaceAll('-', ' ');
    const severity = document.createElement('span'); severity.className = `finding-severity severity-${finding.severity}`; severity.textContent = finding.severity;
    const status = document.createElement('span'); status.className = 'finding-status'; status.textContent = statusLabel(findingStatuses[finding.id]);
    status.hidden = !findingStatuses[finding.id];
    const message = document.createElement('span'); message.className = 'finding-message'; message.textContent = finding.message;
    button.append(type, severity, status, message);
    button.dataset.reviewStatus = findingStatuses[finding.id] ?? 'open';
    button.addEventListener('click', () => { selectedFindingId = finding.id; showAffectedOnly = false; page = 0; renderFindingDetail(); renderPreview(); });
    findingItems.appendChild(button);
  }
  findingList.appendChild(findingItems);
  if (!quality.findings.length) findingList.innerHTML = '<p class="inspection-empty">No findings detected by the current checks.</p>';

  $('#preview-prev').addEventListener('click', () => { page = Math.max(0, page - 1); renderPreview(); });
  $('#preview-next').addEventListener('click', () => { page = Math.min(Math.max(0, Math.ceil(getPreviewRowIndices().length / PAGE_SIZE) - 1), page + 1); renderPreview(); });
  $('#preview-filter-toggle').addEventListener('click', () => { showAffectedOnly = false; page = 0; renderPreview(); });
  renderProfileDetail(); renderFindingDetail(); renderPreview();

  function renderProfileDetail() {
    const item = profile.columns.find(column => column.name === selectedColumn);
    $('#profile-rows').querySelectorAll('tr').forEach(row => row.classList.toggle('selected', row.dataset.column === selectedColumn));
    const detail = $('#profile-detail');
    detail.replaceChildren();
    if (!item) { detail.textContent = 'No columns available.'; return; }
    const title = document.createElement('h4'); title.textContent = `${item.name} details`; detail.appendChild(title);
    const description = getColumnDescription(item.name);
    if (description) { const note = document.createElement('p'); note.className = 'column-description'; note.textContent = description; detail.appendChild(note); }
    const stats = document.createElement('div'); stats.className = 'profile-stat-grid';
    const metrics = [['Rows', item.rowCount], ['Populated', item.populatedCount], ['Missing', `${item.missingCount} (${item.missingPercent.toFixed(1)}%)`], ['Distinct values', item.distinctCount]];
    if (item.numericStats) metrics.push(['Numeric min', formatValue(item.numericStats.min)], ['Numeric max', formatValue(item.numericStats.max)], ['Mean', formatValue(item.numericStats.mean)], ['Median', formatValue(item.numericStats.median)]);
    if (item.dateStats) metrics.push(['Earliest date', item.dateStats.min], ['Latest date', item.dateStats.max]);
    for (const [label, value] of metrics) { const card = document.createElement('div'); card.className = 'profile-stat'; const caption = document.createElement('span'); caption.textContent = label; const strong = document.createElement('strong'); strong.textContent = String(value); card.append(caption, strong); stats.appendChild(card); }
    detail.appendChild(stats);
    const typesTitle = document.createElement('h5'); typesTitle.textContent = 'Observed value types'; detail.appendChild(typesTitle);
    const types = document.createElement('div'); types.className = 'observed-type-list';
    for (const [type, count] of Object.entries(item.typeDistribution).filter(([, count]) => count > 0)) { const chip = document.createElement('span'); chip.className = 'observed-type-chip'; chip.textContent = `${type}: ${count}`; types.appendChild(chip); }
    detail.appendChild(types);
    const examplesTitle = document.createElement('h5'); examplesTitle.textContent = 'Examples'; detail.appendChild(examplesTitle);
    const examples = document.createElement('div'); examples.className = 'value-examples';
    for (const [type, values] of Object.entries(item.examples)) for (const value of values) { const chip = document.createElement('code'); chip.textContent = `${type}: ${formatValue(value)}`; examples.appendChild(chip); }
    if (!examples.childElementCount) examples.textContent = 'No populated examples.';
    detail.appendChild(examples);
  }

  function renderFindingDetail() {
    const finding = quality.findings.find(item => item.id === selectedFindingId);
    findingList.querySelectorAll('[data-finding-id]').forEach(button => button.classList.toggle('selected', button.dataset.findingId === selectedFindingId));
    const detail = $('#finding-detail'); detail.replaceChildren();
    if (!finding) { detail.innerHTML = '<p class="inspection-empty">Select a finding to inspect its evidence and affected rows.</p>'; return; }
    const title = document.createElement('h4'); title.textContent = finding.message; detail.appendChild(title);
    const metadata = document.createElement('p'); metadata.className = 'finding-meta'; metadata.textContent = `Type: ${finding.type.replaceAll('-', ' ')} · Severity: ${finding.severity}${finding.column ? ` · Column: ${finding.column}` : ''}`; detail.appendChild(metadata);
    const evidence = document.createElement('pre'); evidence.className = 'finding-evidence';
    evidence.textContent = JSON.stringify(finding.evidence, (key, value) => {
      if (value === undefined) return '(undefined)';
      // Keep evidence useful without dumping thousands of row indices into the
      // detail panel. The full index list remains available to the row preview.
      if (key === 'rowIndices' && Array.isArray(value) && value.length > 50) {
        return [...value.slice(0, 50), `… ${value.length - 50} more row indices`];
      }
      return value;
    }, 2);
    detail.appendChild(evidence);
    const reviewActions = document.createElement('div'); reviewActions.className = 'finding-review-actions';
    const currentStatus = findingStatuses[finding.id];
    const reviewed = document.createElement('button'); reviewed.type = 'button'; reviewed.textContent = currentStatus === 'reviewed' ? 'Reviewed ✓' : 'Mark reviewed'; reviewed.setAttribute('aria-pressed', String(currentStatus === 'reviewed'));
    reviewed.addEventListener('click', () => setFindingStatus(finding.id, currentStatus === 'reviewed' ? null : 'reviewed'));
    const ignored = document.createElement('button'); ignored.type = 'button'; ignored.textContent = currentStatus === 'ignored' ? 'Ignored ✓' : 'Ignore finding'; ignored.setAttribute('aria-pressed', String(currentStatus === 'ignored'));
    ignored.addEventListener('click', () => setFindingStatus(finding.id, currentStatus === 'ignored' ? null : 'ignored'));
    reviewActions.append(reviewed, ignored);
    if (currentStatus) { const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Reopen'; clear.addEventListener('click', () => setFindingStatus(finding.id, null)); reviewActions.append(clear); }
    detail.appendChild(reviewActions);
    const indices = getFindingRowIndices(finding);
    const action = document.createElement('p'); action.className = 'finding-row-hint';
    action.textContent = indices.length
      ? (showAffectedOnly
          ? `Showing only ${indices.length} affected row${indices.length === 1 ? '' : 's'} (displayed row numbers are 1-based).`
          : `${indices.length} affected row${indices.length === 1 ? '' : 's'} identified (displayed row numbers are 1-based).`)
      : 'No specific source rows were attached to this finding.';
    detail.appendChild(action);
    if (indices.length) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.textContent = showAffectedOnly ? 'Show all rows' : 'Show affected rows';
      jump.addEventListener('click', () => {
        showAffectedOnly = !showAffectedOnly;
        page = 0;
        renderFindingDetail();
        renderPreview();
      });
      detail.appendChild(jump);
    }
  }

  function statusLabel(status) { return status === 'reviewed' ? 'Reviewed' : status === 'ignored' ? 'Ignored' : ''; }

  function updateSummary() {
    const reviewedCount = quality.findings.filter(finding => findingStatuses[finding.id] === 'reviewed').length;
    const ignoredCount = quality.findings.filter(finding => findingStatuses[finding.id] === 'ignored').length;
    summary.textContent = `${dataset.rowCount} rows · ${dataset.columns.length} columns · ${quality.findingCount} findings · ${reviewedCount} reviewed · ${ignoredCount} ignored`;
  }

  function setFindingStatus(id, status) {
    if (status === 'reviewed' || status === 'ignored') findingStatuses[id] = status;
    else delete findingStatuses[id];
    try { sessionStorage.setItem(statusStorageKey, JSON.stringify(findingStatuses)); } catch { /* status remains usable for this view */ }
    for (const button of findingList.querySelectorAll('[data-finding-id]')) {
      const value = findingStatuses[button.dataset.findingId];
      button.dataset.reviewStatus = value ?? 'open';
      const chip = button.querySelector('.finding-status');
      if (chip) { chip.textContent = statusLabel(value); chip.hidden = !value; }
    }
    updateSummary();
    renderFindingDetail();
  }

  function getPreviewRowIndices() {
    if (showAffectedOnly) return getFindingRowIndices(quality.findings.find(item => item.id === selectedFindingId));
    return Array.from({length: dataset.rowCount}, (_, index) => index);
  }

  function renderPreview() {
    const columns = selectedColumn ? [selectedColumn, ...dataset.columns.filter(column => column !== selectedColumn)] : dataset.columns;
    const head = $('#preview-head'); head.replaceChildren();
    const headerRow = document.createElement('tr');
    const rowHeader = document.createElement('th'); rowHeader.textContent = 'Row'; headerRow.appendChild(rowHeader);
    for (const column of columns) { const th = document.createElement('th'); th.textContent = column; headerRow.appendChild(th); }
    head.appendChild(headerRow);
    const tbody = $('#preview-body'); tbody.replaceChildren();
    const rowIndices = getPreviewRowIndices();
    const start = page * PAGE_SIZE; const visibleIndices = rowIndices.slice(start, start + PAGE_SIZE);
    const selectedFinding = quality.findings.find(item => item.id === selectedFindingId);
    // Highlight affected rows only in the explicit affected-rows view. Merely selecting
    // a finding should not imply that off-page rows are being shown or highlighted.
    const affected = new Set(showAffectedOnly ? getFindingRowIndices(selectedFinding) : []);
    for (const index of visibleIndices) {
      const row = dataset.rows[index]; const tr = document.createElement('tr'); tr.classList.toggle('affected-row', affected.has(index));
      const number = document.createElement('th'); number.scope = 'row'; number.textContent = String(index + 1); tr.appendChild(number);
      for (const column of columns) { const td = document.createElement('td'); td.textContent = formatValue(row[column]); if (column === selectedColumn) td.classList.add('selected-column-cell'); tr.appendChild(td); }
      tbody.appendChild(tr);
    }
    const totalPages = Math.max(1, Math.ceil(rowIndices.length / PAGE_SIZE));
    $('#row-preview-caption').textContent = showAffectedOnly
      ? `${rowIndices.length} affected rows for ${selectedFinding?.type ?? 'selected finding'}`
      : (dataset.rowCount ? `Rows ${rowIndices.length ? start + 1 : 0}–${Math.min(rowIndices.length, start + PAGE_SIZE)} of ${dataset.rowCount}` : 'No rows');
    $('#preview-page').textContent = `${Math.min(page + 1, totalPages)} / ${totalPages}`;
    $('#preview-prev').disabled = page === 0;
    $('#preview-next').disabled = start + PAGE_SIZE >= rowIndices.length;
    const toggle = $('#preview-filter-toggle');
    toggle.hidden = !showAffectedOnly;
    toggle.textContent = 'Show all rows';
  }
}

function formatValue(value) {
  if (value === undefined) return '(undefined)';
  if (value === null) return '(null)';
  if (typeof value === 'string' && value.trim() === '') return '(blank)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function analyzeDataset(dataset, onProgress) {
  if (typeof Worker === 'undefined') {
    // Non-browser test environments retain a direct fallback.
    return import('./profiling.js').then(async ({profileDataset}) => {
      onProgress({stage: 'profiling', rowCount: dataset.rowCount, columnCount: dataset.columns.length});
      const profile = profileDataset(dataset);
      onProgress({stage: 'quality', rowCount: dataset.rowCount, columnCount: dataset.columns.length});
      const {findDataQualityIssues} = await import('./quality-findings.js');
      return {profile, quality: findDataQualityIssues(dataset)};
    });
  }
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL('./data-inspection-worker.js', import.meta.url), {type: 'module'}); }
    catch (error) { reject(error); return; }
    let settled = false;
    const finish = () => { if (settled) return; settled = true; worker.terminate(); };
    worker.onmessage = event => {
      const message = event.data ?? {};
      if (message.type === 'progress') { onProgress(message); return; }
      finish();
      if (message.type === 'error') reject(new Error(message.message || 'Dataset analysis failed.'));
      else if (message.type === 'result') resolve({profile: message.profile, quality: message.quality});
      else reject(new Error('Dataset analysis worker returned an unknown response.'));
    };
    worker.onerror = event => { finish(); reject(new Error(event.message || 'Dataset analysis worker failed.')); };
    try { worker.postMessage({dataset}); }
    catch (error) { finish(); reject(error); }
  });
}
