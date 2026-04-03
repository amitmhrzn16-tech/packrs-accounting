"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  ArrowDownUp,
  TrendingUp,
  TrendingDown,
  Settings,
  LogOut,
  Tags,
  FileSpreadsheet,
  FileText,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  companyId?: string;
  companyName?: string;
}

export function Sidebar({ companyId, companyName }: SidebarProps) {
  const pathname = usePathname();

  const masterLinks = [
    { href: "/dashboard", label: "Master Dashboard", icon: LayoutDashboard },
  ];

  const companyLinks = companyId
    ? [
        {
          href: `/dashboard/companies/${companyId}`,
          label: "Dashboard",
          icon: LayoutDashboard,
        },
        {
          href: `/dashboard/companies/${companyId}/income`,
          label: "Income",
          icon: TrendingUp,
        },
        {
          href: `/dashboard/companies/${companyId}/expenses`,
          label: "Expenses",
          icon: TrendingDown,
        },
        {
          href: `/dashboard/companies/${companyId}/transactions`,
          label: "Transactions",
          icon: ArrowDownUp,
        },
        {
          href: `/dashboard/companies/${companyId}/reconciliation`,
          label: "Bank Reconciliation",
          icon: FileSpreadsheet,
        },
        {
          href: `/dashboard/companies/${companyId}/cash-reconciliation`,
          label: "Cash Reconciliation",
          icon: Wallet,
        },
        {
          href: `/dashboard/companies/${companyId}/reports`,
          label: "Reports",
          icon: FileText,
        },
        {
          href: `/dashboard/companies/${companyId}/settings`,
          label: "Settings",
          icon: Settings,
        },
      ]
    : [];

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              P
            </div>
            <span className="text-lg font-bold">Packrs</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Overview
          </p>
          {masterLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}

          {companyId && (
            <>
              <div className="my-4 border-t" />
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {companyName || "Company"}
              </p>
              {companyLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t p-4">
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
