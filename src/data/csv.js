import * as d3 from "d3";
import {DataSourceAdapter, validateRawTable} from "./data-source.js";
import {validateCsvColumns} from "./csv-validation.js";

/** CSV adapter: reads CSV values faithfully as strings and does no cleaning. */
export class CsvSourceAdapter extends DataSourceAdapter {
  constructor({fetchImpl = (...args) => fetch(...args)} = {}) {
    super("csv");
    this.fetchImpl = fetchImpl;
  }

  async load(reference) {
    const {table} = await this.loadResource(reference);
    return table;
  }

  /** Fetch a remote CSV and return both its validated table and original text. */
  async loadResource(reference) {
    const url = normalizeCsvUrl(reference);
    const response = await this.fetchImpl(url, {headers: {Accept: "text/csv,text/plain,*/*"}});
    if (!response.ok) throw new Error(`The server responded with HTTP ${response.status}.`);
    const text = await response.text();
    const name = csvNameFromUrl(url);
    return {table: this.loadText(text, url), text, reference: url, name};
  }

  /** Read and parse a local CSV file in a Web Worker when available. */
  async loadFile(file, {onProgress = () => {}, retainText = true} = {}) {
    if (!file || typeof file.text !== 'function') throw new TypeError('Choose a readable CSV file.');
    const name = String(file.name || "local-file.csv");
    if (!name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      throw new Error('Choose a .csv file.');
    }

    // Node-based unit tests and older environments without Worker retain a safe
    // fallback. The app requests retainText:false so a large CSV string isn't
    // kept alongside the parsed row objects in IndexedDB.
    if (typeof Worker === 'undefined') {
      onProgress({stage: 'reading'});
      const text = await file.text();
      onProgress({stage: 'parsing'});
      return {table: this.loadText(text, name), ...(retainText ? {text} : {}), name};
    }

    return new Promise((resolve, reject) => {
      let worker;
      try { worker = new Worker(new URL('./csv-worker.js', import.meta.url), {type: 'module'}); }
      catch (error) { reject(error); return; }
      let columns = null;
      const rows = [];
      let finished = false;
      const cleanup = () => { if (!finished) { finished = true; worker.terminate(); } };
      worker.onmessage = event => {
        const message = event.data ?? {};
        if (message.type === 'progress') { onProgress(message); return; }
        if (message.type === 'header') { columns = message.columns; return; }
        if (message.type === 'batch') {
          // Append in bounded batches instead of structured-cloning one enormous
          // result object back to the main thread.
          for (const row of message.rows) rows.push(row);
          onProgress({stage: 'parsing', rowsParsed: rows.length, bytesRead: message.bytesRead, fileSize: file.size});
          return;
        }
        cleanup();
        if (message.type === 'error') { reject(new Error(message.message || 'Could not parse CSV.')); return; }
        try {
          if (!columns?.length) throw new Error('No columns were found in the CSV.');
          if (!rows.length) throw new Error('The CSV has headers but no data rows.');
          const table = validateRawTable({columns, rows, source: {type: 'csv', reference: name}}, {cloneRows: false, validateRows: false});
          resolve({table, name});
        } catch (error) { reject(error); }
      };
      worker.onerror = event => { cleanup(); reject(new Error(event.message || 'CSV parsing worker failed.')); };
      worker.postMessage({file, reference: name, batchSize: 2000});
    });
  }

  /** Parse persisted or embedded CSV text using the same raw-table contract. */
  loadText(text, reference = "local-file.csv") {
    if (typeof text !== "string") throw new TypeError("CSV content must be text.");
    if (!text.trim()) throw new Error("The selected CSV file is empty.");
    let rows;
    try {
      rows = d3.csvParse(text);
    } catch (error) {
      throw new Error(`Could not parse CSV: ${error.message}`);
    }
    validateCsvColumns(rows.columns);
    return this.#toRawTable(rows, reference);
  }

  #toRawTable(rows, reference) {
    return validateRawTable({
      rows,
      columns: rows.columns ?? [],
      source: {type: this.type, reference}
    });
  }
}


function normalizeCsvUrl(reference) {
  if (typeof reference !== "string" || !reference.trim()) throw new Error("Enter a valid CSV URL.");
  let parsed;
  try { parsed = new URL(reference.trim()); }
  catch { throw new Error("Enter a valid URL."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
  return parsed.href;
}

function csvNameFromUrl(reference) {
  const url = new URL(reference);
  const segment = url.pathname.split("/").filter(Boolean).at(-1) || "remote-data.csv";
  let name;
  try { name = decodeURIComponent(segment); }
  catch { name = segment; }
  if (!name.toLowerCase().endsWith(".csv")) name = `${name}.csv`;
  return name;
}
