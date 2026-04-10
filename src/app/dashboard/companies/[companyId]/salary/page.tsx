"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, DollarSign, Calendar, Users, TrendingDown, X, CheckCircle } from "lucide-react";

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

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "esewa", label: "eSewa" },
  { value: "khalti", label: "Khalti" },
  { value: "cheque", label: "Cheque" },
];

export default function SalaryPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyCurrency, setCompanyCurrency] = useState("NPR");
  const [summary, setSummary] = useState({ total_count: 0, total_paid: 0, total_deductions: 0, total_bonus: 0 });
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterStaff, setFilterStaff] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [form, setForm] = useState({
    staffId: "", amount: "", month: "", paymentDate: "",
    paymentMethod: "cash", referenceNo: "", deductions: "0",
    bonus: "0", notes: "", autoDeductAdvance: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompany();
    fetchStaff();
  }, [companyId]);

  useEffect(() => {
    fetchPayments();
  }, [companyId, filterMonth, filterStaff]);

  async function fetchCompany() {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      const data = await res.json();
      setCompanyCurrency(data.currency || "NPR");
    } catch {}
  }

  async function fetchStaff() {
    try {
      const res = await fetch(`/api/companies/${companyId}/staff?isActive=true`);
      const data = await res.json();
      setStaff(data.staff || []);
    } catch {}
  }

  async function fetchPayments() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterMonth) p.set("month", filterMonth);
      if (filterStaff) p.set("staffId", filterStaff);
      const res = await fetch(`/api/companies/${companyId}/salary-payments?${p}`);
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
      referenceNo: "", deductions: "0", bonus: "0", notes: "",
      autoDeductAdvance: true,
    });
    setShowForm(true);
    setShowBulkForm(false);
  }

  async function handleSaveSingle() {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/salary-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount) || 0,
          deductions: parseFloat(form.deductions) || 0,
          bonus: parseFloat(form.bonus) || 0,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        fetchPayments();
        fetchStaff(); // refresh advance dues
      }
    } catch {}
    setSaving(false);
  }

  async function handleBulkPay() {
    setSaving(true);
    const today = new Date().toISOString().split("T")[0];
    let successCount = 0;
    for (const s of staff) {
      if (s.salaryAmount <= 0) continue;
      // Check if already paid for this month
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
  const netPreview = (parseFloat(form.amount) || 0) - (parseFloat(form.deductions) || 0) + (parseFloat(form.bonus) || 0);

  // Check who's already paid for selected month
  const paidStaffIds = new Set(payments.filter((p) => p.month === filterMonth).map((p) => p.staff_id));
  const unpaidStaff = staff.filter((s) => !paidStaffIds.has(s.id) && s.salaryAmount > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Salary Payments</h1>
          <p className="text-sm text-muted-foreground">Manage monthly salary payments with advance auto-deduction</p>
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
                        <span className="ml-1 text-orange-500">(Due: {formatCurrency(s.totalAdvanceDue, companyCurrency)})</span>
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

      {/* Single Pay Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
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

              {selectedStaff && selectedStaff.totalAdvanceDue > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
                  <p className="font-medium text-orange-700">Pending Advance Due: {formatCurrency(selectedStaff.totalAdvanceDue, companyCurrency)}</p>
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.autoDeductAdvance}
                      onChange={(e) => setForm({ ...form, autoDeductAdvance: e.target.checked })}
                    />
                    <span className="text-xs">Auto-deduct up to 25% from salary</span>
                  </label>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Deductions</Label>
                  <Input type="number" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} />
                </div>
                <div>
                  <Label>Bonus</Label>
                  <Input type="number" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} />
                </div>
              </div>

              <div className="rounded-lg bg-primary/5 p-3 text-center">
                <p className="text-xs text-muted-foreground">Net Payable</p>
                <p className="text-xl font-bold">{formatCurrency(netPreview, companyCurrency)}</p>
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
                  <span>{s.name}</span>
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
  );
}
