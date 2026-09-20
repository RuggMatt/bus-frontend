const { defineConfig } = require("eslint/config");
const globals = require("globals");
const js = require("@eslint/js");
const vue = require("eslint-plugin-vue");

module.exports = defineConfig([
  {
    ignores: ["dist/**"],
  },
  js.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        L: "readonly",
      },
    },
    rules: {
      "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
      "vue/max-attributes-per-line": [
        "error",
        {
          singleline: {
            max: 4,
          },
          multiline: {
            max: 1,
          },
        },
      ],
    },
  },
]);
