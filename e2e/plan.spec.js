// Ticket 106: the garden plan on the web build -- create it from Zones, see the
// seeded zones and plants, open a plant from its bubble, and drop plants (from
// the drawer, then from the plan itself) with the banner and its undo. The
// server is the fake one behind mockAuthApi; the drops are checked on the rows
// the app pushes to it.
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText, tabButton } = require('./helpers');

const CORNER_HINT =
  'Glissez un coin pour le déplacer, ou un « + » au milieu d’un côté pour y ajouter un sommet. Appui long sur un coin pour le supprimer.';
const STAMP = '2026-05-01T10:00:00.000Z';
// Ticket 110 review screenshots: only taken when SHOTS_DIR names a folder.
async function shot(page, name) {
  if (process.env.SHOTS_DIR)
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
}
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

  test('a selected plant shows its distances to the zone sides (ticket 122)', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');

    await page.getByLabel('Plante Rosier ‘Pierre de Ronsard’').click();
    // The rose stands at (200, 300) in the 600 x 800 cm 'Massif sud'.
    await expect(visibleText(page, '2 m')).toBeVisible();
    await expect(visibleText(page, '4 m')).toBeVisible();
    await expect(visibleText(page, '3 m')).toBeVisible();
    await expect(visibleText(page, '5 m')).toBeVisible();

    await page.waitForTimeout(400);
    const empty = await planPoint(page, 800, 2000);
    await page.mouse.click(empty.x, empty.y);
    await expect(visibleText(page, '5 m')).toHaveCount(0);
    await expect(visibleText(page, '4 m')).toHaveCount(0);
  });

  test('the arrows nudge the plant by the step, saved and synced (ticket 123)', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');

    await page.getByLabel('Plante Rosier ‘Pierre de Ronsard’').click();
    await expect(visibleText(page, '2 m')).toBeVisible();
    const right = page.getByRole('button', { name: 'Déplacer de 5 cm vers la droite' });
    for (let i = 0; i < 3; i++) await right.click();

    // 15 cm to the right: the bubble stays open and the distances follow.
    await expect(page.getByTestId('plan-bubble')).toBeVisible();
    await expect(visibleText(page, '2,15 m')).toBeVisible();
    await expect(visibleText(page, '3,85 m')).toBeVisible();
    await expect.poll(() => serverPlant(api, 'plant-rose')?.planX, { timeout: 20000 }).toBe(215);
    expect(serverPlant(api, 'plant-rose').planY).toBe(300);
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');

    await page.reload();
    await page.getByLabel('Plante Rosier ‘Pierre de Ronsard’').click();
    await expect(visibleText(page, '2,15 m')).toBeVisible();
    await expect(visibleText(page, '3,85 m')).toBeVisible();
  });

  test('the nudge step cycles 1, 5, 10 cm and is remembered (ticket 123)', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');

    await page.getByLabel('Plante Rosier ‘Pierre de Ronsard’').click();
    await expect(page.getByRole('button', { name: 'Pas de déplacement : 5 cm' })).toBeVisible();
    await page.getByRole('button', { name: 'Pas de déplacement : 5 cm' }).click();
    await expect(page.getByRole('button', { name: 'Pas de déplacement : 10 cm' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Déplacer de 10 cm vers le haut' })
    ).toBeVisible();

    await page.reload();
    await page.getByLabel('Plante Rosier ‘Pierre de Ronsard’').click();
    await expect(page.getByRole('button', { name: 'Pas de déplacement : 10 cm' })).toBeVisible();
  });

  test('an arrow stops at a side of the zone and is then disabled (ticket 123)', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');

    await page.getByLabel('Plante Rosier ‘Pierre de Ronsard’').click();
    await page.getByRole('button', { name: 'Pas de déplacement : 5 cm' }).click();
    // The left side is the nearest, 2 m away: 20 presses of 10 cm reach it.
    const left = page.getByRole('button', { name: 'Déplacer de 10 cm vers la gauche' });
    for (let i = 0; i < 20; i++) await left.click();

    await expect(left).toBeDisabled();
    await expect.poll(() => serverPlant(api, 'plant-rose')?.planX, { timeout: 20000 }).toBe(0);
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');
    // The other arrows still work.
    await expect(
      page.getByRole('button', { name: 'Déplacer de 10 cm vers le haut' })
    ).toBeEnabled();
  });

  test('the bubble sizes the plant on the plan: + and -, typed metres, synced', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    // The marker stops growing at 28 px (ticket 125): past that the canopy shows the size.
    const dia = async () => {
      const canopy = page.getByTestId('plan-canopy-plant-rose');
      const target = (await canopy.count()) ? canopy : page.getByTestId('plan-dot-plant-rose');
      return (await target.boundingBox()).width;
    };

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

  test('a big plant shows a canopy and does not hide the small plant under it (ticket 125)', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    // The small plant is seeded first: the plan, not the data order, puts it on top.
    api.server.seed(
      'plants',
      plant('plant-small', 'Hosta', { zoneId: 'zone-a', planX: 460, planY: 500, planSizeCm: 30 })
    );
    api.server.seed(
      'plants',
      plant('plant-big', 'Chêne', { zoneId: 'zone-a', planX: 400, planY: 500, planSizeCm: 500 })
    );
    await page.goto('/plan');

    const canopy = page.getByTestId('plan-canopy-plant-big');
    await expect(canopy).toBeVisible();
    const canopyBox = await canopy.boundingBox();
    const markerBox = await page.getByTestId('plan-dot-plant-big').boundingBox();
    expect(markerBox.width).toBeLessThanOrEqual(29);
    expect(canopyBox.width).toBeGreaterThan(markerBox.width * 2);
    await expect(page.getByTestId('plan-dot-plant-small')).toBeVisible();

    await page.getByLabel('Plante Hosta').click();
    await expect(page.getByRole('button', { name: /Ouvrir la fiche/ })).toContainText('Hosta');
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

  test('plants snap to a 50 cm grid; the magnet turns it off and is remembered', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedGarden(api);
    await page.goto('/plan');
    await expect(visibleText(page, 'À placer · 1')).toBeVisible();
    const magnet = (state) =>
      page.getByRole('button', { name: `Aimanter les plantes à la grille (${state})` });
    await expect(magnet('activé')).toBeVisible();

    const item = await page.getByLabel('À placer : Lavande').boundingBox();
    await longPressDrag(
      page,
      { x: item.x + item.width / 2, y: item.y + 20 },
      await planPoint(page, 1213, 817)
    );
    await expect
      .poll(() => serverPlant(api, 'plant-lavande')?.zoneId, { timeout: 20000 })
      .toBe('zone-b');
    const snapped = serverPlant(api, 'plant-lavande');
    expect(snapped.planX % 50).toBe(0);
    expect(snapped.planY % 50).toBe(0);

    await magnet('activé').click();
    await expect(magnet('désactivé')).toBeVisible();
    await page.reload();
    await expect(magnet('désactivé')).toBeVisible();

    // Drop the placed plant at a point that is not on the grid.
    await longPressDrag(
      page,
      await planPoint(page, snapped.planX, snapped.planY),
      await planPoint(page, 1213, 817)
    );
    await expect
      .poll(() => serverPlant(api, 'plant-lavande')?.planX, { timeout: 20000 })
      .not.toBe(snapped.planX);
    const free = serverPlant(api, 'plant-lavande');
    expect(free.planX % 50 !== 0 || free.planY % 50 !== 0).toBe(true);
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
// Ticket 116: the edit sheets open folded; this shows dimensions and Aimantation.
async function unfold(page) {
  await page.getByRole('button', { name: 'Déplier les réglages' }).click();
}

async function fold(page) {
  await page.getByRole('button', { name: 'Plier les réglages' }).click();
}

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

    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Une zone de plantes' }).click();
    await expect(page.getByText(/Touchez chaque coin de la zone/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminer la zone' })).toBeDisabled();

    await tapCorners(page, [
      [600, 1000],
      [1200, 1000],
      [1200, 1700],
    ]);
    await expect(visibleText(page, 'Nouvelle zone · 3 coins')).toBeVisible();
    await expect(visibleText(page, '6 m')).toBeVisible();
    await expect(visibleText(page, '7 m')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminer la zone' })).toBeEnabled();

    await tapCorners(page, [[300, 2000]]);
    await expect(visibleText(page, 'Nouvelle zone · 4 coins')).toBeVisible();
    await page.getByRole('button', { name: 'Retirer le dernier coin' }).click();
    await expect(visibleText(page, 'Nouvelle zone · 3 coins')).toBeVisible();
    await tapCorners(page, [[600, 1700]]);
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
    near(polygon[0][0], 600);
    near(polygon[0][1], 1000);
    near(polygon[2][0], 1200);
    near(polygon[2][1], 1700);
    // The rose sits in Massif sud and stays there.
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');
  });

  test('a rectangle by its sides is placed, dragged, then saved', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');

    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Une zone de plantes' }).click();
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

    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Une zone de plantes' }).click();
    await tapCorners(page, [
      [600, 1000],
      [1200, 1000],
      [1200, 1700],
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

  test('typing the dimensions of a zone resizes it without snapping when the magnet is off', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    await unfold(page);
    await expect(
      visibleText(page, 'Modifier la zone · touchez une longueur pour la saisir')
    ).toBeVisible();
    await expect(
      visibleText(page, `${CORNER_HINT} Aimant actif : les coins se calent (voir Aimantation).`)
    ).toBeVisible();
    // The magnet is reachable while editing; off, the hint loses its second sentence.
    await page.getByRole('button', { name: 'Aimanter les plantes à la grille (activé)' }).click();
    await expect(visibleText(page, CORNER_HINT)).toBeVisible();
    await page.getByTestId('plan-dim-width').fill('7,15');
    await page.getByTestId('plan-dim-length').fill('9');
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-a')?.[2]?.[0], { timeout: 20000 }).toBe(715);
    expect(pushedPolygon(api, 'zone-a')[0]).toEqual([0, 0]);
    expect(pushedPolygon(api, 'zone-a')[2]).toEqual([715, 900]);
  });

  test('magnet on: a traced zone has only corners on the 50 cm grid', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Une zone de plantes' }).click();
    await expect(
      page.getByText(
        'Touchez chaque coin de la zone (aimant actif : les coins se calent). Au moins 3 coins ; « Terminer » referme la forme.'
      )
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Aimanter les plantes à la grille (activé)' })
    ).toBeVisible();
    await tapCorners(page, [
      [613, 1017],
      [1182, 1031],
      [1191, 1688],
      [622, 1679],
    ]);
    await page.getByRole('button', { name: 'Terminer la zone' }).click();
    await page.getByRole('button', { name: 'Potager' }).click();
    await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-d'), { timeout: 20000 }).not.toBeNull();
    const polygon = pushedPolygon(api, 'zone-d');
    expect(polygon).toHaveLength(4);
    for (const [x, y] of polygon) {
      expect(x % 50).toBe(0);
      expect(y % 50).toBe(0);
    }
  });

  test('magnet off: a traced corner is not snapped; the button toggles while tracing', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Une zone de plantes' }).click();
    await page.getByRole('button', { name: 'Aimanter les plantes à la grille (activé)' }).click();
    await expect(
      page.getByText(
        'Touchez chaque coin de la zone. Au moins 3 coins ; « Terminer » referme la forme.'
      )
    ).toBeVisible();
    await tapCorners(page, [
      [613, 1017],
      [1182, 1031],
      [1191, 1688],
    ]);
    await page.getByRole('button', { name: 'Terminer la zone' }).click();
    await page.getByRole('button', { name: 'Potager' }).click();
    await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-d'), { timeout: 20000 }).not.toBeNull();
    expect(pushedPolygon(api, 'zone-d').some(([x, y]) => x % 50 !== 0 || y % 50 !== 0)).toBe(true);
  });

  test('magnet on: a dragged zone rectangle lands on the 50 cm grid', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Une zone de plantes' }).click();
    await page.getByRole('button', { name: 'Rectangle par cotes' }).click();
    await page.getByLabel('Largeur (m)').fill('4');
    await page.getByLabel('Longueur (m)').fill('1,5');
    await page.getByRole('button', { name: 'Façade nord' }).click();
    await page.getByRole('button', { name: 'Poser sur le plan' }).click();
    const handle = page.getByLabel('Rectangle à déplacer');
    const before = await handle.boundingBox();
    await drag(
      page,
      { x: before.x + before.width / 2, y: before.y + before.height / 2 },
      { x: before.x + before.width / 2 + 61, y: before.y + before.height / 2 - 143 }
    );
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-c'), { timeout: 20000 }).not.toBeNull();
    const polygon = pushedPolygon(api, 'zone-c');
    expect(polygon[0][0] % 50).toBe(0);
    expect(polygon[0][1] % 50).toBe(0);
    expect(polygon[0][0]).toBeGreaterThan(100);
    expect(polygon[1][0] - polygon[0][0]).toBe(400);
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
    await unfold(page);
    await expect(
      visibleText(page, 'Modifier la zone · touchez une longueur pour la saisir')
    ).toBeVisible();
    await expect(page.getByText(CORNER_HINT)).toBeVisible();
    await expect(page.getByTestId('plan-dim-width')).toHaveValue('6');
    await expect(page.getByTestId('plan-dim-length')).toHaveValue('8');
    await expect(page.getByLabel('Coin 3')).toBeVisible();
    await fold(page);

    const corner = await planPoint(page, 600, 800);
    await drag(page, corner, { x: corner.x + 40, y: corner.y });
    await expect(page.getByText('48 m²')).toHaveCount(0);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();

    await expect
      .poll(() => pushedPolygon(api, 'zone-a')?.[2]?.[0], { timeout: 20000 })
      .toBeGreaterThan(700);
    // The magnet is on: the dragged corner sits on the 50 cm grid.
    expect(pushedPolygon(api, 'zone-a')[2][0] % 50).toBe(0);
    expect(pushedPolygon(api, 'zone-a')[2][1] % 50).toBe(0);
    // Only the dragged corner moved.
    expect(pushedPolygon(api, 'zone-a')[1]).toEqual([600, 0]);
    expect(pushedPolygon(api, 'zone-a')[0]).toEqual([0, 0]);
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');

    await holdAt(page, spot);
    await expect(
      visibleText(page, 'Modifier la zone · touchez une longueur pour la saisir')
    ).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Effacer le tracé' }).click();

    await expect.poll(() => serverZone(api, 'zone-a')?.polygon, { timeout: 20000 }).toBeNull();
    await expect(page.getByText('Massif sud')).toHaveCount(0);
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');
  });
});

// Ticket 110: garden elements (house, terrace, pond...) drawn on the plan only.
// What the app writes is read back from the fake server's plan_features rows.
function seedFeatureGarden(api, { withTerrace = true } = {}) {
  seedGarden(api);
  if (withTerrace) {
    api.server.seed('plan_features', {
      id: 'feature-terrace',
      kind: 'terrace',
      label: 'Terrasse sud',
      polygon: rect(500, 1200, 500, 400),
      updatedAt: STAMP,
      deletedAt: null,
    });
  }
}

const serverFeatures = (api) =>
  api.server.rows.filter((r) => r.table === 'plan_features').map((r) => r.row);
const serverFeature = (api, id) => serverFeatures(api).find((row) => row.id === id);

test.describe('garden elements (ticket 110)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('Ajouter offers a zone or an element; a terrace is created, placed and dragged', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedFeatureGarden(api, { withTerrace: false });
    await page.goto('/plan');
    await expect(visibleText(page, 'À placer · 1')).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter' }).click();
    await expect(visibleText(page, 'Ajouter au plan')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Une zone de plantes' })).toBeVisible();
    await shot(page, '1-choice-sheet');
    await page.getByRole('button', { name: 'Un élément du jardin' }).click();

    await expect(visibleText(page, 'Élément du jardin')).toBeVisible();
    await expect(visibleText(page, 'Nouvel élément')).toBeVisible();
    for (const label of ['Maison', 'Abri', 'Terrasse', 'Allée', 'Bassin', 'Clôture', 'Autre']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Terrasse', exact: true }).click();
    await page.getByLabel('Nom (facultatif)').fill('Terrasse sud');
    await page.getByLabel('Largeur (m)').fill('5');
    await page.getByLabel('Longueur (m)').fill('4');
    await expect(
      visibleText(page, '20 m² · glissez-le à sa place, puis ajustez ses coins.')
    ).toBeVisible();

    const handle = page.getByLabel('Rectangle à déplacer');
    await expect(handle).toBeVisible();
    await shot(page, '2-element-sheet');
    const before = await handle.boundingBox();
    await drag(
      page,
      { x: before.x + before.width / 2, y: before.y + before.height / 2 },
      { x: before.x + before.width / 2 + 53, y: before.y + before.height / 2 - 111 }
    );
    const after = await handle.boundingBox();
    expect(after.x - before.x).toBeGreaterThan(30);
    expect(before.y - after.y).toBeGreaterThan(80);

    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect(page.getByText('Terrasse sud')).toBeVisible();
    await expect.poll(() => serverFeatures(api).length, { timeout: 20000 }).toBe(1);
    const [created] = serverFeatures(api);
    expect(created.kind).toBe('terrace');
    expect(created.label).toBe('Terrasse sud');
    expect(created.deletedAt).toBeNull();
    const polygon = JSON.parse(created.polygon);
    expect(polygon[1][0] - polygon[0][0]).toBe(500);
    expect(polygon[2][1] - polygon[1][1]).toBe(400);
    // The magnet is on: the top-left corner sits on the 50 cm grid.
    expect(polygon[0][0] % 50).toBe(0);
    expect(polygon[0][1] % 50).toBe(0);
    // It never shows among the zones.
    await expect(visibleText(page, '15 × 25 m · 2 zones · 1 plante placée')).toBeVisible();
  });

  test('two elements drawn under the zones, with their labels', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedFeatureGarden(api);
    api.server.seed('plan_features', {
      id: 'feature-house',
      kind: 'house',
      label: null,
      polygon: rect(0, 1900, 800, 600),
      updatedAt: STAMP,
      deletedAt: null,
    });
    await page.goto('/plan');
    await expect(page.getByText('Terrasse sud')).toBeVisible();
    await expect(page.getByText('Maison')).toBeVisible();
    await shot(page, '3-plan-two-elements');
  });

  test('a long press edits an element: a corner snaps to 50 cm, then Terminer', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedFeatureGarden(api);
    await page.goto('/plan');
    await expect(page.getByText('Terrasse sud')).toBeVisible();

    await holdAt(page, await planPoint(page, 600, 1300));
    await unfold(page);
    await expect(
      visibleText(page, 'Modifier l’élément · touchez une longueur pour la saisir')
    ).toBeVisible();
    await expect(visibleText(page, '20 m²')).toBeVisible();
    await expect(
      visibleText(page, `${CORNER_HINT} Aimant actif : les coins se calent (voir Aimantation).`)
    ).toBeVisible();
    await expect(page.getByTestId('plan-dim-width')).toHaveValue('5');
    await expect(page.getByTestId('plan-dim-length')).toHaveValue('4');
    await shot(page, '4-edit-mode');
    // Ticket 116: folded, the sheet leaves the lower plan in view.
    await fold(page);

    const corner = await planPoint(page, 1000, 1600);
    await drag(page, corner, { x: corner.x + 41, y: corner.y + 17 });
    await expect(visibleText(page, '20 m²')).toHaveCount(0);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();

    await expect
      .poll(() => JSON.parse(serverFeature(api, 'feature-terrace').polygon)[2][0], {
        timeout: 20000,
      })
      .toBeGreaterThan(1050);
    const polygon = JSON.parse(serverFeature(api, 'feature-terrace').polygon);
    expect(polygon[2][0] % 50).toBe(0);
    expect(polygon[2][1] % 50).toBe(0);
    // Only the dragged corner moved.
    expect(polygon[0]).toEqual([500, 1200]);
  });

  test('typing the dimensions of an element resizes it on the 50 cm grid', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedFeatureGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 600, 1300));
    await unfold(page);
    await expect(
      visibleText(page, 'Modifier l’élément · touchez une longueur pour la saisir')
    ).toBeVisible();

    await page.getByTestId('plan-dim-width').fill('6,2');
    await page.getByTestId('plan-dim-length').fill('5,3');
    await shot(page, 'edit-element');
    // An invalid value is refused; the last good shape is kept.
    await page.getByTestId('plan-dim-width').fill('abc');
    await expect(page.getByText('Valeur invalide, par exemple 12,5.')).toBeVisible();
    await page.getByTestId('plan-dim-width').fill('6,2');
    await expect(page.getByText('Valeur invalide, par exemple 12,5.')).toHaveCount(0);
    await page.getByTestId('plan-dim-width').fill('40');
    await expect(page.getByText('Trop grand pour le plan.')).toBeVisible();
    await page.getByTestId('plan-dim-width').fill('6,2');
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();

    await expect
      .poll(() => JSON.parse(serverFeature(api, 'feature-terrace').polygon)[2][0], {
        timeout: 20000,
      })
      .toBe(1100);
    const polygon = JSON.parse(serverFeature(api, 'feature-terrace').polygon);
    expect(polygon[0]).toEqual([500, 1200]);
    expect(polygon[2]).toEqual([1100, 1750]);
  });

  test('"Type et nom" changes the kind and the name', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedFeatureGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 600, 1300));
    await expect(
      visibleText(page, 'Modifier l’élément · touchez une longueur pour la saisir')
    ).toBeVisible();
    await page.getByRole('button', { name: 'Type et nom' }).click();
    await page.getByRole('button', { name: 'Bassin', exact: true }).click();
    await page.getByLabel('Nom (facultatif)').fill('');
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect
      .poll(() => serverFeature(api, 'feature-terrace').kind, { timeout: 20000 })
      .toBe('pond');
    expect(serverFeature(api, 'feature-terrace').label).toBeNull();
    await expect(page.getByText('Bassin')).toBeVisible();
  });

  test('a plant dropped on an element is refused and keeps its place', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedFeatureGarden(api);
    await page.goto('/plan');
    await expect(visibleText(page, 'À placer · 1')).toBeVisible();
    await expect(page.getByText('Terrasse sud')).toBeVisible();

    const item = await page.getByLabel('À placer : Lavande').boundingBox();
    await longPressDrag(
      page,
      { x: item.x + item.width / 2, y: item.y + 20 },
      await planPoint(page, 750, 1400)
    );

    await expect(page.getByRole('alert')).toContainText(
      'Impossible de poser une plante sur Terrasse sud : la plante reprend sa place.'
    );
    await shot(page, '5-refusal-banner');
    await expect(visibleText(page, 'À placer · 1')).toBeVisible();
    await page.waitForTimeout(1500);
    const pushedPlants = api.server.pushes.flatMap((p) => p.plants ?? []);
    expect(pushedPlants.some((row) => row.id === 'plant-lavande')).toBe(false);
    expect(serverPlant(api, 'plant-lavande').planX).toBeNull();
    // The banner goes away by itself.
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 9000 });

    // A placed plant dragged onto the element goes back where it was.
    await longPressDrag(page, await planPoint(page, 200, 300), await planPoint(page, 800, 1300));
    await expect(page.getByRole('alert')).toContainText('Impossible de poser une plante sur');
    expect(serverPlant(api, 'plant-rose').planX).toBe(200);
    expect(serverPlant(api, 'plant-rose').zoneId).toBe('zone-a');
  });

  test('Supprimer asks to confirm, then the element is gone and the deletion is pushed', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedFeatureGarden(api);
    await page.goto('/plan');
    await expect(page.getByText('Terrasse sud')).toBeVisible();

    await holdAt(page, await planPoint(page, 600, 1300));
    await expect(
      visibleText(page, 'Modifier l’élément · touchez une longueur pour la saisir')
    ).toBeVisible();
    // Dismissing the confirmation keeps the element.
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await expect(
      visibleText(page, 'Modifier l’élément · touchez une longueur pour la saisir')
    ).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText('Terrasse sud')).toHaveCount(0);
    await expect
      .poll(() => serverFeature(api, 'feature-terrace').deletedAt, { timeout: 20000 })
      .not.toBeNull();
  });
});

// Ticket 113: typing a side's length. The pills are drawn without a hit target of
// their own (the canvas finds the one under a tap), so they are clicked at the
// spot where they sit: 26 px outside the side's middle (ticket 117 moved them out
// from 16 px so that they stay clear of the "+" handle at the middle).
function seedSideGarden(api) {
  const { server } = api;
  server.seed('garden_plan', {
    id: 'main',
    widthCm: 1500,
    lengthCm: 2500,
    updatedAt: STAMP,
    deletedAt: null,
  });
  server.seed('zones', zone('zone-p', 'Potager', rect(300, 1000, 700, 600), 0));
  server.seed('zones', zone('zone-c', 'Façade nord', null, 1));
  server.seed('plan_features', {
    id: 'feature-terrace',
    kind: 'terrace',
    label: 'Terrasse sud',
    // Ticket 114: in the upper plan, clear of the taller edit sheet.
    polygon: rect(800, 200, 500, 400),
    updatedAt: STAMP,
    deletedAt: null,
  });
}

async function clickTopPill(page, midXCm, topYCm) {
  const at = await planPoint(page, midXCm, topYCm);
  await page.mouse.click(at.x, at.y - 26);
}

const SIDE_TEXT =
  'Longueur du côté du haut : la forme s’étire de ce côté, les côtés parallèles le restent.';
const EDIT_ZONE = 'Modifier la zone · touchez une longueur pour la saisir';

test.describe('typing a side length (ticket 113)', () => {
  test.beforeEach(async ({ page }) => {
    // Ticket 117: the edit sheet's hint is a line longer; a taller screen keeps the zone above it.
    await page.setViewportSize({ width: 390, height: 1000 });
  });

  test('a zone: the top side 7 -> 8,5 m shows 42 -> 51 m2, then Valider and Terminer', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedSideGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 650, 1300));
    await expect(visibleText(page, EDIT_ZONE)).toBeVisible();

    await clickTopPill(page, 650, 1000);
    const input = page.getByLabel('Longueur du côté du haut, en mètres');
    await expect(input).toHaveValue('7');
    await expect(visibleText(page, SIDE_TEXT)).toBeVisible();
    await expect(visibleText(page, '42 m² → 42 m²')).toBeVisible();
    await input.fill('8,5');
    await expect(visibleText(page, '42 m² → 51 m²')).toBeVisible();
    await shot(page, 'cote');

    // Annuler keeps the shape.
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByLabel('Longueur du côté du haut, en mètres')).toHaveCount(0);
    await expect(visibleText(page, '42 m²').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminer', exact: true })).toBeVisible();

    await clickTopPill(page, 650, 1000);
    await page.getByLabel('Longueur du côté du haut, en mètres').fill('8,5');
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(visibleText(page, '51 m²').first()).toBeVisible();
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();

    await expect.poll(() => pushedPolygon(api, 'zone-p')?.[1]?.[0], { timeout: 20000 }).toBe(1150);
    expect(pushedPolygon(api, 'zone-p')).toEqual([
      [300, 1000],
      [1150, 1000],
      [1150, 1600],
      [300, 1600],
    ]);
  });

  test('zero and out-of-plan lengths are refused in French; Valider stays disabled', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedSideGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 650, 1300));
    await clickTopPill(page, 650, 1000);
    const input = page.getByLabel('Longueur du côté du haut, en mètres');
    await input.fill('0');
    await expect(page.getByText('Doit être supérieur à 0.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Valider' })).toBeDisabled();
    await input.fill('abc');
    await expect(page.getByText('Valeur invalide, par exemple 12,5.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Valider' })).toBeDisabled();
    await input.fill('20');
    await expect(page.getByText('Trop grand pour le plan.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Valider' })).toBeDisabled();
    await input.fill('5');
    await expect(page.getByRole('button', { name: 'Valider' })).toBeEnabled();
  });

  test('an element: the top side 5 -> 6 m stretches the terrace', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedSideGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 1050, 400));
    await expect(
      visibleText(page, 'Modifier l’élément · touchez une longueur pour la saisir')
    ).toBeVisible();
    await clickTopPill(page, 1050, 200);
    await page.getByLabel('Longueur du côté du haut, en mètres').fill('6');
    await expect(visibleText(page, '20 m² → 24 m²')).toBeVisible();
    await page.getByRole('button', { name: 'Valider' }).click();
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect
      .poll(() => JSON.parse(serverFeature(api, 'feature-terrace').polygon)[1][0], {
        timeout: 20000,
      })
      .toBe(1400);
    expect(JSON.parse(serverFeature(api, 'feature-terrace').polygon)).toEqual([
      [800, 200],
      [1400, 200],
      [1400, 600],
      [800, 600],
    ]);
  });

  test('tracing: the last side can be set to 3 m', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedSideGarden(api);
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Une zone de plantes' }).click();
    await tapCorners(page, [
      [400, 300],
      [800, 300],
    ]);
    await clickTopPill(page, 600, 300);
    await page.getByLabel(/^Longueur du côté .*, en mètres$/).fill('3');
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(visibleText(page, '3 m')).toBeVisible();
    await tapCorners(page, [
      [700, 900],
      [400, 900],
    ]);
    await page.getByRole('button', { name: 'Terminer la zone' }).click();
    await page.getByRole('button', { name: 'Façade nord' }).click();
    await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-c'), { timeout: 20000 }).not.toBeNull();
    const polygon = pushedPolygon(api, 'zone-c');
    expect(polygon).toHaveLength(4);
    expect(polygon[1][0] - polygon[0][0]).toBe(300);
    expect(polygon[1][1]).toBe(polygon[0][1]);
  });

  test('magnet off: a traced corner placed at about 86 degrees ends exactly square', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedSideGarden(api);
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Une zone de plantes' }).click();
    await page.getByRole('button', { name: 'Aimanter les plantes à la grille (activé)' }).click();
    await tapCorners(page, [
      [413, 317],
      [1013, 317],
      [1083, 1117],
    ]);
    await page.getByRole('button', { name: 'Terminer la zone' }).click();
    await page.getByRole('button', { name: 'Façade nord' }).click();
    await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-c'), { timeout: 20000 }).not.toBeNull();
    const [a, b, c] = pushedPolygon(api, 'zone-c');
    expect((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])).toBe(0);
    // Not grid snapped: the magnet is off.
    expect(a[0] % 50 !== 0 || a[1] % 50 !== 0).toBe(true);
  });
});

// Ticket 114: corners snap to the other shapes' corners and sides. Zone A
// (0,0 600x800) is edited; zone E is the neighbour, with an off-grid corner
// (1013,117) so that a snap cannot be mistaken for the 50 cm grid. The reach is
// 12 px (about 54 cm at this zoom).
test.describe('snapping to other shapes (ticket 114)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  async function seedSnapGarden(context) {
    const api = await mockAuthApi(context);
    seedDrawGarden(api);
    api.server.seed('zones', zone('zone-e', 'Allée', rect(1013, 117, 387, 883), 3));
    return api;
  }

  // Edits zone A and drags its corner 3 (600,800) to the plan point (xCm, yCm)
  // shifted by (dxPx, dyPx) screen pixels, then finishes.
  async function dragCornerTo(page, xCm, yCm, dxPx = 0, dyPx = 0) {
    const corner = await planPoint(page, 600, 800);
    const target = await planPoint(page, xCm, yCm);
    await drag(page, corner, { x: target.x + dxPx, y: target.y + dyPx });
  }
  async function finishEdit(page, api) {
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    // Zone A already has its seeded outline: wait for the moved corner.
    await expect
      .poll(() => JSON.stringify(pushedPolygon(api, 'zone-a')?.[2]), { timeout: 20000 })
      .not.toBe('[600,800]');
    return pushedPolygon(api, 'zone-a');
  }
  test('the edit sheet opens folded: summary and buttons; unfolding is remembered (ticket 116)', async ({
    context,
    page,
  }) => {
    await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    await expect(
      visibleText(page, '48 m² · 6 × 8 m · Grille 50 cm · Sommets · Côtés · Angles')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminer', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Effacer le tracé' })).toBeVisible();
    await expect(page.getByText('Aimantation', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('plan-dim-width')).toHaveCount(0);
    await shot(page, 'edit-folded');
    await unfold(page);
    await expect(page.getByText('Aimantation', { exact: true })).toBeVisible();
    await expect(page.getByTestId('plan-dim-width')).toBeVisible();
    await page.reload();
    await holdAt(page, await planPoint(page, 500, 700));
    await expect(page.getByText('Aimantation', { exact: true })).toBeVisible();
    await fold(page);
    await expect(page.getByText('Aimantation', { exact: true })).toHaveCount(0);
  });

  test('the edit sheet has the Aimantation block', async ({ context, page }) => {
    await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    await unfold(page);
    await expect(page.getByText('Aimantation', { exact: true })).toBeVisible();
    await expect(page.getByText('priorité : sommet › côté › angle › grille')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grille · 50 cm' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sommets' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Côtés' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bord du jardin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Angles 90° / plat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Distance Moyenne' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bord du jardin' })).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    );
    await expect(page.getByRole('button', { name: 'Sommets' })).toHaveCSS(
      'background-color',
      'rgb(31, 42, 34)'
    );
    if (process.env.SHOTS_DIR)
      await page.screenshot({ path: `${process.env.SHOTS_DIR}/aimantation.png` });
  });

  test('a corner dragged near another zone corner lands on it, with its marker', async ({
    context,
    page,
  }) => {
    const api = await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    const corner = await planPoint(page, 600, 800);
    const target = await planPoint(page, 1013, 117);
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x + 3, corner.y + 3, { steps: 2 });
    await page.mouse.move(target.x + 4, target.y + 3, { steps: 10 });
    await expect(page.getByTestId('plan-snap-marker')).toBeVisible();
    await expect(page.getByText('Sommet', { exact: true })).toBeVisible();
    if (process.env.SHOTS_DIR)
      await page.screenshot({ path: `${process.env.SHOTS_DIR}/marker.png` });
    await page.mouse.up();
    await expect(page.getByTestId('plan-snap-marker')).toHaveCount(0);
    expect((await finishEdit(page, api))[2]).toEqual([1013, 117]);
  });

  test('away from corners, a corner lands on the other zone side', async ({ context, page }) => {
    const api = await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    await dragCornerTo(page, 1013, 600, -8, 0);
    const [x, y] = (await finishEdit(page, api))[2];
    expect(x).toBe(1013);
    expect(y).toBeGreaterThan(117);
    expect(y).toBeLessThan(1000);
  });

  test('a corner near a right angle lands on it rather than on the grid (ticket 121)', async ({
    context,
    page,
  }) => {
    const api = await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    // At x = 645 the 50 cm grid alone would give 650; square with the side from
    // (0, 0) to (600, 0), the corner keeps x = 600 and takes the grid along y.
    await dragCornerTo(page, 645, 1195);
    expect((await finishEdit(page, api))[2]).toEqual([600, 1200]);
  });

  test('the Angles toggle off: the same corner goes to the grid', async ({ context, page }) => {
    const api = await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    await unfold(page);
    await page.getByRole('button', { name: 'Angles 90° / plat' }).click();
    await fold(page);
    await dragCornerTo(page, 645, 1195);
    expect((await finishEdit(page, api))[2]).toEqual([650, 1200]);
  });

  test('Sommets off: near a corner the point goes to the side instead', async ({
    context,
    page,
  }) => {
    const api = await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    await unfold(page);
    await page.getByRole('button', { name: 'Sommets' }).click();
    await fold(page);
    await dragCornerTo(page, 1013, 117, 3, -2);
    const [x, y] = (await finishEdit(page, api))[2];
    expect(y).toBe(117);
    expect(x).not.toBe(1013);
  });

  test('the grid step changes to 1 m and is remembered after a reload', async ({
    context,
    page,
  }) => {
    const api = await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    await unfold(page);
    await page.getByRole('button', { name: 'Pas de la grille 1 m' }).click();
    await expect(page.getByRole('button', { name: 'Grille · 1 m' })).toBeVisible();
    await page.getByRole('button', { name: 'Bord du jardin' }).click();
    await fold(page);
    await dragCornerTo(page, 730, 1330, 2, 3);
    const [x, y] = (await finishEdit(page, api))[2];
    expect(x % 100).toBe(0);
    expect(y % 100).toBe(0);

    await page.reload();
    await holdAt(page, await planPoint(page, 500, 700));
    // Folded before the drag, the sheet stays folded after the reload.
    await unfold(page);
    await expect(page.getByRole('button', { name: 'Grille · 1 m' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bord du jardin' })).toHaveCSS(
      'background-color',
      'rgb(31, 42, 34)'
    );
  });

  test('the magnet off: no snapping to the other zone', async ({ context, page }) => {
    const api = await seedSnapGarden(context);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 500, 700));
    await page.getByRole('button', { name: 'Aimanter les plantes à la grille (activé)' }).click();
    await dragCornerTo(page, 1013, 117, 4, 3);
    const polygon = await finishEdit(page, api);
    expect(polygon[2]).not.toEqual([1013, 117]);
    expect(polygon[2][0] % 50 === 0 && polygon[2][1] % 50 === 0).toBe(false);
  });
});

// Ticket 117: a "+" at the middle of each side adds a corner (tap, or drag to
// place it); a long press on a corner offers "Supprimer ce sommet".
// The edit sheet is tall at this size: the zone sits in the upper plan, clear of it.
function seedCornerGarden(api) {
  const { server } = api;
  server.seed('garden_plan', {
    id: 'main',
    widthCm: 1500,
    lengthCm: 2500,
    updatedAt: STAMP,
    deletedAt: null,
  });
  server.seed('zones', zone('zone-p', 'Potager', rect(100, 250, 500, 400), 0));
  server.seed('plan_features', {
    id: 'feature-terrace',
    kind: 'terrace',
    label: 'Terrasse sud',
    polygon: rect(900, 250, 400, 300),
    updatedAt: STAMP,
    deletedAt: null,
  });
}

test.describe('adding and removing corners (ticket 117)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  const corners = (page) => page.getByLabel(/^Coin \d+$/);
  const pluses = (page) => page.getByLabel(/^Ajouter un sommet/);

  async function longPress(page, point) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
  }

  test('a zone: tap a "+", drag a "+", long press to delete, disabled on a triangle', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedCornerGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 350, 450));
    await unfold(page);
    await expect(visibleText(page, EDIT_ZONE)).toBeVisible();
    await expect(corners(page)).toHaveCount(4);
    await expect(pluses(page)).toHaveCount(4);
    await shot(page, 'plus-handles');

    // A tap on the top side's "+" adds a corner at its middle.
    const top = await planPoint(page, 350, 250);
    await page.mouse.click(top.x, top.y);
    await expect(corners(page)).toHaveCount(5);
    await expect(pluses(page)).toHaveCount(5);

    // Long press on that corner: the popover, then it is removed.
    await longPress(page, top);
    await shot(page, 'delete-popover');
    await page.getByRole('button', { name: 'Supprimer ce sommet' }).click();
    await expect(corners(page)).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Supprimer ce sommet' })).toHaveCount(0);

    // Dragging the right side's "+" outward: the area reads "before -> after".
    const from = await planPoint(page, 600, 450);
    const to = await planPoint(page, 800, 450);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 3, from.y, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await expect(visibleText(page, '20 m² → 24 m²')).toBeVisible();
    await shot(page, 'drag-new-corner');
    await page.mouse.up();
    await expect(corners(page)).toHaveCount(5);
    await expect(visibleText(page, '20 m² → 24 m²')).toHaveCount(0);
    await expect(visibleText(page, '24 m²').first()).toBeVisible();

    // The length pills stay tappable (clear of the "+").
    // Let the drag's commit settle; a finger never taps within the same frame.
    await page.waitForTimeout(250);
    await page.mouse.click(top.x, top.y - 26);
    await expect(page.getByLabel('Longueur du côté du haut, en mètres')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();

    // Down to a triangle: the item is disabled there.
    await longPress(page, to);
    await page.getByRole('button', { name: 'Supprimer ce sommet' }).click();
    await expect(corners(page)).toHaveCount(4);
    await longPress(page, await planPoint(page, 100, 250));
    await page.getByRole('button', { name: 'Supprimer ce sommet' }).click();
    await expect(corners(page)).toHaveCount(3);
    await longPress(page, await planPoint(page, 100, 650));
    await expect(page.getByRole('button', { name: 'Supprimer ce sommet' })).toBeDisabled();
    // A tap elsewhere closes it (not within the first moments, which are the long press's release).
    await page.waitForTimeout(600);
    const away = await planPoint(page, 1200, 700);
    await page.mouse.click(away.x, away.y);
    await expect(page.getByRole('button', { name: 'Supprimer ce sommet' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-p')?.length, { timeout: 20000 }).toBe(3);
  });

  test('a zone: the dragged "+" corner is saved where it was dropped', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedCornerGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 350, 450));
    await drag(page, await planPoint(page, 600, 450), await planPoint(page, 800, 450));
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect.poll(() => pushedPolygon(api, 'zone-p')?.length, { timeout: 20000 }).toBe(5);
    const polygon = pushedPolygon(api, 'zone-p');
    near(polygon[2][0], 800);
    near(polygon[2][1], 450);
  });

  test('an element: tap a "+" adds a corner and it is saved', async ({ context, page }) => {
    const api = await mockAuthApi(context);
    seedSideGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 1050, 400));
    await expect(
      visibleText(page, 'Modifier l’élément · touchez une longueur pour la saisir')
    ).toBeVisible();
    await expect(corners(page)).toHaveCount(4);
    await page.mouse.click(...Object.values(await planPoint(page, 1300, 400)));
    await expect(corners(page)).toHaveCount(5);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect
      .poll(() => JSON.parse(serverFeature(api, 'feature-terrace').polygon).length, {
        timeout: 20000,
      })
      .toBe(5);
    expect(JSON.parse(serverFeature(api, 'feature-terrace').polygon)[2]).toEqual([1300, 400]);
  });

  test('an element: a long press inside moves the whole shape, and it is saved', async ({
    context,
    page,
  }) => {
    const api = await mockAuthApi(context);
    seedSideGarden(api);
    await page.goto('/plan');
    await holdAt(page, await planPoint(page, 1050, 400));
    await expect(corners(page)).toHaveCount(4);
    const from = await planPoint(page, 1100, 400);
    const to = await planPoint(page, 1300, 500);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect
      .poll(() => JSON.parse(serverFeature(api, 'feature-terrace').polygon)[0], { timeout: 20000 })
      .toEqual([1000, 300]);
    expect(JSON.parse(serverFeature(api, 'feature-terrace').polygon)).toHaveLength(4);
  });
});
