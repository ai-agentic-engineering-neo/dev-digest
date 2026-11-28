import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const toWarn = (rules) =>
  Object.fromEntries(Object.entries(rules).map(([name]) => [name, 'warn']));

export default tseslint.config(
  { ignores: ['src/vendor/**', '.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    plugins: {
      '@next/next': nextPlugin,
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...toWarn(jsxA11y.flatConfigs.recommended.rules),
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              regex: '^(\\.\\./){3,}(lib|components)(/|$)',
              message: 'Import from lib/components through the "@/" alias, not a ../../../ climb.',
            },
            {
              group: ['@devdigest/ui/*'],
              message: 'Import UI only from the @devdigest/ui barrel.',
            },
          ],
        },
      ],
    },
  },
);
