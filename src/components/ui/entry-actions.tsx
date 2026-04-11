"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, XCircle, Edit2, Trash2, History, MoreHorizontal,
  Clock, Shield, AlertTriangle, X, ChevronDown,
} from "lucide-react";

// ==========================================
// Approval Status Badge
// ==========================================
interface ApprovalBadgeProps {
  status: string; // 'pending' | 'approved' | 'rejected'
  small?: boolean;
}

export function ApprovalBadge({ status, small }: ApprovalBadgeProps) {
  const styles: Record<string, { bg: string; text: string; icon: any }> = {
    pending: { bg: "bg-yellow-100 border-yellow-300", text: "text-yellow-700", icon: Clock },
    approved: { bg: "bg-green-100 border-green-300", text: "text-green-700", icon: CheckCircle },
    rejected: { bg: "bg-red-100 border-red-300", text: "text-red-700", icon: XCircle },
  };
  const s = styles[status] || styles.pending;
  const Icon = s.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${s.bg} ${s.text} ${small ? "text-[10px]" : "text-xs"} font-medium`}>
      <Icon className={small ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ==========================================
// Actions Dropdown (Edit / Delete / Approve / Reject / View Log)
// ==========================================
interface EntryActionsProps {
  entryId: string;
  approvalStatus: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onViewLog?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canApprove?: boolean;
}

export function EntryActions({
  entryId,
  approvalStatus,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onViewLog,
  canEdit = true,
  canDelete = true,
  canApprove = true,
}: EntryActionsProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Position dropdown below the button, aligned to the right
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 176), // 176 = w-44 (11rem)
      });
    }
    setOpen(!open);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[80] w-44 bg-white rounded-lg shadow-lg border py-1 text-sm"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {canEdit && onEdit && (
              <button
                onClick={() => { setOpen(false); onEdit(); }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50 text-gray-700"
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {canApprove && approvalStatus === "pending" && onApprove && (
              <button
                onClick={() => { setOpen(false); onApprove(); }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-green-50 text-green-700"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Approve
              </button>
            )}
            {canApprove && approvalStatus === "pending" && onReject && (
              <button
                onClick={() => { setOpen(false); onReject(); }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-50 text-red-600"
              >
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
            )}
            {onViewLog && (
              <button
                onClick={() => { setOpen(false); onViewLog(); }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-blue-50 text-blue-700"
              >
                <History className="h-3.5 w-3.5" /> View Log
              </button>
            )}
            {canDelete && onDelete && (
              <>
                <div className="border-t my-1" />
                <button
                  onClick={() => { setOpen(false); onDelete(); }}
                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-50 text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// Entry Log Viewer Modal
// ==========================================
interface LogEntry {
  id: string;
  action: string;
  fieldChanges?: Record<string, { old: any; new: any }> | null;
  performedByName?: string;
  performedBy?: string;
  changedBy?: string;
  performer?: string;
  notes?: string;
  details?: string;
  createdAt?: string;
  changedAt?: string;
  timestamp?: string;
}

interface EntryLogViewerProps {
  logs?: LogEntry[];
  loading?: boolean;
  onClose: () => void;
  title?: string;
  // Self-fetching mode: pass these instead of logs
  companyId?: string;
  module?: string;
  entryId?: string;
  // Legacy extra props (ignored but accepted to avoid type errors)
  entry?: any;
}

export function EntryLogViewer({ logs: propLogs, loading: propLoading, onClose, title = "Entry Log", companyId, module, entryId }: EntryLogViewerProps) {
  const [fetchedLogs, setFetchedLogs] = useState<LogEntry[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);

  // Self-fetching mode: if companyId + module + entryId are provided, fetch logs internally
  useEffect(() => {
    if (companyId && module && entryId) {
      setFetchLoading(true);
      fetch(`/api/companies/${companyId}/entry-logs?module=${module}&entryId=${entryId}&_t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          setFetchedLogs(data.logs || []);
        })
        .catch((err) => {
          console.error("EntryLogViewer fetch error:", err);
          setFetchedLogs([]);
        })
        .finally(() => setFetchLoading(false));
    }
  }, [companyId, module, entryId]);

  const logs = propLogs || fetchedLogs;
  const loading = propLoading || fetchLoading;
  const actionColors: Record<string, string> = {
    created: "text-green-600 bg-green-50",
    edited: "text-blue-600 bg-blue-50",
    deleted: "text-red-600 bg-red-50",
    approved: "text-emerald-600 bg-emerald-50",
    rejected: "text-orange-600 bg-orange-50",
    recovered: "text-purple-600 bg-purple-50",
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto max-h-[calc(80vh-56px)] p-4">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No log entries found</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[log.action] || "text-gray-600 bg-gray-50"}`}>
                      {log.action.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(log.createdAt || log.changedAt || log.timestamp || "").toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{log.performedByName || log.performedBy || log.changedBy || log.performer || "System"}</span>
                    {(log.notes || log.details) && <span className="text-gray-500"> — {log.notes || log.details}</span>}
                  </p>
                  {log.fieldChanges && Object.keys(log.fieldChanges).length > 0 && (
                    <div className="mt-2 text-xs bg-gray-50 rounded p-2 space-y-1">
                      {Object.entries(log.fieldChanges).map(([field, change]) => (
                        <div key={field} className="flex gap-2">
                          <span className="font-medium text-gray-600 min-w-[80px]">{field}:</span>
                          <span className="text-red-500 line-through">{String(change.old || "—")}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-green-600">{String(change.new || "—")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Confirm Delete Dialog
// ==========================================
interface ConfirmDeleteProps {
  title?: string;
  message?: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  isLoading?: boolean;
  open?: boolean;
}

export function ConfirmDeleteDialog({ title = "Delete Entry", message, description, onConfirm, onCancel, loading, isLoading, open }: ConfirmDeleteProps) {
  // Support open prop - if explicitly false, don't render
  if (open === false) return null;
  const isLoadingFinal = loading || isLoading || false;
  const displayMessage = message || description || "Are you sure? This action cannot be undone.";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6">{displayMessage}</p>
        <div className="flex gap-3">
          <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={isLoadingFinal}>
            {isLoadingFinal ? "Deleting..." : "Delete"}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
