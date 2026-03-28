/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: [
    './index.js',
    'plugin:@next/eslint-plugin-next/core-web-vitals',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
  settings: {
    react: { version: 'detect' },
  },
};
