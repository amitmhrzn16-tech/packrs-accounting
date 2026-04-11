"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MainContent } from "@/components/dashboard/main-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus, DollarSign, TrendingUp, TrendingDown, AlertCircle,
  X, Edit2, Trash2, Eye, MoreVertical
} from "lucide-react";
import { FileUpload, AttachmentBadge, AttachmentViewer } from "@/components/ui/file-upload";
import { ApprovalBadge, EntryActions, EntryLogViewer, ConfirmDeleteDialog } from "@/components/ui/entry-actions";

interface Company {
  id: string;
  name: string;
}

interface Transfer {
  id: string;
  fromCompanyId: string;
  fromCompanyName: string;
  toCompanyId: string;
  toCompanyName: string;
  amount: number;
  transferDate: string;
  paymentMethod: string;
  referenceNo?: string;
  description?: string;
  transferType: string;
  status: string;
  approvalStatus: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  attachmentUrl?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

interface LoanAccount {
  id: string;
  counterpartyId: string;
  counterpartyName: string;
  accountType: string;
  principalAmount: number;
  interestRate: number;
  interestAccrued: number;
  amountPaid: number;
  balance: number;
  startDate: string;
  dueDate?: string;
  status: string;
  notes?: string;
}

interface PageProps {
  params: { companyId: string };
}

const TRANSFER_TYPES = [
  { value: "loan", label: "Loan" },
  { value: "repayment", label: "Repayment" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
];

const PAYMENT_METHODS = [
  { value: "bank", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
];

export default function IntercompanyPage({ params }: PageProps) {
  const companyId = params.companyId;

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loanAccounts, setLoanAccounts] = useState<LoanAccount[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyCurrency, setCompanyCurrency] = useState("NPR");
  const [companyName, setCompanyName] = useState("");
  const [summary, setSummary] = useState({ totalSent: 0, totalReceived: 0, netPosition: 0 });

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    toCompanyId: "",
    amount: "",
    transferDate: new Date().toISOString().split("T")[0],
    paymentMethod: "bank",
    transferType: "loan",
    referenceNo: "",
    description: "",
    attachmentUrl: "",
  });

  // Edit modal
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [editForm, setEditForm] = useState({
    amount: "",
    description: "",
    paymentMethod: "bank",
    referenceNo: "",
  });

  // Entry log viewer
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logViewerTransferId, setLogViewerTransferId] = useState("");
  const [logViewerLogs, setLogViewerLogs] = useState<any[]>([]);
  const [logViewerLoading, setLogViewerLoading] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState("");

  const [saving, setSaving] = useState(false);
  const [viewAttachment, setViewAttachment] = useState("");

  useEffect(() => {
    fetchCompany();
    fetchCompanies();
  }, [companyId]);

  useEffect(() => {
    fetchTransfers();
  }, [companyId]);

  async function fetchCompany() {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      const data = await res.json();
      setCompanyCurrency(data.currency || "NPR");
      setCompanyName(data.name || "");
    } catch (err) {
      console.error("fetchCompany error:", err);
    }
  }

  async function fetchCompanies() {
    try {
      const res = await fetch("/api/companies?all=true&_t=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      const list = data.companies || data || [];
      setCompanies((Array.isArray(list) ? list : []).map((c: any) => ({ id: c.id, name: c.name })));
    } catch (err) {
      console.error("fetchCompanies error:", err);
    }
  }

  async function fetchTransfers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/intercompany?_t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setTransfers(data.transfers || []);
      setLoanAccounts(data.loanAccounts || []);
      setSummary(data.summary || { totalSent: 0, totalReceived: 0, netPosition: 0 });
    } catch (err) {
      console.error("fetchTransfers error:", err);
    }
    setLoading(false);
  }

  async function handleCreateTransfer() {
    if (!form.toCompanyId || !form.amount || !form.transferDate) {
      alert("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/intercompany`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toCompanyId: form.toCompanyId,
          amount: Number(form.amount),
          transferDate: form.transferDate,
          paymentMethod: form.paymentMethod,
          transferType: form.transferType,
          referenceNo: form.referenceNo,
          description: form.description,
          attachmentUrl: form.attachmentUrl,
        }),
      });

      if (res.ok) {
        setShowForm(false);
        setForm({
          toCompanyId: "",
          amount: "",
          transferDate: new Date().toISOString().split("T")[0],
          paymentMethod: "bank",
          transferType: "loan",
          referenceNo: "",
          description: "",
          attachmentUrl: "",
        });
        await fetchTransfers();
      } else {
        alert("Failed to create transfer");
      }
    } catch (err) {
      console.error("createTransfer error:", err);
      alert("Error creating transfer");
    }
    setSaving(false);
  }

  async function handleEditTransfer() {
    if (!editingTransfer) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/intercompany`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTransfer.id,
          action: "edit",
          amount: editForm.amount ? Number(editForm.amount) : undefined,
          description: editForm.description,
          paymentMethod: editForm.paymentMethod,
          referenceNo: editForm.referenceNo,
        }),
      });

      if (res.ok) {
        setShowEditForm(false);
        await fetchTransfers();
      } else {
        alert("Failed to edit transfer");
      }
    } catch (err) {
      console.error("editTransfer error:", err);
      alert("Error editing transfer");
    }
    setSaving(false);
  }

  async function handleApproveTransfer(transferId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/intercompany`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: transferId, action: "approve" }),
      });

      if (res.ok) {
        await fetchTransfers();
      } else {
        alert("Failed to approve transfer");
      }
    } catch (err) {
      console.error("approveTransfer error:", err);
      alert("Error approving transfer");
    }
    setSaving(false);
  }

  async function handleRejectTransfer(transferId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/intercompany`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: transferId, action: "reject" }),
      });

      if (res.ok) {
        await fetchTransfers();
      } else {
        alert("Failed to reject transfer");
      }
    } catch (err) {
      console.error("rejectTransfer error:", err);
      alert("Error rejecting transfer");
    }
    setSaving(false);
  }

  async function handleDeleteTransfer(transferId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/intercompany?id=${transferId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setShowDeleteConfirm(false);
        await fetchTransfers();
      } else {
        alert("Failed to delete transfer");
      }
    } catch (err) {
      console.error("deleteTransfer error:", err);
      alert("Error deleting transfer");
    }
    setSaving(false);
  }

  async function handleViewLog(transferId: string) {
    setLogViewerTransferId(transferId);
    setLogViewerLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/entry-logs?module=intercompany&entryId=${transferId}&_t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setLogViewerLogs(data.logs || []);
    } catch (err) {
      console.error("getEntryLogs error:", err);
      setLogViewerLogs([]);
    }
    setLogViewerLoading(false);
    setShowLogViewer(true);
  }

  function openEditForm(transfer: Transfer) {
    setEditingTransfer(transfer);
    setEditForm({
      amount: String(transfer.amount),
      description: transfer.description || "",
      paymentMethod: transfer.paymentMethod,
      referenceNo: transfer.referenceNo || "",
    });
    setShowEditForm(true);
  }

  const otherCompanies = companies.filter((c) => c.id !== companyId);
  const receivables = loanAccounts.filter((l) => l.accountType === "loan_receivable");
  const payables = loanAccounts.filter((l) => l.accountType === "loan_payable");

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />
      <MainContent className="overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Intercompany Transfers</h1>
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Transfer
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Sent</p>
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(summary.totalSent, companyCurrency)}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-red-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Received</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(summary.totalReceived, companyCurrency)}
                    </p>
                  </div>
                  <TrendingDown className="h-8 w-8 text-green-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Net Position</p>
                    <p className={`text-2xl font-bold ${summary.netPosition >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(summary.netPosition, companyCurrency)}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-gray-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Loans</p>
                    <p className="text-2xl font-bold text-blue-600">{loanAccounts.filter((l) => l.status === "active").length}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transfers List */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : transfers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No transfers yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">From → To</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-600">Amount</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Method</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Approval</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map((t) => (
                        <tr key={t.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">{formatDate(t.transferDate)}</td>
                          <td className="py-3 px-4">
                            <span className="text-xs">
                              {t.fromCompanyName} <span className="text-gray-400">→</span> {t.toCompanyName}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {formatCurrency(t.amount, companyCurrency)}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-xs">
                              {t.transferType}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-xs text-gray-600">{t.paymentMethod}</td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={t.status === "completed" ? "default" : t.status === "rejected" ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {t.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <ApprovalBadge status={t.approvalStatus} small />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <EntryActions
                              entryId={t.id}
                              approvalStatus={t.approvalStatus}
                              onEdit={() => openEditForm(t)}
                              onDelete={() => {
                                setDeleteTargetId(t.id);
                                setShowDeleteConfirm(true);
                              }}
                              onApprove={() => handleApproveTransfer(t.id)}
                              onReject={() => handleRejectTransfer(t.id)}
                              onViewLog={() => handleViewLog(t.id)}
                              canEdit={t.approvalStatus === "pending"}
                              canApprove={t.approvalStatus === "pending"}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Loan Accounts Section */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* Receivables */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loan Receivables</CardTitle>
              </CardHeader>
              <CardContent>
                {receivables.length === 0 ? (
                  <p className="text-sm text-gray-500">No loan receivables</p>
                ) : (
                  <div className="space-y-3">
                    {receivables.map((l) => (
                      <div key={l.id} className="border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-sm">{l.counterpartyName}</p>
                          <Badge
                            variant={l.status === "active" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {l.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                          <div>
                            <p className="text-gray-500">Principal</p>
                            <p className="font-semibold text-gray-900">{formatCurrency(l.principalAmount, companyCurrency)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Balance</p>
                            <p className="font-semibold text-green-600">{formatCurrency(l.balance, companyCurrency)}</p>
                          </div>
                        </div>
                        {l.interestRate > 0 && (
                          <div className="text-xs text-gray-500 mt-2">
                            Interest: {l.interestRate}% ({formatCurrency(l.interestAccrued, companyCurrency)})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payables */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loan Payables</CardTitle>
              </CardHeader>
              <CardContent>
                {payables.length === 0 ? (
                  <p className="text-sm text-gray-500">No loan payables</p>
                ) : (
                  <div className="space-y-3">
                    {payables.map((l) => (
                      <div key={l.id} className="border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-sm">{l.counterpartyName}</p>
                          <Badge
                            variant={l.status === "active" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {l.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                          <div>
                            <p className="text-gray-500">Principal</p>
                            <p className="font-semibold text-gray-900">{formatCurrency(l.principalAmount, companyCurrency)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Balance</p>
                            <p className="font-semibold text-red-600">{formatCurrency(l.balance, companyCurrency)}</p>
                          </div>
                        </div>
                        {l.interestRate > 0 && (
                          <div className="text-xs text-gray-500 mt-2">
                            Interest: {l.interestRate}% ({formatCurrency(l.interestAccrued, companyCurrency)})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Create Transfer Modal */}
          {showForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <Card className="w-full max-w-lg">
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Create New Transfer</CardTitle>
                  <button onClick={() => setShowForm(false)} className="p-1">
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>To Company *</Label>
                    <select
                      value={form.toCompanyId}
                      onChange={(e) => setForm({ ...form, toCompanyId: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                    >
                      <option value="">Select company...</option>
                      {otherCompanies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Amount *</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Transfer Date *</Label>
                    <Input
                      type="date"
                      value={form.transferDate}
                      onChange={(e) => setForm({ ...form, transferDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Payment Method</Label>
                    <select
                      value={form.paymentMethod}
                      onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Transfer Type</Label>
                    <select
                      value={form.transferType}
                      onChange={(e) => setForm({ ...form, transferType: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                    >
                      {TRANSFER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Reference No</Label>
                    <Input
                      placeholder="Optional"
                      value={form.referenceNo}
                      onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <textarea
                      placeholder="Optional"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Attachment</Label>
                    <FileUpload
                      onFileUploaded={(url: string) => setForm({ ...form, attachmentUrl: url })}
                      currentUrl={form.attachmentUrl}
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleCreateTransfer}
                      disabled={saving}
                      className="flex-1"
                    >
                      {saving ? "Saving..." : "Create"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowForm(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Edit Transfer Modal */}
          {showEditForm && editingTransfer && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <Card className="w-full max-w-lg">
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Edit Transfer</CardTitle>
                  <button onClick={() => setShowEditForm(false)} className="p-1">
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Payment Method</Label>
                    <select
                      value={editForm.paymentMethod}
                      onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Reference No</Label>
                    <Input
                      placeholder="Optional"
                      value={editForm.referenceNo}
                      onChange={(e) => setEditForm({ ...editForm, referenceNo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <textarea
                      placeholder="Optional"
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleEditTransfer}
                      disabled={saving}
                      className="flex-1"
                    >
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowEditForm(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Entry Log Viewer */}
          {showLogViewer && (
            <EntryLogViewer
              logs={logViewerLogs}
              loading={logViewerLoading}
              onClose={() => setShowLogViewer(false)}
              title="Transfer Log"
            />
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <ConfirmDeleteDialog
              title="Delete Transfer"
              message="Are you sure you want to delete this transfer? This action cannot be undone."
              onConfirm={() => handleDeleteTransfer(deleteTargetId)}
              onCancel={() => setShowDeleteConfirm(false)}
              isLoading={saving}
            />
          )}
        </div>
      </MainContent>
    </div>
  );
}
