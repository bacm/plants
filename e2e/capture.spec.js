// Ticket 056: the in-app camera, driven with a fake browser camera stream
// (see playwright.config.js's chromium-fake-camera project, the only one
// this spec runs under).
//
// Scope: create a zone and a plant in it -> open the camera from the tab
// bar's central button -> select the plant in the strip -> shoot -> close ->
// the shot shows up on the plant's Photos tab as a real, decodable image.
const { test, expect } = require('@playwright/test');
const { visibleText, tabButton, backButton, expectStoredPhotoLoads } = require('./helpers');

test.describe('in-app camera (garden walk)', () => {
  test('shoot a photo for a chosen plant -> it lands in the plant Photos tab', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const zoneName = `E2E Capture Zone ${Date.now()}`;
    const plantName = `E2E Capture Plant ${Date.now()}`;

    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();

    // --- Zone + plant to shoot into ---
    await tabButton(page, 'Zones').click();
    await expect(visibleText(page, 'Mes Zones de Jardin')).toBeVisible();
    await visibleText(page, '+ Créer une zone').click();
    await expect(visibleText(page, 'Nouvelle zone')).toBeVisible();
    await page.getByPlaceholder('ex. Massif nord, Balcon').fill(zoneName);
    await visibleText(page, 'Créer la zone').click();
    await expect(visibleText(page, 'Mes Zones de Jardin')).toBeVisible();

    await visibleText(page, zoneName).click();
    await expect(visibleText(page, '+ Ajouter une plante')).toBeVisible();
    await visibleText(page, '+ Ajouter une plante').click();
    await expect(visibleText(page, 'Nouvelle plante')).toBeVisible();
    await page.getByPlaceholder('Nom de la plante *').fill(plantName);
    await visibleText(page, zoneName).click();
    await visibleText(page, 'Enregistrer').click();
    await expect(visibleText(page, plantName)).toBeVisible();

    // plant/[id] is a full-screen route outside the (tabs) group, so the
    // bottom tab bar (and its central camera button) isn't rendered there;
    // go back to the zone detail screen, which is inside (tabs), first.
    await backButton(page).click();
    await expect(visibleText(page, '1 plante')).toBeVisible();

    // --- Open the camera from the tab bar's central button ---
    await page.locator('[aria-label="Prendre une photo"]:visible').click();
    // useCameraPermissions() starts out ungranted until requested; tap
    // "Autoriser", which the fake-camera project's launch flags
    // (--use-fake-ui-for-media-stream) auto-accept with no real prompt.
    await visibleText(page, 'Autoriser').click();
    await expect(page.locator('[aria-label="Fermer l’appareil photo"]:visible')).toBeVisible();

    // The camera opened straight to "Sans zone" (no zone remembered yet):
    // switch to the zone the plant is in.
    await visibleText(page, zoneName).click();
    await visibleText(page, plantName).click();

    // --- Shoot ---
    await page.locator('[aria-label="Déclencher"]:visible').click();
    await expect(visibleText(page, `${plantName} · 1`)).toBeVisible();

    // --- Close the camera and check the plant's Photos tab ---
    // Closing falls back to the dashboard here rather than the zone detail
    // it was opened from: a documented app defect (see
    // e2e/web-smoke.spec.js) leaves expo-router unable to go back after an
    // earlier router.replace() (app/plant/new.js's save), which app/capture.js
    // handles the same way -- router.replace('/(tabs)') -- rather than throw.
    await page.locator('[aria-label="Fermer l’appareil photo"]:visible').click();
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
