"use client";
import Link from "next/link";
import DottleMascot from "@/components/dottle-mascot";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center space-y-4">
        <DottleMascot variant="detecting" size={280} />
        <h1 className="text-2xl font-semibold text-ink-primary">Page not found</h1>
        <p className="text-sm text-ink-muted">
          The page you're looking for doesn't exist.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
