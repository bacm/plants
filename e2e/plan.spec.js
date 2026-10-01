// Ticket 106: the garden plan on the web build -- create it from Zones, see the
// seeded zones and plants, open a plant from its bubble, and drop plants (from
// the drawer, then from the plan itself) with the banner and its undo. The
// server is the fake one behind mockAuthApi; the drops are checked on the rows
// the app pushes to it.
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText, tabButton } = require('./helpers');

const STAMP = '2026-05-01T10:00:00.000Z';
const rect = (x, y, w, h) =>
  JSON.stringify([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);

const zone = (id, name, polygon, orderIndex) => ({
  id,
  name,
  description: null,
  icon: null,
  orderIndex,
  polygon,
  updatedAt: STAMP,
  deletedAt: null,
});

const plant = (id, name, over = {}) => ({
  id,
  name,
  type: 'perennial',
  sun: 'full_sun',
  water: 'medium',
  bloomStartMonth: 1,
  bloomEndMonth: 12,
  createdAt: STAMP,
  zoneId: null,
  planX: null,
  planY: null,
  width: 100,
  updatedAt: STAMP,
  deletedAt: null,
  ...over,
});

function seedGarden(api) {
  const { server } = api;
  server.seed('garden_plan', {
    id: 'main',
    widthCm: 1500,
    lengthCm: 2500,
    updatedAt: STAMP,
    deletedAt: null,
  });
  server.seed('zones', zone('zone-a', 'Massif sud', rect(0, 0, 600, 800), 0));
  server.seed('zones', zone('zone-b', 'Bordure ombre', rect(1000, 0, 400, 1000), 1));
  server.seed(
    'plants',
    plant('plant-rose', 'Rosier ‘Pierre de Ronsard’', {
      zoneId: 'zone-a',
      planX: 200,
      planY: 300,
      width: 150,
    })
  );
  server.seed('plants', plant('plant-lavande', 'Lavande'));
}

const serverPlant = (api, id) =>
  api.server.rows.find((r) => r.table === 'plants' && r.row.id === id)?.row;

// Screen position of a point of the plan, from the grid's on-screen box.
async function planPoint(page, xCm, yCm) {
  const box = await page.getByLabel('Plan du jardin, 15 × 25 m').boundingBox();
  const pxPerCm = box.width / 1500;
  return { x: box.x + xCm * pxPerCm, y: box.y + yCm * pxPerCm };
}

// A long press, then a drag, then a drop: the plan's gesture needs ~450 ms of hold.
async function longPressDrag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test.describe('garden plan (ticket 106)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('Zones opens the plan, which is created at 15 x 25 m and pushed to the server', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    await page.goto('/');
    await tabButton(page, 'Zones').click();
    await page.getByTestId('zones-plan-button').click();

    await expect(page.getByLabel('Largeur (m)')).toHaveValue('15');
    await page.getByLabel('Longueur (m)').fill('0');
    await page.getByRole('button', { name: 'Créer le plan' }).click();
    await expect(visibleText(page, 'Doit être supérieur à 0.')).toBeVisible();
    await page.getByLabel('Longueur (m)').fill('25,5');
    await expect(visibleText(page, '15 × 25,5 m · 382,5 m²')).toBeVisible();
    await page.getByRole('button', { name: 'Créer le plan' }).click();

    await expect(visibleText(page, '15 × 25,5 m · 0 zone · 0 plante placée')).toBeVisible();
    await expect
      .poll(() => api.server.rows.find((r) => r.table === 'garden_plan')?.row.lengthCm ?? null, {
        timeout: 20000,
      })
      .toBe(2550);
  });

  test('the plan shows the zones and plants; a tap opens the bubble, then the plant sheet', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');

    await expect(visibleText(page, '15 × 25 m · 2 zones · 1 plante placée')).toBeVisible();
    await expect(page.getByText('Massif sud')).toBeVisible();
    await expect(page.getByText('48 m²')).toBeVisible();
    await expect(page.getByText('Bordure ombre')).toBeVisible();
    await expect(visibleText(page, 'À placer · 1')).toBeVisible();
    await expect(visibleText(page, 'Appui long pour poser')).toBeVisible();

    const dot = page.getByLabel('Plante Rosier ‘Pierre de Ronsard’');
    await dot.click();
    const bubble = page.getByRole('button', { name: /Ouvrir la fiche/ });
    await expect(bubble).toContainText('Rosier ‘Pierre de Ronsard’');
    await expect(bubble).toContainText('Massif sud · 1,5 m de large');

    // A tap elsewhere closes it (a tap right after the selection is the same
    // tap reaching the canvas, and is ignored).
    await page.waitForTimeout(400);
    const empty = await planPoint(page, 800, 2000);
    await page.mouse.click(empty.x, empty.y);
    await expect(bubble).toHaveCount(0);

    await dot.click();
    await bubble.click();
    await expect(page).toHaveURL(/\/plant\/plant-rose/);
  });

  test('zoom buttons change the scale and "Voir tout" brings it back', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    const grid = page.getByLabel('Plan du jardin, 15 × 25 m');
    await expect(grid).toBeVisible();
    const width = async () => (await grid.boundingBox()).width;
    const fitted = await width();

    await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
    await expect.poll(width).toBeGreaterThan(fitted * 1.4);
    await page.getByRole('button', { name: 'Voir tout le jardin' }).click();
    await expect.poll(async () => Math.abs((await width()) - fitted)).toBeLessThan(2);
    await page.getByRole('button', { name: 'Dézoomer', exact: true }).click();
    await expect.poll(width).toBeLessThan(fitted * 0.8);
  });

  test('dragging a plant from the drawer into a zone saves its zone; Annuler undoes it', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    await expect(visibleText(page, 'À placer · 1')).toBeVisible();

    const item = await page.getByLabel('À placer : Lavande').boundingBox();
    await longPressDrag(
      page,
      { x: item.x + item.width / 2, y: item.y + 20 },
      await planPoint(page, 1200, 800)
    );

    await expect(page.getByText(/Lavande déplacée vers/)).toContainText('Bordure ombre');
    await expect(visibleText(page, '15 × 25 m · 2 zones · 2 plantes placées')).toBeVisible();
    await expect(page.getByText(/À placer ·/)).toHaveCount(0);
    await expect
      .poll(() => serverPlant(api, 'plant-lavande')?.zoneId, { timeout: 20000 })
      .toBe('zone-b');
    const pushed = serverPlant(api, 'plant-lavande');
    expect(Math.abs(pushed.planX - 1200)).toBeLessThan(40);
    expect(Math.abs(pushed.planY - 800)).toBeLessThan(40);

    await page.getByRole('button', { name: 'Annuler le déplacement' }).click();
    await expect(visibleText(page, 'À placer · 1')).toBeVisible();
    await expect
      .poll(() => serverPlant(api, 'plant-lavande')?.planX, { timeout: 20000 })
      .toBeNull();
    expect(serverPlant(api, 'plant-lavande').zoneId).toBeNull();
  });

  test('dragging a placed plant out of every zone clears its zone; Annuler restores both', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    const dot = page.getByLabel('Plante Rosier ‘Pierre de Ronsard’');
    await expect(dot).toBeVisible();

    const from = await planPoint(page, 200, 300);
    await longPressDrag(page, from, await planPoint(page, 800, 2000));

    await expect(page.getByText(/Rosier retirée de sa zone/)).toBeVisible();
    await expect.poll(() => serverPlant(api, 'plant-rose')?.zoneId, { timeout: 20000 }).toBeNull();
    expect(serverPlant(api, 'plant-rose').planY).toBeGreaterThan(1800);

    await page.getByRole('button', { name: 'Annuler le déplacement' }).click();
    await expect
      .poll(() => serverPlant(api, 'plant-rose')?.zoneId, { timeout: 20000 })
      .toBe('zone-a');
    expect(serverPlant(api, 'plant-rose').planX).toBe(200);
    expect(serverPlant(api, 'plant-rose').planY).toBe(300);
  });

  test('the plan cannot shrink below a drawn zone', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Dimensions du plan' }).click();

    await page.getByLabel('Largeur (m)').fill('5');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('alert')).toContainText('au moins 14 × 25 m');

    await page.getByLabel('Largeur (m)').fill('20');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(visibleText(page, '20 × 25 m · 2 zones · 1 plante placée')).toBeVisible();
  });
});
