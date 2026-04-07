"use client";

import { useEffect, useRef, useState } from "react";

type ConversationUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Channel = {
  id: string;
  name: string;
};

type Message = {
  id: string;
  senderId: string;
  senderName?: string;
  recipientId?: string | null;
  companyId?: string | null;
  content: string;
  createdAt: string;
};

type ActiveConversation =
  | { kind: "dm"; userId: string; name: string }
  | { kind: "channel"; companyId: string; name: string };

interface ChatWidgetProps {
  currentUserId: string;
  currentUserName: string;
}

export default function ChatWidget({ currentUserId, currentUserName }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ConversationUser[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<ActiveConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"dms" | "channels">("dms");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversations list when opened
  useEffect(() => {
    if (!open) return;
    fetch("/api/chat/conversations")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users || []);
        setChannels(data.channels || []);
      })
      .catch(() => {});
  }, [open]);

  // Fetch messages for active conversation + poll every 4s
  useEffect(() => {
    if (!active || !open) return;
    let cancelled = false;

    const load = async () => {
      const url =
        active.kind === "dm"
          ? `/api/chat/dm/${active.userId}`
          : `/api/chat/channel/${active.companyId}`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMessages(data.messages || []);
        }
      } catch {}
    };

    load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, open]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!active || !draft.trim() || loading) return;
    setLoading(true);
    const content = draft.trim();
    setDraft("");
    const url =
      active.kind === "dm"
        ? `/api/chat/dm/${active.userId}`
        : `/api/chat/channel/${active.companyId}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        // Optimistic append
        const now = new Date().toISOString();
        setMessages((prev) => [
          ...prev,
          {
            id: `tmp-${Date.now()}`,
            senderId: currentUserId,
            senderName: currentUserName,
            content,
            createdAt: now,
          },
        ]);
      } else {
        setDraft(content);
      }
    } catch {
      setDraft(content);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString([], {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition"
        title="Open chat"
        aria-label="Open chat"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[540px] w-[760px] max-w-[95vw] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
      {/* Sidebar */}
      <div className="flex w-56 flex-col border-r border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 p-3">
          <span className="font-semibold text-gray-800">Chat</span>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-500 hover:text-gray-800"
            aria-label="Close chat"
          >
            ×
          </button>
        </div>
        <div className="flex border-b border-gray-200 text-sm">
          <button
            className={`flex-1 py-2 ${tab === "dms" ? "border-b-2 border-blue-600 font-semibold text-blue-700" : "text-gray-600"}`}
            onClick={() => setTab("dms")}
          >
            Direct (Users)
          </button>
          <button
            className={`flex-1 py-2 ${tab === "channels" ? "border-b-2 border-blue-600 font-semibold text-blue-700" : "text-gray-600"}`}
            onClick={() => setTab("channels")}
          >
            Channels
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tab === "channels" ? (
            channels.length === 0 ? (
              <div className="p-3 text-xs text-gray-500">No channels available.</div>
            ) : (
              channels.map((c) => {
                const isActive = active?.kind === "channel" && active.companyId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() =>
                      setActive({ kind: "channel", companyId: c.id, name: c.name })
                    }
                    className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                      isActive ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-700"
                    }`}
                  >
                    # {c.name}
                  </button>
                );
              })
            )
          ) : users.length === 0 ? (
            <div className="p-3 text-xs text-gray-500">
              No other users found. Ask an admin to add teammates in User
              Management.
            </div>
          ) : (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-500">
                Start a chat with
              </div>
              {users.map((u) => {
              const isActive = active?.kind === "dm" && active.userId === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => setActive({ kind: "dm", userId: u.id, name: u.name })}
                  className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    isActive ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-700"
                  }`}
                >
                  {u.name}
                  <span className="block truncate text-xs text-gray-500">{u.email}</span>
                </button>
              );
              })}
            </>
          )}
        </div>
      </div>

      {/* Conversation pane */}
      <div className="flex flex-1 flex-col">
        <div className="border-b border-gray-200 p-3">
          <div className="text-sm font-semibold text-gray-800">
            {active
              ? active.kind === "channel"
                ? `# ${active.name}`
                : active.name
              : "Select a conversation"}
          </div>
          {active?.kind === "channel" && (
            <div className="text-xs text-gray-500">Company channel</div>
          )}
        </div>
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-gray-50 p-3">
          {!active ? (
            <div className="pt-10 text-center text-sm text-gray-500">
              Pick a channel or user on the left to start chatting.
            </div>
          ) : messages.length === 0 ? (
            <div className="pt-10 text-center text-sm text-gray-500">
              No messages yet. Say hi!
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === currentUserId;
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                      mine
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-800 border border-gray-200"
                    }`}
                  >
                    {!mine && (
                      <div className="mb-0.5 text-xs font-semibold text-blue-700">
                        {m.senderName || "User"}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    <div
                      className={`mt-1 text-[10px] ${
                        mine ? "text-blue-100" : "text-gray-400"
                      }`}
                    >
                      {formatTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-gray-200 p-2">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!active}
              rows={2}
              placeholder={active ? "Type a message…" : "Select a conversation"}
              className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={!active || !draft.trim() || loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
