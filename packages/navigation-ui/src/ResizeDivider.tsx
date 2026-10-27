"use client";
import { useRef, useState, type ButtonHTMLAttributes } from "react";

export interface ResizeDividerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onResize"> {
  label: string;
  /** Positive movement grows a panel on the left; negative grows one on the right. */
  direction?: 1 | -1;
  getSize: (handle: HTMLElement) => number;
  /** The host owns layout constraints and returns the applied width. */
  onResize: (handle: HTMLElement, requested: number) => number | undefined;
}

/** Shared pointer capture, cancellation and keyboard contract for dock dividers. */
export function ResizeDivider({ label, direction = 1, getSize, onResize, className = "", ...props }: ResizeDividerProps) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState<number>();
  const resize = (handle: HTMLElement, requested: number) => {
    const next = onResize(handle, requested);
    if (next !== undefined) setWidth(next);
  };
  const finish = () => { drag.current = null; setDragging(false); };
  return <button {...props} type="button" role="separator" aria-orientation="vertical" aria-label={label}
    aria-valuenow={width} aria-valuetext={width === undefined ? undefined : `${width}px`} title={label}
    className={`resize-divider ${className}${dragging ? " is-dragging" : ""}`}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      drag.current = { x: event.clientX, width: getSize(event.currentTarget) };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }}
    onPointerMove={event => {
      if (drag.current) resize(event.currentTarget, drag.current.width + (event.clientX - drag.current.x) * direction);
    }}
    onPointerUp={event => {
      finish();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onLostPointerCapture={finish} onPointerCancel={finish}
    onKeyDown={event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      resize(event.currentTarget, getSize(event.currentTarget) + (event.key === "ArrowRight" ? 16 : -16) * direction);
    }} />;
}
