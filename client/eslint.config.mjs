// Flat ESLint config — a small, high-value rule set (docs/improvement-plan.md X1b/X1c).
// Errors only; rule sources: skill frontend-ui-architecture references/enforcement.md.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    settings: { 'import/resolver': { typescript: { project: './tsconfig.json' } } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // X1b — a runtime import from the vendored contracts 500s the Next build (client/INSIGHTS.md).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@devdigest/shared',
              allowTypeImports: true,
              message: 'Runtime imports from @devdigest/shared break the Next build — use `import type`.',
            },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],

      // X1c — hooks.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // X1c — import direction: vendor ← lib ← components ← app.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/lib', from: ['./src/components', './src/app'] },
            { target: './src/components', from: './src/app' },
            { target: './src/vendor', from: ['./src/lib', './src/components', './src/app'] },
          ],
        },
      ],
      'import/no-cycle': 'error',
    },
  },
);
