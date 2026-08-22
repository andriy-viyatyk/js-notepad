// @ts-check
// Flat ESLint config (ESLint 9). Replaces the legacy .eslintrc.json.
// Scope is deliberately ts/tsx-only, matching the old `--ext .ts,.tsx` behavior —
// js/mjs/cjs (build scripts, this config) stay unlinted, exactly as before.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
    // Global ignores (flat-config replacement for ignorePatterns). The *.{js,jsx,mjs,cjs}
    // globs re-create the old `--ext .ts,.tsx` scope: only TypeScript is linted, so build
    // scripts, this config file, and vite/forge JS never enter the run.
    {
        ignores: [
            "scratches/**",
            "assets/editor-types/**",
            "out/**",
            ".vite/**",
            "dist/**",
            "release/**",
            "**/*.js",
            "**/*.jsx",
            "**/*.mjs",
            "**/*.cjs",
        ],
    },

    // The legacy .eslintrc did not report unused eslint-disable directives (eslintrc default
    // is "off"); ESLint 9 flat config defaults this to "warn". Keep the old behavior — the
    // codebase carries directives for rules that were renamed across the plugin upgrades, and
    // cleaning them up is a separate concern, not part of this toolchain migration.
    {
        linterOptions: {
            reportUnusedDisableDirectives: "off",
        },
    },

    // Main config — ts/tsx only.
    {
        files: ["**/*.ts", "**/*.tsx"],
        extends: [
            js.configs.recommended,
            // Array; bundles eslint-recommended (core-rule disables) + recommended TS rules.
            ...tseslint.configs.recommended,
            importPlugin.flatConfigs.recommended,
            importPlugin.flatConfigs.electron,
            importPlugin.flatConfigs.typescript,
        ],
        // react-hooks: pinned to the classic two rules (exact match of the pre-upgrade v4
        // surface). react-hooks v7's `recommended` additionally folds in the React-Compiler
        // rules — intentionally not adopted here.
        plugins: {
            "react-hooks": reactHooks,
        },
        languageOptions: {
            parser: tseslint.parser,
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
        },
        settings: {
            // Classic resolver form. eslint-plugin-import@2.32 does not honor the newer
            // `import/resolver-next`, so the string form is required; eslint-import-resolver
            // -typescript@4 remains backward-compatible with it.
            "import/resolver": {
                typescript: { alwaysTryTypes: true },
                node: true,
            },
        },
        rules: {
            // ---- react-hooks classic rules ----
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",

            // ---- carried over verbatim from .eslintrc.json ----
            "no-useless-escape": "off",
            "@typescript-eslint/no-empty-function": "off",
            "import/no-named-as-default-member": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    // v8 changed the `caughtErrors` default from "none" to "all"; restore the
                    // pre-upgrade behavior of not flagging unused catch bindings.
                    caughtErrors: "none",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],

            // ---- migrated to v8 successor rule names (same intent as the old off-switches) ----
            // old: @typescript-eslint/no-empty-interface (removed in v8, merged into this rule)
            "@typescript-eslint/no-empty-object-type": "off",
            // old: @typescript-eslint/no-var-requires (renamed in v8). The codebase intentionally
            // uses require(...) in documented spots (file-path.ts, fs.ts, etc.).
            "@typescript-eslint/no-require-imports": "off",

            // ---- newly-added v8 `recommended` rules disabled to preserve the pre-upgrade
            //      behavior (US-825 is a toolchain migration, not a code-cleanup task) ----
            // The script-API type surface uses `declare namespace` heavily.
            "@typescript-eslint/no-namespace": "off",
            // Intentional short-circuit / expression statements (e.g. `cond && doThing()`).
            "@typescript-eslint/no-unused-expressions": "off",

            // The @modelcontextprotocol/sdk 1.29 `exports` map uses a `./*` wildcard whose
            // `types` condition (`./dist/esm/*.d.ts`) can't satisfy the `.js`-suffixed deep
            // imports the SDK requires at runtime/bundle time — the TS resolver reports them
            // unresolved even though they build and run. Exempt just that package.
            "import/no-unresolved": ["error", { ignore: ["^@modelcontextprotocol/sdk/"] }],
        },
    },

    // Declaration files.
    {
        files: ["**/*.d.ts"],
        rules: {
            "no-var": "off",
            "@typescript-eslint/no-explicit-any": "off",
        },
    },

    // Areas that intentionally use `any`.
    {
        files: [
            "src/renderer/uikit/AVGrid/**/*.ts",
            "src/renderer/uikit/AVGrid/**/*.tsx",
            // av-grid's own generics default the row type to `any` (`AVGrid<R = any>`), so the
            // shim's props, instance type and prop-forwarding maps carry it through.
            "src/renderer/uikit/DataGrid/**/*.ts",
            "src/renderer/uikit/DataGrid/**/*.tsx",
            "src/renderer/editors/grid/**/*.ts",
            "src/renderer/editors/grid/**/*.tsx",
            "**/*.story.ts",
            "**/*.story.tsx",
            "assets/script-library/**/*.ts",
            "assets/script-library/**/*.tsx",
        ],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },

    // AVGrid models use the model-view pattern: a plain class exposes a `useModel()` method
    // that is invoked from a function component's render, so its useEffect calls are valid.
    // react-hooks v7's rules-of-hooks mis-flags them as "hook in a class component".
    {
        files: ["src/renderer/uikit/AVGrid/model/**/*.ts"],
        rules: {
            "react-hooks/rules-of-hooks": "off",
        },
    },

    // Rule 6: UIKit must not reach into application-layer modules. Stories are harnesses and
    // are intentionally excluded; resolved paths distinguish uikit/shared from src/shared.
    {
        files: ["src/renderer/uikit/**/*.ts", "src/renderer/uikit/**/*.tsx"],
        ignores: ["src/renderer/uikit/**/*.story.ts", "src/renderer/uikit/**/*.story.tsx"],
        rules: {
            "import/no-restricted-paths": ["error", {
                zones: [{
                    target: "./src/renderer/uikit",
                    from: [
                        "./src/renderer/api",
                        "./src/renderer/ui",
                        "./src/renderer/components",
                        "./src/shared",
                    ],
                    message: "Rule 6: uikit/ imports only core/ and theme/. Take app concepts through props/callbacks, or move the contract to core/.",
                }],
            }],
        },
    },

    // C4-1: av-grid is reached only through uikit/DataGrid, so a later decision to vendor the
    // library's source changes one folder instead of every consumer.
    {
        files: ["src/**/*.ts", "src/**/*.tsx"],
        ignores: ["src/renderer/uikit/DataGrid/**"],
        rules: {
            "no-restricted-imports": ["error", {
                paths: [{
                    name: "av-grid",
                    message: "EPIC-057 C4-1: import from uikit/DataGrid, not from av-grid directly.",
                }],
                patterns: ["av-grid/*"],
            }],
        },
    },
);
