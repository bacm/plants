// Ticket 087: swipe between a plant's photos in the lightbox. On web the
// swipe is a horizontal scroll of the pager, done here by setting scrollLeft.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { mockAuthApi } = require('./helpers');

// The web app is gated behind a login (ticket 101): start every test signed in.
test.beforeEach(async ({ context }) => {
  await mockAuthApi(context);
});
const { visibleText, screenTitle, tabButton } = require('./helpers');

test('swipe from one photo of a plant to the next in the lightbox', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const stamp = Date.now();
  const zoneName = `E2E Swipe Zone ${stamp}`;
  const plantName = `E2E Swipe Plant ${stamp}`;

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

  // Newest first: the May photo opens as 1 / 2.
  await page.getByLabel('Photo du 2026-05-01').click();
  const lightbox = page.getByRole('dialog');
  await expect(lightbox.getByText('1 mai 2026 · 1 / 2')).toBeVisible();

  await lightbox.evaluate((root) => {
    const pager = [...root.querySelectorAll('div')].find(
      (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'hidden'
    );
    pager.scrollLeft = pager.clientWidth;
  });
  await expect(lightbox.getByText('1 avril 2026 · 2 / 2')).toBeVisible();

  expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});
