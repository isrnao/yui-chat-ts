/_ eslint-disable _/

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x';
import reactDom from 'eslint-plugin-react-dom';

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
});
```

## Supabase Configuration

This project saves chat logs to Supabase. Create a `.env` file based on `.env.example` and provide your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values.

### `save-chat` Edge Function

Chat messages are **not** inserted directly from the client. All inserts go through the
`save-chat` Edge Function (`supabase/functions/save-chat`), which derives `ip` / `ua` from request
headers server-side so they are tamper-proof. The client (and `pnpm dev`) will fail with
`Failed to send a request to the Edge Function` until this function is deployed to the project that
`VITE_SUPABASE_URL` points to:

```bash
supabase functions deploy save-chat
```

Deploying the function alone is safe and has no effect on existing clients. Locking down direct
INSERT via RLS is a separate, later step — see
[docs/save-chat-edge-function.md](docs/save-chat-edge-function.md) for the full staged rollout
(function deploy → client deploy → RLS migration) and the rationale.

## Styling Notes

- The root `main` element owns the viewport height via `min-h-dvh`; descendant panes should rely on flex sizing plus `overflow-y-auto` instead of duplicating `min-height` styles.
- Layout containers apply horizontal padding once with `px-[var(--page-gap)]`. Any child that needs to span edge to edge should add the `bleed-x` utility class.
- Design tokens (brand colors, IE-inspired grays, and the retro font stack) live in `src/styles/theme.css`, making classes like `bg-yui-green`, `border-ie-gray`, and `font-yui` available across the app.
