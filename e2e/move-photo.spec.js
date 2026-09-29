// Ticket 082: move a photo to another plant from the photo viewer.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  visibleText,
  screenTitle,
  tabButton,
  backButton,
  expectStoredPhotoLoads,
} = require('./helpers');

test('move a photo from plant A to plant B via the lightbox', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const stamp = Date.now();
  const zoneName = `E2E Move Zone ${stamp}`;
  const plantA = `E2E Move Plant A ${stamp}`;
  const plantB = `E2E Move Plant B ${stamp}`;
  const photoDate = '2026-05-01';

  await page.goto('/');
  await expect(visibleText(page, 'Votre jardin')).toBeVisible();
  await tabButton(page, 'Zones').click();
  await expect(screenTitle(page, 'Zones')).toBeVisible();
  await visibleText(page, 'Nouvelle zone').click();
  await page.getByPlaceholder('ex. Massif nord, Balcon').fill(zoneName);
  await visibleText(page, 'Créer la zone').click();
  await expect(screenTitle(page, 'Zones')).toBeVisible();
  await visibleText(page, zoneName).click();

  for (const name of [plantA, plantB]) {
    await visibleText(page, 'Ajouter une plante').click();
    await expect(visibleText(page, 'Nouvelle plante')).toBeVisible();
    await page.getByLabel('Nom de la plante', { exact: true }).fill(name);
    await visibleText(page, zoneName).click();
    await visibleText(page, 'Enregistrer').click();
    await expect(visibleText(page, name)).toBeVisible();
    await backButton(page).click();
  }

  // Open plant A and give it a photo.
  await visibleText(page, plantA).click();
  await visibleText(page, 'Photos').click();
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.getByRole('button', { name: 'Ajouter une photo', exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(path.join(__dirname, 'fixtures', 'test-photo.png'));
  await page.getByPlaceholder('AAAA-MM-JJ').fill(photoDate);
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByLabel(`Photo du ${photoDate}`)).toBeVisible();

  // Lightbox -> Déplacer -> plant B.
  await page.getByLabel(`Photo du ${photoDate}`).click();
  const lightbox = page.getByRole('dialog');
  await lightbox.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(lightbox.getByText('Déplacer la photo', { exact: true })).toBeVisible();
  // The current plant's row is disabled.
  await expect(lightbox.getByRole('button', { name: plantA, exact: true })).toBeDisabled();
  await lightbox.getByRole('button', { name: plantB, exact: true }).click();

  // The lightbox closes (fade-out) and A's Photos tab is empty again.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel(`Photo du ${photoDate}`)).toHaveCount(0);
  await expect(visibleText(page, 'Appuyez pour ajouter une photo').first()).toBeVisible();

  // B's Photos tab has the photo.
  await backButton(page).click();
  await visibleText(page, plantB).click();
  await visibleText(page, 'Photos').click();
  await expect(page.getByLabel(`Photo du ${photoDate}`)).toBeVisible();
  await expectStoredPhotoLoads(page);

  expect(consoleErrors, `console errors: ${JSON.stringify(consoleErrors)}`).toEqual([]);
  expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});
