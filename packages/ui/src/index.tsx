"use client";
import * as React from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary:
      "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium",
    secondary:
      "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700",
    danger: "bg-rose-600 hover:bg-rose-500 text-white font-medium",
    ghost: "bg-transparent hover:bg-slate-800 text-slate-200",
  };
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-md text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
}) {
  return (
    <div
      className={`bg-slate-900/60 border border-slate-800 rounded-xl p-5 ${className}`}
    >
      {title && (
        <div className="text-sm font-medium text-slate-300 mb-3">{title}</div>
      )}
      {children}
    </div>
  );
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  return (
    <input
      {...props}
      className={`bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 w-full ${props.className ?? ""}`}
    />
  );
}

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly (string | number)[];
}) {
  return (
    <select
      {...props}
      className={`bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 w-full ${props.className ?? ""}`}
    >
      {options.map((o) => (
        <option key={String(o)} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warn" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-slate-800 text-slate-200 border-slate-700",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    warn: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    danger: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    info: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs uppercase tracking-wide text-slate-400 mb-1 block">
      {children}
    </label>
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`${maxWidth} w-full mx-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 py-4 border-b border-slate-800">
            <h3 className="text-lg font-bold text-slate-100">{title}</h3>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-6">
        <div className="text-slate-300 text-sm leading-relaxed">{message}</div>
        <div className="flex items-center gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? "Processing..." : confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
