"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";

interface Comment {
  id: string;
  transactionId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

interface CommentThreadProps {
  transactionId: string;
  initialCount?: number;
  onCountChange?: (count: number) => void;
}

export default function CommentThread({
  transactionId,
  initialCount = 0,
  onCountChange,
}: CommentThreadProps) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(initialCount);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/transactions/${transactionId}/comments`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list: Comment[] = data.comments || [];
        setComments(list);
        setCount(list.length);
        onCountChange?.(list.length);
      } catch {}
    };

    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, transactionId]);

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

  const submit = async () => {
    if (!draft.trim() || loading) return;
    setLoading(true);
    const content = draft.trim();
    setDraft("");
    try {
      const res = await fetch(`/api/transactions/${transactionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments((prev) => {
          const next = [...prev, newComment];
          setCount(next.length);
          onCountChange?.(next.length);
          return next;
        });
      } else {
        setDraft(content);
      }
    } catch {
      setDraft(content);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="relative p-1 text-gray-400 hover:text-blue-600 transition-colors"
        title="Comments"
      >
        <MessageSquare className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-7 z-40 w-80 rounded-lg border border-gray-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
            <span className="text-sm font-semibold text-gray-800">Comments</span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto p-3">
            {comments.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-400">
                No comments yet.
              </div>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="rounded-md bg-gray-50 p-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-blue-700">
                      {c.userName}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {formatTime(c.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-xs text-gray-800">
                    {c.content}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-gray-200 p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Add a comment…"
              className="w-full resize-none rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
            <div className="mt-1 flex justify-end">
              <button
                onClick={submit}
                disabled={!draft.trim() || loading}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
