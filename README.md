> [!IMPORTANT]
> Notes for testers:
>
> Uses an Anthropic API key. Currently pre-defined in the playground environment with ~$4.75 in token usage available (auto-bill disabled). Uses Sonnet for cost-efficiency.
>
> When testing, you should see the app is in playground mode, and there should be two directory trees available to explore: excalidraw-app, and vantage-web. If you see only one much smaller repo with references to an online checkout/cart, refresh the page. This should cause the app to load the correct playground. (I'm not sure what the root issue is here, but I noticed it last-minute.) Please let me know if you encounter any other issues getting the app launched, as this is my first time deploying with Fly.io.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
