"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sidebar-collapsed";

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");

    const handler = () => {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    };
    window.addEventListener("sidebar-toggle", handler);
    return () => window.removeEventListener("sidebar-toggle", handler);
  }, []);

  return collapsed;
}

export function toggleSidebar() {
  const current = localStorage.getItem(STORAGE_KEY) === "true";
  localStorage.setItem(STORAGE_KEY, String(!current));
  window.dispatchEvent(new Event("sidebar-toggle"));
}
