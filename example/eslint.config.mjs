import tseslint from "typescript-eslint";
import eslint from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  recommendedConfig: eslint.configs.recommended,
});

const config = compat.extends(
  "@remix-run/eslint-config",
  "plugin:tailwindcss/recommended",
);

export default tseslint.config(
  ...config,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      "build",
      "functions",
      "postcss.config.cjs",
      "eslint.config.mjs",
      "node_modules",
      "public",
      "types",
    ],
  },
  {
    rules: {
      "import/no-amd": "off",
      "import/first": "off",
    },
  },
  {
    settings: {
      tailwindcss: {
        callees: ["cw"],
      },
    },
  },
);
