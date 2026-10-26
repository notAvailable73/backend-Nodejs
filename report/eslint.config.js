import js from "@eslint/js";
import globals from "globals";

// Static analysis for the report: ESLint's recommended rule set for Node ESM
export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: globals.node,
        },
    },
];
