import {test, expect} from '@playwright/test';

test('clicking one chart filters the data rendered in another chart and clearing restores it', async ({page}) => {
  await page.goto('/tests/browser/cross-chart-e2e.html');
  await page.waitForFunction(() => window.__crossChartReady === true);

  const dependent = page.locator('#dependent-chart');
  await expect(dependent.locator('.tick text', {hasText:'Jan'})).toBeVisible();
  await expect(dependent.locator('.tick text', {hasText:'Feb'})).toBeVisible();
  await expect(dependent.locator('.tick text', {hasText:'Mar'})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__renderedDependentData.length)).toBe(3);

  const usBar = page.locator('#source-chart [data-interaction-target="category-click"]').first();
  await expect(usBar).toBeVisible();
  await usBar.evaluate(element => element.dispatchEvent(new MouseEvent('click', {
    bubbles:true, cancelable:true, view:window
  })));

  await expect.poll(() => page.evaluate(() => window.__crossChartFilters())).toEqual([
    {column:'country', operator:'equals', value:'US'}
  ]);
  await expect.poll(() => page.evaluate(() => window.__renderedDependentData)).toEqual([
    {month:'Jan', revenue:10}, {month:'Feb', revenue:20}
  ]);
  await expect(dependent.locator('.tick text', {hasText:'Jan'})).toBeVisible();
  await expect(dependent.locator('.tick text', {hasText:'Feb'})).toBeVisible();
  await expect(dependent.locator('.tick text', {hasText:'Mar'})).toHaveCount(0);

  await page.evaluate(() => window.__clearCrossChartFilters());
  await expect.poll(() => page.evaluate(() => window.__crossChartFilters())).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__renderedDependentData.length)).toBe(3);
  await expect(dependent.locator('.tick text', {hasText:'Mar'})).toBeVisible();
});
