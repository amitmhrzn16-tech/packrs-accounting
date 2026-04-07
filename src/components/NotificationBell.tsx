"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface CommentNotification {
  id: string;
  transactionId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  txnType: string;
  amount: number;
  particulars: string | null;
  txnDate: string;
  companyId: string;
  companyName: string;
}

const STORAGE_KEY = "packrs:last-seen-comment";

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<CommentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeen, setLastSeen] = useState<string>("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Load last-seen timestamp
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || "";
      setLastSeen(saved);
    } catch {}
  }, []);

  // Poll for all recent notifications
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/notifications/comments");
        if (!res.ok) return;
        const data = await res.json();
        const list: CommentNotification[] = data.notifications || [];
        if (cancelled) return;
        setAll(list);
        // Unread = created after lastSeen
        const unread = lastSeen
          ? list.filter((n) => n.createdAt > lastSeen).length
          : list.length;
        setUnreadCount(unread);
      } catch {}
    };

    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lastSeen]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, now);
    } catch {}
    setLastSeen(now);
    setUnreadCount(0);
  };

  const openBell = () => {
    setOpen(true);
  };

  const goToTransaction = (n: CommentNotification) => {
    const path =
      n.txnType === "income"
        ? `/dashboard/companies/${n.companyId}/income`
        : `/dashboard/companies/${n.companyId}/expenses`;
    markAllRead();
    setOpen(false);
    router.push(path);
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString();
    } catch {
      return "";
    }
  };

  const formatAmount = (n: number) =>
    new Intl.NumberFormat("en-NP", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <>
      <button
        onClick={openBell}
        className="fixed top-4 right-5 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow-md hover:bg-gray-50 border border-gray-200 transition"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed top-16 right-5 z-50 flex h-[480px] w-[380px] max-w-[95vw] flex-col rounded-xl border border-gray-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-gray-200 p-3">
            <div>
              <div className="font-semibold text-gray-800">Notifications</div>
              <div className="text-xs text-gray-500">New comments on entries</div>
            </div>
            <div className="flex items-center gap-2">
              {all.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {all.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-gray-400">
                <Bell className="h-10 w-10 mb-2 opacity-40" />
                <div className="text-sm">No notifications yet</div>
              </div>
            ) : (
              all.map((n) => {
                const isUnread = lastSeen ? n.createdAt > lastSeen : true;
                return (
                  <button
                    key={n.id}
                    onClick={() => goToTransaction(n)}
                    className={`block w-full border-b border-gray-100 p-3 text-left transition hover:bg-gray-50 ${
                      isUnread ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isUnread && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                        )}
                        <div className="truncate text-sm font-semibold text-gray-800">
                          {n.userName}
                        </div>
                      </div>
                      <div className="shrink-0 text-[10px] text-gray-400">
                        {formatTime(n.createdAt)}
                      </div>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-gray-700">
                      {n.content}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                      <span
                        className={`rounded px-1.5 py-0.5 font-semibold ${
                          n.txnType === "income"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {n.txnType}
                      </span>
                      <span className="truncate">
                        {n.companyName} · {n.txnDate} · Rs. {formatAmount(n.amount)}
                      </span>
                    </div>
                    {n.particulars && (
                      <div className="mt-1 truncate text-[11px] italic text-gray-500">
                        {n.particulars}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
