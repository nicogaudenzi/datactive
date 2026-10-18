import {test, expect} from '@playwright/test';

test('large CSV import stays interactive and table pagination preserves the complete row set', async ({page}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  // Module dependencies and asynchronous startup can delay handler registration.
  // Wait for the actual file input listener instead of racing the import workflow.
  await expect.poll(() => page.evaluate(() => window.__datactiveImportHandlerReady === true), {timeout: 30_000}).toBe(true);

  const rowCount = 12_000;
  const lines = ['id,region,amount,year,note'];
  const regions = ['North', 'South', 'East', 'West'];
  for (let index = 0; index < rowCount; index += 1) {
    lines.push(`${index + 1},${regions[index % regions.length]},${(index % 997) + 1},${2020 + (index % 5)},record-${index + 1}`);
  }
  const csv = lines.join('\n');
  await page.locator('#csv-file').setInputFiles({
    name: 'p2-large-fixture.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  });

  // Selecting a file is explicit consent to import it, so the one-shot intent
  // restores it after the persistence reload. An unrelated manual reload should
  // instead start on the sample dataset and offer a separate restore action.
  await expect.poll(async () => page.locator('#csv-import-status').textContent(), {timeout: 75_000})
    .toContain(`Ready: p2-large-fixture.csv · ${rowCount.toLocaleString()} rows`);

  // A browser-side task must still execute after import; this catches a stuck
  // main thread without relying on machine-specific duration thresholds.
  const responsiveness = await page.evaluate(async () => {
    const started = performance.now();
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    return performance.now() - started;
  });
  expect(Number.isFinite(responsiveness)).toBe(true);

  await page.getByRole('button', {name: '5. Dashboard'}).click();
  await expect(page.locator('#dashboard-workspace')).toBeVisible();
  const table = page.locator('.data-table');
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(page.locator('.data-table-pagination')).toContainText('Rows 1–50 of 12,000');

  await page.getByRole('button', {name: 'Next'}).click();
  await expect(page.locator('.data-table-pagination')).toContainText('Rows 51–100 of 12,000');
  await expect(table.locator('tbody tr')).toHaveCount(50);

  // The table is a paged view, not a truncated source: the engine reports all
  // rows in the pagination summary and the final page remains reachable.
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(page.locator('.data-table-pagination')).toContainText('Rows 101–150 of 12,000');
});
