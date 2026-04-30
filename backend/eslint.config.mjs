import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**']
  },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-console': 'off'
    }
  },
  {
  files: ['scripts/**/*.js'],
  languageOptions: {
    globals: {
      require: 'readonly',
      module: 'readonly'
    }
  }
}
  
];