import {test, expect} from '@playwright/test';

test('a saved import is not loaded automatically after an ordinary reload, but can be restored explicitly', async ({page}) => {
  test.setTimeout(60000);
  await page.goto('/');

  await page.locator('#csv-file').setInputFiles({
    name: 'restore-choice.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('category,value\nalpha,10\nbeta,20\n')
  });
  await expect(page.locator('#csv-import-status')).toContainText('Ready: restore-choice.csv', {timeout: 30000});

  // A plain reload must not silently parse a persisted source from IndexedDB.
  await page.reload();
  await expect(page.locator('#csv-import-status')).toHaveText('Sample dataset loaded');
  await expect(page.locator('#restore-saved-import')).toBeVisible();
  await expect(page.locator('#restore-saved-import')).toContainText('restore-choice.csv');

  // Restoration remains available, but now requires an explicit user action.
  await page.locator('#restore-saved-import').click();
  await expect(page.locator('#csv-import-status')).toContainText('Ready: restore-choice.csv', {timeout: 30000});
});

test('saving annotations restores the currently loaded source across its intentional reload', async ({page}) => {
  test.setTimeout(60000);
  await page.goto('/');

  await page.locator('#csv-file').setInputFiles({
    name: 'annotation-save-source.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('category,value\nalpha,10\nbeta,20\n')
  });
  await expect(page.locator('#csv-import-status')).toContainText('Ready: annotation-save-source.csv', {timeout: 30000});

  await page.locator('#show-annotate-workspace').click();
  await expect(page.locator('#annotation-editor')).toBeVisible();
  await page.getByRole('button', {name: 'Save all metadata'}).click();

  // Saving metadata intentionally reloads the app; unlike an ordinary reload,
  // it must restore the source that was already loaded in this session.
  await expect(page.locator('#csv-import-status')).toContainText('Ready: annotation-save-source.csv', {timeout: 30000});
  await expect(page.locator('#annotation-editor [role="status"]')).toContainText('All column metadata saved', {timeout: 10000});
});
