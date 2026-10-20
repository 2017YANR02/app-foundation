"use client";
import { createContext, useContext, type ComponentType, type ReactNode, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
export type WorkspaceApi = <T>(action: string, body?: unknown) => Promise<T>;
export type WorkspaceHost = {
  api: WorkspaceApi;
  navigate: (path: string) => void;
  Link: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;
  Button: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: "secondary"; size?: "sm" }>;
  t: (text: string) => string;
};
const Context = createContext<WorkspaceHost | null>(null);
export function WorkspaceProvider({ host, children }: { host: WorkspaceHost; children: ReactNode }) { return <Context.Provider value={host}>{children}</Context.Provider>; }
export function useWorkspace() { const host = useContext(Context); if (!host) throw new Error("WorkspaceProvider is required"); return host; }
export function WorkspaceShell({ brand, title, navigation, actions, children }: { brand: string; title: string; navigation: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return <div className="staff-workspace"><header className="staff-header"><span className="staff-brand">{brand}</span><div className="staff-header-actions">{actions}</div></header><div className="staff-layout"><nav className="staff-nav">{navigation}</nav><main className="staff-main"><div className="staff-page-heading"><h1>{title}</h1></div>{children}</main></div></div>;
}

export function WorkspaceLoginFrame({ brand, children }: { brand: string; children: ReactNode }) { return <main className="staff-login staff-workspace"><section className="staff-panel staff-login-card"><p className="staff-eyebrow">{brand}</p>{children}</section></main>; }
