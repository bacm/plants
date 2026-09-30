// Ticket 088: choose a plant's cover photo from the lightbox; the plant detail
// hero then shows it instead of the newest photo.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { visibleText, screenTitle, tabButton } = require('./helpers');

test('choose an older photo as the plant cover from the lightbox', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const stamp = Date.now();
  const zoneName = `E2E Cover Zone ${stamp}`;
  const plantName = `E2E Cover Plant ${stamp}`;

  await page.goto('/');
  await expect(visibleText(page, 'Votre jardin')).toBeVisible();
  await tabButton(page, 'Zones').click();
  await expect(screenTitle(page, 'Zones')).toBeVisible();
  await visibleText(page, 'Nouvelle zone').click();
  await page.getByPlaceholder('ex. Massif nord, Balcon').fill(zoneName);
  await visibleText(page, 'Créer la zone').click();
  await visibleText(page, zoneName).click();
  await visibleText(page, 'Ajouter une plante').click();
  await page.getByLabel('Nom de la plante', { exact: true }).fill(plantName);
  await visibleText(page, zoneName).click();
  await visibleText(page, 'Enregistrer').click();
  await expect(visibleText(page, plantName)).toBeVisible();

  await visibleText(page, 'Photos').click();
  for (const date of ['2026-05-01', '2026-04-01']) {
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await page.getByRole('button', { name: 'Ajouter une photo', exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'fixtures', 'test-photo.png'));
    await page.getByPlaceholder('AAAA-MM-JJ').fill(date);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByLabel(`Photo du ${date}`)).toBeVisible();
    // Let the date modal fully close so the next fill hits the new one.
    await expect(page.getByPlaceholder('AAAA-MM-JJ')).toHaveCount(0);
  }

  const hero = page.locator('img:visible').first();
  const heroSrcBefore = await hero.getAttribute('src');

  await page.getByLabel('Photo du 2026-04-01').click();
  const lightbox = page.getByRole('dialog');
  await lightbox.getByRole('button', { name: "Choisir comme photo d'accueil" }).click();
  await expect(
    lightbox.getByRole('button', { name: "Retirer comme photo d'accueil" })
  ).toBeVisible();
  await lightbox.getByRole('button', { name: 'Retour', exact: true }).click();
  await expect(lightbox).toHaveCount(0);

  // The April thumbnail is now the plant's cover, so the hero shows it.
  const aprilSrc = await page.getByLabel('Photo du 2026-04-01').locator('img').getAttribute('src');
  const maySrc = await page.getByLabel('Photo du 2026-05-01').locator('img').getAttribute('src');
  expect(heroSrcBefore).toBe(maySrc);
  await expect(hero).toHaveAttribute('src', aprilSrc);

  expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});
