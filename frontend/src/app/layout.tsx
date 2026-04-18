"use client";
import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { OrgProvider } from "@/lib/org-context";
import { ProjectProvider } from "@/lib/project-context";

const PUBLIC_PATHS = ["/login", "/register", "/auth/callback"];

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!isLoading && !user && !isPublic) {
      router.push("/login");
    }
  }, [user, isLoading, isPublic, router]);

  // Public pages (login/register) render without the shell
  if (isPublic) return <>{children}</>;

  // Show nothing while checking auth
  if (isLoading || !user) return null;

  return (
    <OrgProvider>
      <ProjectProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-col flex-1 overflow-hidden min-w-0">
            <TopBar />
            <main className="flex-1 overflow-auto p-6 bg-dark-bg">
              {children}
            </main>
          </div>
        </div>
      </ProjectProvider>
    </OrgProvider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));

  return (
    <html lang="en" className="dark">
      <head>
        <title>Dottle — AI Agent Observability</title>
        <meta name="description" content="Catch agent drift before your users do" />
      </head>
      <body className="bg-dark-bg text-ink-primary">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
