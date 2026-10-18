import {test, expect} from '@playwright/test';

test('creates a choropleth from saved geographic mappings and supports region filtering', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: '3. Annotate'}).click();
  await page.getByLabel('country geographic role').selectOption('country');
  await page.getByRole('button', {name: 'Save all metadata'}).click();
  await expect(page.locator('#show-maps-workspace')).toBeEnabled();

  await page.getByRole('button', {name: '4. Maps'}).click();
  await page.getByRole('button', {name: 'Suggest exact matches'}).click();
  await page.getByRole('button', {name: 'Save region mappings'}).click();
  await expect(page.getByRole('status').filter({hasText: 'Saved 3 region assignments'})).toBeVisible();

  await page.getByRole('button', {name: '5. Dashboard'}).click();
  await page.locator('#add-chart').click();
  await page.locator('#chart-type').selectOption('map');
  await page.locator('#map-geographic-column').selectOption('country');
  await page.locator('#map-definition').selectOption('north-america-countries');
  await page.locator('#map-measure').selectOption('revenue');
  await page.locator('#map-aggregation').selectOption('sum');
  await page.locator('#chart-title').fill('Revenue by country map');
  await page.locator('#chart-submit').click();

  const widget = page.locator('#dashboard .grid-stack-item').filter({hasText: 'Revenue by country map'});
  await expect(widget).toHaveCount(1);
  await expect(widget.locator('.map-chart-svg .map-region')).toHaveCount(3);
  await expect(widget.locator('.map-chart-svg path.map-region')).toHaveCount(3);
  for (const path of await widget.locator('.map-chart-svg path.map-region').all()) {
    await expect(path).toHaveAttribute('d', /M.+/);
  }
  await expect(widget.locator('.map-chart-summary')).toContainText('3 of 3 regions with data');
  await widget.locator('path.map-region[data-region-id="country-mexico"]').click();
  await expect(page.locator('#filter-count')).toHaveText('1');
  await expect(page.locator('#active-filters .filter-chip')).toContainText('country:');
});
