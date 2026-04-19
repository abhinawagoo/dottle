"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Zap } from "lucide-react";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      login(token).then((user: any) => {
        if (user?.onboarding_completed === false) {
          router.push("/onboarding");
        } else {
          router.push("/");
        }
      });
    } else {
      router.push("/login?error=oauth_failed");
    }
  }, [params, login, router]);

  return null;
}

// Google OAuth redirects here: /auth/callback?token=...
export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center animate-pulse">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <p className="text-sm text-ink-muted">Signing you in…</p>
      </div>
      <Suspense>
        <CallbackInner />
      </Suspense>
    </div>
  );
}
