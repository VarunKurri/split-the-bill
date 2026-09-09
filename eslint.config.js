import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
      // Must stay last: turns off every rule Prettier already owns, so the
      // formatter and the linter never disagree about the same character.
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused args prefixed with _ are a deliberate signal, not an oversight.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Money is integer cents and the domain layer is pure — an implicit any
      // slipping into either is exactly the bug class we can least afford.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  // Test files run in Node and lean on Vitest globals via explicit imports.
  {
    files: ['**/*.test.ts'],
    languageOptions: { globals: globals.node },
  },

  // Config files are plain Node ESM and sit outside the app's type project.
  {
    files: ['*.config.js', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);
