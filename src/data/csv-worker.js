import {validateCsvColumns} from './csv-validation.js';

const BATCH_SIZE_DEFAULT = 2000;

self.onmessage = async event => {
  const {file, reference = 'local-file.csv', batchSize = BATCH_SIZE_DEFAULT} = event.data ?? {};
  try {
    if (!file || typeof file.stream !== 'function') throw new TypeError('This browser cannot stream the selected CSV file.');
    if (!file.size) throw new Error('The selected CSV file is empty.');
    self.postMessage({type: 'progress', stage: 'reading', bytesRead: 0, fileSize: file.size});

    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8', {fatal: false});
    let header = null;
    let row = [];
    let field = '';
    let inQuotes = false;
    let afterQuote = false;
    let skipLF = false;
    let firstCharacter = true;
    let bytesRead = 0;
    let rowsParsed = 0;
    let batch = [];
    let hasRowContent = false;

    const flushRow = () => {
      row.push(field);
      field = '';
      const parsed = row;
      row = [];
      hasRowContent = false;
      if (header === null) {
        if (parsed.length && parsed[0].startsWith('\uFEFF')) parsed[0] = parsed[0].slice(1);
        header = validateCsvColumns(parsed);
        self.postMessage({type: 'header', columns: header});
        return;
      }
      // Match the ordinary CSV behavior of ignoring a final blank line.
      if (parsed.length === 1 && parsed[0] === '') return;
      // Like the previous d3-dsv object parser, ignore extra fields and leave
      // missing fields undefined instead of rejecting otherwise readable files.
      const record = {};
      for (let i = 0; i < header.length; i += 1) record[header[i]] = parsed[i];
      batch.push(record);
      rowsParsed += 1;
      if (batch.length >= batchSize) emitBatch();
    };

    const emitBatch = () => {
      if (!batch.length) return;
      self.postMessage({type: 'batch', rows: batch, bytesRead, fileSize: file.size});
      batch = [];
    };

    const consume = chunk => {
      for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk[i];
        if (firstCharacter) {
          firstCharacter = false;
          if (ch === '\uFEFF') continue;
        }
        if (skipLF) { skipLF = false; if (ch === '\n') continue; }
        if (inQuotes) {
          if (ch === '"') { inQuotes = false; afterQuote = true; }
          else field += ch;
          hasRowContent = true;
          continue;
        }
        if (afterQuote) {
          if (ch === '"') { field += '"'; inQuotes = true; afterQuote = false; hasRowContent = true; continue; }
          afterQuote = false;
        }
        if (ch === '"' && field.length === 0) { inQuotes = true; hasRowContent = true; continue; }
        if (ch === ',') { row.push(field); field = ''; hasRowContent = true; continue; }
        if (ch === '\n' || ch === '\r') {
          flushRow();
          if (ch === '\r') skipLF = true;
          continue;
        }
        field += ch;
        hasRowContent = true;
      }
    };

    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      consume(decoder.decode(value, {stream: true}));
      self.postMessage({type: 'progress', stage: 'parsing', bytesRead, fileSize: file.size, rowsParsed});
    }
    consume(decoder.decode());
    if (inQuotes && !afterQuote) throw new Error('The CSV ends inside a quoted field. Check for an unmatched quote.');
    if (field.length || row.length || hasRowContent || afterQuote) flushRow();
    emitBatch();
    if (header === null) throw new Error('The CSV must contain a header row with at least one column.');
    if (rowsParsed === 0) throw new Error('The CSV has headers but no data rows.');
    self.postMessage({type: 'done', rowsParsed, bytesRead, fileSize: file.size});
  } catch (error) {
    self.postMessage({type: 'error', message: error?.message || String(error)});
  }
};
