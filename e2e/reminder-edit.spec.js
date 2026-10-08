// Ticket 131: edit a reminder's frequency and postpone it from the Rappels screen.
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText, tabButton } = require('./helpers');

const STAMP = '2025-05-01T10:00:00.000Z';

test('edit a reminder frequency, then postpone it by 7 days', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { server } = await mockAuthApi(context);
  server.seed('plants', {
    id: 'plant-rose',
    name: 'Rosier',
    type: 'shrub',
    createdAt: STAMP,
    zoneId: null,
    updatedAt: STAMP,
    deletedAt: null,
  });
  server.seed('reminders', {
    id: 'rem-water',
    plantId: 'plant-rose',
    kind: 'water',
    frequencyDays: 7,
    nextDueDate: '2099-01-10',
    lastDoneDate: null,
    enabled: 1,
    repeatRule: null,
    updatedAt: STAMP,
    deletedAt: null,
  });

  // Let the first sync land in local storage, then open the screen by URL.
  await page.goto('/');
  await tabButton(page, 'Bibliothèque').click();
  await expect(visibleText(page, 'Rosier')).toBeVisible();
  await page.goto('/plant/reminders?plantId=plant-rose');
  await expect(visibleText(page, 'Rappels')).toBeVisible();
  await expect(page.getByText(/^Tous les 7 j · /)).toBeVisible();

  await page.getByRole('button', { name: 'Modifier le rappel Arroser' }).click();
  await page.getByLabel('Fréquence du rappel').fill('10');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText(/^Tous les 10 j · /)).toBeVisible();

  const before = await page.getByText(/^Tous les 10 j · /).textContent();
  await page.getByRole('button', { name: 'Modifier le rappel Arroser' }).click();
  await page.getByRole('button', { name: 'Reporter de 7 jours' }).click();
  await expect(page.getByText(/^Tous les 10 j · /)).not.toHaveText(before);
});
