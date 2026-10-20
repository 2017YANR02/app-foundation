"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useWorkspace } from "./host";
export class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
export function useResource<T>(path: string) {
  const { api } = useWorkspace();
  const [state, setState] = useState<{ data?: T; error?: RequestError; key: string }>({ key: "" });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const key = `${revision}:${path}`;
  useEffect(() => {
    let live = true;
    api<T>(path).then(data => { if (live) setState({ data, key }); }).catch(error => { if (live) setState({ error, key }); });
    return () => { live = false; };
  }, [path, key, api]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, loading: state.key !== key, reload };
}
export function ErrorNotice({ error, retry }: { error?: Error; retry?: () => void }) {
  const { Button, t } = useWorkspace();
  if (!error) return null;
  return <div className="staff-error" role="alert"><p>{error.message}</p>{retry && <Button type="button" variant="secondary" size="sm" onClick={retry}>{t("重新加载")}</Button>}</div>;
}
export function Form({ submit, children, success }: { submit: (data: FormData, button: string) => Promise<void>; children: ReactNode; success?: string }) {
  const { t } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const data = new FormData(event.currentTarget);
    const button = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? "";
    lock.current = true; setBusy(true); setError(undefined); setDone(false);
    try { await submit(data, button); setDone(true); } catch (cause) { setError(cause instanceof Error ? cause : new Error(t("操作失败"))); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form onSubmit={onSubmit}><fieldset disabled={busy} className="staff-form">{children}</fieldset><ErrorNotice error={error} />{busy && <p role="status">{t("正在保存…")}</p>}{done && success && <p className="staff-success" role="status">{success}</p>}</form>;
}
export const value = (data: FormData, key: string) => String(data.get(key) ?? "");
export const dateTime = (time: number) => new Date(time * 1000).toLocaleString("zh-CN", { hour12: false });
export function today() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="staff-field"><span>{label}</span>{children}</label>; }
