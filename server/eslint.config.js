// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'clones/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // DI adapters/interfaces intentionally have unused params on some
      // implementations (e.g. mocks) — allow an explicit underscore escape.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
