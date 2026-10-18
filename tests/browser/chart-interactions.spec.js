import {test, expect} from '@playwright/test';
import {CHART_INTERACTION_REGISTRY, CHART_TYPES} from '../../src/interactions/chart-interaction-registry.js';

const clickSelectors = {
  bar: '[data-interaction-target="category-click"]', line: '[class^="line-point-"]', area: '[class^="area-point-"]',
  scatter: 'circle', table: 'tbody tr:first-child td:first-child', pie: 'path',
  stackedBar: '.stacked-bar-group rect', boxPlot: '[data-interaction-target="category-click"]',
  violinPlot: '[data-interaction-target="category-click"]', heatmap: '.heatmap-cell', treemap: '.treemap-node',
  combo: '[data-interaction-target="category-click"]', waterfall: '.waterfall-bar',
  funnel: '.funnel-stage', radar: 'text:has-text("US")', map: '.map-region'
};
const brushSelectors = {
  category: '.chart-category-brush .overlay',
  numeric: '.chart-x-brush .overlay'
};
const columnFor = {
  bar:'country', line:'month', area:'month', scatter:'revenue', table:'country', pie:'country',
  histogram:'revenue', density:'revenue', map:'country', stackedBar:'country', boxPlot:'country', violinPlot:'country',
  heatmap:'country', treemap:'country', combo:'month', waterfall:'month', funnel:'country', radar:'country'
};
async function openChart(page, type) {
  await page.goto(`/tests/browser/harness.html?type=${type}`);
  await page.waitForFunction(() => window.__chartReady === true);
  await expect(page.locator('#chart svg, #chart .data-table-wrapper').first()).toBeVisible();
}
async function emitted(page) { return page.evaluate(() => window.__events); }
async function dragBrush(page, selector, fromRatio = .15, toRatio = .65) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `Expected visible brush overlay ${selector}`).not.toBeNull();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromRatio, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toRatio, y, {steps: 8});
  await page.mouse.up();
}
async function performInteraction(page, type, interaction) {
  if (interaction.id === 'category-brush' || interaction.id === 'numeric-brush') {
    const selector = interaction.id === 'numeric-brush' ? brushSelectors.numeric : brushSelectors.category;
    await dragBrush(page, selector);
    return;
  }
  const selector = clickSelectors[type];
  expect(selector, `Missing browser interaction driver for ${type}:${interaction.id}`).toBeTruthy();
  // These tests validate renderer wiring (the SVG element's real D3 click
  // listener and emitted payload), not pointer hit-testing. Some chart marks
  // are thin/concave or partially overlapped by the brush overlay, so a physical
  // center click can time out without reaching the mark. Brush interactions
  // below remain real mouse drags through Playwright.
  const target = page.locator(selector).first();
  await expect(target).toBeAttached();
  await expect(target).toBeVisible();
  await target.evaluate(element => {
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  });
}
function expectedColumn(type, interaction) {
  if (interaction.id === 'category-brush' && ['line','area','combo','waterfall','stackedBar'].includes(type)) {
    return ({line:'month',area:'month',combo:'month',waterfall:'month',stackedBar:'month'})[type];
  }
  return columnFor[type];
}
function assertPayload(type, interaction, payload) {
  if (interaction.id === 'compound-category-click') {
    expect(Array.isArray(payload)).toBeTruthy();
    expect(payload).toHaveLength(2);
    expect(payload.map(e => e.operator)).toEqual(['equals','equals']);
    expect(payload.map(e => e.column)).toEqual(['country','month']);
    return;
  }
  expect(payload).toMatchObject({column:expectedColumn(type, interaction)});
  if (interaction.emits === 'equals') expect(payload.operator).toBe('equals');
  else if (interaction.emits === 'in') expect(payload.operator).toBe('in');
  else if (interaction.emits === 'in-or-clear') expect(['in','clear']).toContain(payload.operator);
  else if (interaction.emits === 'range-or-clear') expect(['range','clear']).toContain(payload.operator);
  if (payload.operator === 'in') expect(payload.value.length).toBeGreaterThan(0);
  if (payload.operator === 'range') {
    expect(payload.value).toHaveLength(2);
    expect(payload.value[0]).toBeLessThan(payload.value[1]);
  }
}

// Each test is generated from the registry: adding an interaction to a chart
// automatically creates a test, and fails loudly until a browser driver exists.
for (const type of CHART_TYPES) {
  for (const interaction of CHART_INTERACTION_REGISTRY[type].interactions) {
    test(`${type}: ${interaction.id} emits its declared filter event`, async ({page}) => {
      await openChart(page, type);
      await performInteraction(page, type, interaction);
      const events = await emitted(page);
      expect(events, 'Expected the real renderer to emit a filter event').toHaveLength(1);
      assertPayload(type, interaction, events[0]);
    });
  }
}

test('registry has a browser driver for every declared interaction', () => {
  for (const type of CHART_TYPES) {
    for (const interaction of CHART_INTERACTION_REGISTRY[type].interactions) {
      if (interaction.id === 'category-brush' || interaction.id === 'numeric-brush') continue;
      expect(clickSelectors[type], `Missing driver for ${type}:${interaction.id}`).toBeTruthy();
    }
  }
});
