import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDashboardDocument,
  validateDashboardDocument,
  DASHBOARD_DOCUMENT_SCHEMA,
  DASHBOARD_DOCUMENT_VERSION
} from '../src/dashboard/dashboard-document.js';

const visualization = {
  id: 'chart-1', type: 'bar', title: 'Revenue by month',
  query: {dimensions: ['month'], measures: [{column: 'revenue', aggregation: 'sum'}]},
  layout: {x: 0, y: 0, w: 6, h: 5}
};
const dataSource = {
  type: 'csv', reference: '/data/sales.csv',
  expectedSchema: {columns: ['date', 'revenue', 'month']}
};

function validDocument(overrides = {}) {
  return createDashboardDocument({dataSource, visualizations: [visualization], ...overrides});
}

test('creates a versioned dashboard document with configuration and a data reference, not rows', () => {
  const document = validDocument();
  assert.equal(document.schema, DASHBOARD_DOCUMENT_SCHEMA);
  assert.equal(document.version, DASHBOARD_DOCUMENT_VERSION);
  assert.equal(document.dataSource.reference, '/data/sales.csv');
  assert.deepEqual(document.visualizations, [visualization]);
  assert.equal('rows' in document, false);
  assert.deepEqual(validateDashboardDocument(document), []);
});

test('document creation clones input so later edits do not mutate the document', () => {
  const sourceVisualizations = [structuredClone(visualization)];
  const document = validDocument({visualizations: sourceVisualizations});
  sourceVisualizations[0].query.dimensions[0] = 'country';
  assert.equal(document.visualizations[0].query.dimensions[0], 'month');
});

test('rejects unknown versions, missing data-source metadata, and malformed grid settings', () => {
  const document = validDocument();
  document.version = 99;
  document.dataSource = null;
  document.settings.grid.columns = 0;
  const errors = validateDashboardDocument(document).join(' ');
  assert.match(errors, /Unsupported dashboard document version/);
  assert.match(errors, /dataSource/);
  assert.match(errors, /Grid columns/);
});

test('rejects duplicate visualization ids and malformed visualization layouts', () => {
  const document = validDocument({visualizations: [visualization, {...visualization, layout: {x: 0, y: 0, w: 0, h: 5}}]});
  const errors = validateDashboardDocument(document).join(' ');
  assert.match(errors, /Duplicate visualization id/);
  assert.match(errors, /layout.w must be positive/);
});

test('rejects invalid expected schema and incomplete chart configuration', () => {
  const document = validDocument();
  document.dataSource.expectedSchema.columns = ['month', 42];
  document.visualizations[0].query = null;
  const errors = validateDashboardDocument(document).join(' ');
  assert.match(errors, /expectedSchema.columns/);
  assert.match(errors, /query object/);
});
