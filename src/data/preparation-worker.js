import {DataPreparationPipeline} from './preparation/pipeline.js';

self.onmessage = async event => {
  try {
    const {rawTable, definitions = []} = event.data ?? {};
    const pipeline = new DataPreparationPipeline({definitions});
    const dataset = await pipeline.run(rawTable);
    self.postMessage({type: 'result', dataset});
  } catch (error) {
    self.postMessage({type: 'error', message: error?.message || String(error)});
  }
};
