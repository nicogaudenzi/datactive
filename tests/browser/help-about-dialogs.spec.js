import {test, expect} from '@playwright/test';

test('Help and About open accessible modal panels and can be dismissed', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('button', {name: 'Help', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'About', exact: true})).toBeVisible();
  const headerButtons = await page.locator('.header-actions > button').allTextContents();
  expect(headerButtons.slice(0, 5)).toEqual(['Start fresh', 'Import Interrogation', 'Export Interrogation', 'Help', 'About']);

  await page.getByRole('button', {name: 'Help', exact: true}).click();
  const help = page.getByRole('dialog', {name: 'Datactive Help'});
  await expect(help).toBeVisible();
  for (const heading of ['1. Import Data', '2. Profile / Prepare', '3. Annotate', '4. Maps', '5. Dashboard']) {
    await expect(help.getByRole('heading', {name: heading, exact: true})).toBeVisible();
  }
  await help.getByRole('button', {name: 'Close help'}).click();
  await expect(help).not.toBeVisible();

  await page.getByRole('button', {name: 'About', exact: true}).click();
  const about = page.getByRole('dialog', {name: 'About Datactive'});
  await expect(about).toBeVisible();
  await expect(about.getByRole('heading', {name: 'Features'})).toBeVisible();
  await expect(about.getByRole('link', {name: 'Nico Gaudenzi'})).toHaveAttribute('href', 'https://nicogaudenzi.com');
  await expect(about.getByRole('heading', {name: 'Contribute', exact: true})).toBeVisible();
  await expect(about.getByRole('link', {name: 'Buy Me a Coffee'})).toHaveAttribute('href', 'https://buymeacoffee.com/nicogaudene');
  await about.getByRole('button', {name: 'Close about'}).click();
  await expect(about).not.toBeVisible();
});
