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
      // Leftover Expo template entry points; `main` is expo-router/entry.
      // Tracked by docs/backlog/013-remove-dead-code.md.
      'App.js',
      'index.js',
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
];
