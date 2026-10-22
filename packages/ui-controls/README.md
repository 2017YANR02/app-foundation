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
