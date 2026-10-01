// Ticket 115: the plant journal on the web build -- measurements (with the
// Taille card and its growth curve), notes and "En fleur" entries, and the plan
// dot that follows the latest measured width until a size is set by hand.
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText } = require('./helpers');

const STAMP = '2026-05-01T10:00:00.000Z';
// Review screenshots: only taken when SHOTS_DIR names a folder.
async function shot(page, name) {
  if (process.env.SHOTS_DIR)
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
}

function seedGarden(api) {
  const { server } = api;
  server.seed('garden_plan', {
    id: 'main',
    widthCm: 1500,
    lengthCm: 2500,
    updatedAt: STAMP,
    deletedAt: null,
  });
  server.seed('plants', {
    id: 'plant-rose',
    name: 'Rosier',
    type: 'shrub',
    sun: 'full_sun',
    water: 'medium',
    bloomStartMonth: 1,
    bloomEndMonth: 12,
    createdAt: STAMP,
    zoneId: null,
    planX: 700,
    planY: 900,
    updatedAt: STAMP,
    deletedAt: null,
  });
}

// Opens "Ajouter au journal" from the plant sheet and fills a measurement.
async function addMeasurement(page, { width, height, date }) {
  await visibleText(page, 'Ajouter au journal').click();
  await expect(visibleText(page, 'Nouvelle entrée')).toBeVisible();
  await page.getByRole('radio', { name: 'Observation' }).click();
  await page.getByRole('button', { name: 'Mesure' }).click();
  if (width) await page.getByLabel('Largeur (cm)').fill(width);
  if (height) await page.getByLabel('Hauteur (cm)').fill(height);
  if (date) await page.getByLabel('Date', { exact: true }).fill(date);
  await visibleText(page, 'Enregistrer').click();
}

test.describe('plant journal (ticket 115)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('measurements feed the Taille card, the curve and the plan dot; notes and bloom show', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    const dia = async () => (await page.getByTestId('plan-dot-plant-rose').boundingBox()).width;
    await page.getByLabel('Plante Rosier').click();
    const bubble = page.getByTestId('plan-bubble');
    await expect(bubble).toContainText('0,5 m');
    await expect(bubble).not.toContainText('mesurée');
    const fallback = await dia();

    await page.getByRole('button', { name: /Ouvrir la fiche/ }).click();
    await expect(page).toHaveURL(/\/plant\/plant-rose/);
    await visibleText(page, 'Actions').click();
    await expect(visibleText(page, 'Rien dans le journal pour l’instant.')).toBeVisible();

    // A validation error keeps the user on the form.
    await visibleText(page, 'Ajouter au journal').click();
    await page.getByRole('radio', { name: 'Observation' }).click();
    await page.getByRole('button', { name: 'Mesure' }).click();
    await expect(
      visibleText(page, 'Au moins l’une des deux. La largeur mesurée sera utilisée sur le plan.')
    ).toBeVisible();
    await shot(page, 'observation-mesure');
    page.once('dialog', (dialog) => dialog.accept());
    await visibleText(page, 'Enregistrer').click();
    await expect(visibleText(page, 'Nouvelle entrée')).toBeVisible();

    // A first measurement: the card, no curve yet.
    await page.getByLabel('Largeur (cm)').fill('100');
    await page.getByLabel('Hauteur (cm)').fill('80');
    await page.getByLabel('Date', { exact: true }).fill('2026-03-01');
    await visibleText(page, 'Enregistrer').click();
    await visibleText(page, 'Actions').click();
    await expect(page.getByTestId('size-card')).toContainText('100 × 80 cm');
    await expect(page.getByTestId('growth-curve')).toHaveCount(0);

    // A second one: the card shows the latest, the curve appears.
    await addMeasurement(page, { width: '120', height: '90' });
    await visibleText(page, 'Actions').click();
    await expect(page.getByTestId('size-card')).toContainText('120 × 90 cm');
    await expect(page.getByTestId('growth-curve')).toBeVisible();
    await expect(page.getByText(/· 120 × 90 cm$/)).toBeVisible();
    await expect(page.getByText('1 mars · 100 × 80 cm')).toBeVisible();
    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(300);
    await shot(page, 'actions-taille-journal');

    // A note and an "En fleur" entry.
    await visibleText(page, 'Ajouter au journal').click();
    await page.getByRole('radio', { name: 'Observation' }).click();
    await page.getByRole('button', { name: 'Note' }).click();
    await visibleText(page, 'Enregistrer').click(); // empty note: refused
    await expect(visibleText(page, 'Nouvelle entrée')).toBeVisible();
    await page.getByLabel('Notes').fill('Rejets au pied');
    await visibleText(page, 'Enregistrer').click();
    await visibleText(page, 'Actions').click();
    await expect(page.getByText(/· Rejets au pied$/)).toBeVisible();

    await visibleText(page, 'Ajouter au journal').click();
    await page.getByRole('radio', { name: 'Observation' }).click();
    await page.getByRole('button', { name: 'En fleur' }).click();
    await visibleText(page, 'Enregistrer').click();
    await visibleText(page, 'Actions').click();
    await expect(visibleText(page, 'En fleur')).toBeVisible();

    // The care flow still works next to the observations.
    await visibleText(page, 'Ajouter au journal').click();
    await page.getByRole('button', { name: 'Taillé' }).click();
    await visibleText(page, 'Enregistrer').click();
    await visibleText(page, 'Actions').click();
    await expect(visibleText(page, 'Taillé')).toBeVisible();

    // The plan dot follows the measured width.
    await page.goto('/plan');
    await page.getByLabel('Plante Rosier').click();
    await expect(bubble).toContainText('1,2 m');
    await expect(page.getByTestId('plan-size-source')).toHaveText(/^mesurée le \d+ \S+$/);
    await expect.poll(dia).toBeGreaterThan(fallback * 2);
    await shot(page, 'plan-bulle-mesuree');

    // Set by hand in the bubble: "réglée sur le plan".
    await page.getByRole('button', { name: 'Augmenter la taille sur le plan' }).click();
    await expect(bubble).toContainText('1,3 m');
    await expect(page.getByTestId('plan-size-source')).toHaveText('réglée sur le plan');

    // A new measurement with a width takes over again.
    await page.getByRole('button', { name: /Ouvrir la fiche/ }).click();
    await addMeasurement(page, { width: '140' });
    await page.goto('/plan');
    await page.getByLabel('Plante Rosier').click();
    await expect(bubble).toContainText('1,4 m');
    await expect(page.getByTestId('plan-size-source')).toHaveText(/^mesurée le /);
  });

  test('deleting an entry asks for confirmation in the journal wording', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    await page.getByLabel('Plante Rosier').click();
    await page.getByRole('button', { name: /Ouvrir la fiche/ }).click();
    await visibleText(page, 'Actions').click();
    await addMeasurement(page, { width: '90' });
    await visibleText(page, 'Actions').click();
    await expect(page.getByTestId('size-card')).toContainText('Largeur 90 cm');
    let message = '';
    page.once('dialog', (dialog) => {
      message = dialog.message();
      dialog.accept();
    });
    await visibleText(page, 'Supprimer').click();
    await expect(page.getByTestId('size-card')).toHaveCount(0);
    expect(message).toContain('Cette entrée sera supprimée.');
  });
});
