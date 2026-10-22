"use client";

import { useEffect, useRef, type ComponentProps } from "react";

type DialogProps = Omit<ComponentProps<"dialog">, "open" | "ref"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
};
export type { DialogProps };
const locks = new WeakMap<Document, { count: number; overflow: string }>();
function lockScroll(doc: Document) {
  const lock = locks.get(doc) ?? { count: 0, overflow: doc.body.style.overflow };
  lock.count += 1;
  locks.set(doc, lock);
  doc.body.style.overflow = "hidden";
  return () => {
    lock.count -= 1;
    if (!lock.count) { doc.body.style.overflow = lock.overflow; locks.delete(doc); }
  };
}

/** Native modal focus containment, Escape handling and focus restoration. Supply an accessible name. */
export function Dialog({ open, onOpenChange, closeOnBackdrop = true, closeOnEscape = true, onCancel, onClose, onClick, onPointerDown, className = "", children, ...props }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const startedOutside = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    const unlock = lockScroll(dialog.ownerDocument);
    return () => { dialog.close(); unlock(); };
  }, [open]);
  const outside = (element: HTMLDialogElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  };
  return <dialog {...props} ref={ref} className={`af-dialog ${className}`}
    onCancel={event => { onCancel?.(event); const prevented = event.defaultPrevented; event.preventDefault(); if (!prevented && closeOnEscape) onOpenChange(false); }}
    onClose={event => { onClose?.(event); if (open && !event.currentTarget.open) onOpenChange(false); }}
    onPointerDown={event => { onPointerDown?.(event); startedOutside.current = event.target === event.currentTarget && outside(event.currentTarget, event.clientX, event.clientY); }}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented && closeOnBackdrop && startedOutside.current && event.target === event.currentTarget && outside(event.currentTarget, event.clientX, event.clientY)) onOpenChange(false); startedOutside.current = false; }}>
    {children}
  </dialog>;
}
