/**
 * Guards the native/web data-layer contract.
 *
 * Metro resolves `lib/db.web.js` on web and `lib/db.js` everywhere else, so every
 * screen import must exist in both. When it does not, the web build does not fail
 * to bundle — it crashes at runtime with "X is not a function", or silently drops
 * columns. This test makes that divergence a build-time failure instead.
 *
 * Neither module is imported here: lib/db.js calls SQLite.openDatabaseSync() at
 * module scope, which cannot run under Jest. The export lists are read from the
 * source AST instead.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const LIB = path.join(__dirname, '..');

/**
 * Known gaps in the web shim, tracked by docs/backlog/005-decide-web-target.md.
 * Closing that ticket means emptying this set. Do not add to it: a new entry
 * means a screen has just gained a way to crash on web.
 */
const KNOWN_WEB_GAPS = new Set([]);

function exportedNames(file) {
  const source = fs.readFileSync(path.join(LIB, file), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const names = new Set();

  for (const node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      // export function foo() {} / export const foo = ...
      if (node.declaration?.type === 'FunctionDeclaration') {
        names.add(node.declaration.id.name);
      } else if (node.declaration?.type === 'VariableDeclaration') {
        for (const d of node.declaration.declarations) names.add(d.id.name);
      }
      // export { foo, bar as baz }
      for (const spec of node.specifiers ?? []) {
        names.add(spec.exported.name);
      }
    }
  }
  return names;
}

describe('lib/db.js and lib/db.web.js expose the same surface', () => {
  const native = exportedNames('db.js');
  const web = exportedNames('db.web.js');

  it('parses a plausible number of exports from both modules', () => {
    // Cheap sanity check: if the extractor silently breaks, every other
    // assertion in this file would pass vacuously.
    expect(native.size).toBeGreaterThan(20);
    expect(web.size).toBeGreaterThan(20);
  });

  it('has no native export missing from the web shim beyond the known gaps', () => {
    const missing = [...native].filter((n) => !web.has(n) && !KNOWN_WEB_GAPS.has(n));
    expect(missing).toEqual([]);
  });

  it('has no web export missing from the native module', () => {
    // This direction has no allowlist: a web-only export means a screen works on
    // web and breaks on the platform the app actually ships to.
    const missing = [...web].filter((n) => !native.has(n));
    expect(missing).toEqual([]);
  });

  it('does not list gaps that have already been closed', () => {
    // Keeps KNOWN_WEB_GAPS honest: an entry that now exists on both sides is
    // stale and must be removed, or the allowlist stops meaning anything.
    const stale = [...KNOWN_WEB_GAPS].filter((n) => web.has(n));
    expect(stale).toEqual([]);
  });
});
