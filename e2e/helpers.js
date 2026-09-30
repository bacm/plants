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
// server. This stands in for the server with page.route on a browser context
// (so every page of the test is covered): the /auth routes, and since ticket
// 095 the /sync and /photos routes over an in-memory garden per account.
// `state.signedIn` is what /auth/me answers from; a 200 login sets it (and
// `state.account`), logout clears it. Set `state.loginReply` / `state.signupReply`
// ({ status, body }) to script the answers, and read `state.requests` to see
// what the app sent. Ticket 099: `isAdmin` makes the account an admin, and the
// /admin/accounts routes are answered from `state.accounts` (pending and
// approved accounts, changed by approve/refuse/...); `state.adminRequests`
// lists the actions. `state.server` is the signed-in account's garden:
// `seed(table, row)`, `rows` (what it holds), `photos` (id -> { bytes, mime }),
// `pushes` (every pushed change set). `state.down = true` makes /sync and
// /photos unreachable (a network error). Every garden starts empty.
const TEST_ACCOUNT = { id: 'acc-1', email: 'camille@exemple.fr', isAdmin: false };

function makeFakeServer() {
  const server = {
    rows: [], // { rev, table, row }
    photos: new Map(),
    pushes: [],
    rev: 0,
    seed(table, row) {
      server.rows.push({ rev: ++server.rev, table, row });
    },
    push(changes) {
      server.pushes.push(changes);
      for (const [table, list] of Object.entries(changes)) {
        for (const row of list) {
          const at = server.rows.findIndex((r) => r.table === table && r.row.id === row.id);
          if (at >= 0 && server.rows[at].row.updatedAt >= row.updatedAt) continue;
          if (at >= 0) server.rows.splice(at, 1);
          server.seed(table, row);
        }
      }
    },
    pull(since) {
      const changes = {};
      for (const r of server.rows.filter((x) => x.rev > since)) {
        (changes[r.table] ??= []).push(r.row);
      }
      return { changes, revision: server.rev, more: false };
    },
  };
  return server;
}

async function mockAuthApi(context, { signedIn = true, isAdmin = false } = {}) {
  const account = { ...TEST_ACCOUNT, isAdmin };
  const servers = new Map();
  const state = {
    accounts: [
      {
        ...account,
        status: 'approved',
        createdAt: '2026-01-01T00:00:00Z',
        decidedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'acc-2',
        email: 'nouvelle@exemple.fr',
        status: 'pending',
        isAdmin: false,
        createdAt: new Date().toISOString(),
        decidedAt: null,
      },
      {
        id: 'acc-3',
        email: 'jardin.paul@exemple.fr',
        status: 'pending',
        isAdmin: false,
        createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        decidedAt: null,
      },
    ],
    adminRequests: [],
    signedIn,
    account,
    down: false,
    loginReply: { status: 200, body: { account } },
    signupReply: { status: 202, body: { status: 'pending' } },
    requests: [],
    serverFor(accountId) {
      if (!servers.has(accountId)) servers.set(accountId, makeFakeServer());
      return servers.get(accountId);
    },
    get server() {
      return state.serverFor(state.account.id);
    },
  };

  const corsFor = (request) => ({
    'access-control-allow-origin': request.headers().origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  });

  await context.route('**/auth/*', async (route) => {
    const request = route.request();
    const cors = corsFor(request);
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
      await (state.signedIn ? json(200, state.account) : json(401, { detail: 'Non authentifié' }));
    } else if (name === 'login') {
      if (state.loginReply.status === 200) {
        state.signedIn = true;
        state.account = state.loginReply.body.account ?? state.account;
      }
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

  // Ticket 099: answered from state.accounts, with the same transitions as
  // the server; only while the signed-in account is an admin.
  const targets = {
    approve: 'approved',
    refuse: 'refused',
    disable: 'disabled',
    enable: 'approved',
  };
  await context.route('**/admin/accounts**', async (route) => {
    const request = route.request();
    const cors = corsFor(request);
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const json = (status, payload) =>
      route.fulfill({
        status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    if (!state.signedIn) {
      await json(401, { detail: 'Non authentifié' });
      return;
    }
    if (!state.account.isAdmin) {
      await json(403, { detail: 'Réservé à l’administrateur' });
      return;
    }
    const parts = new URL(request.url()).pathname.split('/').filter(Boolean);
    if (request.method() === 'GET') {
      await json(200, state.accounts);
      return;
    }
    const [, , id, action] = parts;
    state.adminRequests.push({ id, action });
    const target = state.accounts.find((a) => a.id === id);
    if (!target) {
      await json(404, { detail: 'Compte introuvable.' });
    } else if (action === 'reset-password') {
      await json(200, { temporaryPassword: 'Temporaire2345678' });
    } else if (action === 'revoke-sessions') {
      await json(200, { status: 'ok' });
    } else {
      target.status = targets[action];
      target.decidedAt = new Date().toISOString();
      await json(200, { status: 'ok' });
    }
  });

  // The garden routes need the session cookie (here: state.signedIn) and, like
  // the real server, answer cross-origin calls from the page.
  const gardenRoute = async (route) => {
    const request = route.request();
    const cors = corsFor(request);
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (state.down) {
      await route.abort('failed');
      return;
    }
    const url = new URL(request.url());
    state.requests.push({ name: `${request.method()} ${url.pathname}`, body: null });
    const json = (status, payload) =>
      route.fulfill({
        status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    if (!state.signedIn) {
      await json(401, { detail: 'Non authentifié' });
      return;
    }
    const server = state.server;
    if (url.pathname === '/sync/pull') {
      await json(200, server.pull(Number(url.searchParams.get('since')) || 0));
    } else if (url.pathname === '/sync/push') {
      server.push(JSON.parse(request.postData()).changes);
      await json(200, { applied: 0 });
    } else if (url.pathname === '/sync/stats') {
      await json(200, {});
    } else if (url.pathname.startsWith('/photos/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      if (request.method() === 'PUT') {
        server.photos.set(id, {
          bytes: request.postDataBuffer(),
          mime: request.headers()['content-type'],
        });
        await json(201, { id });
      } else if (server.photos.has(id)) {
        const photo = server.photos.get(id);
        await route.fulfill({
          status: 200,
          headers: { ...cors, 'content-type': photo.mime },
          body: photo.bytes,
        });
      } else {
        await json(404, { detail: 'Photo introuvable' });
      }
    } else {
      await route.fulfill({ status: 404, headers: cors });
    }
  };
  await context.route('**/sync/*', gardenRoute);
  await context.route('**/photos/*', gardenRoute);
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
