// Shared helpers for the Playwright e2e specs (web-smoke.spec.js and
// capture.spec.js — ticket 056).

// expo-router keeps previous stack screens (the tabs navigator, a zone's
// detail screen, ...) mounted-but-hidden when you navigate forward, so text
// that also appears on an earlier screen (a zone or plant name, shown on
// several screens) can match more than one element. Scope to the one that is
// actually rendered on screen right now.
function visibleText(page, text) {
  return page.locator(`:text-is(${JSON.stringify(text)}):visible`);
}

// The floating tab bar (ticket 064) only renders a visible text label on the
// active tab -- the others are icon-only, so `visibleText` can't find them.
// Every tab (active or not) still carries an accessibilityLabel of
// "<title>, tab, N of M", which react-native-web exposes as `aria-label`.
function tabButton(page, title) {
  return page.locator(`[aria-label^=${JSON.stringify(title + ',')}]:visible`);
}

// A photo row can survive a reload while its image does not (ticket 044: web
// stored a blob: URL that died with the page). Assert real, decodable bytes.
async function expectStoredPhotoLoads(page) {
  await page.waitForFunction(
    () =>
      [...document.images].some(
        (img) => img.src.startsWith('data:') && img.complete && img.naturalWidth > 0
      ),
    null,
    { timeout: 10000 }
  );
}

module.exports = { visibleText, tabButton, expectStoredPhotoLoads };
