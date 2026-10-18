import {applyTransformationDefinition, replayTransformationDefinitions, validateTransformationDefinitions, TRANSFORMATION_TYPES} from './transform-registry.js';
import {buildCleaningPreview} from './cleaning-preview.js';

const LABELS = {
  'trim-text': 'Trim whitespace', 'normalize-case': 'Normalize text case',
  'replace-value': 'Replace a value', 'fill-missing': 'Fill missing values',
  'convert-to-date': 'Convert column to date',
  'remove-rows-missing': 'Remove rows with missing values',
  'remove-duplicate-rows': 'Remove duplicate rows', 'derive-month': 'Derive month from date', 'derive-column': 'Derive column'
};
const missing = value => value == null || (typeof value === 'string' && value.trim() === '');

/** Mounts the first-pass transformation editor. Changes are previewed before the caller persists them. */
export function mountCleaningEditor(host, {rawTable, dataset, definitions = [], onApply}) {
  if (!host) throw new TypeError('A host element is required.');
  let activeDefinitions = validateTransformationDefinitions(definitions);
  host.insertAdjacentHTML('beforeend', `
    <section class="inspection-panel cleaning-editor is-collapsed" aria-label="Data cleaning transformations" data-panel="cleaning-transformations">
      <div class="inspection-panel-heading"><button type="button" class="inspection-panel-toggle" aria-expanded="false" aria-controls="cleaning-transformations-content"><span class="panel-chevron" aria-hidden="true">›</span><h3>Cleaning transformations</h3></button><span>Choose an operation, preview its effect, then apply it to the preparation pipeline.</span></div>
      <div class="inspection-panel-content" id="cleaning-transformations-content" hidden>
      <div class="cleaning-current"><h4>Applied steps</h4><div class="cleaning-step-list" id="cleaning-step-list"></div></div>
      <form class="cleaning-form" id="cleaning-form">
        <label>Operation<select id="cleaning-type">${TRANSFORMATION_TYPES.filter(type => type !== 'derive-month').map(type => `<option value="${type}">${LABELS[type]}</option>`).join('')}</select></label>
        <label id="cleaning-column-label">Column<select id="cleaning-column"></select></label>
        <label id="derived-name-label" hidden>New column name<input id="derived-name" type="text" placeholder="e.g. Profit"></label>
        <label id="derived-expression-label" hidden>Expression<input id="derived-expression" type="text" placeholder="[Revenue] - [Cost]"></label>
        <label id="derived-result-label" hidden>Result type<select id="derived-result"><option value="number">Number</option><option value="text">Text</option><option value="date">Date</option></select></label>
        <p id="derived-help" class="annotation-help" hidden>Use [Column Name] for columns. Operators: + − * / %, comparisons > >= < <= == !=, and logical AND/OR/NOT. Functions: IF(condition, trueValue, falseValue), IS_MISSING(value), YEAR(date), MONTH(date), DAY(date), FORMAT_MONTH(date), TRIM(text), LOWER(text), UPPER(text), CONCAT(a, b), ABS(number), ROUND(number, places). Missing/invalid conditions produce a blank unless checked with IS_MISSING(...).</p>
        <label id="cleaning-mode-label" hidden>Case<select id="cleaning-mode"><option value="lower">lowercase</option><option value="upper">UPPERCASE</option></select></label>
        <label id="cleaning-find-label" hidden>Exact value to find<input id="cleaning-find" type="text"></label>
        <label id="cleaning-replace-label" hidden>Replace with<input id="cleaning-replace" type="text"></label>
        <label id="cleaning-fill-label" hidden>Value for missing cells<input id="cleaning-fill" type="text" placeholder="e.g. Unknown"></label>
        <label id="cleaning-invalid-date-label" hidden>When a value is not a valid date<select id="cleaning-invalid-date"><option value="missing">Replace with missing value</option><option value="keep">Keep original value</option><option value="remove-row">Remove the row</option></select></label>
        <div class="cleaning-actions"><button type="submit" class="primary-button">Preview transformation</button></div>
      </form>
      <div id="cleaning-preview" class="cleaning-preview" aria-live="polite"><p class="inspection-empty">Choose an operation to preview its effect.</p></div>
      </div>
    </section>`);
  const $ = selector => host.querySelector(selector);
  const panelToggle = $('.inspection-panel-toggle');
  panelToggle.addEventListener('click', () => {
    const expanded = panelToggle.getAttribute('aria-expanded') === 'true';
    panelToggle.setAttribute('aria-expanded', String(!expanded));
    $('#cleaning-transformations-content').hidden = expanded;
    $('.cleaning-editor').classList.toggle('is-collapsed', expanded);
    $('.panel-chevron').textContent = expanded ? '›' : '⌄';
  });
  const typeSelect = $('#cleaning-type');
  const columnSelect = $('#cleaning-column');
  const form = $('#cleaning-form');
  const preview = $('#cleaning-preview');
  let previewDefinition = null;

  for (const column of dataset.columns) { const option = document.createElement('option'); option.value = column; option.textContent = column; columnSelect.append(option); }
  typeSelect.addEventListener('change', updateControls);
  form.addEventListener('submit', event => { event.preventDefault(); previewDefinition = buildDefinition(); showPreview(previewDefinition); });
  updateControls();
  renderSteps();

  function updateControls() {
    const type = typeSelect.value;
    $('#cleaning-column-label').hidden = type === 'remove-duplicate-rows' || type === 'derive-column';
    for (const id of ['derived-name-label','derived-expression-label','derived-result-label','derived-help']) $(`#${id}`).hidden = type !== 'derive-column';
    $('#cleaning-mode-label').hidden = type !== 'normalize-case';
    $('#cleaning-find-label').hidden = type !== 'replace-value';
    $('#cleaning-replace-label').hidden = type !== 'replace-value';
    $('#cleaning-fill-label').hidden = type !== 'fill-missing';
    $('#cleaning-invalid-date-label').hidden = type !== 'convert-to-date';
    previewDefinition = null;
    preview.innerHTML = '<p class="inspection-empty">Choose an operation and preview its effect.</p>';
  }

  function buildDefinition() {
    const type = typeSelect.value;
    const definition = {id: `clean-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type};
    if (type === 'derive-column') { definition.targetColumn = $('#derived-name').value.trim(); definition.expression = $('#derived-expression').value.trim(); definition.resultType = $('#derived-result').value; }
    else if (type !== 'remove-duplicate-rows') definition.column = columnSelect.value;
    if (type === 'normalize-case') definition.mode = $('#cleaning-mode').value;
    if (type === 'replace-value') { definition.find = $('#cleaning-find').value; definition.replaceWith = $('#cleaning-replace').value; }
    if (type === 'fill-missing') definition.value = $('#cleaning-fill').value;
    if (type === 'convert-to-date') definition.onInvalid = $('#cleaning-invalid-date').value;
    return definition;
  }

  function showPreview(definition) {
    preview.replaceChildren();
    try {
      const before = replayTransformationDefinitions(rawTable, activeDefinitions).table;
      const after = applyTransformationDefinition(before, definition);
      const nextDefinitions = validateTransformationDefinitions([...activeDefinitions, definition], rawTable.columns);
      const comparison = buildCleaningPreview(before, after, definition);
      const title = document.createElement('h4'); title.textContent = LABELS[definition.type];
      const summary = document.createElement('p'); summary.className = 'cleaning-preview-summary';
      summary.textContent = `${comparison.totalAffectedRows} row${comparison.totalAffectedRows === 1 ? '' : 's'} affected · ${comparison.totalChangedCells} cell${comparison.totalChangedCells === 1 ? '' : 's'} changed · ${before.rows.length} rows before → ${after.rows.length} after`;
      preview.append(title, summary);
      if (comparison.changedColumns.length) {
        const columnsSummary = document.createElement('p'); columnsSummary.className = 'cleaning-preview-columns';
        columnsSummary.textContent = `Affected columns: ${comparison.changedColumns.join(', ')}`;
        preview.append(columnsSummary);
      }
      if (comparison.removedRows > 0) {
        const detail = document.createElement('p'); detail.textContent = `${comparison.removedRows} row${comparison.removedRows === 1 ? '' : 's'} will be removed. Remove this step to restore them from the raw source.`; preview.append(detail);
      }
      renderComparisonTable(comparison);
      if (comparison.omittedRows > 0) {
        const more = document.createElement('p'); more.className = 'cleaning-preview-columns';
        more.textContent = `Showing ${comparison.entries.length} of ${comparison.totalAffectedRows} affected rows.`;
        preview.append(more);
      } else if (comparison.totalAffectedRows === 0) {
        const none = document.createElement('p'); none.className = 'inspection-empty'; none.textContent = 'This transformation would not change any rows or cell values.'; preview.append(none);
      }
      const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'primary-button'; apply.textContent = 'Apply transformation';
      apply.addEventListener('click', () => onApply(nextDefinitions));
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel preview';
      cancel.addEventListener('click', () => { previewDefinition = null; preview.innerHTML = '<p class="inspection-empty">Preview cancelled. No changes were applied.</p>'; });
      const actions = document.createElement('div'); actions.className = 'cleaning-actions'; actions.append(apply, cancel); preview.append(actions);
    } catch (error) {
      const message = document.createElement('p'); message.className = 'annotation-help error'; message.textContent = `Could not preview transformation: ${error.message}`; preview.append(message);
    }
  }

  function renderComparisonTable(comparison) {
    if (!comparison.entries.length) return;
    const wrap = document.createElement('div'); wrap.className = 'cleaning-comparison-wrap';
    const table = document.createElement('table'); table.className = 'cleaning-comparison-table';
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    const rowHeader = document.createElement('th'); rowHeader.textContent = 'Row'; header.append(rowHeader);
    for (const column of comparison.columns) {
      for (const side of ['Before', 'After']) {
        const th = document.createElement('th'); th.textContent = `${column} · ${side}`; th.scope = 'col'; header.append(th);
      }
    }
    thead.append(header); table.append(thead);
    const tbody = document.createElement('tbody');
    comparison.entries.forEach((entry, index) => {
      const tr = document.createElement('tr'); tr.dataset.status = entry.status;
      const status = document.createElement('th'); status.scope = 'row'; status.textContent = entry.status === 'removed' ? `Row ${entry.rowNumber} · Removed` : entry.status === 'added' ? `Row ${entry.rowNumber} · Added` : `Row ${entry.rowNumber} · Changed`; tr.append(status);
      for (const column of comparison.columns) {
        const beforeCell = document.createElement('td'); beforeCell.textContent = displayPreviewValue(entry.before?.[column]);
        const afterCell = document.createElement('td'); afterCell.textContent = entry.after ? displayPreviewValue(entry.after[column]) : '— row removed —';
        if (entry.changedColumns.includes(column)) { beforeCell.classList.add('cleaning-cell-changed'); afterCell.classList.add('cleaning-cell-changed'); }
        if (entry.status === 'removed') afterCell.classList.add('cleaning-cell-removed');
        tr.append(beforeCell, afterCell);
      }
      tbody.append(tr);
    });
    table.append(tbody); wrap.append(table); preview.append(wrap);
  }

  function displayPreviewValue(value) {
    if (value === undefined) return '—';
    if (value === null) return 'null';
    if (value === '') return '(empty)';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  function renderSteps() {
    const list = $('#cleaning-step-list'); list.replaceChildren();
    if (!activeDefinitions.length) { list.innerHTML = '<p class="inspection-empty">No cleaning transformations applied. Raw data is currently used as-is.</p>'; return; }
    activeDefinitions.forEach((definition, index) => {
      const row = document.createElement('div'); row.className = 'cleaning-step';
      const description = document.createElement('span'); description.textContent = `${index + 1}. ${LABELS[definition.type] ?? definition.type}${definition.column ? ` · ${definition.column}` : definition.targetColumn ? ` · ${definition.targetColumn} = ${definition.expression ?? `month from ${definition.sourceColumn}`}` : ''}`;
      const controls = document.createElement('div'); controls.className = 'cleaning-step-actions';
      for (const [label, delta] of [['↑', -1], ['↓', 1]]) {
        const move = document.createElement('button'); move.type = 'button'; move.textContent = label; move.title = delta < 0 ? 'Move step up' : 'Move step down'; move.disabled = index + delta < 0 || index + delta >= activeDefinitions.length;
        move.addEventListener('click', () => { const next = [...activeDefinitions]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; onApply(next); }); controls.append(move);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.addEventListener('click', () => onApply(activeDefinitions.filter((_, i) => i !== index)));
      controls.append(remove); row.append(description, controls); list.append(row);
    });
  }

}
