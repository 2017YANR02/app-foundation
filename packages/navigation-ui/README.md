# Navigation UI

Local 0.1.3 candidate, not published. React navigation with host-owned links, labels, permissions and content. Import `NavigationShell` and `@app-foundation/navigation-ui/navigation.css`. Supply `items`, localized `labels`, `header(mobileToggle)` and a `renderLink` adapter; only supply authorized items. The host retains active-route matching, auth and navigation side effects.

CSS variables `--af-nav-expanded`, `--af-nav-header-height`, `--af-nav-sidebar-bg`, `--af-nav-content-bg`, `--af-nav-text`, `--af-nav-active`, `--af-nav-hover`, `--af-nav-selected` adapt each host. Use a host class with higher specificity to override defaults. Default expanded width 116px; collapsed 58px; 38px-high items with 3px vertical margins and 18px icons. Text and divider animate in 240ms; reduced motion disables transitions. Mobile uses a labelled toggle, backdrop and Escape dismissal. Keep the header above the drawer.

Mount the continuous-corners `SiteCorners` adapter once in the consuming root; inverse junctions use the same library geometry. Pass icons from the host/shared icons package. This package has no router, identity, storage or API dependencies. Fixed local artifact in both consumers; publish an immutable release before product deployment. React/ESM entry preserves the client boundary.

Optional `groups` preserves secondary collapsible menus (id, label, icon, items, defaultOpen). Each group uses native keyboard-accessible details/summary and the same fixed icon positions.

Use `contentAs="div"` when embedding inside an existing main landmark. Optional item `badge` shows host-owned counts and hides them in the collapsed rail.

The shared inverse corner paints above the content in an isolated layout layer, below the header and mobile drawer. Hidden navigation only changes its own direct layout body, so embedded navigation retains its corner and column geometry.
