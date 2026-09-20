import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        confirm: "readonly",
        alert: "readonly",
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ["**/*.jsx"],
    // eslint's core rule does not account for JSX references without the React parser.
    rules: { "no-unused-vars": "off" },
  },
];
