# Vendored @n8n/chat browser bundle

**Version: 1.35.5** — `chat.bundle.umd.js`, taken verbatim from that release's
`dist/`. The matching stylesheet lives at `styles/n8n-chat.css`.

## Why this is vendored instead of installed

Installing `@n8n/chat` from npm pulls in n8n's *server* workflow engine as
transitive metadata:

```
@n8n/chat -> n8n-workflow -> @n8n/expression-runtime -> isolated-vm
                          -> ssh2
```

`isolated-vm` and `ssh2` are native C++ addons. `isolated-vm@7` declares
`engines.node >= 24` and ships prebuilds only for abi137 (Node 24) and abi147 —
there is **no abi127 build for Node 22**. On a Node 22 host npm therefore falls
back to compiling it with `node-gyp`, which needs Python and a C++ toolchain.
Shared hosting has neither, so `npm install` fails outright and the deploy dies
before the build ever starts.

None of that code is reachable from a browser. This bundle contains zero
references to `isolated-vm`, `ssh2`, `n8n-workflow` or `expression-runtime` —
it is UMD, self-contained (Vue included), and exposes `window.N8nChat`.
Shipping it directly removes ~650 packages and every native build step.

## How it is loaded

`components/ShopAIChat.tsx` injects it as a classic `<script>`, so no bundler
tries to resolve it and the import is invisible to webpack/Turbopack. Our theme
in `styles/chat-widget-theme.css` targets the widget's `#n8n-chat` DOM, which
this change does not alter.

## Updating it

```bash
npm pack @n8n/chat@<version>          # or npm i --no-save @n8n/chat@<version>
cp <extracted>/dist/chat.bundle.umd.js public/vendor/n8n-chat/
cp <extracted>/dist/style.css          styles/n8n-chat.css
```

Then re-check the launcher, the panel open/close animation, and the quick-reply
chips, since `ShopAIChat.tsx` augments the widget's DOM and a markup change
upstream can break those hooks. Record the new version at the top of this file.
