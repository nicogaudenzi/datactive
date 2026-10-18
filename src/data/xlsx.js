import * as XLSX from "xlsx";
import {DataSourceAdapter, validateRawTable} from "./data-source.js";

/** Excel adapter. It reads one worksheet and returns raw cell values without cleaning. */
export class XlsxSourceAdapter extends DataSourceAdapter {
  constructor() {
    super("xlsx");
  }

  async load(reference) {
    const file = reference?.file ?? reference;
    const sheetName = reference?.sheetName;
    return (await this.loadFile(file, {sheetName})).table;
  }

  async loadFile(file, {sheetName} = {}) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new TypeError("Choose a readable Excel workbook (.xlsx or .xls).");
    }
    const extension = String(file.name ?? "").toLowerCase().split(".").pop();
    if (!new Set(["xlsx", "xls"]).has(extension)) {
      throw new Error("Choose a supported Excel workbook (.xlsx or .xls).");
    }

    let workbook;
    try {
      const bytes = await file.arrayBuffer();
      if (!bytes || bytes.byteLength === 0) {
        throw new Error("The file is empty.");
      }
      workbook = XLSX.read(bytes, {type: "array", cellDates: true});
    } catch (error) {
      throw new Error(`Could not read the Excel workbook: ${error.message}`);
    }
    const sheetNames = [...(workbook.SheetNames ?? [])];
    if (!sheetNames.length) throw new Error("The Excel workbook does not contain any worksheets.");
    const selectedSheet = sheetName ?? sheetNames[0];
    const worksheet = workbook.Sheets[selectedSheet];
    if (!worksheet) throw new Error(`The worksheet "${selectedSheet}" was not found in this workbook.`);

    const matrix = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: true, defval: null, blankrows: false});
    if (!matrix.length) throw new Error(`The worksheet "${selectedSheet}" is empty.`);
    const columns = matrix[0].map(value => value == null ? "" : String(value));
    if (!columns.length || columns.every(column => !column.trim())) {
      throw new Error("The worksheet must contain a header row with at least one column.");
    }
    if (columns.some(column => !column.trim())) throw new Error("The worksheet contains an empty column name.");
    if (new Set(columns).size !== columns.length) throw new Error("The worksheet contains duplicate column names. Rename them before importing.");
    const rows = matrix.slice(1).map(values => Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null])));
    const table = validateRawTable({
      columns,
      rows,
      source: {type: this.type, reference: file.name || "workbook.xlsx", sheetName: selectedSheet}
    });
    return {table, sheetNames, selectedSheet};
  }
}
