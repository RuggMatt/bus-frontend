import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'build/']
  },
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        L: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: {
        L: 'readonly'
      }
    },
    rules: {
      'vue/max-attributes-per-line': [
        'error',
        {
          singleline: {
            max: 4
          },
          multiline: {
            max: 1
          }
        }
      ]
    }
  }
];



