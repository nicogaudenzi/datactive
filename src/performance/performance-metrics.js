const MAX_ENTRIES = 100;

/**
 * Lightweight, opt-in-friendly timing recorder for import and interaction stages.
 * Metrics are kept in memory only and exposed for diagnostics/tests; no data values
 * are recorded or persisted.
 */
export function createPerformanceMetrics({now = () => performance.now()} = {}) {
  const entries = [];

  function record(name, startedAt, details = {}) {
    const entry = {
      name: String(name),
      durationMs: Math.max(0, now() - startedAt),
      timestamp: Date.now(),
      ...sanitizeDetails(details)
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    return entry;
  }

  function snapshot() {
    return entries.map(entry => ({...entry}));
  }

  function clear() {
    entries.length = 0;
  }

  return Object.freeze({record, snapshot, clear});
}

function sanitizeDetails(details) {
  const safe = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'string') safe[key] = value.slice(0, 80);
  }
  return safe;
}
