"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, orgsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Eye, EyeOff, Zap } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError("");
    setLoading(true);
    try {
      // 1. Register user
      const data = await authApi.register(name, email, password);
      await login(data.token);
      // 2. Create first org
      if (orgName.trim()) {
        await orgsApi.create(orgName.trim());
      }
      router.push("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-ink-primary tracking-tight">Agentloop</span>
        </div>

        <div className="bg-dark-surface border border-dark-border rounded-2xl p-8 shadow-card">
          <h1 className="text-base font-semibold text-ink-primary mb-1">Create account</h1>
          <p className="text-xs text-ink-muted mb-6">Start observing your AI agents for free</p>

          {/* Google SSO */}
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/auth/google`}
            className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl border border-dark-border bg-dark-raised hover:bg-dark-bg text-sm text-ink-secondary hover:text-ink-primary transition-colors mb-5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-dark-divider" />
            <span className="text-[11px] text-ink-dim">or</span>
            <div className="flex-1 h-px bg-dark-divider" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Full name</label>
              <input className="input-dark" placeholder="Ada Lovelace" value={name}
                onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Work email</label>
              <input type="email" className="input-dark" placeholder="ada@company.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} className="input-dark pr-10"
                  placeholder="8+ characters" value={password}
                  onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink-secondary transition-colors">
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="form-label">Organization name</label>
              <input className="input-dark" placeholder="Acme Inc." value={orgName}
                onChange={(e) => setOrgName(e.target.value)} />
              <p className="text-[10px] text-ink-dim mt-1">You can create more orgs later</p>
            </div>

            {error && (
              <p className="text-xs text-status-red bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full justify-center" loading={loading}>
              Create account
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-muted mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-400 hover:text-brand-400/80 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
