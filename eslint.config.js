import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const restrictedLayers = (layers) => [
  'error',
  {
    patterns: layers.map((layer) => ({
      group: [`**/${layer}/**`],
      message: `Слой не должен зависеть от ${layer}.`,
    })),
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      '.worktrees/**',
      'playwright-report/**',
      'test-results/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedLayers([
        'application',
        'infrastructure',
        'presentation',
        'app',
      ]),
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedLayers(['infrastructure', 'presentation', 'app']),
    },
  },
  {
    files: ['src/presentation/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedLayers(['infrastructure']),
    },
  },
);
