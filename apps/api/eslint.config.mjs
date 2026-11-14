import tseslint from 'typescript-eslint';
export default tseslint.config({
  ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
}, {
  files: ['src/**/*.ts', 'prisma/**/*.ts', 'test/**/*.ts'],
  languageOptions: { parser: tseslint.parser },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: { 'no-debugger': 'error', 'no-duplicate-imports': 'error' },
});
