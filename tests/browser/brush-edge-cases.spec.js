import {test, expect} from '@playwright/test';

async function openChart(page, type) {
  await page.goto(`/tests/browser/harness.html?type=${type}`);
  await page.waitForFunction(() => window.__chartReady === true);
  await expect(page.locator('#chart svg').first()).toBeVisible();
}
async function events(page) { return page.evaluate(() => window.__events); }
async function filters(page) { return page.evaluate(() => window.__activeFilters()); }
async function applyEvents(page) {
  await page.evaluate(() => window.__events.forEach(event => window.__applyInteraction(event)));
}
async function drag(page, selector, fromRatio, toRatio, steps = 10) {
  const overlay = page.locator(selector);
  await expect(overlay).toBeVisible();
  const box = await overlay.boundingBox();
  expect(box).not.toBeNull();
  const y = box.y + box.height / 2;
  const x1 = box.x + box.width * fromRatio;
  const x2 = box.x + box.width * toRatio;
  await page.mouse.move(x1, y);
  await page.mouse.down();
  if (x1 !== x2) await page.mouse.move(x2, y, {steps});
  await page.mouse.up();
}

test('zero-width categorical drag does not create a filter', async ({page}) => {
  await openChart(page, 'bar');
  await drag(page, '.chart-category-brush .overlay', 0.5, 0.5, 1);
  expect(await events(page)).toEqual([]);
  expect(await filters(page)).toEqual([]);
});

test('zero-width numeric drag does not create a filter', async ({page}) => {
  await openChart(page, 'scatter');
  await drag(page, '.chart-x-brush .overlay', 0.5, 0.5, 1);
  expect(await events(page)).toEqual([]);
  expect(await filters(page)).toEqual([]);
});

test('numeric brush includes the exact lower domain boundary', async ({page}) => {
  await openChart(page, 'scatter');
  await drag(page, '.chart-x-brush .overlay', 0, 0.5);
  const emitted = await events(page);
  expect(emitted).toHaveLength(1);
  expect(emitted[0].column).toBe('revenue');
  expect(emitted[0].operator).toBe('range');
  expect(emitted[0].value[0]).toBeCloseTo(5, 5);
  expect(emitted[0].value[1]).toBeGreaterThan(emitted[0].value[0]);
});

test('numeric brush includes the exact upper domain boundary', async ({page}) => {
  await openChart(page, 'scatter');
  await drag(page, '.chart-x-brush .overlay', 0.5, 1);
  const emitted = await events(page);
  expect(emitted).toHaveLength(1);
  expect(emitted[0].column).toBe('revenue');
  expect(emitted[0].operator).toBe('range');
  expect(emitted[0].value[1]).toBeCloseTo(65, 5);
  expect(emitted[0].value[0]).toBeLessThan(emitted[0].value[1]);
});

test('repeated numeric brushing replaces the previous range', async ({page}) => {
  await openChart(page, 'scatter');
  await drag(page, '.chart-x-brush .overlay', 0.1, 0.4);
  const first = (await events(page))[0];
  expect(first.operator).toBe('range');
  await applyEvents(page);

  await page.evaluate(() => { window.__events = []; });
  await drag(page, '.chart-x-brush .overlay', 0.6, 0.9);
  const secondEvents = await events(page);
  expect(secondEvents).toHaveLength(1);
  expect(secondEvents[0].operator).toBe('range');
  expect(secondEvents[0].value[0]).toBeGreaterThan(first.value[0]);
  await applyEvents(page);
  expect(await filters(page)).toEqual([secondEvents[0]]);
});

test('numeric brushing preserves an unrelated active category filter', async ({page}) => {
  await openChart(page, 'scatter');
  await page.evaluate(() => window.__filterStore.setFilter({column:'country', operator:'equals', value:'US'}));
  await drag(page, '.chart-x-brush .overlay', 0.2, 0.7);
  await applyEvents(page);
  const active = await filters(page);
  expect(active).toHaveLength(2);
  expect(active).toContainEqual({column:'country', operator:'equals', value:'US'});
  expect(active.find(filter => filter.column === 'revenue')).toEqual((await events(page))[0]);
});

test('clearing and reapplying a numeric brush leaves only the latest range active', async ({page}) => {
  await openChart(page, 'scatter');
  await drag(page, '.chart-x-brush .overlay', 0.2, 0.7);
  await applyEvents(page);
  expect(await filters(page)).toHaveLength(1);

  await page.evaluate(() => { window.__events = []; });
  await drag(page, '.chart-x-brush .overlay', 0, 1);
  expect(await events(page)).toEqual([{column:'revenue', operator:'clear', value:null}]);
  await applyEvents(page);
  expect(await filters(page)).toEqual([]);

  await page.evaluate(() => { window.__events = []; });
  await drag(page, '.chart-x-brush .overlay', 0.3, 0.6);
  await applyEvents(page);
  expect(await filters(page)).toHaveLength(1);
  expect((await filters(page))[0].operator).toBe('range');
});
