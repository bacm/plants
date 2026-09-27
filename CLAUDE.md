# Plants — working notes for Claude

Expo SDK 55 / React Native 0.83 app for managing ornamental garden plants: zones,
bloom periods, care reminders, photo history. Solo project, JavaScript (no
TypeScript), file-based routing via expo-router.

## Commands

| Command | What it does |
| --- | --- |
| `npm run verify` | **Run before every commit.** lint + tests + secret scan + backlog index. ~5s. |
| `npm run verify:full` | `verify` plus the three-platform bundle. What CI runs. |
| `npm run lint` / `lint:fix` | ESLint. Rules live in `eslint.config.js`. |
| `npm run test` | Jest. Tests are in `lib/__tests__/`. |
| `npm run backlog` | Regenerate `docs/backlog/INDEX.md` after touching a ticket. |
| `npm run bundle` | `expo export` for iOS + Android + web into `.bundle-check/`. |
| `npm run setup` | One-time: enable the versioned git hooks. |

A `PostToolUse` hook lints every `.js` file right after you edit it and blocks on
errors. If you see ESLint output come back at you, fix it before continuing —
do not disable the rule to move on.

## Architecture

```
app/_layout.js        initDb() then <Stack>
app/(tabs)/           index (dashboard) · zones/ · bloom · library
app/plant/            [id] (detail, 3 tabs) · new · edit · log · reminders
app/zone/new.js
lib/db.js             SQLite — every platform except web
lib/db.web.js         localStorage shim — web only, resolved by Metro
lib/plantSearch.js    plant lookup via the OpenAI API
lib/theme.js          colors, spacing, typography, radius, shadow
components/           GlassCard · GradientHero
```

### Invariants

1. **`lib/db.*` is the only place SQL or storage access may appear.** Screens
   import named functions; they never build a query. Keep it that way.
2. **`lib/db.js` and `lib/db.web.js` must export the same names.** Metro picks one
   per platform, so a name present in only one is a runtime crash on the other.
   `lib/__tests__/db-parity.test.js` enforces this; `KNOWN_WEB_GAPS` in that file
   is the current debt and must only ever shrink.
3. **All styling goes through `lib/theme.js`.** No raw hex in a component except
   `#fff` on an accent background.
4. `App.js` and `index.js` are leftover Expo template files. `main` is
   `expo-router/entry`, so they are never loaded. Do not edit them.

## Coding rules

Each of these exists because it was violated and cost something.

1. **Await every promise.** `lib/db.js` mixes async reads (`getAllAsync`) with sync
   writes (`runSync`). A missing `await` on a read yields a Promise that reads as a
   truthy object, so the bug is silent — this is exactly how `markReminderDone`
   became a no-op. ESLint catches the `db.*Async()` shape; it cannot catch a
   screen calling an async helper without awaiting, so check that by eye.
2. **Never read a secret from `EXPO_PUBLIC_*`.** Metro inlines those variables into
   the shipped bundle, where anyone can read them. Secrets belong behind a server.
   `npm run secrets` enforces this, with per-file debt tracked in
   `scripts/secret-exceptions.txt`.
3. **One source of truth for the plant field list.** The ~30 plant columns are
   currently written out by hand in `createPlant`, `normalizeToForm`, `new.js` and
   `edit.js`. Adding a field means touching all of them, which is how `imageUrls`
   ended up written nowhere. When you touch this area, extend the shared
   definition rather than adding a fifth copy.
4. **Labels belong next to the enum they describe, not in the screen.** Month
   names, `SUN_LABELS`, `CARE_LABELS`, `colorHex` and friends are currently
   duplicated across 5–7 files with inconsistent values. Do not add a copy; move
   the set you need into a shared module and import it.
5. **Never interpolate a caller-supplied key into SQL.** `updatePlant` builds its
   `SET` clause from the keys of an object. If you extend it, validate keys
   against an explicit field list — the interpolation is the whole reason that
   list has to exist.
6. **Wrap a DB write that can fail in a `try`/`catch` and surface the error.**
   There is currently no error handling around any write, so a constraint
   violation is swallowed and the user sees a silent no-op.
7. **Month values are 1–12 and ranges can wrap the year.** Queries of the shape
   `start <= m AND end >= m` silently miss a November-to-February bloom. Validate
   month inputs on entry; handle wrap in the query.
8. **No new dependency without declaring it in `package.json`.** `@expo/vector-icons`
   worked for a while only because it sat in Expo's nested `node_modules`.

## Working a ticket

Tickets live in `docs/backlog/` as one markdown file each — see
`docs/backlog/README.md` for the format, and `INDEX.md` for the current state.

1. Pick a ticket and set its `status:` to `in-progress`.
2. Branch: `git checkout -b <type>/<id>-<slug>`, e.g. `fix/002-markreminderdone`.
3. Make the change. Keep it to that ticket's scope — anything else you notice
   becomes a new ticket, not a bigger diff.
4. Add or extend a test when the change is testable. `lib/db.js` cannot be
   imported under Jest (it opens SQLite at module scope), so logic worth testing
   should be extracted into a pure module rather than left inline.
5. `npm run verify`, then set `status: done` and run `npm run backlog`.
6. Commit. The pre-commit hook re-runs `verify`.

Do not close a ticket that is partly done. Split it and say what is left.

## Commits

One logical change per commit. Imperative subject under 72 characters, no trailing
period, English:

```
Fix markReminderDone never advancing nextDueDate

The missing await made the guard read nextDueDate off a Promise, so the
function returned before updating anything. Callers now await it.

Refs: docs/backlog/002-fix-markreminderdone-no-op.md
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Reference the ticket with `Refs:`. Never commit `dist/`, `.bundle-check/`, `.env`,
or a generated `INDEX.md` that disagrees with the tickets.

## Debt markers

Known, deliberate compromises are marked in code and validated by `verify`, so
they cannot be quietly forgotten:

- `eslint-disable` comments must name the ticket that will remove them.
- `KNOWN_WEB_GAPS` in `lib/__tests__/db-parity.test.js` — web shim gaps.
- `scripts/secret-exceptions.txt` — files still reading a secret from the client.

If you add a marker, add the ticket in the same change.
