/** Resolves source types without coupling import UI to individual adapters. */
export class DataSourceRegistry {
  #adapters = new Map();

  register(adapter) {
    if (!adapter || typeof adapter.type !== 'string' || !adapter.type.trim()) {
      throw new TypeError('A source adapter with a non-empty type is required.');
    }
    if (typeof adapter.load !== 'function') {
      throw new TypeError(`The ${adapter.type} adapter must implement load(reference).`);
    }
    if (this.#adapters.has(adapter.type)) {
      throw new Error(`A data source adapter is already registered for "${adapter.type}".`);
    }
    this.#adapters.set(adapter.type, adapter);
    return this;
  }

  get(type) {
    const adapter = this.#adapters.get(type);
    if (!adapter) throw new Error(`Unsupported data source type: "${type}".`);
    return adapter;
  }

  load(type, reference) {
    return this.get(type).load(reference);
  }

  loadResource(type, reference) {
    const adapter = this.get(type);
    if (typeof adapter.loadResource !== 'function') {
      throw new Error(`The ${type} adapter does not support loading resources with source content.`);
    }
    return adapter.loadResource(reference);
  }

  loadFile(type, file, options) {
    const adapter = this.get(type);
    if (typeof adapter.loadFile !== 'function') {
      throw new Error(`The ${type} adapter does not support local file imports.`);
    }
    return adapter.loadFile(file, options);
  }

  loadText(type, text, reference) {
    const adapter = this.get(type);
    if (typeof adapter.loadText !== 'function') {
      throw new Error(`The ${type} adapter does not support loading text content.`);
    }
    return adapter.loadText(text, reference);
  }
}
