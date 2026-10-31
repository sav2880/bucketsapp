/* SPDX-License-Identifier: Apache-2.0 */
'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['engine.js', 'app.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, module: 'readonly' } },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the engine RNG (plan.md §6.3).' }],
      'prefer-const': 'error',
      'no-unused-vars': ['error', { args: 'after-used' }],
    },
  },
  {
    files: ['*.test.js', 'build.js', 'eslint.config.js', 'smoke.test.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: { eqeqeq: ['error', 'always', { null: 'ignore' }], 'prefer-const': 'error' },
  },
];
