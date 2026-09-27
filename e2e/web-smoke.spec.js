// Ticket 034: exercise the web build end to end in a real browser, the way a
// developer would by hand, and fail on any console error along the way.
//
// Scope: create a zone -> create a plant in it (name + zone only, no AI
// search since the search server isn't running here) -> edit the plant ->
// add a care log -> see it all from the zones tab -> reload and confirm it
// survived (lib/db.web.js persists to localStorage).
//
// Out of scope: photo upload. That opens the native file/camera picker,
// which Playwright cannot drive without either mocking expo-image-picker or
// adding a testID to app code (ticket 027's territory) -- neither of which
// this ticket asks for. See the report for details.
const { test, expect } = require('@playwright/test');

// expo-router keeps previous stack screens (the tabs navigator, a zone's
// detail screen, ...) mounted-but-hidden when you navigate forward, so text
// that also appears on an earlier screen (a zone or plant name, shown on
// several screens) can match more than one element. Scope to the one that is
// actually rendered on screen right now.
function visibleText(page, text) {
  return page.locator(`:text-is(${JSON.stringify(text)}):visible`);
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
});
