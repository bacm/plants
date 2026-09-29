// Ticket 085: the "Photo déjà présente" / "Photo déjà classée ailleurs" sheet
// on the sort screen. Two copies of the same library photo are imported (same
// lastModified, size and pixel size, so the same fingerprint); the first is
// filed into a plant, the second triggers the sheet.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { visibleText, screenTitle, tabButton, backButton } = require('./helpers');

const PHOTO = path.join(__dirname, 'fixtures', 'test-photo.png');

function trackErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

// Creates a zone with one plant per name, through the UI.
async function createGarden(page, zoneName, plantNames) {
  await page.goto('/');
  await expect(visibleText(page, 'Votre jardin')).toBeVisible();
  await tabButton(page, 'Zones').click();
  await expect(screenTitle(page, 'Zones')).toBeVisible();
  await visibleText(page, 'Nouvelle zone').click();
  await page.getByPlaceholder('ex. Massif nord, Balcon').fill(zoneName);
  await visibleText(page, 'Créer la zone').click();
  await expect(screenTitle(page, 'Zones')).toBeVisible();
  await visibleText(page, zoneName).click();
  for (const name of plantNames) {
    await visibleText(page, 'Ajouter une plante').click();
    await expect(visibleText(page, 'Nouvelle plante')).toBeVisible();
    await page.getByLabel('Nom de la plante', { exact: true }).fill(name);
    await visibleText(page, zoneName).click();
    await visibleText(page, 'Enregistrer').click();
    await expect(visibleText(page, name)).toBeVisible();
    await backButton(page).click();
  }
}

// Opens /sort and imports the same photo twice.
async function importTwice(page, zoneName) {
  await page.goto('/sort');
  await expect(visibleText(page, 'Tout est trié')).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles([PHOTO, PHOTO]);
  await expect(visibleText(page, '2 photos')).toBeVisible({ timeout: 10000 });
  // The plant list only shows the plants of the selected zone chip.
  await visibleText(page, zoneName).click();
}

async function photoCount(page, zoneName, plantName) {
  await page.goto('/');
  await expect(visibleText(page, 'Votre jardin')).toBeVisible();
  await tabButton(page, 'Zones').click();
  await visibleText(page, zoneName).click();
  await visibleText(page, plantName).click();
  await visibleText(page, 'Photos').click();
  await expect(visibleText(page, 'Mes photos')).toBeVisible();
  // Let a late render settle before counting.
  await page.waitForTimeout(500);
  return page.locator('[aria-label^="Photo du "]:visible').count();
}

test.describe('Duplicate photo warning (ticket 085)', () => {
  test('same plant -> "Remplacer l’ancienne" leaves one photo', async ({ page }) => {
    const errors = trackErrors(page);
    const stamp = Date.now();
    const zoneName = `E2E Dup Zone ${stamp}`;
    const plantName = `E2E Dup Plant ${stamp}`;
    await createGarden(page, zoneName, [plantName]);

    await importTwice(page, zoneName);
    await visibleText(page, plantName).click();
    await expect(visibleText(page, '1 photo')).toBeVisible();
    await visibleText(page, plantName).click();
    await expect(visibleText(page, 'Photo déjà présente')).toBeVisible();

    await page.getByRole('button', { name: 'Remplacer l’ancienne', exact: true }).click();
    await expect(visibleText(page, 'Tout est trié')).toBeVisible();

    expect(await photoCount(page, zoneName, plantName)).toBe(1);
    expect(errors, `console errors: ${JSON.stringify(errors)}`).toEqual([]);
  });

  test('same plant -> "Garder les deux" leaves two photos', async ({ page }) => {
    const errors = trackErrors(page);
    const stamp = Date.now();
    const zoneName = `E2E Dup Zone ${stamp}`;
    const plantName = `E2E Dup Plant ${stamp}`;
    await createGarden(page, zoneName, [plantName]);

    await importTwice(page, zoneName);
    await visibleText(page, plantName).click();
    await expect(visibleText(page, '1 photo')).toBeVisible();
    await visibleText(page, plantName).click();
    await expect(visibleText(page, 'Photo déjà présente')).toBeVisible();

    await page.getByRole('button', { name: 'Garder les deux', exact: true }).click();
    await expect(visibleText(page, 'Tout est trié')).toBeVisible();

    expect(await photoCount(page, zoneName, plantName)).toBe(2);
    expect(errors, `console errors: ${JSON.stringify(errors)}`).toEqual([]);
  });

  test('another plant -> "Garder seulement ici" moves the photo', async ({ page }) => {
    const errors = trackErrors(page);
    const stamp = Date.now();
    const zoneName = `E2E Dup Zone ${stamp}`;
    const plantA = `E2E Dup Plant A ${stamp}`;
    const plantB = `E2E Dup Plant B ${stamp}`;
    await createGarden(page, zoneName, [plantA, plantB]);

    await importTwice(page, zoneName);
    await visibleText(page, plantA).click();
    await expect(visibleText(page, '1 photo')).toBeVisible();
    await visibleText(page, plantB).click();
    await expect(visibleText(page, 'Photo déjà classée ailleurs')).toBeVisible();

    await page.getByRole('button', { name: 'Garder seulement ici', exact: true }).click();
    await expect(visibleText(page, 'Tout est trié')).toBeVisible();

    expect(await photoCount(page, zoneName, plantA)).toBe(0);
    expect(await photoCount(page, zoneName, plantB)).toBe(1);
    expect(errors, `console errors: ${JSON.stringify(errors)}`).toEqual([]);
  });
});
