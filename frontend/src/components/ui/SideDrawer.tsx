"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}

export function SideDrawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  width = "760px",
  children,
}: SideDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed top-0 right-0 h-full z-50 flex flex-col bg-dark-surface border-l border-dark-border shadow-2xl transition-transform duration-300 ease-out"
        style={{
          width,
          maxWidth: "92vw",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        {(title || actions) && (
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-dark-border shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <div className="text-sm font-semibold text-ink-primary leading-snug">
                  {title}
                </div>
              )}
              {subtitle && (
                <div className="text-[11px] text-ink-muted mt-0.5 leading-snug">
                  {subtitle}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actions}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-dark-raised transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}
