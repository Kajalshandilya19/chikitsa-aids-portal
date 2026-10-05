const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const typescriptEslintParser = require('@typescript-eslint/parser');

/**
 * Same file in every service. Several AGENTS.md rules are enforced here so a mistake fails `npm run lint`
 * instead of review:
 *   R-RBAC-1  permission codes only through P.* (no 'pension:...' string literals outside permission-codes.ts)
 *   R-DB-3    no raw SQL string concatenation with template literals inside .query(...) except in migrations
 *   R-LOG-1   no console.log (use the logger, which redacts personal data)
 */
module.exports = [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '*.cjs', 'jest.config.ts', 'eslint.config.js'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
    },
    rules: {
      ...typescriptEslintPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^pension:[a-z_]+\\.[a-z_]+\\.[a-z_]+$/]",
          message: 'R-RBAC-1: use P.<NAME> from lib/permission-codes.ts, never a permission string literal.',
        },
        {
          selector: "CallExpression[callee.property.name='query'] > TemplateLiteral[expressions.length>0]",
          message: 'R-DB-3: never build SQL with ${...}. Use $1 placeholders and a parameter array.',
        },
      ],
    },
  },
  {
    // The catalogue itself, migrations (DDL with constant identifiers) and dev scripts may use these forms.
    files: ['src/lib/permission-codes.ts', 'src/migration/**/*.ts', 'src/dev/**/*.ts', 'src/lib/sequence-counter.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
];
