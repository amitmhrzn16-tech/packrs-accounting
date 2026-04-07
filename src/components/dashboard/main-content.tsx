"use client";

import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "@/hooks/use-sidebar";

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MainContent({ children, className }: MainContentProps) {
  const collapsed = useSidebarCollapsed();

  return (
    <div
      className={cn(
        "flex-1 transition-all duration-300",
        collapsed ? "ml-16" : "ml-64",
        className
      )}
    >
      {children}
    </div>
  );
}
