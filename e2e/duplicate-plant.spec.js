// Ticket 118: "Dupliquer" on the plant sheet opens a prefilled "Nouvelle plante"
// (species sheet kept, name numbered); nothing is created until "Enregistrer".
const { test, expect } = require('@playwright/test');
const { mockAuthApi, visibleText, screenTitle, tabButton } = require('./helpers');

test.beforeEach(async ({ context }) => {
  await mockAuthApi(context);
});

test('duplicate a plant into a prefilled new plant', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const stamp = Date.now();
  const zoneName = `E2E Dup Zone ${stamp}`;
  const plantName = `E2E Dup ${stamp} Rosier`;
  const latinName = 'Rosa duplicata';

  await page.goto('/');
  await expect(visibleText(page, 'Votre jardin')).toBeVisible();
  await tabButton(page, 'Zones').click();
  await visibleText(page, 'Nouvelle zone').click();
  await page.getByPlaceholder('ex. Massif nord, Balcon').fill(zoneName);
  await visibleText(page, 'Créer la zone').click();
  await visibleText(page, zoneName).click();
  await visibleText(page, 'Ajouter une plante').click();
  await page.getByLabel('Nom de la plante', { exact: true }).fill(plantName);
  await page.getByLabel('Nom latin', { exact: true }).fill(latinName);
  await visibleText(page, zoneName).click();
  await visibleText(page, 'Enregistrer').click();
  await expect(visibleText(page, plantName)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: process.env.SHOTS_118 ? `${process.env.SHOTS_118}/sheet.png` : undefined,
  });

  await page.getByRole('button', { name: 'Dupliquer', exact: true }).click();
  await expect(screenTitle(page, 'Nouvelle plante')).toBeVisible();
  await expect(page.getByText(`Copie de ${plantName}.`)).toBeVisible();
  await expect(page.getByText('photos, journal, rappels', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Nom de la plante', { exact: true })).toHaveValue(`${plantName} 2`);
  await expect(page.getByLabel('Nom latin', { exact: true })).toHaveValue(latinName);
  await page.screenshot({
    path: process.env.SHOTS_118 ? `${process.env.SHOTS_118}/form.png` : undefined,
  });

  await visibleText(page, 'Enregistrer').click();
  await expect(visibleText(page, `${plantName} 2`)).toBeVisible();

  // Both plants exist in the library; the original is unchanged.
  await page.goto('/');
  await tabButton(page, 'Bibliothèque').click();
  await expect(visibleText(page, plantName)).toBeVisible();
  await expect(visibleText(page, `${plantName} 2`)).toBeVisible();

  expect(pageErrors).toEqual([]);
});
