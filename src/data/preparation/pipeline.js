import {createCanonicalDataset} from '../dataset-schema.js';
import {validateRawTable} from '../data-source.js';
import {createTransformationProvenance, replayTransformationDefinitions, validateTransformationDefinitions} from './transform-registry.js';

/** Ordered preparation pipeline. Raw input is copied before any step is applied. */
export class DataPreparationPipeline {
  constructor({steps = [], definitions = []} = {}) {
    if (!Array.isArray(steps) || steps.some(step => typeof step !== 'function')) {
      throw new TypeError('Preparation steps must be an array of functions.');
    }
    this.steps = [...steps];
    this.definitions = validateTransformationDefinitions(definitions);
    this.lastProvenance = [];
  }

  async run(rawInput) {
    const rawSnapshot = validateRawTable(rawInput, {cloneRows: false, validateRows: false});
    const replayed = replayTransformationDefinitions(rawSnapshot, this.definitions);
    let table = replayed.table;
    const provenance = createTransformationProvenance(replayed.definitions);
    for (let index = 0; index < this.steps.length; index += 1) {
      table = validateRawTable(await this.steps[index](validateRawTable(table)));
      provenance.push({order: provenance.length + 1, id: `runtime-step-${index + 1}`, type: 'runtime-function', parameters: {replayable: false}});
    }
    this.lastProvenance = provenance;
    const dataset = createCanonicalDataset(table);
    return {...dataset, preparation: {version: 1, transformations: provenance.map(item => ({...item, parameters: {...item.parameters}}))}};
  }
}

export function createDefaultPreparationPipeline() {
  return new DataPreparationPipeline();
}
