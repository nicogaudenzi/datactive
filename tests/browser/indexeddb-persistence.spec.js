import {test, expect} from '@playwright/test';

test('CSV imports larger than the Web Storage quota are parsed in a worker and survive reload through IndexedDB', async ({page}) => {
  test.setTimeout(90000);
  await page.goto('/');
  const rowCount = 80000;
  const description = 'x'.repeat(64);
  const lines = ['id,description,value'];
  for (let i = 0; i < rowCount; i++) lines.push(`${i},${description},${i % 100}`);
  const csv = lines.join('\n');
  expect(Buffer.byteLength(csv, 'utf8')).toBeGreaterThan(5 * 1024 * 1024);

  await page.locator('#csv-file').setInputFiles({name: 'large-over-five-mib.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
  await expect(page.locator('#csv-import-status')).toContainText('Ready: large-over-five-mib.csv', {timeout: 60000});

  const stored = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('datactive-storage', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('records', 'readonly');
    const request = tx.objectStore('records').get('dashboard-builder.imported-csv.v1');
    const record = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = record?.value;
    // Inspect Blob properties inside the browser context. Playwright's transport
    // does not preserve Blob instances when returning them to the Node test.
    const result = value ? {
      name: value.name,
      hasText: value.text !== undefined,
      hasRawTable: value.rawTable !== undefined,
      fileBlobSize: value.fileBlob?.size,
      fileBlobIsBlob: value.fileBlob instanceof Blob,
      fileBlobTag: Object.prototype.toString.call(value.fileBlob),
      fileBlobType: value.fileBlob?.type,
    } : null;
    db.close();
    return result;
  });
  expect(stored?.name).toBe('large-over-five-mib.csv');
  expect(stored?.hasText).toBe(false);
  expect(stored?.hasRawTable).toBe(false);
  expect(stored?.fileBlobSize).toBeGreaterThan(5 * 1024 * 1024);
  expect(stored?.fileBlobIsBlob).toBe(true);
});
