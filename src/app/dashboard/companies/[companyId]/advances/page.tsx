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
  Plus, AlertTriangle, CheckCircle, Clock, DollarSign, ArrowDownRight,
  X, ChevronDown, ChevronUp, ShieldAlert, Send, MoreVertical, Trash2, Edit2, ThumbsUp, ThumbsDown, Eye
} from "lucide-react";
import { FileUpload, AttachmentBadge, AttachmentViewer } from "@/components/ui/file-upload";
import { ApprovalBadge, EntryActions, EntryLogViewer, ConfirmDeleteDialog } from "@/components/ui/entry-actions";

interface Staff {
  id: string;
  name: string;
  role: string;
  salaryAmount: number;
  isActive: boolean;
}

interface Recovery {
  id: string;
  amount: number;
  recoveryDate: string;
  recoveryMethod: string;
  notes?: string;
  recoveredByName?: string;
}

interface Advance {
  id: string;
  staff_id: string;
  staffName: string;
  staffRole: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNo?: string;
  reason?: string;
  dueAmount: number;
  status: string;
  recoveryDeadline?: string;
  notes?: string;
  createdByName: string;
  createdAt: string;
  attachmentUrl?: string;
  recoveries: Recovery[];
  interestRate?: number;
  customDeductionAmount?: number;
  approvalStatus?: string;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "esewa", label: "eSewa" },
  { value: "khalti", label: "Khalti" },
  { value: "cheque", label: "Cheque" },
];

const RECOVERY_METHODS = [
  { value: "cash_return", label: "Cash Return" },
  { value: "bank_return", label: "Bank Return" },
  { value: "salary_deduction", label: "Salary Deduction" },
];

const ADVANCE_LIMIT = 3000;

interface PageProps {
  params: { companyId: string };
}

export default function AdvancesPage({ params }: PageProps) {
  const companyId = params.companyId;

  const [advances, setAdvances] = useState<Advance[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyCurrency, setCompanyCurrency] = useState("NPR");
  const [companyName, setCompanyName] = useState("");
  const [summary, setSummary] = useState({ total_advances: 0, total_given: 0, total_outstanding: 0, total_recovered: 0 });
  const [filterStaff, setFilterStaff] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    staffId: "", amount: "", paymentDate: "", paymentMethod: "cash",
    referenceNo: "", reason: "", recoveryDeadline: "", notes: "", attachmentUrl: "",
    interestRate: "0", customDeductionAmount: "",
  });
  const [viewAttachment, setViewAttachment] = useState("");

  // Confirmation step
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [staffAdvances, setStaffAdvances] = useState<Advance[]>([]);
  const [staffMonthTotal, setStaffMonthTotal] = useState(0);
  const [needsAdminApproval, setNeedsAdminApproval] = useState(false);
  const [adminAlertSent, setAdminAlertSent] = useState(false);

  // Recovery form
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoveryAdvanceId, setRecoveryAdvanceId] = useState("");
  const [recoveryForm, setRecoveryForm] = useState({
    amount: "", recoveryDate: "", recoveryMethod: "cash_return", notes: "",
  });

  // Edit modal
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState<Advance | null>(null);
  const [editForm, setEditForm] = useState({
    amount: "", reason: "", interestRate: "0", customDeductionAmount: "",
  });

  // Entry log viewer
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logViewerAdvanceId, setLogViewerAdvanceId] = useState("");

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState("");

  // Action menu dropdown
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompany();
    fetchStaff();
  }, [companyId]);

  useEffect(() => {
    fetchAdvances();
  }, [companyId, filterStaff, filterStatus]);

  async function fetchCompany() {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      const data = await res.json();
      setCompanyCurrency(data.currency || "NPR");
      setCompanyName(data.name || "");
    } catch {}
  }

  async function fetchStaff() {
    try {
      const res = await fetch(`/api/companies/${companyId}/staff?isActive=true&_t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setStaff(data.staff || []);
    } catch {}
  }

  async function fetchAdvances() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterStaff) p.set("staffId", filterStaff);
      if (filterStatus) p.set("status", filterStatus);
      p.set("_t", String(Date.now()));
      const res = await fetch(`/api/companies/${companyId}/advance-payments?${p}`, { cache: "no-store" });
      const data = await res.json();
      setAdvances(data.advances || []);
      setSummary(data.summary || { total_advances: 0, total_given: 0, total_outstanding: 0, total_recovered: 0 });
    } catch (err) {
      console.error("fetchAdvances error:", err);
    }
    setLoading(false);
  }

  function openCreateForm() {
    const today = new Date().toISOString().split("T")[0];
    setForm({
      staffId: "", amount: "", paymentDate: today, paymentMethod: "cash",
      referenceNo: "", reason: "", recoveryDeadline: "", notes: "", attachmentUrl: "",
      interestRate: "0", customDeductionAmount: "",
    });
    setShowConfirmation(false);
    setNeedsAdminApproval(false);
    setAdminAlertSent(false);
    setShowForm(true);
  }

  function openEditForm(advance: Advance) {
    setEditingAdvance(advance);
    setEditForm({
      amount: String(advance.amount),
      reason: advance.reason || "",
      interestRate: String(advance.interestRate || 0),
      customDeductionAmount: String(advance.customDeductionAmount || ""),
    });
    setShowEditForm(true);
  }

  function openDeleteConfirm(advanceId: string) {
    setDeleteTargetId(advanceId);
    setShowDeleteConfirm(true);
  }

  function openLogViewer(advanceId: string) {
    setLogViewerAdvanceId(advanceId);
    setShowLogViewer(true);
  }

  function openRecoveryForm(advance: Advance) {
    const today = new Date().toISOString().split("T")[0];
    setRecoveryAdvanceId(advance.id);
    setRecoveryForm({
      amount: String(advance.dueAmount),
      recoveryDate: today,
      recoveryMethod: "cash_return",
      notes: "",
    });
    setShowRecoveryForm(true);
  }

  // Step 1: Check before creating — shows confirmation
  function handleProceedToConfirmation() {
    const amt = parseFloat(form.amount) || 0;
    if (!form.staffId || amt <= 0) {
      alert("Please select a staff member and enter a valid amount.");
      return;
    }

    // Find existing unpaid advances for this staff member
    const existingAdvances = advances.filter(
      (a) => a.staff_id === form.staffId && a.status !== "recovered"
    );
    setStaffAdvances(existingAdvances);

    // Calculate total advance this month for this staff
    const currentMonth = form.paymentDate.substring(0, 7); // "YYYY-MM"
    const monthAdvances = advances.filter(
      (a) => a.staff_id === form.staffId && a.paymentDate.substring(0, 7) === currentMonth
    );
    const monthTotal = monthAdvances.reduce((s, a) => s + a.amount, 0) + amt;
    setStaffMonthTotal(monthTotal);

    // Check if over limit
    const overLimit = monthTotal > ADVANCE_LIMIT;
    setNeedsAdminApproval(overLimit);
    setAdminAlertSent(false);

    setShowConfirmation(true);
  }

  // Send Slack admin alert for over-limit advance
  async function sendAdminAlert() {
    try {
      const staffMember = staff.find((s) => s.id === form.staffId);
      const amt = parseFloat(form.amount) || 0;

      // Fire a Slack notification via the advance-payments API with a special flag
      await fetch(`/api/companies/${companyId}/advance-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "admin_alert",
          staffId: form.staffId,
          staffName: staffMember?.name || "Unknown",
          amount: amt,
          monthTotal: staffMonthTotal,
          limit: ADVANCE_LIMIT,
          unpaidCount: staffAdvances.length,
          unpaidTotal: staffAdvances.reduce((s, a) => s + a.dueAmount, 0),
        }),
      });
      setAdminAlertSent(true);
    } catch (err) {
      console.error("Admin alert error:", err);
      alert("Failed to send admin alert. Please try again.");
    }
  }

  async function handleCreateAdvance() {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/advance-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: form.staffId,
          amount: parseFloat(form.amount) || 0,
          paymentDate: form.paymentDate,
          paymentMethod: form.paymentMethod,
          referenceNo: form.referenceNo,
          reason: form.reason,
          recoveryDeadline: form.recoveryDeadline,
          notes: form.notes,
          attachmentUrl: form.attachmentUrl || undefined,
          interestRate: parseFloat(form.interestRate) || 0,
          customDeductionAmount: form.customDeductionAmount ? parseFloat(form.customDeductionAmount) : undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setShowConfirmation(false);
        await new Promise((r) => setTimeout(r, 300));
        await fetchAdvances();
        await fetchStaff();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to create advance: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error("handleCreateAdvance error:", err);
      alert("Failed to create advance. Check console for details.");
    }
    setSaving(false);
  }

  async function handleEditAdvance() {
    if (!editingAdvance) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/advance-payments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAdvance.id,
          action: "edit",
          amount: parseFloat(editForm.amount) || editingAdvance.amount,
          reason: editForm.reason,
          interestRate: parseFloat(editForm.interestRate) || 0,
          customDeductionAmount: editForm.customDeductionAmount ? parseFloat(editForm.customDeductionAmount) : undefined,
        }),
      });
      if (res.ok) {
        setShowEditForm(false);
        setEditingAdvance(null);
        await new Promise((r) => setTimeout(r, 300));
        await fetchAdvances();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to update advance: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error("handleEditAdvance error:", err);
      alert("Failed to update advance. Check console for details.");
    }
    setSaving(false);
  }

  async function handleDeleteAdvance(advanceId: string) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/companies/${companyId}/advance-payments?id=${advanceId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setShowDeleteConfirm(false);
        setDeleteTargetId("");
        await new Promise((r) => setTimeout(r, 300));
        await fetchAdvances();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to delete advance: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error("handleDeleteAdvance error:", err);
      alert("Failed to delete advance. Check console for details.");
    }
    setSaving(false);
  }

  async function handleApproveAdvance(advanceId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/advance-payments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: advanceId,
          action: "approve",
        }),
      });
      if (res.ok) {
        setOpenActionMenu(null);
        await new Promise((r) => setTimeout(r, 300));
        await fetchAdvances();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to approve advance: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error("handleApproveAdvance error:", err);
      alert("Failed to approve advance. Check console for details.");
    }
    setSaving(false);
  }

  async function handleRejectAdvance(advanceId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/advance-payments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: advanceId,
          action: "reject",
        }),
      });
      if (res.ok) {
        setOpenActionMenu(null);
        await new Promise((r) => setTimeout(r, 300));
        await fetchAdvances();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to reject advance: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error("handleRejectAdvance error:", err);
      alert("Failed to reject advance. Check console for details.");
    }
    setSaving(false);
  }

  async function handleRecovery() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/companies/${companyId}/advance-payments/${recoveryAdvanceId}/recover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parseFloat(recoveryForm.amount) || 0,
            recoveryDate: recoveryForm.recoveryDate,
            recoveryMethod: recoveryForm.recoveryMethod,
            notes: recoveryForm.notes,
          }),
        }
      );
      if (res.ok) {
        setShowRecoveryForm(false);
        await new Promise((r) => setTimeout(r, 300));
        await fetchAdvances();
        await fetchStaff();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Recovery failed: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error("handleRecovery error:", err);
    }
    setSaving(false);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "due":
        return <Badge className="bg-red-100 text-red-700"><AlertTriangle className="mr-1 h-3 w-3" />Due</Badge>;
      case "partially_recovered":
        return <Badge className="bg-yellow-100 text-yellow-700"><Clock className="mr-1 h-3 w-3" />Partial</Badge>;
      case "recovered":
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="mr-1 h-3 w-3" />Recovered</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  // Outstanding (unpaid) advances
  const unpaidAdvances = advances.filter((a) => a.status !== "recovered");
  const selectedFormStaff = staff.find((s) => s.id === form.staffId);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />
      <MainContent className="overflow-auto">
        <div className="p-8">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Advance Payments</h1>
          <p className="text-sm text-muted-foreground">Track advances given to staff — auto-set as due (receivable)</p>
        </div>
        <Button onClick={openCreateForm}>
          <Plus className="mr-2 h-4 w-4" /> Give Advance
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Given</p>
                <p className="text-lg font-bold">{formatCurrency(summary.total_given, companyCurrency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(summary.total_outstanding, companyCurrency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Recovered</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(summary.total_recovered, companyCurrency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ArrowDownRight className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Advances</p>
                <p className="text-xl font-bold">{summary.total_advances}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={filterStaff}
          onChange={(e) => setFilterStaff(e.target.value)}
        >
          <option value="">All Staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="due">Due</option>
          <option value="partially_recovered">Partially Recovered</option>
          <option value="recovered">Recovered</option>
        </select>
      </div>

      {/* Unpaid Advances Summary Banner */}
      {unpaidAdvances.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Unpaid Advances ({unpaidAdvances.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unpaidAdvances.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-red-200 bg-white p-2.5">
                  <div>
                    <p className="font-medium text-sm">{a.staffName}</p>
                    <p className="text-xs text-muted-foreground">
                      Given: {formatCurrency(a.amount, companyCurrency)} · {formatDate(a.paymentDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-600 text-sm">{formatCurrency(a.dueAmount, companyCurrency)}</p>
                    <p className="text-xs text-muted-foreground">due</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advances List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Advance Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : advances.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No advance payments found.</p>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Staff</th>
                    <th className="text-left px-4 py-3 font-semibold">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold">Interest Rate</th>
                    <th className="text-left px-4 py-3 font-semibold">Total with Interest</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Approval</th>
                    <th className="text-left px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {advances.map((a) => {
                    const totalWithInterest = a.amount * (1 + (a.interestRate || 0) / 100);
                    return (
                      <tr key={a.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{a.staffName}</p>
                            <p className="text-xs text-muted-foreground">{a.staffRole}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(a.paymentDate)}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-semibold">{formatCurrency(a.amount, companyCurrency)}</p>
                            <p className="text-xs text-muted-foreground">Due: {formatCurrency(a.dueAmount, companyCurrency)}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {a.interestRate && a.interestRate > 0 ? (
                            <span className="text-orange-600 font-medium">{a.interestRate}%</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {a.interestRate && a.interestRate > 0 ? (
                            <span className="font-semibold text-orange-600">{formatCurrency(totalWithInterest, companyCurrency)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(a.status)}
                        </td>
                        <td className="px-4 py-3">
                          <ApprovalBadge status={a.approvalStatus} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative inline-block">
                            <button
                              onClick={() => setOpenActionMenu(openActionMenu === a.id ? null : a.id)}
                              className="rounded p-2 hover:bg-accent"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openActionMenu === a.id && (
                              <div className="absolute right-0 mt-1 bg-background border rounded-lg shadow-lg z-40 min-w-48">
                                <button
                                  onClick={() => { openEditForm(a); setOpenActionMenu(null); }}
                                  className="flex items-center gap-2 w-full px-4 py-2 hover:bg-muted text-left text-sm border-b"
                                >
                                  <Edit2 className="h-4 w-4" /> Edit
                                </button>
                                <button
                                  onClick={() => { handleApproveAdvance(a.id); }}
                                  className="flex items-center gap-2 w-full px-4 py-2 hover:bg-muted text-left text-sm border-b text-green-600"
                                >
                                  <ThumbsUp className="h-4 w-4" /> Approve
                                </button>
                                <button
                                  onClick={() => { handleRejectAdvance(a.id); }}
                                  className="flex items-center gap-2 w-full px-4 py-2 hover:bg-muted text-left text-sm border-b text-red-600"
                                >
                                  <ThumbsDown className="h-4 w-4" /> Reject
                                </button>
                                <button
                                  onClick={() => { openLogViewer(a.id); setOpenActionMenu(null); }}
                                  className="flex items-center gap-2 w-full px-4 py-2 hover:bg-muted text-left text-sm border-b"
                                >
                                  <Eye className="h-4 w-4" /> View Log
                                </button>
                                <button
                                  onClick={() => { openDeleteConfirm(a.id); setOpenActionMenu(null); }}
                                  className="flex items-center gap-2 w-full px-4 py-2 hover:bg-muted text-left text-sm text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Expanded Details (Recovery History) */}
            {expandedId && (
              <div className="border-t">
                {advances
                  .filter((a) => a.id === expandedId)
                  .map((a) => (
                    <div key={a.id} className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        {a.reason && <span className="text-sm text-muted-foreground">Reason: {a.reason}</span>}
                        {a.attachmentUrl && (
                          <button onClick={() => setViewAttachment(a.attachmentUrl!)}>
                            <AttachmentBadge url={a.attachmentUrl} small />
                          </button>
                        )}
                      </div>
                      {a.recoveryDeadline && (
                        <p className="text-xs text-orange-500 mb-3">Deadline: {formatDate(a.recoveryDeadline)}</p>
                      )}
                      {a.status !== "recovered" && (
                        <Button size="sm" variant="outline" onClick={() => openRecoveryForm(a)} className="mb-3">
                          Recover
                        </Button>
                      )}
                      {a.recoveries.length > 0 && (
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs font-semibold mb-2">Recovery History</p>
                          <div className="space-y-2">
                            {a.recoveries.map((r) => (
                              <div key={r.id} className="flex items-center justify-between text-sm">
                                <div>
                                  <span className="text-green-600 font-medium">
                                    +{formatCurrency(r.amount, companyCurrency)}
                                  </span>
                                  <span className="ml-2 text-muted-foreground">
                                    via {r.recoveryMethod.replace("_", " ")}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">{formatDate(r.recoveryDate)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {a.recoveries.length === 0 && (
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">No recoveries recorded yet.</p>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Advance Modal — Step 1: Form */}
      {showForm && !showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Give Advance</h2>
              <button onClick={() => setShowForm(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700 mb-4">
              The advance amount will automatically be set as <strong>DUE</strong> (receivable) to the staff member.
              Monthly limit per staff: <strong>{formatCurrency(ADVANCE_LIMIT, companyCurrency)}</strong>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Staff *</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.staffId}
                  onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                >
                  <option value="">Select staff...</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              {/* Show existing unpaid advances for selected staff inline */}
              {form.staffId && (() => {
                const existing = advances.filter(
                  (a) => a.staff_id === form.staffId && a.status !== "recovered"
                );
                if (existing.length > 0) {
                  const totalDue = existing.reduce((s, a) => s + a.dueAmount, 0);
                  return (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                      <p className="font-medium text-red-700 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {existing.length} unpaid advance(s) — Total due: {formatCurrency(totalDue, companyCurrency)}
                      </p>
                      <div className="mt-2 space-y-1">
                        {existing.map((a) => (
                          <div key={a.id} className="flex justify-between text-xs text-red-600">
                            <span>{formatDate(a.paymentDate)} — {a.reason || "No reason"}</span>
                            <span className="font-semibold">{formatCurrency(a.dueAmount, companyCurrency)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount *</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Date *</Label>
                  <Input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Method</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.paymentMethod}
                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Recovery Deadline</Label>
                  <Input type="date" value={form.recoveryDeadline} onChange={(e) => setForm({ ...form, recoveryDeadline: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Reason</Label>
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Medical emergency, personal need..." />
              </div>

              <FileUpload
                label="Attach Receipt / Document"
                currentUrl={form.attachmentUrl || undefined}
                onFileUploaded={(url) => setForm({ ...form, attachmentUrl: url })}
                onClear={() => setForm({ ...form, attachmentUrl: "" })}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Interest Rate (%)</Label>
                  <Input type="number" step="0.01" min="0" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <Label>Monthly Deduction Amount</Label>
                  <Input type="number" step="0.01" min="0" value={form.customDeductionAmount} onChange={(e) => setForm({ ...form, customDeductionAmount: e.target.value })} placeholder="Optional" />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={handleProceedToConfirmation} disabled={!form.staffId || !form.amount}>
                  Review & Confirm
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Advance Modal — Step 2: Confirmation */}
      {showForm && showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Confirm Advance Payment</h2>
              <button onClick={() => { setShowForm(false); setShowConfirmation(false); }} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Over-limit Warning */}
            {needsAdminApproval && (
              <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                  <p className="font-bold text-red-700">Advance Limit Exceeded!</p>
                </div>
                <p className="text-sm text-red-600 mb-2">
                  This advance will bring the monthly total for <strong>{selectedFormStaff?.name}</strong> to{" "}
                  <strong>{formatCurrency(staffMonthTotal, companyCurrency)}</strong>, which exceeds the{" "}
                  <strong>{formatCurrency(ADVANCE_LIMIT, companyCurrency)}</strong> monthly limit.
                </p>
                <p className="text-sm text-red-600 mb-3">
                  Admin approval is required. Send an alert to the admin via Slack for verification.
                </p>
                {!adminAlertSent ? (
                  <Button size="sm" variant="destructive" onClick={sendAdminAlert} className="flex items-center gap-1">
                    <Send className="h-3.5 w-3.5" /> Send Admin Alert via Slack
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                    <CheckCircle className="h-4 w-4" /> Admin alert sent! You may proceed if authorized.
                  </div>
                )}
              </div>
            )}

            {/* Advance Details */}
            <div className="rounded-lg border p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Staff:</span>
                <span className="font-medium">{selectedFormStaff?.name} ({selectedFormStaff?.role})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Advance Amount:</span>
                <span className="font-bold text-lg">{formatCurrency(parseFloat(form.amount) || 0, companyCurrency)}</span>
              </div>
              {parseFloat(form.interestRate) > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Interest Rate:</span>
                    <span className="font-medium">{parseFloat(form.interestRate)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Interest Amount:</span>
                    <span className="font-medium text-orange-600">
                      {formatCurrency((parseFloat(form.amount) || 0) * (parseFloat(form.interestRate) || 0) / 100, companyCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground font-semibold">Total with Interest:</span>
                    <span className="font-bold text-lg text-orange-600">
                      {formatCurrency((parseFloat(form.amount) || 0) * (1 + (parseFloat(form.interestRate) || 0) / 100), companyCurrency)}
                    </span>
                  </div>
                </>
              )}
              {form.customDeductionAmount && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly Deduction:</span>
                  <span className="font-medium">{formatCurrency(parseFloat(form.customDeductionAmount), companyCurrency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment Date:</span>
                <span>{form.paymentDate}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Method:</span>
                <span>{form.paymentMethod}</span>
              </div>
              {form.reason && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Reason:</span>
                  <span>{form.reason}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monthly Total (after this):</span>
                <span className={staffMonthTotal > ADVANCE_LIMIT ? "text-red-600 font-bold" : "font-medium"}>
                  {formatCurrency(staffMonthTotal, companyCurrency)}
                </span>
              </div>
            </div>

            {/* Existing Unpaid Advances */}
            {staffAdvances.length > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 mb-4">
                <p className="text-sm font-semibold text-orange-700 mb-2">
                  {staffAdvances.length} Existing Unpaid Advance(s):
                </p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {staffAdvances.map((a) => (
                    <div key={a.id} className="flex justify-between text-xs bg-white rounded p-2 border border-orange-100">
                      <div>
                        <span className="font-medium">{formatDate(a.paymentDate)}</span>
                        <span className="ml-2 text-muted-foreground">{a.reason || "No reason"}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-red-600 font-semibold">{formatCurrency(a.dueAmount, companyCurrency)}</span>
                        <span className="text-muted-foreground ml-1">due</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs font-medium text-orange-700">
                  Total unpaid: {formatCurrency(staffAdvances.reduce((s, a) => s + a.dueAmount, 0), companyCurrency)}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowConfirmation(false)}>Back</Button>
              <Button
                onClick={handleCreateAdvance}
                disabled={saving || (needsAdminApproval && !adminAlertSent)}
                className={needsAdminApproval ? "bg-red-600 hover:bg-red-700" : ""}
              >
                {saving ? "Processing..." : needsAdminApproval ? "Confirm (Over Limit)" : "Confirm & Give Advance"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Modal */}
      {showRecoveryForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-md rounded-lg bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Record Recovery</h2>
              <button onClick={() => setShowRecoveryForm(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount *</Label>
                  <Input type="number" value={recoveryForm.amount} onChange={(e) => setRecoveryForm({ ...recoveryForm, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Date *</Label>
                  <Input type="date" value={recoveryForm.recoveryDate} onChange={(e) => setRecoveryForm({ ...recoveryForm, recoveryDate: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Method</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={recoveryForm.recoveryMethod}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, recoveryMethod: e.target.value })}
                >
                  {RECOVERY_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Notes</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={2}
                  value={recoveryForm.notes}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowRecoveryForm(false)}>Cancel</Button>
                <Button onClick={handleRecovery} disabled={saving || !recoveryForm.amount}>
                  {saving ? "Processing..." : "Record Recovery"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit Advance Modal */}
      {showEditForm && editingAdvance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Advance</h2>
              <button onClick={() => setShowEditForm(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Staff</Label>
                <p className="text-sm font-medium">{editingAdvance.staffName}</p>
              </div>

              <div>
                <Label>Amount</Label>
                <Input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
              </div>

              <div>
                <Label>Reason</Label>
                <Input value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} placeholder="e.g. Medical emergency..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Interest Rate (%)</Label>
                  <Input type="number" step="0.01" min="0" value={editForm.interestRate} onChange={(e) => setEditForm({ ...editForm, interestRate: e.target.value })} />
                </div>
                <div>
                  <Label>Monthly Deduction</Label>
                  <Input type="number" step="0.01" min="0" value={editForm.customDeductionAmount} onChange={(e) => setEditForm({ ...editForm, customDeductionAmount: e.target.value })} placeholder="Optional" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowEditForm(false)}>Cancel</Button>
                <Button onClick={handleEditAdvance} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete Advance"
          message={`Are you sure you want to delete this advance? This action cannot be undone.`}
          onConfirm={() => handleDeleteAdvance(deleteTargetId)}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={saving}
        />
      )}

      {/* Entry Log Viewer */}
      {showLogViewer && logViewerAdvanceId && (
        <EntryLogViewer
          companyId={companyId}
          module="advance"
          entryId={logViewerAdvanceId}
          onClose={() => { setShowLogViewer(false); setLogViewerAdvanceId(""); }}
        />
      )}

      {/* Attachment Viewer */}
      {viewAttachment && (
        <AttachmentViewer url={viewAttachment} onClose={() => setViewAttachment("")} />
      )}
    </div>
        </div>
      </MainContent>
    </div>
  );
}
