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

// A screen's own <Text accessibilityRole="header"> title (ticket 068:
// Bibliothèque/Zones/zone detail) -- react-native-web exposes that role as
// an ARIA heading, so this can tell a screen's title apart from the same
// word shown elsewhere, e.g. the floating tab bar's "Zones" pill (which
// isn't a heading).
function screenTitle(page, text) {
  return page.getByRole('heading', { name: text, exact: true }).and(page.locator(':visible'));
}

// The floating tab bar (ticket 064) only renders a visible text label on the
// active tab -- the others are icon-only, so `visibleText` can't find them.
// Every tab (active or not) still carries an accessibilityLabel of
// "<title>, tab, N of M", which react-native-web exposes as `aria-label`.
function tabButton(page, title) {
  return page.locator(`[aria-label^=${JSON.stringify(title + ',')}]:visible`);
}

// The plant detail hero's and zone detail's back buttons (tickets 067, 068)
// are icon-only, with an accessibilityLabel of "Retour" instead of a visible
// text label -- unlike some other screens' back buttons, which are still a
// Text node visibleText can find.
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

// Ticket 101: the web app is gated behind a login, and the specs run without a
// server. This stands in for the /auth routes with page.route on a browser
// context (so every page of the test is covered). `state.signedIn` is what
// /auth/me answers from; a 200 login sets it, logout clears it. Set
// `state.loginReply` / `state.signupReply` ({ status, body }) to script the
// answers, and read `state.requests` to see what the app sent.
const TEST_ACCOUNT = { id: 'acc-1', email: 'camille@exemple.fr', isAdmin: false };

async function mockAuthApi(context, { signedIn = true } = {}) {
  const state = {
    signedIn,
    loginReply: { status: 200, body: { account: TEST_ACCOUNT } },
    signupReply: { status: 202, body: { status: 'pending' } },
    requests: [],
  };

  await context.route('**/auth/*', async (route) => {
    const request = route.request();
    const origin = request.headers().origin || '*';
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const name = new URL(request.url()).pathname.split('/').pop();
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    state.requests.push({ name, body });
    const json = (status, payload) =>
      route.fulfill({
        status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

    if (name === 'me') {
      await (state.signedIn ? json(200, TEST_ACCOUNT) : json(401, { detail: 'Non authentifié' }));
    } else if (name === 'login') {
      if (state.loginReply.status === 200) state.signedIn = true;
      await json(state.loginReply.status, state.loginReply.body);
    } else if (name === 'signup') {
      await json(state.signupReply.status, state.signupReply.body);
    } else if (name === 'logout') {
      state.signedIn = false;
      await route.fulfill({ status: 204, headers: cors });
    } else {
      await route.fulfill({ status: 404, headers: cors });
    }
  });
  return state;
}

module.exports = {
  visibleText,
  screenTitle,
  tabButton,
  backButton,
  expectStoredPhotoLoads,
  mockAuthApi,
  TEST_ACCOUNT,
};
