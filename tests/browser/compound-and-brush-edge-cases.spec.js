import {test, expect} from '@playwright/test';

async function openChart(page, type) {
  await page.goto(`/tests/browser/harness.html?type=${type}`);
  await page.waitForFunction(() => window.__chartReady === true);
  await expect(page.locator('#chart svg').first()).toBeVisible();
}

async function events(page) {
  return page.evaluate(() => window.__events);
}

async function filters(page) {
  return page.evaluate(() => window.__activeFilters());
}

async function applyEvents(page) {
  await page.evaluate(() => window.__events.forEach(event => window.__applyInteraction(event)));
}

async function drag(page, selector, fromRatio, toRatio) {
  const overlay = page.locator(selector);
  await expect(overlay).toBeVisible();
  const box = await overlay.boundingBox();
  expect(box).not.toBeNull();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromRatio, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toRatio, y, {steps: 10});
  await page.mouse.up();
}

test('heatmap cell emits the exact two-dimension compound selection', async ({page}) => {
  await openChart(page, 'heatmap');
  await page.locator('.heatmap-cell').first().click();

  const emitted = await events(page);
  expect(emitted).toHaveLength(1);
  expect(emitted[0]).toEqual([
    {column: 'country', operator: 'equals', value: 'US'},
    {column: 'month', operator: 'equals', value: 'Jan'}
  ]);
});

test('clicking the same heatmap cell twice clears both filters through the interaction contract', async ({page}) => {
  await openChart(page, 'heatmap');
  const cell = page.locator('.heatmap-cell').first();
  await cell.click();
  await applyEvents(page);
  expect(await filters(page)).toEqual([
    {column: 'country', operator: 'equals', value: 'US'},
    {column: 'month', operator: 'equals', value: 'Jan'}
  ]);

  await page.evaluate(() => { window.__events = []; });
  await cell.click();
  await applyEvents(page);
  expect(await filters(page)).toEqual([]);
});

test('heatmap selection replaces the previous compound selection rather than leaving stale dimension filters', async ({page}) => {
  await openChart(page, 'heatmap');
  const cells = page.locator('.heatmap-cell');
  await cells.nth(0).click();
  await applyEvents(page);
  await page.evaluate(() => { window.__events = []; });

  await cells.nth(3).click();
  await applyEvents(page);
  expect(await filters(page)).toEqual([
    {column: 'country', operator: 'equals', value: 'MX'},
    {column: 'month', operator: 'equals', value: 'Feb'}
  ]);
});

test('category brush supports reverse drags and emits a non-empty category selection', async ({page}) => {
  await openChart(page, 'bar');
  await drag(page, '.chart-category-brush .overlay', 0.72, 0.18);

  const emitted = await events(page);
  expect(emitted).toHaveLength(1);
  expect(emitted[0].column).toBe('country');
  expect(emitted[0].operator).toBe('in');
  expect(emitted[0].value.length).toBeGreaterThan(0);
  expect(emitted[0].value.length).toBeLessThan(4);
});

test('category brush across the full extent emits clear', async ({page}) => {
  await openChart(page, 'bar');
  await drag(page, '.chart-category-brush .overlay', 0, 1);

  expect(await events(page)).toEqual([
    {column: 'country', operator: 'clear', value: null}
  ]);
});

test('numeric brush supports reverse drags and normalizes range bounds', async ({page}) => {
  await openChart(page, 'scatter');
  await drag(page, '.chart-x-brush .overlay', 0.78, 0.22);

  const emitted = await events(page);
  expect(emitted).toHaveLength(1);
  expect(emitted[0].column).toBe('revenue');
  expect(emitted[0].operator).toBe('range');
  expect(emitted[0].value).toHaveLength(2);
  expect(emitted[0].value[0]).toBeLessThan(emitted[0].value[1]);
  expect(emitted[0].value[0]).toBeGreaterThanOrEqual(10);
  expect(emitted[0].value[1]).toBeLessThanOrEqual(60);
});

test('numeric brush across the full extent emits clear', async ({page}) => {
  await openChart(page, 'scatter');
  await drag(page, '.chart-x-brush .overlay', 0, 1);

  expect(await events(page)).toEqual([
    {column: 'revenue', operator: 'clear', value: null}
  ]);
});

test('a tiny numeric brush produces a finite ordered range instead of invalid bounds', async ({page}) => {
  await openChart(page, 'scatter');
  await drag(page, '.chart-x-brush .overlay', 0.5, 0.515);

  const emitted = await events(page);
  expect(emitted).toHaveLength(1);
  expect(emitted[0].operator).toBe('range');
  expect(emitted[0].value.every(Number.isFinite)).toBe(true);
  expect(emitted[0].value[0]).toBeLessThanOrEqual(emitted[0].value[1]);
});
