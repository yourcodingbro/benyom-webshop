import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Authored application code must declare return types explicitly.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/components/shadcn/**', 'src/app/(payload)/**', 'src/payload-types.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true, allowTypedFunctionExpressions: true }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
  {
    ignores: ['.next/', 'node_modules/', 'next-env.d.ts', 'src/payload-types.ts', 'src/app/(payload)/admin/importMap.js', 'src/migrations/**'],
  },
]

export default eslintConfig
