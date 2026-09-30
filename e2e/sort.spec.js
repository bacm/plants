// Ticket 061: the "À trier" screen -- import two photos from the (fake, on
// web) photo library via the camera screen's "Galerie" button (the one
// always-visible entry point: the badge next to it, and the dashboard's own
// card, only show once there is something to sort), assign one to a plant,
// delete the other, then check the assigned photo actually landed on the
// plant and the screen goes back to its empty state.
//
// Runs under the chromium-fake-camera project (see playwright.config.js):
// reaching "Galerie" means opening the camera screen first, same as
// capture.spec.js.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { mockAuthApi } = require('./helpers');

// The web app is gated behind a login (ticket 101): start every test signed in.
test.beforeEach(async ({ context }) => {
  await mockAuthApi(context);
});
const {
  visibleText,
  screenTitle,
  tabButton,
  backButton,
  expectStoredPhotoLoads,
} = require('./helpers');

test.describe('À trier (sort + import)', () => {
  test('import two photos -> assign one, delete the other -> photo shows on the plant', async ({
    page,
  }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    // "Supprimer" (removeCurrent) confirms via window.confirm on web
    // (lib/dialogs.js) -- accept it, same as the backup e2e test.
    page.on('dialog', (d) => d.accept());

    const zoneName = `E2E Sort Zone ${Date.now()}`;
    const plantName = `E2E Sort Plant ${Date.now()}`;

    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();

    // --- Zone + plant to assign a photo to ---
    await tabButton(page, 'Zones').click();
    await expect(screenTitle(page, 'Zones')).toBeVisible();
    await visibleText(page, 'Nouvelle zone').click();
    await expect(visibleText(page, 'Nouvelle zone')).toBeVisible();
    await page.getByPlaceholder('ex. Massif nord, Balcon').fill(zoneName);
    await visibleText(page, 'Créer la zone').click();
    await expect(screenTitle(page, 'Zones')).toBeVisible();

    await visibleText(page, zoneName).click();
    await expect(visibleText(page, 'Ajouter une plante')).toBeVisible();
    await visibleText(page, 'Ajouter une plante').click();
    await expect(visibleText(page, 'Nouvelle plante')).toBeVisible();
    await page.getByLabel('Nom de la plante', { exact: true }).fill(plantName);
    await visibleText(page, zoneName).click();
    await visibleText(page, 'Enregistrer').click();
    await expect(visibleText(page, plantName)).toBeVisible();

    // --- Open the camera screen just for its "Galerie" button ---
    // plant/[id] is a full-screen route outside the (tabs) group, so the
    // bottom tab bar isn't rendered there; go back to the zone detail
    // screen first, same as capture.spec.js.
    await backButton(page).click();
    await expect(visibleText(page, '1 plante')).toBeVisible();
    await page.locator('[aria-label="Prendre une photo"]:visible').click();
    await visibleText(page, 'Autoriser').click();
    await expect(page.locator('[aria-label="Fermer l’appareil photo"]:visible')).toBeVisible();

    // --- Import two photos from the library ---
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await page.locator('[aria-label="Importer de la galerie"]:visible').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      path.join(__dirname, 'fixtures', 'test-photo.png'),
      path.join(__dirname, 'fixtures', 'test-photo.png'),
    ]);

    // openGallery (app/capture.js) navigates to /sort once the import
    // finishes.
    await expect(visibleText(page, 'À trier')).toBeVisible({ timeout: 10000 });
    await expect(visibleText(page, '2 photos')).toBeVisible({ timeout: 10000 });

    // --- Ticket 086: the photo opens full screen, and closes again ---
    await page.getByRole('button', { name: 'Afficher la photo en plein écran' }).click();
    const viewer = page.getByRole('dialog');
    await expect(viewer.getByLabel('Photo 1 sur 2, plein écran')).toBeVisible();
    await viewer.getByRole('button', { name: 'Retour', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // --- Assign the photo shown to the plant just created ---
    await visibleText(page, zoneName).click();
    await visibleText(page, plantName).click();
    await expect(visibleText(page, '1 photo')).toBeVisible();

    // --- Delete the one still left ---
    await visibleText(page, 'Supprimer').click();
    await expect(visibleText(page, 'Tout est trié')).toBeVisible();

    // --- The assigned photo is really on the plant ---
    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    await tabButton(page, 'Zones').click();
    await visibleText(page, zoneName).click();
    await visibleText(page, plantName).click();
    await visibleText(page, 'Photos').click();
    await expect(visibleText(page, 'Mes photos')).toBeVisible();
    await expect(page.locator('img:visible').first()).toBeVisible();
    await expectStoredPhotoLoads(page);

    expect(consoleErrors, `console errors: ${JSON.stringify(consoleErrors)}`).toEqual([]);
  });
});
