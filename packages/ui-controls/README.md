# UI controls

Controlled React primitives derived from CubeRoot. Import the stylesheet once.

```tsx
import { BoolToggle } from "@app-foundation/ui-controls";
import "@app-foundation/ui-controls/styles.css";

<BoolToggle value={enabled} onChange={setEnabled} label="自由查看" />
```

Label on the left, iOS-style switch on the right. Label click, keyboard switch and pointer dragging share the controlled value. Supports disabled, className, ariaLabel (required for non-text labels), and renderSwitch adapters. Two meaningful alternatives should use a select, not a boolean toggle. Agreement acceptance remains an explicit checkbox in consumer applications.

Theme tokens: --af-toggle-on, --af-control-foreground and --af-control-focus. No environment, application imports, storage or business logic. Local artifact 0.1.0; not published.

## Fields, hints and dialogs (0.2.0)

- `PasswordInput`: native input props (including ref), required `showLabel` / `hideLabel`, optional controlled `show` / `onShowChange`, `renderToggle(show)` for host icons, wrapper/toggle classes. No password policy or persistence. Toggle is keyboard accessible and follows input disabled state.
- `SearchInput`: controlled string `value` / `onChange`, required `clearLabel`, optional `debounceMs`, `inputClassName`, `ariaLabel`, `clearable`. Composition stays local until IME completion; clear commits immediately. Does not own a router, URL, request or result list.
- `Tooltip`: `content`, render-prop `children(triggerProps)`, optional `disabled`, `onlyWhenOverflow`, `openOnClick`. Spread onto the actual focusable trigger and compose any existing handlers. Text only: hover/focus, Escape and click dismissal; portal targets the active dialog/fullscreen root when needed. Interactive content belongs in Dialog.
- `Dialog`: controlled `open` / `onOpenChange`, native dialog attributes, optional `closeOnBackdrop` / `closeOnEscape` (both true). Supply `aria-label` or `aria-labelledby` and a visible close action. Native focus containment/restoration, nested scroll locks, inside-to-outside drag protection. Close only asks the host to update visibility; it never submits or navigates. Host owns heading, actions, dimensions and business gates.

```tsx
<PasswordInput showLabel="显示密码" hideLabel="隐藏密码" autoComplete="current-password" />
<SearchInput value={query} onChange={setQuery} clearLabel="清除搜索" ariaLabel="搜索" />
<Tooltip content="帮助">{tip => <button {...tip}>?</button>}</Tooltip>
<Dialog open={open} onOpenChange={setOpen} aria-labelledby="heading">
  <h2 id="heading">详情</h2><button onClick={() => setOpen(false)}>关闭</button>
</Dialog>
```

Additional tokens: `--af-control-border/background/radius`, `--af-tooltip-border/background/foreground`, `--af-dialog-backdrop`. Theme/localization/links stay with the host. Consumers import the namespaced stylesheet once; host classes can customize appearance. Version 0.2.0 is a local candidate, not a public release.

## Glass refraction (0.2.1)

```tsx
import { GlassOptics } from "@app-foundation/ui-controls/glass-optics";

<GlassOptics targetRef={headerRef} cssVariable="--header-refraction" />
```

Mount one instance per target and CSS property. Omit `targetRef` to attach to `document.body`. The component installs the backdrop-filter value on supported Chromium browsers and removes it on unmount. Set `displacementScale` to tune refraction (default `42`). An optional stable `onActiveChange(target, active)` callback lets the host update attributes when the filter is installed or removed.

## Glass surface (0.2.2)

Import `@app-foundation/ui-controls/glass-surface.css` and add `af-glass-surface`
to a positioned, isolated element with a transparent 1px border and the
desired radius. Keep its background transparent. The stylesheet paints a
one-pixel reflection and the backdrop on a separate layer behind the content.
It uses a solid fill for printing, reduced transparency and unsupported backdrop
filters, and a flat edge when border-area clipping is unavailable.

Set `--af-glass-fill` and `--af-glass-tint` to the host's solid and translucent
colors, `--af-glass-edge` to the theme edge, and `--af-glass-filter` to the
property installed by `GlassOptics` with a blur fallback. Optionally use
`--af-glass-rim` for an interaction-state gradient, `--af-glass-width: 0px`
for borderless surfaces, or `--af-glass-content: none` to suppress the layer.

### Site-wide material (0.2.3)

Set the theme inputs `--af-glass-card`, `--af-glass-popover`, `--af-glass-ink`
and `--af-glass-border` on the root theme. Mount one `SiteGlassOptics` from
the `glass-optics` entry. Scopes with a local theme can set the same
inputs on an element marked `data-af-glass-theme`.

### Liquid Glass Studio optics (0.2.4)

The shared renderer uses Liquid Glass Studio's edge refraction curve, RGB
dispersion and directional Fresnel highlights. It measures each visible rounded
surface and reuses the maps for matching geometry. Desktop Chromium samples the
live page through an SVG filter. Android, Safari and Firefox retain the
shape-aware highlights and use CSS frost for the site-wide backdrop. Reduced
transparency uses the solid fill.
The included notice pins the upstream source and preserves its MIT license.

Since 0.2.5, framed `data-site-surface="panel"` and `data-site-surface="popover"`
elements can also read `--af-studio-filter` and `--af-studio-rim` for direct
painting. Heading roles stay on the site-level material. At the contact edge,
the displacement returns smoothly to the unmodified backdrop.

Version 0.2.6 keeps recently viewed lens maps available for reverse scrolling,
shares generated CSS rules for equal shapes, and skips displacement baking
where the browser uses CSS frost. Framed surfaces with a flat background can
set `--af-glass-filter: none` to keep their tint and highlight without sampling
the backdrop.

The repository's `Liquid Glass Studio upstream` workflow checks the pinned
revision daily and assigns the owner an issue for each newly detected revision.
Updating the adopted revision follows the same package and consumer checks.

`af-glass-surface` uses the panel material by default. Set
`data-af-glass-role="popover|menu|dialog"` for a different tint density. For
elements that require direct painting, such as table headers, use the same
`--af-glass-*-bg` tokens and `--af-glass-backdrop`. Existing frames can use
`--af-glass-border-color`, `--af-glass-border-image` and
`--af-glass-border-clip` with a border-box background origin. Set
`--af-glass-inset: 0px` for a framed layer inside a host without a reserved border.
