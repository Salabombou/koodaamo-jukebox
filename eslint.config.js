import pluginJs from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * @type {import('eslint').Linter.Config}
 */
export default [
  { files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'] },
  { ignores: ['node_modules', 'build'] },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  prettier
];
