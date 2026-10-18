import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}) => {
  // Surface runtime failures that can leave the dashboard empty and cause
  // downstream locator timeouts.
  page.on('pageerror', error => console.error('Browser page error:', error));
  page.on('console', message => {
    if (message.type() === 'error') console.error('Browser console error:', message.text());
  });
});

async function openDashboardWorkspace(page) {
  // The guided workflow now opens on Import Data. Chart lifecycle tests must
  // explicitly enter the Dashboard workspace before interacting with widgets.
  await page.getByRole('button', {name: '5. Dashboard'}).click();
  await expect(page.locator('#dashboard-workspace')).toBeVisible();
  await expect(page.locator('#import-workspace')).toBeHidden();
  await expect(page.locator('#show-dashboard-workspace')).toHaveAttribute('aria-current', 'page');
}

async function addBarChart(page, {title, dimension = 'country', measure = 'revenue'} = {}) {
  await page.locator('#add-chart').click();
  const dialog = page.locator('#chart-dialog');
  await expect(dialog).toBeVisible();
  await page.locator('#chart-title').fill(title);
  await page.locator('#chart-type').selectOption('bar');
  await page.locator('#chart-dimension').selectOption(dimension);
  await page.locator('#chart-measure').selectOption(measure);
  await page.locator('#chart-submit').click();
  await expect(dialog).not.toBeVisible();
  const widget = page.locator('#dashboard .grid-stack-item').filter({hasText: title});
  await expect(widget).toHaveCount(1);
  await expect(widget.locator('.chart-content svg')).toHaveCount(1);
  return widget;
}

async function clearActiveFilters(page) {
  // Filters now starts collapsed by default. Expand it before using the
  // Clear all control inside its panel body.
  const toggle = page.locator('#filter-panel-toggle');
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  await page.locator('#clear-active-filters').click();
}

async function removeChart(page, widget) {
  page.once('dialog', dialog => dialog.accept());
  await widget.locator('[data-delete-chart]').click();
  await expect(widget).toHaveCount(0);
}

test('repeated create, type edit, and remove operations keep dashboard widgets consistent', async ({page}) => {
  await page.goto('/');
  await openDashboardWorkspace(page);
  const dashboard = page.locator('#dashboard');
  const widgets = dashboard.locator('.grid-stack-item');

  await expect(widgets).toHaveCount(1);
  await expect(dashboard.locator('[data-widget-id="dashboard-widget-chart-1"] svg')).toHaveCount(1);

  const createdWidgetIds = [];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const widget = await addBarChart(page, {title: `Lifecycle test ${iteration + 1}`});
    const widgetId = await widget.locator('[data-widget-id]').getAttribute('data-widget-id');
    createdWidgetIds.push(widgetId);
    await expect(widgets).toHaveCount(2);

    await widget.locator('[data-edit-chart]').click();
    const dialog = page.locator('#chart-dialog');
    await expect(dialog).toBeVisible();
    await page.locator('#chart-type').selectOption('line');
    await page.locator('#chart-dimension').selectOption('month');
    await page.locator('#chart-measure').selectOption('revenue');
    await page.locator('#chart-submit').click();

    await expect(dialog).not.toBeVisible();
    await expect(widgets).toHaveCount(2);
    await expect(widget.locator('.chart-content svg')).toHaveCount(1);
    await expect.poll(() => widget.locator('svg .line-point-0').count()).toBeGreaterThan(0);
    await widget.locator('svg .line-point-0').first().click();
    await expect(page.locator('#filter-count')).toHaveText('1');
    await clearActiveFilters(page);
    await expect(page.locator('#filter-count')).toHaveText('0');

    await removeChart(page, widget);
    await expect(widgets).toHaveCount(1);
  }

  expect(new Set(createdWidgetIds).size).toBe(createdWidgetIds.length);
  await expect(widgets).toHaveCount(1);
  await expect(dashboard.locator('[data-widget-id="dashboard-widget-chart-1"] svg')).toHaveCount(1);
});

test('repeated same-type edits do not duplicate widgets, SVGs, or click effects', async ({page}) => {
  await page.goto('/');
  await openDashboardWorkspace(page);
  const dashboard = page.locator('#dashboard');
  const widgets = dashboard.locator('.grid-stack-item');
  const initialWidget = await addBarChart(page, {title: 'Same-type edit lifecycle'});
  const widgetId = await initialWidget.locator('[data-widget-id]').getAttribute('data-widget-id');
  // Resolve the widget by its stable ID: title-based locators stop matching as
  // soon as an edit changes the chart title.
  const widget = page.locator(`#dashboard .grid-stack-item:has([data-widget-id="${widgetId}"])`);

  for (const title of ['Edited title one', 'Edited title two', 'Same-type edit lifecycle']) {
    await widget.locator('[data-edit-chart]').click();
    await expect(page.locator('#chart-dialog')).toBeVisible();
    await page.locator('#chart-title').fill(title);
    // Keep the chart type unchanged so this exercises the in-place edit path.
    await page.locator('#chart-type').selectOption('bar');
    await page.locator('#chart-submit').click();

    await expect(page.locator('#chart-dialog')).not.toBeVisible();
    await expect(widgets).toHaveCount(2);
    await expect(widget.locator('[data-widget-id]')).toHaveAttribute('data-widget-id', widgetId);
    await expect(widget.locator('.chart-content svg')).toHaveCount(1);
    await expect(widget.locator('.chart-header h2')).toHaveText(title);
  }

  await widget.locator('rect[data-interaction-target="category-click"]').first().click();
  await expect(page.locator('#filter-count')).toHaveText('1');
  await expect(page.locator('#active-filters .filter-chip')).toHaveCount(1);
  await expect(widgets).toHaveCount(2);
});

test('removing a filtered chart preserves filter state and remaining charts continue updating', async ({page}) => {
  await page.goto('/');
  await openDashboardWorkspace(page);
  const dashboard = page.locator('#dashboard');
  const widgets = dashboard.locator('.grid-stack-item');
  const countryChart = await addBarChart(page, {title: 'Filter then remove'});

  await countryChart.locator('rect[data-interaction-target="category-click"]').first().click();
  await expect(page.locator('#filter-count')).toHaveText('1');
  await expect(page.locator('#active-filters .filter-chip')).toHaveCount(1);
  const filteredRowCount = await page.locator('#filtered-row-count').innerText();
  expect(filteredRowCount).not.toMatch(/^30\s*\/\s*30 rows$/);

  await removeChart(page, countryChart);
  await expect(widgets).toHaveCount(1);
  await expect(page.locator('#filter-count')).toHaveText('1');
  await expect(page.locator('#active-filters .filter-chip')).toHaveCount(1);
  await expect(dashboard.locator('[data-widget-id="dashboard-widget-chart-1"] svg')).toHaveCount(1);

  // A surviving chart can still add a filter, and clearing filters restores it.
  await dashboard.locator('[data-widget-id="dashboard-widget-chart-1"] rect[data-interaction-target="category-click"]').first().click();
  await expect(page.locator('#filter-count')).toHaveText('2');
  await clearActiveFilters(page);
  await expect(page.locator('#filter-count')).toHaveText('0');
  await expect(page.locator('#active-filters .filter-empty')).toHaveText('No filters applied');
  await expect(widgets).toHaveCount(1);
});
