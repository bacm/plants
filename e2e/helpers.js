// Shared helpers for the Playwright e2e specs (web-smoke.spec.js and
// capture.spec.js — ticket 056).

// expo-router keeps previous stack screens (the tabs navigator, a zone's
// detail screen, ...) mounted-but-hidden when you navigate forward, so text
// that also appears on an earlier screen (a zone or plant name, shown on
// several screens) can match more than one element. Scope to the one that is
// actually rendered on screen right now.
//
// Ticket 066: the dashboard title splits "jardin" into its own nested <Text>
// for the italic accent colour, so the DOM node carrying "Votre jardin" now
// has a child <span> for "jardin" -- the CSS `:text-is()` engine used here
// before only matches an element whose text comes from a single run, so it
// stopped matching. `getByText(..., { exact: true })` reads the full
// (possibly multi-node) accessible text instead, so it keeps matching this
// and every other exact-text case the old selector covered.
function visibleText(page, text) {
  return page.getByText(text, { exact: true }).and(page.locator(':visible'));
}

// The floating tab bar (ticket 064) only renders a visible text label on the
// active tab -- the others are icon-only, so `visibleText` can't find them.
// Every tab (active or not) still carries an accessibilityLabel of
// "<title>, tab, N of M", which react-native-web exposes as `aria-label`.
function tabButton(page, title) {
  return page.locator(`[aria-label^=${JSON.stringify(title + ',')}]:visible`);
}

// The plant detail hero's back button (ticket 067) is icon-only, with an
// accessibilityLabel of "Retour" instead of a visible text label -- unlike
// every other screen's back button, which is still a Text node visibleText
// can find.
function backButton(page) {
  return page.locator('[aria-label="Retour"]:visible');
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

module.exports = { visibleText, tabButton, backButton, expectStoredPhotoLoads };
