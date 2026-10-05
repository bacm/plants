// Picking several photos at once from a plant's "Ajouter une photo" gallery
// option: all are added, each with its own original date (the web File's
// lastModified, see lib/originalPhotoDate.js), without asking for a date.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText, screenTitle, tabButton } = require('./helpers');

test.beforeEach(async ({ context }) => {
  await mockAuthApi(context);
});

const PHOTO = path.join(__dirname, 'fixtures', 'test-photo.png');

function localDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('adds several gallery photos to a plant in one go', async ({ page }) => {
  const zoneName = `E2E Multi Zone ${Date.now()}`;
  const plantName = `E2E Multi Plant ${Date.now()}`;

  await page.goto('/');
  await expect(visibleText(page, 'Votre jardin')).toBeVisible();
  await tabButton(page, 'Zones').click();
  await expect(screenTitle(page, 'Zones')).toBeVisible();
  await visibleText(page, 'Nouvelle zone').click();
  await page.getByPlaceholder('ex. Massif nord, Balcon').fill(zoneName);
  await visibleText(page, 'Créer la zone').click();
  await expect(screenTitle(page, 'Zones')).toBeVisible();
  await visibleText(page, zoneName).click();
  await visibleText(page, 'Ajouter une plante').click();
  await expect(visibleText(page, 'Nouvelle plante')).toBeVisible();
  await page.getByLabel('Nom de la plante', { exact: true }).fill(plantName);
  await visibleText(page, zoneName).click();
  await visibleText(page, 'Enregistrer').click();
  await expect(visibleText(page, plantName)).toBeVisible();

  await visibleText(page, 'Photos').click();
  await expect(visibleText(page, 'Mes photos')).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.getByRole('button', { name: 'Ajouter une photo', exact: true }).click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([PHOTO, PHOTO]);

  await expect(visibleText(page, '2 photos')).toBeVisible();
  await expect(visibleText(page, 'Chaque photo garde sa date de prise de vue.')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

  const fileDate = localDate(fs.statSync(PHOTO).mtimeMs);
  await expect(page.locator(`[aria-label="Photo du ${fileDate}"]:visible`)).toHaveCount(2);
});
