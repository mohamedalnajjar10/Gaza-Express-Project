import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.ts', 'prisma/**/*.ts', 'test/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-console': 'error',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/maintenance/prune.ts', 'prisma/seed.ts', 'test/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
