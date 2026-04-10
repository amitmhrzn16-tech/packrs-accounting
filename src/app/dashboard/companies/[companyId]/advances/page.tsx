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
  X, ChevronDown, ChevronUp
} from "lucide-react";

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
  recoveries: Recovery[];
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
    referenceNo: "", reason: "", recoveryDeadline: "", notes: "",
  });

  // Recovery form
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoveryAdvanceId, setRecoveryAdvanceId] = useState("");
  const [recoveryForm, setRecoveryForm] = useState({
    amount: "", recoveryDate: "", recoveryMethod: "cash_return", notes: "",
  });

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
      p.set("_t", String(Date.now())); // cache-bust
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
      referenceNo: "", reason: "", recoveryDeadline: "", notes: "",
    });
    setShowForm(true);
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
        }),
      });
      if (res.ok) {
        setShowForm(false);
        // Small delay to ensure DB write is committed before re-fetching
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

      {/* Advances List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : advances.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No advance payments found.</p>
          ) : (
            <div className="divide-y">
              {advances.map((a) => (
                <div key={a.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{a.staffName}</span>
                          {getStatusBadge(a.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {a.staffRole} · Given: {formatDate(a.paymentDate)} · Via {a.paymentMethod}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Given / Due</p>
                        <p className="font-semibold">
                          {formatCurrency(a.amount, companyCurrency)} / <span className="text-red-600">{formatCurrency(a.dueAmount, companyCurrency)}</span>
                        </p>
                      </div>
                      {a.status !== "recovered" && (
                        <Button size="sm" variant="outline" onClick={() => openRecoveryForm(a)}>
                          Recover
                        </Button>
                      )}
                      <button
                        onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                        className="rounded p-1 hover:bg-accent"
                      >
                        {expandedId === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {a.reason && <p className="mt-1 text-sm text-muted-foreground">Reason: {a.reason}</p>}
                  {a.recoveryDeadline && (
                    <p className="text-xs text-orange-500">Deadline: {formatDate(a.recoveryDeadline)}</p>
                  )}

                  {expandedId === a.id && a.recoveries.length > 0 && (
                    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Advance Modal */}
      {showForm && (
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
                <Button onClick={handleCreateAdvance} disabled={saving || !form.staffId || !form.amount}>
                  {saving ? "Processing..." : "Give Advance"}
                </Button>
              </div>
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
    </div>
        </div>
      </MainContent>
    </div>
  );
}
