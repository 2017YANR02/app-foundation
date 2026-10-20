# @app-foundation/icons

Use `BrandIcon` from the root with a typed `name`, `size`, optional `color`,
`className` and SVG accessibility props. Brand names include youtube, tiktok,
instagram, bilibili, douyin, xiaohongshu, kuaishou, wechat, wechat-official, qq,
and discord. Defaults match CubeRoot’s contact page; supply an aria-label for
standalone informative icons. Icons next to text are decorative by default.
The nine original Si components are also exported for direct customization.

Import any Lucide icon, helper or type from `@app-foundation/icons/lucide`.
This re-exports the entire installed lucide-react API, not a hand-maintained
subset. lucide-react is a peer so each host retains its current compatible
1.x version. ESM and CommonJS exports are separate, sideEffects is false and
Lucide’s entry is separate from brands to retain bundler tree shaking.
No accounts, URLs, follower counts, QR codes or page layout belong here.

0.1.0 is a local candidate. Both websites consume the exact same packed artifact;
immutable publication and site release remain separate from local extraction.
