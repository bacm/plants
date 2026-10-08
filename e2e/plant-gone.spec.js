// Ticket 134: "Marquer comme disparue" keeps a plant (and its history) but hides
// it from the library until the "Disparues" filter is on; the sheet shows a
// "Disparue le …" banner with "Restaurer".
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText, tabButton } = require('./helpers');

test.beforeEach(async ({ context, page }) => {
  await mockAuthApi(context);
  await page.setViewportSize({ width: 390, height: 844 });
});

test('mark a plant as gone, find it under Disparues, restore it', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  const plantName = `E2E Gone ${Date.now()} Rosier`;

  await page.goto('/');
  await expect(visibleText(page, 'Votre jardin')).toBeVisible();
  await tabButton(page, 'Bibliothèque').click();
  await page.getByLabel('Ajouter une plante').click();
  await page.getByLabel('Nom de la plante', { exact: true }).fill(plantName);
  await visibleText(page, 'Enregistrer').click();
  await expect(visibleText(page, plantName)).toBeVisible();

  // Mark it gone: an invalid date keeps the form open.
  await visibleText(page, 'Actions').click();
  await page.getByRole('button', { name: 'Marquer comme disparue' }).click();
  const dateField = page.getByLabel('Date de disparition');
  await expect(dateField).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await dateField.fill('hier');
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(visibleText(page, 'Date au format AAAA-MM-JJ')).toBeVisible();
  await dateField.fill('2026-09-30');
  await page.getByRole('button', { name: 'Confirmer' }).click();

  // The sheet shows the banner and no longer offers the action.
  await expect(page.getByTestId('gone-banner')).toContainText('Disparue le 30 septembre 2026');
  await expect(page.getByRole('button', { name: 'Marquer comme disparue' })).toHaveCount(0);

  // Gone from the library, present under "Disparues".
  await page.goto('/');
  await tabButton(page, 'Bibliothèque').click();
  await expect(visibleText(page, plantName)).toHaveCount(0);
  await page.getByRole('button', { name: 'Disparues' }).click();
  await expect(visibleText(page, plantName)).toBeVisible();

  // Open the sheet from there and restore.
  await visibleText(page, plantName).click();
  await expect(page.getByTestId('gone-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.getByTestId('gone-banner')).toHaveCount(0);

  await page.goto('/');
  await tabButton(page, 'Bibliothèque').click();
  await expect(visibleText(page, plantName)).toBeVisible();
  await page.getByRole('button', { name: 'Disparues' }).click();
  await expect(visibleText(page, 'Aucune plante disparue.')).toBeVisible();

  expect(pageErrors).toEqual([]);
});
