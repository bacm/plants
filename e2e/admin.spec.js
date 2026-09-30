// Ticket 099: the Administration screen. No real server: /auth and /admin are
// answered by page.route (see mockAuthApi in helpers.js).
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText } = require('./helpers');

test.describe('administration', () => {
  test('an admin approves one request and refuses another', async ({ context, page }) => {
    const api = await mockAuthApi(context, { signedIn: true, isAdmin: true });
    await page.goto('/settings');

    const entry = page.getByRole('link', { name: 'Administration · 2 demandes' });
    await expect(entry).toBeVisible();
    await entry.click();

    await expect(visibleText(page, 'Demandes en attente · 2')).toBeVisible();
    await expect(visibleText(page, 'nouvelle@exemple.fr')).toBeVisible();
    await expect(visibleText(page, 'jardin.paul@exemple.fr')).toBeVisible();
    await expect(visibleText(page, 'il y a 3 j')).toBeVisible();

    await page.getByRole('button', { name: 'Approuver nouvelle@exemple.fr' }).click();
    await expect(visibleText(page, 'Demandes en attente · 1')).toBeVisible();
    expect(api.adminRequests).toContainEqual({ id: 'acc-2', action: 'approve' });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Refuser jardin.paul@exemple.fr' }).click();
    await expect(visibleText(page, 'Demandes en attente · 0')).toBeVisible();
    await expect(visibleText(page, 'Aucune demande en attente.')).toBeVisible();
    expect(api.adminRequests).toContainEqual({ id: 'acc-3', action: 'refuse' });
    await expect(visibleText(page, 'Refusé')).toBeVisible();
  });

  test('a non-admin sees no Administration entry', async ({ context, page }) => {
    await mockAuthApi(context, { signedIn: true, isAdmin: false });
    await page.goto('/settings');
    await expect(visibleText(page, 'Connecté sur ce navigateur')).toBeVisible();
    await expect(page.getByRole('link', { name: /Administration/ })).toHaveCount(0);
  });
});
