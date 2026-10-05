import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'videos', 'coverage', '_site', 'site-videos', 'templates/**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Dev scripts run in Node and evaluate snippets in the browser page.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', document: 'readonly', window: 'readonly' },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
