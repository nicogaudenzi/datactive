import {test, expect} from '@playwright/test';

async function openChart(page, type) {
  await page.goto(`/tests/browser/harness.html?type=${type}`);
  await page.waitForFunction(() => window.__chartReady === true);
  await expect(page.locator('#chart svg').first()).toBeVisible();
}
async function emitted(page) { return page.evaluate(() => window.__events); }
async function filters(page) { return page.evaluate(() => window.__activeFilters()); }
async function clickRealMark(page, selector) {
  const mark = page.locator(selector).first();
  await expect(mark).toBeAttached();
  await expect(mark).toBeVisible();
  await mark.evaluate(el => el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window})));
}

test('stacked-bar segment click emits the stack dimension and selected stack value', async ({page}) => {
  await openChart(page, 'stackedBar');
  await clickRealMark(page, '.stacked-bar-group rect');
  const events = await emitted(page);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({column:'country', operator:'equals'});
  expect(['US','MX','CA','UK']).toContain(events[0].value);
});

test('scatter point click filters by the source X value, not screen coordinates', async ({page}) => {
  await openChart(page, 'scatter');
  const point = page.locator('#chart circle').first();
  const title = await point.locator('title').textContent();
  const expected = Number(title.match(/revenue: ([^\n]+)/)?.[1]);
  expect(Number.isFinite(expected)).toBeTruthy();
  await clickRealMark(page, '#chart circle');
  expect(await emitted(page)).toEqual([{column:'revenue',operator:'equals',value:expected}]);
});

test('applying filters from different columns preserves both and clearing one preserves the other', async ({page}) => {
  await openChart(page, 'stackedBar');
  await clickRealMark(page, '.stacked-bar-group rect');
  const stackEvent = (await emitted(page))[0];
  await page.evaluate(event => window.__applyInteraction(event), stackEvent);

  await page.evaluate(() => { window.__events = []; });
  // Use the real scatter renderer in a second chart container on the same page,
  // sharing the same event sink and FilterStore as the first renderer.
  await page.evaluate(() => {
    const container = document.createElement('div');
    container.id = 'second-chart';
    container.style.cssText = 'width:760px;height:460px;';
    document.body.appendChild(container);
    const rows = window.__fixtureRows;
    const chart = new window.__chartClasses.ScatterChart(container, {
      type:'scatter', query:{xColumn:'revenue',yColumn:'cost'}, data:rows
    }, {onFilter: payload => window.__events.push(payload)});
    chart.renderData(rows);
    window.__secondChart = chart;
  });
  await clickRealMark(page, '#second-chart circle');
  const scatterEvent = (await emitted(page))[0];
  expect(scatterEvent.column).toBe('revenue');
  await page.evaluate(event => window.__applyInteraction(event), scatterEvent);

  const active = await filters(page);
  expect(active).toHaveLength(2);
  expect(active).toContainEqual(stackEvent);
  expect(active).toContainEqual(scatterEvent);

  await page.evaluate(column => window.__filterStore.removeFilter(column), scatterEvent.column);
  expect(await filters(page)).toEqual([stackEvent]);
});
