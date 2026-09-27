// Ticket 034: exercise the web build end to end in a real browser, the way a
// developer would by hand, and fail on any console error along the way.
//
// Scope: create a zone -> create a plant in it (name + zone only, no AI
// search since the search server isn't running here) -> edit the plant ->
// add a care log -> see it all from the zones tab -> reload and confirm it
// survived (lib/db.web.js persists to localStorage).
//
// Ticket 036 adds a second test below covering the photo flow: on web,
// expo-image-picker's gallery option opens a hidden `<input type="file">`
// that Playwright can drive with `filechooser` + `setFiles` -- see that
// test for what it actually found.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');

// expo-router keeps previous stack screens (the tabs navigator, a zone's
// detail screen, ...) mounted-but-hidden when you navigate forward, so text
// that also appears on an earlier screen (a zone or plant name, shown on
// several screens) can match more than one element. Scope to the one that is
// actually rendered on screen right now.
function visibleText(page, text) {
  return page.locator(`:text-is(${JSON.stringify(text)}):visible`);
}

// A photo row can survive a reload while its image does not (ticket 044: web
// stored a blob: URL that died with the page). Assert real, decodable bytes.
async function expectStoredPhotoLoads(page) {
  await page.waitForFunction(
    () =>
      [...document.images].some(
        (img) => img.src.startsWith('data:') && img.complete && img.naturalWidth > 0
      ),
    null,
    { timeout: 10000 }
  );
}

test.describe('web smoke', () => {
  test('zone -> plant -> edit -> care log -> reload survives', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    const zoneName = `E2E Zone ${Date.now()}`;
    const plantName = `E2E Plant ${Date.now()}`;
    const editedLatinName = 'Testus latinus';

    // --- Dashboard loads ---
    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();

    // --- Create a zone ---
    await visibleText(page, 'Zones').click();
    await expect(visibleText(page, 'Mes Zones de Jardin')).toBeVisible();
    await visibleText(page, '+ Créer une zone').click();

    await expect(visibleText(page, 'Nouvelle zone')).toBeVisible();
    await page.getByPlaceholder('ex. Massif nord, Balcon').fill(zoneName);
    await visibleText(page, 'Créer la zone').click();

    // Back on the zones list, the new zone is there.
    await expect(visibleText(page, 'Mes Zones de Jardin')).toBeVisible();
    await expect(visibleText(page, zoneName)).toBeVisible();

    // --- Create a plant in that zone ---
    await visibleText(page, zoneName).click();
    await expect(visibleText(page, '+ Ajouter une plante')).toBeVisible();
    await visibleText(page, '+ Ajouter une plante').click();

    await expect(visibleText(page, 'Nouvelle plante')).toBeVisible();
    await page.getByPlaceholder('Nom de la plante *').fill(plantName);
    // Zone pills only render once zones have loaded; select ours (no AI
    // search -- the search server is not running for this test).
    await visibleText(page, zoneName).click();
    await visibleText(page, 'Enregistrer').click();

    // Plant detail screen (Info tab).
    await expect(visibleText(page, plantName)).toBeVisible();

    // --- Edit the plant: change one field ---
    await visibleText(page, 'Modifier la fiche').click();
    await expect(visibleText(page, 'Modifier')).toBeVisible();
    await page.getByPlaceholder('Nom latin (optionnel)').fill(editedLatinName);
    await visibleText(page, 'Enregistrer').click();

    // Back on the detail screen, the edited field shows.
    await expect(visibleText(page, plantName)).toBeVisible();
    await expect(visibleText(page, editedLatinName)).toBeVisible();

    // --- Add a care log ---
    await visibleText(page, 'Actions').click();
    await visibleText(page, '+ Log').click();
    await expect(visibleText(page, 'Enregistrer un soin')).toBeVisible();
    // Default care type ('Arrosé') and today's date are prefilled; just save.
    await visibleText(page, 'Enregistrer').click();

    // Back on detail; switch to Actions to see the new history entry.
    await visibleText(page, 'Actions').click();
    await expect(visibleText(page, 'Arrosé')).toBeVisible();

    // --- Zones tab shows the zone with its plant ---
    // plant/[id] is a full-screen route outside the (tabs) group, so the
    // bottom tab bar isn't rendered here; go back through the stack to reach
    // it instead of trying to tap a "Zones" tab that doesn't exist yet.
    //
    // APP DEFECT found by this test (reported, not fixed -- see ticket 034's
    // report): tapping "‹ Retour" here is a no-op. It works fine on a plant
    // detail screen reached straight from creation, but once you've edited
    // the plant and/or logged a care entry -- both of which save via
    // router.replace(`/plant/${id}`) -- router.back() from that same screen
    // does nothing: URL and screen stay put. The browser's own back button
    // (history.back()) *does* navigate correctly at that exact point, so
    // expo-router's in-memory stack has desynced from actual history after
    // the replace() calls. Since the tab bar isn't rendered on this route
    // either, a user who edits or logs care has no way back to the zones
    // list. Asserting the intended behaviour so this fails loudly.
    await visibleText(page, '‹ Retour').click(); // plant detail -> zone detail
    // "N plante(s)" only renders on the zone detail screen, so unlike the
    // plant/zone names (shown on the still-unmoved plant detail too) it
    // actually proves the navigation happened.
    await expect(visibleText(page, '1 plante')).toBeVisible();
    await visibleText(page, '← Retour').click(); // zone detail -> zones list (tab)
    await expect(visibleText(page, 'Mes Zones de Jardin')).toBeVisible();
    await expect(visibleText(page, zoneName)).toBeVisible();
    await expect(visibleText(page, plantName)).toBeVisible();

    // --- Reload: everything persisted (lib/db.web.js -> localStorage) ---
    await page.reload();
    await expect(visibleText(page, 'Mes Zones de Jardin')).toBeVisible();
    await expect(visibleText(page, zoneName)).toBeVisible();
    await expect(visibleText(page, plantName)).toBeVisible();

    await visibleText(page, zoneName).click();
    await expect(visibleText(page, plantName)).toBeVisible();

    // --- Delete the zone: a confirmation-driven deletion (ticket 042) ---
    // window.confirm() on web; accept the browser-native dialog.
    page.once('dialog', (d) => d.accept());
    await visibleText(page, 'Supprimer la zone').click();
    await expect(visibleText(page, 'Mes Zones de Jardin')).toBeVisible();
    await expect(visibleText(page, zoneName)).toHaveCount(0);

    // No console errors or uncaught exceptions anywhere in the flow.
    expect(consoleErrors, `console errors: ${JSON.stringify(consoleErrors)}`).toEqual([]);
    expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });

  // Ticket 036: add a photo with a chosen date and confirm it survives a
  // reload. Sets up its own zone/plant rather than reusing the test above so
  // this one can be run in isolation.
  test('add a photo with a chosen date -> photos tab -> reload survives', async ({ page }) => {
    const zoneName = `E2E Photo Zone ${Date.now()}`;
    const plantName = `E2E Photo Plant ${Date.now()}`;
    const photoDate = '2026-05-01';

    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();

    await visibleText(page, 'Zones').click();
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

    // --- Photos tab: add a photo from the gallery, with a chosen date ---
    await visibleText(page, 'Photos').click();
    await expect(visibleText(page, 'Mes photos')).toBeVisible();

    // showAddPhotoOptions() (app/plant/[id].js) calls lib/dialogs.js's
    // choose(), which on web resolves `webKey` ('gallery') directly with no
    // dialog (ticket 042) and goes straight into
    // ImagePicker.launchImageLibraryAsync(), which opens a hidden
    // `<input type="file">` -- Playwright sees this as a `filechooser` event.
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await visibleText(page, '+ Ajouter').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'fixtures', 'test-photo.png'));

    // Photo date modal: clear the prefilled today's date, set a specific one.
    await expect(visibleText(page, 'Date de la photo')).toBeVisible();
    const dateInput = page.getByPlaceholder('AAAA-MM-JJ');
    await dateInput.fill(photoDate);
    await visibleText(page, 'Ajouter').click();

    // The photo now shows in the timeline with the chosen date.
    await expect(visibleText(page, photoDate)).toBeVisible();

    // --- Reload: the photo (and its date) survived ---
    // plant/[id] is a full-screen route outside the (tabs) group (see the
    // comment on the first test above), so reloading lands back on this
    // same detail screen directly -- no need to navigate from the zones
    // list again, just reselect the Photos tab.
    await page.reload();
    await expect(visibleText(page, plantName)).toBeVisible();
    await visibleText(page, 'Photos').click();
    await expect(visibleText(page, photoDate)).toBeVisible();
    await expectStoredPhotoLoads(page);
  });

  // Ticket 020: export the garden, delete a plant, then restore it (photo
  // included) by importing the file just downloaded.
  test('export -> delete a plant -> import the backup restores it', async ({ page }) => {
    const zoneName = `E2E Backup Zone ${Date.now()}`;
    const plantName = `E2E Backup Plant ${Date.now()}`;

    // showMessage/confirm (lib/dialogs.js) use window.alert/window.confirm on
    // web, which are native browser dialogs -- not part of the DOM, so their
    // text can't be asserted with a locator. This test only needs every one
    // of them accepted (confirm to replace the garden, delete confirmations,
    // and the final result alert); record the messages instead, so the
    // import result can still be asserted on.
    const dialogMessages = [];
    page.on('dialog', async (d) => {
      dialogMessages.push(d.message());
      await d.accept();
    });

    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();

    // --- Zone + plant + photo, same as the earlier tests ---
    await visibleText(page, 'Zones').click();
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

    await visibleText(page, 'Photos').click();
    await expect(visibleText(page, 'Mes photos')).toBeVisible();
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await visibleText(page, '+ Ajouter').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'fixtures', 'test-photo.png'));
    await expect(visibleText(page, 'Date de la photo')).toBeVisible();
    const photoDate = new Date().toISOString().slice(0, 10);
    await visibleText(page, 'Ajouter').click();
    // Wait for the photo to actually be persisted before exporting -- addPhoto
    // is async, and navigating away too soon would export a garden that
    // still has zero photos in it.
    await expect(visibleText(page, photoDate)).toBeVisible();

    // --- Réglages: export the whole garden ---
    //
    // expo-image-picker's web implementation hands back a `blob:` object URL
    // (no `base64: true` is passed anywhere the app calls it), and a `blob:`
    // URL is only valid for the document that created it -- a hard
    // navigation (page.goto) tears it down. exportGarden fetches it while
    // it's still live, so getting there has to stay client-side routing
    // (clicks / router pushes), same as a real user would, rather than
    // page.goto() straight to '/'.
    await visibleText(page, '‹ Retour').click(); // plant detail -> zone detail
    await expect(visibleText(page, '1 plante')).toBeVisible();
    await visibleText(page, 'Accueil').click(); // zone detail (tabs) -> dashboard
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    await page.locator('[aria-label="Réglages"]:visible').click();
    await expect(visibleText(page, 'Réglages')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await visibleText(page, 'Exporter mon jardin').click();
    const download = await downloadPromise;
    const backupPath = path.join(os.tmpdir(), `e2e-backup-${Date.now()}.json`);
    await download.saveAs(backupPath);
    expect(fs.existsSync(backupPath)).toBe(true);

    // --- Delete the plant through its confirmation (ticket 042) ---
    await visibleText(page, '← Retour').click(); // settings -> dashboard
    await visibleText(page, 'Zones').click();
    await visibleText(page, zoneName).click();
    await visibleText(page, plantName).click();
    await expect(visibleText(page, plantName)).toBeVisible();
    await visibleText(page, 'Actions').click();
    await visibleText(page, 'Supprimer la plante').click();
    // handleDelete navigates to router.replace('/(tabs)'), i.e. the dashboard.
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();

    // --- Réglages: import the file just downloaded, accepting the
    // replace-my-garden confirmation ---
    await page.locator('[aria-label="Réglages"]:visible').click();
    await expect(visibleText(page, 'Réglages')).toBeVisible();

    const importChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await visibleText(page, 'Importer une sauvegarde').click();
    const importChooser = await importChooserPromise;
    await importChooser.setFiles(backupPath);
    await expect
      .poll(() => dialogMessages.some((m) => m.includes('restauré')), { timeout: 10000 })
      .toBe(true);

    // --- The plant and its photo are back after a reload ---
    // The imported photo now holds a real `data:` URL (importGarden rebuilt
    // it from the archive's base64), not a `blob:` one, so a hard navigation
    // from here on is safe. (After a reload, expo-router's history is empty,
    // so '← Retour' -- router.back() -- would be a no-op here; go straight
    // to '/' instead.)
    await page.reload();
    await expect(visibleText(page, 'Réglages')).toBeVisible();
    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    await visibleText(page, 'Zones').click();
    await expect(visibleText(page, zoneName)).toBeVisible();
    await visibleText(page, zoneName).click();
    await expect(visibleText(page, plantName)).toBeVisible();
    await visibleText(page, plantName).click();
    await visibleText(page, 'Photos').click();
    await expect(visibleText(page, 'Mes photos')).toBeVisible();
    await expect(page.locator('img:visible').first()).toBeVisible();
    await expectStoredPhotoLoads(page);
  });

  // Tickets 022/031: a plant's pruning month derives a "Ce mois-ci au jardin"
  // task on the dashboard (lib/seasonalTasks.js) when it matches the current
  // month. Ticking it off logs a care entry and the task disappears -- and
  // stays gone after a reload, since it's derived from the plant plus a
  // care log, not a separate row that could be left behind.
  test("a prune task derived from this month's pruning month disappears once ticked off", async ({
    page,
  }) => {
    const MONTH_SHORT = [
      'Jan',
      'Fév',
      'Mar',
      'Avr',
      'Mai',
      'Juin',
      'Juil',
      'Août',
      'Sep',
      'Oct',
      'Nov',
      'Déc',
    ];
    const currentMonthShort = MONTH_SHORT[new Date().getMonth()];

    const zoneName = `E2E Seasonal Zone ${Date.now()}`;
    const plantName = `E2E Seasonal Plant ${Date.now()}`;

    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();

    await visibleText(page, 'Zones').click();
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
    // "Mois de taille" pills live in the collapsible "Plus de details" section
    // (app/plant/new.js); expand it, then set this month.
    await page.getByText('Plus de details', { exact: false }).click();
    await visibleText(page, currentMonthShort).click();
    await visibleText(page, 'Enregistrer').click();
    await expect(visibleText(page, plantName)).toBeVisible();

    // --- Dashboard shows the derived prune task ---
    // plant/[id] is a full-screen route outside the (tabs) group, so the tab
    // bar isn't rendered there (see the comment on the first test above); go
    // back to the zone detail screen first, which is inside the tabs group.
    await visibleText(page, '‹ Retour').click(); // plant detail -> zone detail
    await expect(visibleText(page, '1 plante')).toBeVisible();
    await visibleText(page, 'Accueil').click(); // zone detail (tabs) -> dashboard
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    await expect(visibleText(page, 'Ce mois-ci au jardin')).toBeVisible();
    await expect(visibleText(page, `Tailler · ${plantName}`)).toBeVisible();

    // --- Tick it off: the task disappears ---
    await page.locator('[aria-label="Fait"]:visible').click();
    await expect(visibleText(page, `Tailler · ${plantName}`)).toHaveCount(0);

    // --- Reload: still gone (derived from the plant + the new care log) ---
    await page.reload();
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    await expect(visibleText(page, 'Ce mois-ci au jardin')).toBeVisible();
    await expect(visibleText(page, `Tailler · ${plantName}`)).toHaveCount(0);
  });
});
