# Navigation UI

Local 0.2.8 candidate, not published. React navigation with host-owned links, labels, permissions and content. Import `NavigationShell` and `@app-foundation/navigation-ui/navigation.css`. Supply `items`, localized `labels`, `header(mobileToggle)` and a `renderLink` adapter; only supply authorized items. The host retains active-route matching, auth and navigation side effects.

CSS variables `--af-nav-expanded`, `--af-nav-header-height`, `--af-nav-sidebar-bg`, `--af-nav-content-bg`, `--af-nav-text`, `--af-nav-active`, `--af-nav-hover`, `--af-nav-selected` adapt each host. Use a host class with higher specificity to override defaults. Default expanded width 116px; collapsed 58px; 38px-high items with 3px vertical margins and 18px icons. Text and divider animate in 240ms; reduced motion disables transitions. Mobile uses a labelled toggle, backdrop and Escape dismissal. Keep the header above the drawer.

Mount the continuous-corners `SiteCorners` adapter once in the consuming root; inverse junctions use the same library geometry. Pass icons from the host/shared icons package. This package has no router, identity, storage or API dependencies. Fixed local artifact in both consumers; publish an immutable release before product deployment. React/ESM entry preserves the client boundary.

Optional `groups` preserves secondary collapsible menus (id, label, icon, items, defaultOpen). Each group uses native keyboard-accessible details/summary and the same fixed icon positions.

Use `contentAs="div"` when embedding inside an existing main landmark. Optional item `badge` shows host-owned counts and hides them in the collapsed rail.

The shared inverse corner paints above the content in an isolated layout layer, below the header and mobile drawer. Hidden navigation only changes its own direct layout body, so embedded navigation retains its corner and column geometry.

For an adjacent settings panel, use `collapseTarget="panel"` and set `panelVisible` while a panel is mounted. Apply `af-nav-panel` to its root. The desktop toggle then animates the adjacent panel and main-content offset while preserving the full navigation; choosing a navigation item expands it again. `--af-nav-panel-width` defaults to 400px. Panel contents and mobile presentation remain host-owned. `--af-nav-font-size` adapts type size. Active items also mark their shared row, so custom button adapters receive the same selected treatment as links.

Set `iconOnly` to retain the compact icon rail independently of the panel toggle. Desktop labels use native hover titles; mobile keeps visible labels for touch navigation.

In panel mode, pass `onPanelOpen` to mount the host-selected default panel when the toggle is activated without a visible panel. The toggle reports the actual panel visibility; an absent panel is collapsed.

Panel mounting does not replay a reveal animation; only changes to the shared collapsed state animate. Hosts switching panels should replace their active selection directly, without first dismissing it from sidebar pointer-down.

Use `togglePlacement="header"` to receive the shared desktop toggle as the second `header(mobileToggle, desktopToggle)` argument instead of rendering it inside the sidebar. The host owns toolbar layout and sets `--af-nav-header-height`; toggle behavior and responsive visibility remain shared.

Set `--af-nav-outline` to opt into a hairline along the shared continuous corner. Its geometry comes from the same corner library; the host may continue the straight panel edges using that color. The default remains transparent.

Use `mobileLayout="rail"` to keep the same icon rail, header toggle and adjacent panel on narrow screens. The default `drawer` layout is unchanged. On narrow screens the panel covers the content area, fits beside the rail, and uses the same collapse state and transitions. Hosts should reuse their panel contents instead of rendering separate mobile dialogs.

`ResizeDivider` is also available through the lightweight `@app-foundation/navigation-ui/resize-divider` entry; import `resize-divider.css` alongside it. It owns pointer capture, cancellation, dragging state and 16px arrow-key adjustments. Pass `getSize(handle)`, `onResize(handle, requested)` (returning the applied width), `direction` (1 for a left panel, -1 for a right panel), and a localized `label`. Hosts retain bounds, CSS variables and positioning. Extracted from CubeRoot TimerWorkspaceDivider; both Timer and the chat workspace consume this implementation.
