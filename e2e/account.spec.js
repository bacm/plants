// Ticket 101: the web app is gated behind a login. No real server: the /auth
// routes are answered by page.route (see mockAuthApi in helpers.js).
const { test, expect } = require('@playwright/test');
const { mockAuthApi, TEST_ACCOUNT, visibleText } = require('./helpers');

// Screens stay mounted-but-hidden under the one on top; take the visible input.
const field = (page, label) => page.locator(`input[aria-label=${JSON.stringify(label)}]:visible`);

async function fillLogin(page, email, password) {
  await page.getByPlaceholder('vous@exemple.fr').fill(email);
  await field(page, 'Mot de passe').fill(password);
}

const loginButton = (page) => page.getByRole('button', { name: 'Se connecter', exact: true });

test.describe('accounts (web gate)', () => {
  test('signed out, every route shows the login screen', async ({ context, page }) => {
    await mockAuthApi(context, { signedIn: false });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Plants', exact: true })).toBeVisible();
    await expect(visibleText(page, 'Connectez-vous pour retrouver votre jardin.')).toBeVisible();
    await expect(page.locator('[aria-label="Retour"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/account\/login/);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/account\/login/);
  });

  test('wrong credentials show "Identifiants invalides"', async ({ context, page }) => {
    const api = await mockAuthApi(context, { signedIn: false });
    api.loginReply = { status: 401, body: { detail: 'Identifiants invalides' } };
    await page.goto('/');

    await fillLogin(page, 'camille@exemple.fr', 'mauvais-mot-de-passe');
    await loginButton(page).click();

    await expect(visibleText(page, 'Identifiants invalides')).toBeVisible();
    await expect(page).toHaveURL(/\/account\/login/);
  });

  test('a pending account shows the approval banner', async ({ context, page }) => {
    const api = await mockAuthApi(context, { signedIn: false });
    api.loginReply = { status: 403, body: { detail: 'Compte en attente d’approbation' } };
    await page.goto('/');

    await fillLogin(page, 'camille@exemple.fr', 'un-bon-mot-de-passe');
    await loginButton(page).click();

    await expect(visibleText(page, 'Compte en attente d’approbation')).toBeVisible();
    await expect(
      visibleText(
        page,
        'Vous pourrez vous connecter dès que l’administrateur aura validé votre demande.'
      )
    ).toBeVisible();
  });

  test('a good login lands on the home screen, and survives a reload', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context, { signedIn: false });
    await page.goto('/');

    await fillLogin(page, 'camille@exemple.fr', 'un-bon-mot-de-passe');
    await loginButton(page).click();

    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    const login = api.requests.find((r) => r.name === 'login');
    expect(login.body).toMatchObject({ email: 'camille@exemple.fr', client: 'web' });

    await page.reload();
    await expect(visibleText(page, 'Votre jardin')).toBeVisible();
    // The session is the cookie: nothing about it in localStorage.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toContain(TEST_ACCOUNT.email);
  });

  test('signup checks the passwords, then shows the request-sent screen', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context, { signedIn: false });
    await page.goto('/');
    await page.getByText('Pas encore de compte ? Créer un compte').click();
    await expect(page).toHaveURL(/\/account\/signup/);

    await field(page, 'Adresse e-mail').fill('nouvelle@exemple.fr');
    await field(page, 'Mot de passe').fill('douze-caracteres');
    await field(page, 'Confirmer le mot de passe').fill('autre-chose-12345');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(visibleText(page, 'Les mots de passe ne correspondent pas.')).toBeVisible();
    expect(api.requests.filter((r) => r.name === 'signup')).toHaveLength(0);

    // The honeypot is a real input, off-screen and out of the tab order.
    const honeypot = page.locator('input[name="website"]');
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
    await expect(honeypot).toHaveAttribute('aria-hidden', 'true');

    await field(page, 'Confirmer le mot de passe').fill('douze-caracteres');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();

    await expect(page.getByRole('heading', { name: 'Demande envoyée' })).toBeVisible();
    await expect(visibleText(page, 'nouvelle@exemple.fr')).toBeVisible();
    const signup = api.requests.find((r) => r.name === 'signup');
    expect(signup.body).toEqual({
      email: 'nouvelle@exemple.fr',
      password: 'douze-caracteres',
      website: '',
    });
  });

  test('logging out from Réglages goes back to the gate', async ({ context, page }) => {
    await mockAuthApi(context, { signedIn: true });
    await page.goto('/settings');

    await expect(visibleText(page, TEST_ACCOUNT.email)).toBeVisible();
    await expect(visibleText(page, 'Connecté sur ce navigateur')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Se déconnecter' }).click();

    await expect(page.getByRole('heading', { name: 'Plants', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account\/login/);
  });
});
