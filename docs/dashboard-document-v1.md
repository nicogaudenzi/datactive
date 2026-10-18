# Dashboard document schema, version 1 (D1)

The canonical document is defined in `src/dashboard/dashboard-document.js`.

```js
{
  schema: 'dashboard-builder/dashboard',
  version: 1,
  metadata: { name: 'Untitled dashboard' },
  dataSource: {
    type: 'csv',
    reference: '/data/sales.csv',
    expectedSchema: {
      columns: ['date', 'revenue', 'month']
    }
  },
  settings: {
    grid: { columns: 12, cellHeight: 80, margin: 8 }
  },
  visualizations: [
    {
      id: 'chart-1',
      type: 'bar',
      title: 'Revenue by month',
      query: { dimensions: ['month'], measures: [{ column: 'revenue', aggregation: 'sum' }] },
      layout: { x: 0, y: 0, w: 6, h: 5 }
    }
  ]
}
```

## Persistence boundary

Persist chart configuration and layout, dashboard metadata/settings, and a data-source reference with an expected schema. Do **not** persist raw data rows in the dashboard document. A later import flow can reconnect to the reference or ask the user to select a compatible source. A path/reference is a locator, not a guarantee that the source will be available on another machine.

Active filters, selections, chart/DOM instances, GridStack runtime objects, and other temporary UI state are intentionally excluded in version 1. A future explicit “save session” feature could persist filter state separately without changing this default.

`validateDashboardDocument` validates the document's outer structure and basic visualization/layout shape. Dataset-specific column compatibility and per-chart query validation require the active dataset and remain separate checks during restoration (D2).
