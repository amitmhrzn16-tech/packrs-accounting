"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebarCollapsed, toggleSidebar } from "@/hooks/use-sidebar";
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
  Database,
  PanelLeftClose,
  PanelLeft,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  companyId?: string;
  companyName?: string;
}

export function Sidebar({ companyId, companyName }: SidebarProps) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();

  const masterLinks = [
    { href: "/dashboard", label: "Master Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/users", label: "User Management", icon: Users },
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
          href: `/dashboard/companies/${companyId}/dms-sync`,
          label: "DMS Sync",
          icon: Database,
        },
        {
          href: `/dashboard/companies/${companyId}/settings`,
          label: "Settings",
          icon: Settings,
        },
      ]
    : [];

  return (
    <>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo + Toggle */}
          <div className="flex h-16 items-center justify-between border-b px-3">
            <Link
              href="/dashboard"
              className={cn(
                "flex items-center gap-2",
                collapsed && "justify-center w-full"
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                P
              </div>
              {!collapsed && <span className="text-lg font-bold">Packrs</span>}
            </Link>
            {!collapsed && (
              <button
                onClick={toggleSidebar}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Expand button when collapsed */}
          {collapsed && (
            <div className="flex justify-center py-2">
              <button
                onClick={toggleSidebar}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Expand sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-2">
            {!collapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Overview
              </p>
            )}
            {masterLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                title={collapsed ? link.label : undefined}
                className={cn(
                  "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                  collapsed
                    ? "justify-center px-2"
                    : "gap-3 px-3",
                  pathname === link.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                {!collapsed && link.label}
              </Link>
            ))}

            {companyId && (
              <>
                <div className="my-4 border-t" />
                {!collapsed && (
                  <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {companyName || "Company"}
                  </p>
                )}
                {companyLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    title={collapsed ? link.label : undefined}
                    className={cn(
                      "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                      collapsed
                        ? "justify-center px-2"
                        : "gap-3 px-3",
                      pathname === link.href
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <link.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && link.label}
                  </Link>
                ))}
              </>
            )}
          </nav>

          {/* Footer */}
          <div className="border-t p-2">
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                title={collapsed ? "Sign Out" : undefined}
                className={cn(
                  "flex w-full items-center rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  collapsed ? "justify-center px-2" : "gap-3 px-3"
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!collapsed && "Sign Out"}
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
