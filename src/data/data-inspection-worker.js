import {profileDataset} from './profiling.js';
import {findDataQualityIssues} from './quality-findings.js';

self.onmessage = event => {
  const dataset = event.data?.dataset;
  try {
    self.postMessage({type: 'progress', stage: 'profiling', rowCount: dataset?.rowCount, columnCount: dataset?.columns?.length});
    const profile = profileDataset(dataset);
    self.postMessage({type: 'progress', stage: 'quality', rowCount: dataset.rowCount, columnCount: dataset.columns.length});
    const quality = findDataQualityIssues(dataset);
    self.postMessage({type: 'result', profile, quality});
  } catch (error) {
    self.postMessage({type: 'error', message: error?.message || String(error)});
  }
};
