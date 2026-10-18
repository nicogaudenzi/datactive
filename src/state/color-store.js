import * as d3 from "d3";
import {getDimensionColumns, getMeasureColumns} from "../data/dataset-schema.js";

// Keeps colors stable by semantic role. Measures have their own palette so a
// measure color is never confused with a categorical dimension color.
// Dimension values are mapped per dimension column and are based on the
// complete dataset, so filtering/redrawing never changes their colors.
export class ColorStore {
  constructor(dataset) {
    this.measurePalette = d3.schemeTableau10;
    this.dimensionPalette = d3.schemeSet2;
    this.dimensionScales = new Map();
    this.measureScales = new Map();

    for (const column of getDimensionColumns(dataset)) {
      const values = [...new Set(
        dataset.rows
          .map(row => row[column])
          .filter(value => value !== null && value !== undefined && value !== "")
          .map(value => String(value))
      )];

      this.dimensionScales.set(column, d3.scaleOrdinal()
        .domain(values)
        .range(this.dimensionPalette));
    }

    for (const column of getMeasureColumns(dataset)) {
      this.measureScales.set(column, d3.scaleOrdinal()
        .domain([column])
        .range([this.measurePalette[this.measureScales.size % this.measurePalette.length]]));
    }
  }

  getDimensionColor(column, value) {
    let scale = this.dimensionScales.get(column);
    if (!scale) {
      scale = d3.scaleOrdinal().range(this.dimensionPalette);
      this.dimensionScales.set(column, scale);
    }
    return scale(String(value ?? ""));
  }

  getMeasureColor(column) {
    let scale = this.measureScales.get(column);
    if (!scale) {
      const index = this.measureScales.size % this.measurePalette.length;
      scale = d3.scaleOrdinal().domain([column]).range([this.measurePalette[index]]);
      this.measureScales.set(column, scale);
    }
    return scale(column);
  }

  // Categorical dimension color lookup.
  getColor(column, value) {
    return this.getDimensionColor(column, value);
  }

  getScale(column) {
    let scale = this.dimensionScales.get(column);
    if (!scale) {
      scale = d3.scaleOrdinal().range(this.dimensionPalette);
      this.dimensionScales.set(column, scale);
    }
    return scale;
  }
}
