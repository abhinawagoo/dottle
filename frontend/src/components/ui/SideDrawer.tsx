"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Width CSS value — defaults to "60vw". Also accepts px values. */
  width?: string;
  children: React.ReactNode;
  /** Optional: pass to enable prev/next navigation */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

const MIN_WIDTH = 400;
const DEFAULT_VW = 60;

export function SideDrawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  width,
  children,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: SideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Initialise width from prop or default to 60vw
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    if (width && width.endsWith("px")) return parseInt(width, 10);
    return Math.round(window.innerWidth * DEFAULT_VW / 100);
  });

  // ── Drag resize ──────────────────────────────────────────────────────────────
  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = drawerRef.current?.offsetWidth ?? drawerWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, [drawerWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX.current - e.clientX; // drag left = wider
      const next = Math.max(MIN_WIDTH, Math.min(startWidth.current + delta, window.innerWidth * 0.92));
      setDrawerWidth(next);
    };
    const onUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev && hasPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && onNext && hasNext) { e.preventDefault(); onNext(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, onPrev, onNext, hasPrev, hasNext]);

  // ── Body scroll lock ─────────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop — clicking outside closes */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        className="fixed top-0 right-0 h-full z-50 flex flex-col bg-dark-surface border-l border-dark-border shadow-2xl transition-transform duration-300 ease-out"
        style={{
          width: `${drawerWidth}px`,
          maxWidth: "92vw",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Drag handle — left edge */}
        <div
          onMouseDown={onHandleMouseDown}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize z-10 group hover:bg-brand-500/30 transition-colors"
          title="Drag to resize"
        >
          {/* Visual pip in the centre */}
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1 h-8 rounded-r bg-dark-border group-hover:bg-brand-500/60 transition-colors" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border shrink-0">
          {/* Prev / Next navigation */}
          {(onPrev || onNext) && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-dark-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous session (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onNext}
                disabled={!hasNext}
                className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-dark-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next session (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="min-w-0 flex-1">
            {title && (
              <div className="text-sm font-semibold text-ink-primary leading-snug truncate">{title}</div>
            )}
            {subtitle && (
              <div className="text-[11px] text-ink-muted mt-0.5 leading-snug">{subtitle}</div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}
