// Flat ESLint config. Run via `npm run lint`.
// Rules here are executable coding rules; the ones a linter cannot express
// live in CLAUDE.md under "Coding rules".
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-release/**',
      '.bundle-check/**',
      '.expo/**',
      'ios/**',
      'android/**',
      // Python virtualenv for the server; some pip packages (e.g. urllib3,
      // pulled in by pip-audit) ship .js files that are not ours to lint.
      'server/.venv/**',
      // Playwright's own output (npm run e2e:web); see .gitignore.
      'test-results/**',
      'playwright-report/**',
    ],
  },
  ...expoConfig,
  {
    rules: {
      // Dead imports and unused styles were widespread; treat them as errors.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // The UI is French: apostrophes are pervasive in ordinary copy and
      // escaping them as &apos; makes the text unreadable in source.
      'react/no-unescaped-entities': 'off',

      // A promise assigned without `await` is the bug class that silently broke
      // markReminderDone (a Promise was treated as a row). `await db.xAsync()`
      // parses as an AwaitExpression and does not match; `return db.xAsync()`
      // is a legitimate pass-through and is not a VariableDeclarator.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "VariableDeclarator[init.type='CallExpression'][init.callee.object.name='db'][init.callee.property.name=/Async$/]",
          message:
            'Missing await: db.*Async() returns a Promise. Write `const row = await db.getFirstAsync(...)`.',
        },
        {
          selector:
            "ExpressionStatement > CallExpression[callee.object.name='db'][callee.property.name=/Async$/]",
          message:
            'Missing await: db.*Async() returns a Promise. Await it, or return it if the caller awaits.',
        },
      ],

      // Alert.alert is a no-op on react-native-web (ticket 042). lib/dialogs.js
      // is the one place allowed to import it; every screen goes through its
      // showMessage/confirm/choose instead.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Alert'],
              message:
                'Alert.alert is a no-op on web. Use showMessage/confirm/choose from lib/dialogs.js instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['lib/dialogs.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Tests run under Jest, outside the React Native environment the Expo config
    // assumes. Globals are listed rather than pulled from the `globals` package
    // to avoid a dependency for eight names.
    files: ['**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Build and tooling scripts run in Node, not in the app.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Playwright config and specs run under Node/Playwright's test runner,
    // not the app or Jest.
    files: ['playwright.config.js', 'e2e/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
