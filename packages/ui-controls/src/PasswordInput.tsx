"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";

export type PasswordInputProps = Omit<ComponentProps<"input">, "type"> & {
  showLabel: string;
  hideLabel: string;
  wrapperClassName?: string;
  toggleClassName?: string;
  show?: boolean;
  onShowChange?: (show: boolean) => void;
  renderToggle?: (show: boolean) => ReactNode;
};

export function PasswordInput({ showLabel, hideLabel, wrapperClassName = "", toggleClassName = "", show: controlledShow, onShowChange, renderToggle, className = "", id, ...props }: PasswordInputProps) {
  const generatedId = useId();
  const [ownShow, setOwnShow] = useState(false);
  const show = controlledShow ?? ownShow;
  const inputId = id ?? generatedId;
  return <div className={`af-password-input ${wrapperClassName}`}>
    <input {...props} id={inputId} type={show ? "text" : "password"} className={`af-password-field ${className}`} />
    <button type="button" className={`af-password-toggle ${toggleClassName}`} aria-label={show ? hideLabel : showLabel} aria-controls={inputId} aria-pressed={show} disabled={props.disabled}
      onClick={() => { if (controlledShow === undefined) setOwnShow(!show); onShowChange?.(!show); }}>
      {renderToggle ? renderToggle(show) : show ? hideLabel : showLabel}
    </button>
  </div>;
}
