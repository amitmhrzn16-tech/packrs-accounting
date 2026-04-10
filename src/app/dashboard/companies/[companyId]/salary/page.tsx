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
  Plus, DollarSign, Calendar, Users, TrendingDown, X, CheckCircle,
  AlertTriangle, Settings, Minus, PlusCircle
} from "lucide-react";

interface Staff {
  id: string;
  name: string;
  role: string;
  salaryAmount: number;
  totalAdvanceDue: number;
  isActive: boolean;
}

interface SalaryPayment {
  id: string;
  staff_id: string;
  staffName: string;
  staffRole: string;
  agreedSalary: number;
  amount: number;
  month: string;
  paymentDate: string;
  paymentMethod: string;
  referenceNo?: string;
  deductions: number;
  bonus: number;
  netAmount: number;
  status: string;
  notes?: string;
  createdByName: string;
}

interface PayrollSetting {
  id: string;
  settingType: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  defaultValue: string;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "esewa", label: "eSewa" },
  { value: "khalti", label: "Khalti" },
  { value: "cheque", label: "Cheque" },
];

interface PageProps {
  params: { companyId: string };
}

export default function SalaryPage({ params }: PageProps) {
  const companyId = params.companyId;

  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyCurrency, setCompanyCurrency] = useState("NPR");
  const [companyName, setCompanyName] = useState("");
  const [summary, setSummary] = useState({ total_count: 0, total_paid: 0, total_deductions: 0, total_bonus: 0 });
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterStaff, setFilterStaff] = useState("");

  // Payroll settings (custom fields)
  const [deductionFields, setDeductionFields] = useState<PayrollSetting[]>([]);
  const [bonusFields, setBonusFields] = useState<PayrollSetting[]>([]);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [form, setForm] = useState({
    staffId: "", amount: "", month: "", paymentDate: "",
    paymentMethod: "cash", referenceNo: "", notes: "",
    autoDeductAdvance: true,
  });
  // Dynamic fields state: { fieldName: "amount" }
  const [customDeductions, setCustomDeductions] = useState<Record<string, string>>({});
  const [customBonuses, setCustomBonuses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompany();
    fetchStaff();
    fetchPayrollSettings();
  }, [companyId]);

  useEffect(() => {
    fetchPayments();
  }, [companyId, filterMonth, filterStaff]);

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

  async function fetchPayrollSettings() {
    try {
      const [dedRes, bonRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/payroll-settings?type=salary_deduction&_t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/companies/${companyId}/payroll-settings?type=salary_bonus&_t=${Date.now()}`, { cache: "no-store" }),
      ]);
      const dedData = await dedRes.json();
      const bonData = await bonRes.json();
      setDeductionFields(dedData.settings || []);
      setBonusFields(bonData.settings || []);
    } catch {}
  }

  async function fetchPayments() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterMonth) p.set("month", filterMonth);
      if (filterStaff) p.set("staffId", filterStaff);
      p.set("_t", String(Date.now()));
      const res = await fetch(`/api/companies/${companyId}/salary-payments?${p}`, { cache: "no-store" });
      const data = await res.json();
      setPayments(data.payments || []);
      setSummary(data.summary || { total_count: 0, total_paid: 0, total_deductions: 0, total_bonus: 0 });
    } catch {}
    setLoading(false);
  }

  function openSingleForm(s?: Staff) {
    const today = new Date().toISOString().split("T")[0];
    setForm({
      staffId: s?.id || "", amount: s ? String(s.salaryAmount) : "",
      month: filterMonth, paymentDate: today, paymentMethod: "cash",
      referenceNo: "", notes: "",
      autoDeductAdvance: true,
    });
    // Initialize custom fields with defaults
    const ded: Record<string, string> = {};
    deductionFields.forEach((f) => { ded[f.fieldName] = f.defaultValue || "0"; });
    setCustomDeductions(ded);
    const bon: Record<string, string> = {};
    bonusFields.forEach((f) => { bon[f.fieldName] = f.defaultValue || "0"; });
    setCustomBonuses(bon);
    setShowForm(true);
    setShowBulkForm(false);
  }

  async function handleSaveSingle() {
    setSaving(true);
    try {
      // Merge custom deductions + bonuses into single customDeductions object (API supports this)
      const allCustomDed: Record<string, number> = {};
      for (const [key, val] of Object.entries(customDeductions)) {
        const v = parseFloat(val) || 0;
        if (v > 0) allCustomDed[key] = v;
      }

      // Custom bonuses are sent as negative deductions (added to bonus)
      let totalCustomBonus = 0;
      for (const [, val] of Object.entries(customBonuses)) {
        totalCustomBonus += parseFloat(val) || 0;
      }

      const res = await fetch(`/api/companies/${companyId}/salary-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount) || 0,
          deductions: 0, // base deductions set to 0 — all via customDeductions
          bonus: totalCustomBonus,
          customDeductions: allCustomDed,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        await new Promise((r) => setTimeout(r, 300));
        await fetchPayments();
        await fetchStaff();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error("Salary save error:", err);
    }
    setSaving(false);
  }

  async function handleBulkPay() {
    setSaving(true);
    const today = new Date().toISOString().split("T")[0];
    let successCount = 0;
    for (const s of staff) {
      if (s.salaryAmount <= 0) continue;
      const alreadyPaid = payments.find(
        (p) => p.staff_id === s.id && p.month === filterMonth
      );
      if (alreadyPaid) continue;

      try {
        const res = await fetch(`/api/companies/${companyId}/salary-payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffId: s.id,
            amount: s.salaryAmount,
            month: filterMonth,
            paymentDate: today,
            paymentMethod: "cash",
            deductions: 0,
            bonus: 0,
            autoDeductAdvance: true,
          }),
        });
        if (res.ok) successCount++;
      } catch {}
    }
    setShowBulkForm(false);
    fetchPayments();
    fetchStaff();
    setSaving(false);
    alert(`Bulk salary paid for ${successCount} staff members.`);
  }

  const selectedStaff = staff.find((s) => s.id === form.staffId);

  // Calculate net preview with all custom fields
  const grossAmount = parseFloat(form.amount) || 0;
  const totalCustomDed = Object.values(customDeductions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const totalCustomBon = Object.values(customBonuses).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const advanceDeductPreview = selectedStaff && selectedStaff.totalAdvanceDue > 0 && form.autoDeductAdvance
    ? Math.min(selectedStaff.totalAdvanceDue, grossAmount * 0.25)
    : 0;
  const netPreview = grossAmount - totalCustomDed - advanceDeductPreview + totalCustomBon;

  // Check who's already paid for selected month
  const paidStaffIds = new Set(payments.filter((p) => p.month === filterMonth).map((p) => p.staff_id));
  const unpaidStaff = staff.filter((s) => !paidStaffIds.has(s.id) && s.salaryAmount > 0);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />
      <MainContent className="overflow-auto">
        <div className="p-8">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Salary Payments</h1>
          <p className="text-sm text-muted-foreground">Manage monthly salary with custom deductions, bonuses, and advance auto-deduction</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulkForm(true)}>
            <Users className="mr-2 h-4 w-4" /> Bulk Pay All
          </Button>
          <Button onClick={() => openSingleForm()}>
            <Plus className="mr-2 h-4 w-4" /> Pay Salary
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Paid ({filterMonth})</p>
                <p className="text-lg font-bold">{formatCurrency(summary.total_paid, companyCurrency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Deductions</p>
                <p className="text-lg font-bold">{formatCurrency(summary.total_deductions, companyCurrency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Paid Staff</p>
                <p className="text-xl font-bold">{paidStaffIds.size} / {staff.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-xs text-muted-foreground">Unpaid Staff</p>
                <p className="text-xl font-bold text-orange-600">{unpaidStaff.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Label className="text-xs">Month</Label>
          <Input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs">Staff</Label>
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
        </div>
      </div>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Records</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : payments.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No salary payments for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Staff</th>
                    <th className="pb-2 pr-4">Month</th>
                    <th className="pb-2 pr-4 text-right">Gross</th>
                    <th className="pb-2 pr-4 text-right">Deductions</th>
                    <th className="pb-2 pr-4 text-right">Bonus</th>
                    <th className="pb-2 pr-4 text-right">Net Paid</th>
                    <th className="pb-2 pr-4">Method</th>
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{p.staffName}</div>
                        <div className="text-xs text-muted-foreground">{p.staffRole}</div>
                      </td>
                      <td className="py-2 pr-4">{p.month}</td>
                      <td className="py-2 pr-4 text-right">{formatCurrency(p.amount, companyCurrency)}</td>
                      <td className="py-2 pr-4 text-right text-red-500">
                        {p.deductions > 0 ? `-${formatCurrency(p.deductions, companyCurrency)}` : "-"}
                      </td>
                      <td className="py-2 pr-4 text-right text-green-500">
                        {p.bonus > 0 ? `+${formatCurrency(p.bonus, companyCurrency)}` : "-"}
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(p.netAmount, companyCurrency)}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs">{p.paymentMethod}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs">{formatDate(p.paymentDate)}</td>
                      <td className="py-2">
                        <Badge className={p.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Pay — Unpaid Staff */}
      {unpaidStaff.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600">Unpaid for {filterMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unpaidStaff.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(s.salaryAmount, companyCurrency)} / month
                      {s.totalAdvanceDue > 0 && (
                        <span className="ml-1 text-red-500 font-medium">(Adv Due: {formatCurrency(s.totalAdvanceDue, companyCurrency)})</span>
                      )}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => openSingleForm(s)}>Pay</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single Pay Modal — with dynamic custom fields */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Pay Salary</h2>
              <button onClick={() => setShowForm(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Staff *</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.staffId}
                  onChange={(e) => {
                    const s = staff.find((x) => x.id === e.target.value);
                    setForm({ ...form, staffId: e.target.value, amount: s ? String(s.salaryAmount) : form.amount });
                  }}
                >
                  <option value="">Select staff...</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role}) - {formatCurrency(s.salaryAmount, companyCurrency)}</option>
                  ))}
                </select>
              </div>

              {/* Advance Due Warning — prominent red banner */}
              {selectedStaff && selectedStaff.totalAdvanceDue > 0 && (
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <p className="font-bold text-red-700">Pending Advance Due</p>
                  </div>
                  <p className="text-sm text-red-600 mb-2">
                    {selectedStaff.name} has <strong>{formatCurrency(selectedStaff.totalAdvanceDue, companyCurrency)}</strong> in unpaid advances.
                  </p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.autoDeductAdvance}
                      onChange={(e) => setForm({ ...form, autoDeductAdvance: e.target.checked })}
                    />
                    <span className="text-sm text-red-700">Auto-deduct up to 25% of gross salary ({formatCurrency(grossAmount * 0.25, companyCurrency)})</span>
                  </label>
                  {form.autoDeductAdvance && (
                    <p className="text-xs text-red-500 mt-1">
                      Will deduct: {formatCurrency(advanceDeductPreview, companyCurrency)} from this salary
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Gross Amount *</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Month *</Label>
                  <Input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
                </div>
              </div>

              {/* Custom Deduction Fields from Settings */}
              {deductionFields.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Minus className="h-3.5 w-3.5 text-red-500" />
                    <Label className="font-semibold text-red-700 text-sm">Deductions</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {deductionFields.map((field) => (
                      <div key={field.id}>
                        <Label className="text-xs">{field.fieldLabel}</Label>
                        <Input
                          type="number"
                          value={customDeductions[field.fieldName] || "0"}
                          onChange={(e) => setCustomDeductions({ ...customDeductions, [field.fieldName]: e.target.value })}
                          className="h-8"
                        />
                      </div>
                    ))}
                  </div>
                  {totalCustomDed > 0 && (
                    <p className="text-xs text-red-500 font-medium">Total deductions: -{formatCurrency(totalCustomDed, companyCurrency)}</p>
                  )}
                </div>
              )}

              {/* Custom Bonus Fields from Settings */}
              {bonusFields.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <PlusCircle className="h-3.5 w-3.5 text-green-500" />
                    <Label className="font-semibold text-green-700 text-sm">Bonuses / Allowances</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {bonusFields.map((field) => (
                      <div key={field.id}>
                        <Label className="text-xs">{field.fieldLabel}</Label>
                        <Input
                          type="number"
                          value={customBonuses[field.fieldName] || "0"}
                          onChange={(e) => setCustomBonuses({ ...customBonuses, [field.fieldName]: e.target.value })}
                          className="h-8"
                        />
                      </div>
                    ))}
                  </div>
                  {totalCustomBon > 0 && (
                    <p className="text-xs text-green-600 font-medium">Total bonuses: +{formatCurrency(totalCustomBon, companyCurrency)}</p>
                  )}
                </div>
              )}

              {/* No custom fields hint */}
              {deductionFields.length === 0 && bonusFields.length === 0 && (
                <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                  <Settings className="h-4 w-4 mx-auto mb-1" />
                  Add custom deduction/bonus fields in <strong>Settings → Payroll & Cash</strong>
                </div>
              )}

              {/* Net Preview */}
              <div className="rounded-lg bg-primary/5 p-3">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Salary</span>
                    <span>{formatCurrency(grossAmount, companyCurrency)}</span>
                  </div>
                  {totalCustomDed > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Deductions</span>
                      <span>-{formatCurrency(totalCustomDed, companyCurrency)}</span>
                    </div>
                  )}
                  {advanceDeductPreview > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Advance Recovery</span>
                      <span>-{formatCurrency(advanceDeductPreview, companyCurrency)}</span>
                    </div>
                  )}
                  {totalCustomBon > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Bonuses</span>
                      <span>+{formatCurrency(totalCustomBon, companyCurrency)}</span>
                    </div>
                  )}
                  <div className="border-t pt-1 flex justify-between font-bold text-lg">
                    <span>Net Payable</span>
                    <span>{formatCurrency(netPreview, companyCurrency)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Date *</Label>
                  <Input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
                </div>
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
              </div>

              <div>
                <Label>Reference No.</Label>
                <Input value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} placeholder="Optional" />
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
                <Button onClick={handleSaveSingle} disabled={saving || !form.staffId || !form.amount}>
                  {saving ? "Processing..." : "Pay Salary"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Pay Confirmation */}
      {showBulkForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-md rounded-lg bg-background p-6 shadow-xl">
            <h2 className="text-lg font-bold mb-2">Bulk Salary Payment</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This will pay salary to all {unpaidStaff.length} unpaid staff for {filterMonth} via cash.
              Advance dues will be auto-deducted (up to 25%).
            </p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {unpaidStaff.map((s) => (
                <div key={s.id} className="flex justify-between text-sm border-b pb-1">
                  <div>
                    <span>{s.name}</span>
                    {s.totalAdvanceDue > 0 && (
                      <span className="ml-1 text-xs text-red-500">(Adv: {formatCurrency(s.totalAdvanceDue, companyCurrency)})</span>
                    )}
                  </div>
                  <span className="font-medium">{formatCurrency(s.salaryAmount, companyCurrency)}</span>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold mb-4">
              Total: {formatCurrency(unpaidStaff.reduce((sum, s) => sum + s.salaryAmount, 0), companyCurrency)}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowBulkForm(false)}>Cancel</Button>
              <Button onClick={handleBulkPay} disabled={saving}>
                {saving ? "Processing..." : `Pay All (${unpaidStaff.length})`}
              </Button>
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
