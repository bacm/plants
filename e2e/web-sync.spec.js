// Ticket 095: the web app shows and edits the server's garden. The local store
// is a cache synced through the same engine as the phone; the server is the
// fake one behind mockAuthApi (page.route, no real server).
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText, tabButton } = require('./helpers');

const STAMP = '2026-05-01T10:00:00.000Z';
const serverPlant = (over = {}) => ({
  id: 'plant-server-1',
  name: 'Pivoine du serveur',
  type: 'perennial',
  sun: 'full_sun',
  water: 'medium',
  bloomStartMonth: 1,
  bloomEndMonth: 12,
  updatedAt: STAMP,
  deletedAt: null,
  ...over,
});

const cachedPlantNames = (page) =>
  page.evaluate(() =>
    (JSON.parse(localStorage.getItem('garden_db') || '{"plants":[]}').plants || [])
      .filter((p) => p.deletedAt == null)
      .map((p) => p.name)
  );

test.describe('web sync (ticket 095)', () => {
  test('after sign-in the dashboard shows a plant that exists only on the server', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    api.server.seed('plants', serverPlant());

    await page.goto('/');
    await expect(visibleText(page, 'Pivoine du serveur')).toBeVisible();
    expect(await cachedPlantNames(page)).toEqual(['Pivoine du serveur']);
  });

  test('a plant created on the web is pushed to the server', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();

    await page.goto('/plant/new');
    await page.getByLabel('Nom de la plante', { exact: true }).fill('Plante du web');
    await visibleText(page, 'Enregistrer').click();
    await expect(visibleText(page, 'Plante du web')).toBeVisible();

    // The sync runs a few seconds after the write.
    await expect
      .poll(
        () => api.server.rows.some((r) => r.table === 'plants' && r.row.name === 'Plante du web'),
        {
          timeout: 20000,
        }
      )
      .toBe(true);
  });

  test('a server photo is fetched with the cookie and shown from a blob URL', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    api.server.seed('plants', serverPlant());
    api.server.seed('photos', {
      id: 'photo-server-1',
      plantId: 'plant-server-1',
      careLogId: null,
      date: '2026-05-01',
      caption: null,
      fingerprint: null,
      updatedAt: STAMP,
      deletedAt: null,
    });
    api.server.photos.set('photo-server-1', {
      bytes: fs.readFileSync(path.join(__dirname, 'fixtures', 'test-photo.png')),
      mime: 'image/png',
    });

    await page.goto('/');
    await expect(visibleText(page, 'Pivoine du serveur')).toBeVisible();
    await tabButton(page, 'Bibliothèque').click();
    await page.waitForFunction(
      () =>
        [...document.images].some(
          (img) => img.src.startsWith('blob:') && img.complete && img.naturalWidth > 0
        ),
      null,
      { timeout: 15000 }
    );
    // Nothing was downloaded in bulk into the browser.
    const stored = await page.evaluate(() => localStorage.getItem('garden_db'));
    expect(stored).toContain('remote:photo-server-1');
  });

  test('signing out empties the cache: another account sees none of the first garden', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    api.server.seed('plants', serverPlant());
    await page.goto('/settings');
    await expect(visibleText(page, 'Réglages')).toBeVisible();
    await expect.poll(() => cachedPlantNames(page)).toEqual(['Pivoine du serveur']);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/account\/login/);
    await expect.poll(() => cachedPlantNames(page)).toEqual([]);

    api.loginReply = {
      status: 200,
      body: { account: { id: 'acc-2', email: 'autre@exemple.fr', isAdmin: false } },
    };
    await page.getByPlaceholder('vous@exemple.fr').fill('autre@exemple.fr');
    await page.locator('input[aria-label="Mot de passe"]:visible').fill('un-bon-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    await expect(page.getByText('Pivoine du serveur')).toHaveCount(0);
    expect(await cachedPlantNames(page)).toEqual([]);
  });

  test('with the server unreachable a banner says so', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    api.down = true;
    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Serveur injoignable');
  });
});

test.describe('web logout and import (ticket 095)', () => {
  test('importing a backup is disabled on the web', async ({ context, page }) => {
    await mockAuthApi(context);
    await page.goto('/settings');
    await expect(
      visibleText(
        page,
        'Sur le web, votre jardin vient du serveur : importez une sauvegarde depuis le téléphone, déconnecté.'
      )
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Importer une sauvegarde' })).toBeDisabled();
  });

  test('logging out with an unsent change asks first, and staying keeps it', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    await page.goto('/');
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    api.down = true;
    await page.goto('/plant/new');
    await page.getByLabel('Nom de la plante', { exact: true }).fill('Plante non envoyée');
    await visibleText(page, 'Enregistrer').click();
    await expect(visibleText(page, 'Plante non envoyée')).toBeVisible();

    await page.goto('/settings');
    await expect(visibleText(page, 'Réglages')).toBeVisible();
    const messages = [];
    page.on('dialog', async (dialog) => {
      messages.push(dialog.message());
      if (messages.length === 1) await dialog.accept();
      else await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Se déconnecter' }).click();

    await expect.poll(() => messages.length).toBe(2);
    expect(messages[1]).toContain("Des modifications n'ont pas encore été envoyées");
    expect(messages[1]).toContain('seront perdues');
    await expect(page).toHaveURL(/\/settings/);
    expect(await cachedPlantNames(page)).toEqual(['Plante non envoyée']);
    expect(api.signedIn).toBe(true);
  });
});
