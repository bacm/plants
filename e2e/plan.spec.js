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
    await expect(bubble).toContainText('Massif sud');
    await expect(bubble).not.toContainText('de large');

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

  test('the bubble sizes the plant on the plan: + and -, typed metres, synced', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    const dia = async () => (await page.getByTestId('plan-dot-plant-rose').boundingBox()).width;

    await page.getByLabel('Plante Rosier ‘Pierre de Ronsard’').click();
    const bubble = page.getByTestId('plan-bubble');
    await expect(bubble).toContainText('Taille sur le plan');
    // Unset: the fixed fallback size, not the sheet's 1.5 m width.
    await expect(bubble).toContainText('0,5 m');
    const before = await dia();

    await page.getByRole('button', { name: 'Augmenter la taille sur le plan' }).click();
    await expect(bubble).toContainText('0,6 m');
    await expect(bubble).toBeVisible();
    await expect
      .poll(() => serverPlant(api, 'plant-rose')?.planSizeCm, { timeout: 20000 })
      .toBe(60);

    await page.getByRole('button', { name: 'Saisir la taille sur le plan' }).click();
    const input = page.getByLabel('Taille sur le plan (m)');
    await input.fill('abc');
    await input.press('Enter');
    await expect(bubble).toContainText('Valeur invalide');
    await input.fill('3');
    await input.press('Enter');
    await expect(bubble).toContainText('3 m');
    await expect.poll(dia).toBeGreaterThan(before * 2);
    const large = await dia();

    await page.getByRole('button', { name: 'Saisir la taille sur le plan' }).click();
    await page.getByLabel('Taille sur le plan (m)').fill('0,3');
    await page.getByLabel('Taille sur le plan (m)').press('Enter');
    await expect(bubble).toContainText('0,3 m');
    await expect.poll(dia).toBeLessThan(large * 0.3);
    await expect
      .poll(() => serverPlant(api, 'plant-rose')?.planSizeCm, { timeout: 20000 })
      .toBe(30);

    // Cancel leaves the size alone.
    await page.getByRole('button', { name: 'Saisir la taille sur le plan' }).click();
    await page.getByLabel('Taille sur le plan (m)').fill('4');
    await page.getByRole('button', { name: 'Annuler la saisie' }).click();
    await expect(bubble).toContainText('0,3 m');

    // The controls neither closed the bubble nor opened the sheet; the top row does.
    await expect(page).toHaveURL(/\/plan/);
    await page.getByRole('button', { name: /Ouvrir la fiche/ }).click();
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

// Ticket 107: drawing a zone corner by corner or by its sides, editing a corner,
// erasing an outline. Zones without an outline are the ones "Pour quelle zone ?"
// offers; what the app writes is read back from the fake server.
function seedDrawGarden(api) {
  const { server } = api;
  server.seed('garden_plan', {
    id: 'main',
    widthCm: 1500,
    lengthCm: 2500,
    updatedAt: STAMP,
    deletedAt: null,
  });
  server.seed('zones', zone('zone-a', 'Massif sud', rect(0, 0, 600, 800), 0));
  server.seed('zones', zone('zone-c', 'Façade nord', null, 1));
  server.seed('zones', zone('zone-d', 'Potager', null, 2));
  server.seed(
    'plants',
    plant('plant-rose', 'Rosier', { zoneId: 'zone-a', planX: 200, planY: 300, width: 150 })
  );
}

const serverZone = (api, id) =>
  api.server.rows.find((r) => r.table === 'zones' && r.row.id === id)?.row;
const pushedPolygon = (api, id) => {
  const polygon = serverZone(api, id)?.polygon;
  return polygon ? JSON.parse(polygon) : polygon;
};
const near = (actual, expected, tolerance = 25) =>
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3, from.y + 3, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function tapCorners(page, corners) {
  for (const [x, y] of corners) {
    const at = await planPoint(page, x, y);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(150);
  }
}

// A press held still on the plan (no movement): the zone under it is edited.
async function holdAt(page, point) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
}

test.describe('drawing zones (ticket 107)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('tap four corners, undo one, finish, pick a zone without outline', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');
    await expect(visibleText(page, '15 × 25 m · 3 zones · 1 plante placée')).toBeVisible();

    await page.getByRole('button', { name: 'Tracer une zone' }).click();
    await expect(page.getByText(/Touchez chaque coin de la zone/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminer la zone' })).toBeDisabled();

    await tapCorners(page, [
      [800, 1000],
      [1400, 1000],
      [1400, 1700],
    ]);
    await expect(visibleText(page, 'Nouvelle zone · 3 coins')).toBeVisible();
    await expect(visibleText(page, '6 m')).toBeVisible();
    await expect(visibleText(page, '7 m')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminer la zone' })).toBeEnabled();

    await tapCorners(page, [[300, 2000]]);
    await expect(visibleText(page, 'Nouvelle zone · 4 coins')).toBeVisible();
    await page.getByRole('button', { name: 'Retirer le dernier coin' }).click();
    await expect(visibleText(page, 'Nouvelle zone · 3 coins')).toBeVisible();
    await tapCorners(page, [[800, 1700]]);
    await expect(visibleText(page, 'Nouvelle zone · 4 coins')).toBeVisible();

    await page.getByRole('button', { name: 'Terminer la zone' }).click();
    await expect(visibleText(page, 'Pour quelle zone ?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Façade nord' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Potager' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Nouvelle zone' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Massif sud' })).toHaveCount(0);
    await expect(visibleText(page, 'Seules les zones sans tracé sont proposées.')).toBeVisible();

    await page.getByRole('button', { name: 'Potager' }).click();
    await page.getByRole('button', { name: 'Enregistrer la zone' }).click();

    await expect(page.getByText('Potager')).toBeVisible();
    await expect(visibleText(page, '15 × 25 m · 3 zones · 1 plante placée')).toBeVisible();
    await expect.poll(() => pushedPolygon(api, 'zone-d'), { timeout: 20000 }).not.toBeNull();
    const polygon = pushedPolygon(api, 'zone-d');
    expect(polygon).toHaveLength(4);
    near(polygon[0][0], 800);
    near(polygon[0][1], 1000);
    near(polygon[2][0], 1400);
    near(polygon[2][1], 1700);
    // The rose sits in Massif sud and stays there.
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');
  });

  test('a rectangle by its sides is placed, dragged, then saved', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');

    await page.getByRole('button', { name: 'Tracer une zone' }).click();
    await page.getByRole('button', { name: 'Rectangle par cotes' }).click();
    await expect(visibleText(page, 'Zone en rectangle')).toBeVisible();
    await expect(
      visibleText(page, '6 m² · posé en bas du plan, glissez-le à sa place.')
    ).toBeVisible();

    await page.getByLabel('Largeur (m)').fill('abc');
    await expect(visibleText(page, 'Valeur invalide, par exemple 12,5.')).toBeVisible();
    await page.getByLabel('Largeur (m)').fill('4');
    await page.getByLabel('Longueur (m)').fill('1,5');
    await page.getByRole('button', { name: 'Façade nord' }).click();
    await page.getByRole('button', { name: 'Poser sur le plan' }).click();

    const handle = page.getByLabel('Rectangle à déplacer');
    await expect(handle).toBeVisible();
    const before = await handle.boundingBox();
    await drag(
      page,
      { x: before.x + before.width / 2, y: before.y + before.height / 2 },
      { x: before.x + before.width / 2 + 60, y: before.y + before.height / 2 - 150 }
    );
    const after = await handle.boundingBox();
    expect(after.x - before.x).toBeGreaterThan(40);
    expect(before.y - after.y).toBeGreaterThan(100);

    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-c'), { timeout: 20000 }).not.toBeNull();
    const polygon = pushedPolygon(api, 'zone-c');
    expect(polygon[1][0] - polygon[0][0]).toBe(400);
    expect(polygon[2][1] - polygon[1][1]).toBe(150);
    expect(polygon[0][0]).toBeGreaterThan(100);
    await expect(page.getByText('6 m²')).toBeVisible();
  });

  test('a new zone asks for its name and is created with its outline', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');

    await page.getByRole('button', { name: 'Tracer une zone' }).click();
    await tapCorners(page, [
      [800, 1000],
      [1400, 1000],
      [1400, 1700],
    ]);
    await page.getByRole('button', { name: 'Terminer la zone' }).click();
    await page.getByRole('button', { name: '+ Nouvelle zone' }).click();
    await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
    await expect(visibleText(page, 'Donnez un nom à la zone.')).toBeVisible();
    await page.getByLabel('Nom de la nouvelle zone').fill('Rocaille');
    await page.getByRole('button', { name: 'Enregistrer la zone' }).click();

    await expect(page.getByText('Rocaille')).toBeVisible();
    await expect(visibleText(page, '15 × 25 m · 4 zones · 1 plante placée')).toBeVisible();
    await expect
      .poll(() => api.server.rows.find((r) => r.table === 'zones' && r.row.name === 'Rocaille'), {
        timeout: 20000,
      })
      .toBeTruthy();
    const created = api.server.rows.find((r) => r.row.name === 'Rocaille').row;
    expect(JSON.parse(created.polygon)).toHaveLength(3);
  });

  test('a long press edits a zone: drag a corner, finish; then erase the outline', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');
    await expect(page.getByText('48 m²')).toBeVisible();

    const spot = await planPoint(page, 500, 700);
    await holdAt(page, spot);
    await expect(visibleText(page, 'Modifier la zone')).toBeVisible();
    await expect(visibleText(page, 'Glissez un coin pour le déplacer.')).toBeVisible();
    await expect(page.getByLabel('Coin 3')).toBeVisible();

    const corner = await planPoint(page, 600, 800);
    await drag(page, corner, { x: corner.x + 40, y: corner.y });
    await expect(page.getByText('48 m²')).toHaveCount(0);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();

    await expect
      .poll(() => pushedPolygon(api, 'zone-a')?.[2]?.[0], { timeout: 20000 })
      .toBeGreaterThan(700);
    // Only the dragged corner moved.
    expect(pushedPolygon(api, 'zone-a')[1]).toEqual([600, 0]);
    expect(pushedPolygon(api, 'zone-a')[0]).toEqual([0, 0]);
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');

    await holdAt(page, spot);
    await expect(visibleText(page, 'Modifier la zone')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Effacer le tracé' }).click();

    await expect.poll(() => serverZone(api, 'zone-a')?.polygon, { timeout: 20000 }).toBeNull();
    await expect(page.getByText('Massif sud')).toHaveCount(0);
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');
  });
});
