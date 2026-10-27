"use client";
import { useId, useState, type AnchorHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { continuousCornerRadii } from "@2017yanr02/continuous-corners";

export type NavigationItem = { id: string; href: string; label: string; icon: ReactNode; badge?: ReactNode; active?: boolean };
export type NavigationGroup = { id: string; label: string; icon: ReactNode; items: readonly NavigationItem[]; defaultOpen?: boolean };
export type NavigationLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "onClick"> & { href: string; onClick?: () => void };
export type NavigationLabels = { navigation: string; show: string; hide: string; openMobile: string; closeMobile: string };
const corner = continuousCornerRadii({ width: 64, height: 64, radii: [20, 0, 0, 0] });
// Extend the outline beyond the SVG viewport so only the shared top-left
// curve and adjoining edges are painted, without an extra square border.
const cornerOutline = continuousCornerRadii({ width: 128, height: 128, radii: [20, 0, 0, 0] });
export function ContinuousInsetCorner({ className }: { className?: string }) {
  return <svg className={className} width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d={`M0 0H64V64H0Z ${corner.d}`} fill="currentColor" fillRule="evenodd" /><path d={cornerOutline.d} fill="none" stroke="var(--af-nav-outline, transparent)" strokeWidth="0.5" /></svg>;
}
export function SidebarToggle({ collapsed, onToggle, showLabel, hideLabel, controls }: { collapsed: boolean; onToggle: () => void; showLabel: string; hideLabel: string; controls?: string }) {
  const label = collapsed ? showLabel : hideLabel;
  return <button type="button" className="af-nav-toggle" aria-label={label} title={label} aria-expanded={!collapsed} aria-controls={controls} onClick={onToggle}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="3.5" /><path className="af-nav-divider" d="M9 4v16" /></svg></button>;
}
export function NavigationMenu({ items, collapsed, label, renderLink, onNavigate }: { items: readonly NavigationItem[]; collapsed: boolean; label: string; renderLink?: (props: NavigationLinkProps) => ReactNode; onNavigate?: () => void }) {
  return <nav className="af-nav-menu" aria-label={label}>{items.map(item => {
    const props: NavigationLinkProps = { href: item.href, className: "af-nav-link", "aria-current": item.active ? "page" : undefined, "aria-label": item.label, title: collapsed ? item.label : undefined, onClick: onNavigate, children: <><span className="af-nav-icon" aria-hidden="true">{item.icon}</span><span className="af-nav-label">{item.label}</span>{item.badge != null && <span className="af-nav-badge">{item.badge}</span>}</> };
    return <div className="af-nav-row" data-active={item.active || undefined} title={collapsed ? item.label : undefined} key={item.id}>{renderLink ? renderLink(props) : <a {...props} />}</div>;
  })}</nav>;
}
export function NavigationShell({ header, children, items, labels, renderLink, className = "", mainClassName = "", style, showNavigation = true, groups = [], collapseTarget = "sidebar", panelVisible = false, onPanelOpen, iconOnly = false, togglePlacement = "sidebar", mobileLayout = "drawer", contentAs: Content = "main" }: {
  header: (mobileToggle: ReactNode, desktopToggle: ReactNode) => ReactNode; children: ReactNode; items: readonly NavigationItem[]; labels: NavigationLabels; renderLink?: (props: NavigationLinkProps) => ReactNode; className?: string; mainClassName?: string; style?: CSSProperties; showNavigation?: boolean; groups?: readonly NavigationGroup[]; collapseTarget?: "sidebar" | "panel"; panelVisible?: boolean; onPanelOpen?: () => void; iconOnly?: boolean; togglePlacement?: "sidebar" | "header"; mobileLayout?: "drawer" | "rail"; contentAs?: "main" | "div";
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const id = useId();
  const panelCollapsed = !panelVisible || collapsed;
  const toggleCollapsed = collapseTarget === "panel" ? panelCollapsed : collapsed;
  const onToggle = () => {
    if (collapseTarget === "panel" && !panelVisible) {
      onPanelOpen?.();
      setCollapsed(false);
    } else {
      setCollapsed(value => !value);
    }
  };
  const sidebarCollapsed = iconOnly || (collapseTarget === "sidebar" && collapsed);
  const onNavigate = () => { setMobileOpen(false); if (collapseTarget === "panel") setCollapsed(false); };
  const desktopToggle = showNavigation ? <SidebarToggle collapsed={toggleCollapsed} onToggle={onToggle} showLabel={labels.show} hideLabel={labels.hide} controls={collapseTarget === "sidebar" ? `${id}-menu` : undefined} /> : null;
  const mobileToggle = showNavigation && mobileLayout === "drawer" ? <button type="button" className="af-nav-mobile-toggle" aria-label={mobileOpen ? labels.closeMobile : labels.openMobile} aria-expanded={mobileOpen} aria-controls={id} onClick={() => setMobileOpen(value => !value)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={mobileOpen ? "M6 6l12 12M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"} /></svg></button> : null;
  return <div className={`af-navigation ${className}`} style={style} data-collapsed={sidebarCollapsed} data-panel-collapsed={collapseTarget === "panel" && panelCollapsed} data-panel-visible={panelVisible} data-navigation={showNavigation} data-mobile-open={mobileOpen} data-mobile-layout={mobileLayout} onKeyDown={event => { if (event.key === "Escape") setMobileOpen(false); }}>
    {header(mobileToggle, togglePlacement === "header" ? desktopToggle : null)}
    <div className="af-nav-body">
      {showNavigation && <><ContinuousInsetCorner className="af-nav-corner" /><aside id={id} className="af-nav-sidebar">{togglePlacement === "sidebar" && desktopToggle}<div id={`${id}-menu`}><NavigationMenu items={items} collapsed={sidebarCollapsed} label={labels.navigation} renderLink={renderLink} onNavigate={onNavigate} />{groups.map(group => <details className="af-nav-group" key={group.id} open={group.defaultOpen || undefined}><summary className="af-nav-link" aria-label={group.label} title={sidebarCollapsed ? group.label : undefined}><span className="af-nav-icon" aria-hidden="true">{group.icon}</span><span className="af-nav-label">{group.label}</span></summary><NavigationMenu items={group.items} collapsed={sidebarCollapsed} label={group.label} renderLink={renderLink} onNavigate={onNavigate} /></details>)}</div></aside></>}
      {showNavigation && mobileOpen && <button type="button" className="af-nav-backdrop" aria-label={labels.closeMobile} onClick={() => setMobileOpen(false)} />}
      <Content className={`af-nav-main ${mainClassName}`}>{children}</Content>
    </div>
  </div>;
}

export { ResizeDivider, type ResizeDividerProps } from "./ResizeDivider.js";
