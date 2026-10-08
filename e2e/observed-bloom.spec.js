// Ticket 029: the plant detail's "Floraison observée" card -- each season's
// observed window with its shift against the year before, and the one-tap
// start / end / undo of today's mark.
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText, tabButton } = require('./helpers');

const STAMP = '2025-05-01T10:00:00.000Z';
// Review screenshots: only taken when SHOTS_DIR names a folder.
async function shot(page, name) {
  if (process.env.SHOTS_DIR)
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: true });
}

function seedGarden({ server }) {
  server.seed('plants', {
    id: 'plant-peony',
    name: 'Pivoine',
    type: 'perennial',
    bloomStartMonth: 4,
    bloomEndMonth: 5,
    createdAt: STAMP,
    zoneId: null,
    updatedAt: STAMP,
    deletedAt: null,
  });
  const marks = [
    ['o1', '2024-04-10', 'open'],
    ['e1', '2024-04-30', 'end'],
    ['o2', '2025-04-05', 'open'],
    ['o3', '2025-04-12', 'open'],
    ['e2', '2025-04-25', 'end'],
  ];
  for (const [id, date, kind] of marks) {
    server.seed('bloom_observations', {
      id,
      plantId: 'plant-peony',
      date,
      kind,
      updatedAt: STAMP,
      deletedAt: null,
    });
  }
}

test.describe('observed bloom (ticket 029)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('shows each season with its shift, records and undoes today', async ({ context, page }) => {
    seedGarden(await mockAuthApi(context));
    await page.goto('/');
    await tabButton(page, 'Bibliothèque').click();
    await visibleText(page, 'Pivoine').click();
    await expect(page).toHaveURL(/\/plant\/plant-peony/);

    await expect(visibleText(page, 'Floraison observée')).toBeVisible();
    await expect(visibleText(page, '5 avr. → 25 avr.')).toBeVisible();
    await expect(visibleText(page, '10 avr. → 30 avr.')).toBeVisible();
    await expect(visibleText(page, "5 jours plus tôt qu'en 2024")).toBeVisible();
    await shot(page, 'floraison-observee');

    await page.getByRole('button', { name: 'En fleur aujourd’hui' }).click();
    await expect(page.getByRole('button', { name: 'Fin de floraison' })).toBeVisible();
    await expect(page.getByText(/^En fleur depuis le /)).toBeVisible();
    await shot(page, 'floraison-en-cours');

    await page.getByRole('button', { name: 'Annuler la dernière observation' }).click();
    await expect(page.getByRole('button', { name: 'En fleur aujourd’hui' })).toBeVisible();
    await expect(page.getByText(/^En fleur depuis le /)).toHaveCount(0);
  });
});
