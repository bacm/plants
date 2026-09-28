# Plants — working notes for Claude

Expo SDK 55 / React Native 0.83 app for managing ornamental garden plants: zones,
bloom periods, care reminders, photo history. Solo project, JavaScript (no
TypeScript), file-based routing via expo-router.

## Commands

| Command                                      | What it does                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                             | **Run before every commit.** lint + tests + secret scan + backlog index. ~5s.                                   |
| `npm run verify:full`                        | `verify` plus the three-platform bundle. What CI runs.                                                          |
| `npm run lint` / `lint:fix`                  | ESLint. Rules live in `eslint.config.js`.                                                                       |
| `npm run format` / `format:check`            | Prettier. `format:check` runs in `verify` and CI; run `format` before committing.                               |
| `npm run test`                               | Jest. Tests are in `lib/__tests__/`.                                                                            |
| `npm run backlog`                            | Regenerate `docs/backlog/INDEX.md` after touching a ticket.                                                     |
| `npm run bundle`                             | `expo export` for iOS + Android + web into `.bundle-check/`.                                                    |
| `cd server && .venv/bin/python -m pytest -q` | Server tests. Not in `verify`; CI runs them.                                                                    |
| `npm run e2e:web`                            | Playwright smoke test of the web build (`e2e/`). Slow; not in `verify` or CI.                                   |
| `npm run e2e:ios`                            | Maestro flows (`e2e/ios/`) on an iOS simulator in Expo Go. Needs Xcode, Maestro and JDK 17; ~13 min; not in CI. |
| `npm run deploy:iphone`                      | Release build installed on the connected iPhone; keeps the app's data. See `docs/DEPLOY-IPHONE.md`.             |
| `npm run setup`                              | One-time: enable the versioned git hooks.                                                                       |

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
lib/plantFields.js    the plant field list: columns, defaults, form <-> DB mapping
lib/enums.js          enum values and their French labels (type, sun, care kinds…)
lib/months.js         month names, isMonthInRange (handles year wrap)
lib/dates.js          date arithmetic on 'YYYY-MM-DD' strings, in UTC
lib/validation.js     month and date parsing for forms
lib/plantSearch.js    plant lookup via the search server
lib/theme.js          colors, spacing, typography, radius, shadow, colorHex
components/           GlassCard · GradientHero
server/               FastAPI proxy holding the OpenAI key (see server/README.md)
e2e/                  Playwright tests against the web build
```

### Invariants

1. **`lib/db.*` is the only place SQL or storage access may appear.** Screens
   import named functions; they never build a query. Keep it that way.
2. **`lib/db.js` and `lib/db.web.js` must export the same names.** Metro picks one
   per platform, so a name present in only one is a runtime crash on the other.
   `lib/__tests__/db-parity.test.js` enforces this. `KNOWN_WEB_GAPS` in that file
   is empty; an entry is debt and needs a ticket.
3. **All styling goes through `lib/theme.js`.** No raw hex in a component except
   `#fff` on an accent background.

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
3. **The plant field list lives only in `lib/plantFields.js`.** The ~30 columns
   used to be written out by hand in five places, which is how `imageUrls` ended
   up written nowhere. To add a field: one entry in `PLANT_FIELDS` plus a
   migration in `lib/db.js`. `plantFields.test.js` fails if the two disagree. Never
   list field names in a screen.
4. **Labels belong next to the enum they describe, not in the screen.** Enum
   labels are in `lib/enums.js`, month names in `lib/months.js`, `colorHex` in
   `lib/theme.js`. They used to be copied across seven files with diverging
   values. Import them; never declare a label map or month array in a screen.
5. **Never interpolate a caller-supplied key into SQL.** `updatePlant` builds its
   `SET` clause from object keys; `pickPlantUpdates` checks each against
   `PLANT_COLUMNS` and throws on an unknown one. Anything else that builds SQL
   from keys needs the same guard.
6. **Wrap a DB write that can fail in a `try`/`catch` and surface the error.** A
   swallowed constraint violation looks like a silent no-op to the user. The
   save handlers show `Alert.alert('Erreur', …)` and keep the user on the form.
7. **Month values are 1–12 and ranges can wrap the year.** `start <= m AND end >= m`
   silently misses a November-to-February bloom. Use `isMonthInRange`; never
   compare months in SQL. Validate input with `lib/validation.js`.
8. **No new dependency without declaring it in `package.json`.** `@expo/vector-icons`
   worked for a while only because it sat in Expo's nested `node_modules`.
   Expo SDK packages (`expo*`, `react`, `react-native*`, `jest-expo`…) are added
   and updated with `npx expo install`, never plain `npm install` — the SDK pins
   their versions, and Dependabot is configured to leave them alone.

## Working a ticket

Tickets live in `docs/backlog/` as one markdown file each — see
`docs/backlog/README.md` for the format, and `INDEX.md` for the current state.

The main session (Opus) is the planner and reviewer; cheaper subagents in
`.claude/agents/` do the bulk reading and editing. This keeps Opus tokens for
decisions.

| Agent         | Model  | Use for                                                                |
| ------------- | ------ | ---------------------------------------------------------------------- |
| main session  | Opus   | reading the ticket, design, the plan, reviewing the diff, commit       |
| `scout`       | Haiku  | "where is X defined / used?" — any search touching more than 2–3 files |
| `implementer` | Sonnet | executing the plan: edits, tests, `npm run verify`                     |

1. Pick a ticket and set its `status:` to `in-progress`.
2. Branch: `git checkout -b <type>/<id>-<slug>`, e.g. `fix/002-markreminderdone`.
3. **Plan (Opus).** Locate the code with `scout` rather than reading files
   wholesale. Write a plan precise enough to execute without judgement: files,
   functions, the change in each, the test to add, and which CLAUDE.md rules
   apply. Keep it to that ticket's scope — anything else you notice becomes a
   new ticket, not a bigger diff.
4. **Implement (`implementer`).** Hand it the plan. Add or extend a test when the
   change is testable. `lib/db.js` cannot be imported under Jest (it opens SQLite
   at module scope), so logic worth testing should be extracted into a pure
   module rather than left inline.
5. **Review (Opus).** Read `git diff`, not the whole files. If it is wrong, send
   the corrections back to `implementer` rather than re-editing in the main
   session. Check by eye what lint cannot: un-awaited async helpers (rule 1).
6. `npm run verify`. Check each acceptance criterion one by one against the
   code before ticking it — never tick the list in bulk. Then set `status: done`
   and run `npm run backlog`.
7. Commit. The pre-commit hook re-runs `verify`.

Skip the delegation for a change of a few lines — writing the plan would cost
more than making the edit.

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
