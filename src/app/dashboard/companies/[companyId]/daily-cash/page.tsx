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
import { Plus, Banknote, Calendar, X, Filter, Trash2 } from "lucide-react";

interface Staff {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

interface DailyCashPayment {
  id: string;
  staff_id?: string;
  staffName?: string;
  staffRole?: string;
  date: string;
  amount: number;
  category: string;
  description?: string;
  receiptNo?: string;
  approvedBy?: string;
  status: string;
  paymentMethod?: string;
  fonepayRef?: string;
  createdByName: string;
  createdAt: string;
}

interface CategorySummary {
  category: string;
  count: number;
  total: number;
}

interface PayrollSetting {
  id: string;
  settingType: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  defaultValue: string;
}

const DEFAULT_CASH_CATEGORIES = [
  { value: "cash_collection", label: "Cash Collection", icon: "💰" },
  { value: "fonepay", label: "Fonepay", icon: "📱" },
  { value: "fuel", label: "Fuel / Petrol", icon: "⛽" },
  { value: "food", label: "Food / Meals", icon: "🍽️" },
  { value: "transport", label: "Transport", icon: "🚚" },
  { value: "maintenance", label: "Maintenance", icon: "🔧" },
  { value: "tips", label: "Tips / Incentives", icon: "💡" },
  { value: "loading", label: "Loading / Unloading", icon: "📦" },
  { value: "stationery", label: "Stationery / Office", icon: "📝" },
  { value: "utilities", label: "Utilities", icon: "💡" },
  { value: "general", label: "General / Misc", icon: "💵" },
];

interface CollectionLine {
  id: string;
  category: string;
  amount: string;
  description: string;
  receiptNo: string;
  paymentMethod: string;
  fonepayRef: string;
}

interface PageProps {
  params: { companyId: string };
}

export default function DailyCashPage({ params }: PageProps) {
  const companyId = params.companyId;

  const [payments, setPayments] = useState<DailyCashPayment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyCurrency, setCompanyCurrency] = useState("NPR");
  const [companyName, setCompanyName] = useState("");
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([]);
  const [totalSummary, setTotalSummary] = useState({ total_count: 0, total_amount: 0 });
  const [customCategories, setCustomCategories] = useState<PayrollSetting[]>([]);

  // All categories = defaults + custom
  const allCategories = [
    ...DEFAULT_CASH_CATEGORIES,
    ...customCategories.map((c) => ({ value: c.fieldName, label: c.fieldLabel, icon: "🏷️" })),
  ];

  // Filters
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [filterStaff, setFilterStaff] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Form — multi-line collection
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formStaffId, setFormStaffId] = useState("");
  const [lines, setLines] = useState<CollectionLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompany();
    fetchStaff();
    fetchCustomCategories();
  }, [companyId]);

  useEffect(() => {
    fetchPayments();
  }, [companyId, filterDate, filterStaff, filterCategory, dateMode, dateFrom, dateTo]);

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

  async function fetchCustomCategories() {
    try {
      const res = await fetch(`/api/companies/${companyId}/payroll-settings?type=daily_cash_category&_t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setCustomCategories(data.settings || []);
    } catch {}
  }

  async function fetchPayments() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (dateMode === "single" && filterDate) {
        p.set("date", filterDate);
      } else if (dateMode === "range") {
        if (dateFrom) p.set("dateFrom", dateFrom);
        if (dateTo) p.set("dateTo", dateTo);
      }
      if (filterStaff) p.set("staffId", filterStaff);
      if (filterCategory) p.set("category", filterCategory);

      p.set("_t", String(Date.now()));
      const res = await fetch(`/api/companies/${companyId}/daily-cash?${p}`, { cache: "no-store" });
      const data = await res.json();
      setPayments(data.payments || []);
      setCategorySummary(data.categorySummary || []);
      setTotalSummary(data.summary || { total_count: 0, total_amount: 0 });
    } catch {}
    setLoading(false);
  }

  function createNewLine(): CollectionLine {
    return {
      id: Math.random().toString(36).slice(2),
      category: "cash_collection",
      amount: "",
      description: "",
      receiptNo: "",
      paymentMethod: "cash",
      fonepayRef: "",
    };
  }

  function openForm() {
    setFormDate(filterDate || new Date().toISOString().split("T")[0]);
    setFormStaffId("");
    setLines([createNewLine()]);
    setShowForm(true);
  }

  function addLine() {
    setLines([...lines, createNewLine()]);
  }

  function updateLine(id: string, field: keyof CollectionLine, value: string) {
    setLines(lines.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function removeLine(id: string) {
    if (lines.length > 1) {
      setLines(lines.filter((l) => l.id !== id));
    }
  }

  async function handleSave() {
    setSaving(true);
    let successCount = 0;
    let failCount = 0;
    for (const line of lines) {
      const amt = parseFloat(line.amount);
      if (!amt || amt <= 0) continue;
      try {
        const res = await fetch(`/api/companies/${companyId}/daily-cash`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffId: formStaffId || undefined,
            date: formDate,
            amount: amt,
            category: line.category,
            description: line.description || undefined,
            receiptNo: line.receiptNo || undefined,
            paymentMethod: line.paymentMethod,
            fonepayRef: line.fonepayRef || undefined,
          }),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
          const err = await res.json().catch(() => ({}));
          console.error("Line save failed:", err);
        }
      } catch (err) {
        failCount++;
        console.error("Daily cash save error:", err);
      }
    }

    if (successCount > 0) {
      setShowForm(false);
      await new Promise((r) => setTimeout(r, 300));
      await fetchPayments();
    }
    if (failCount > 0) {
      alert(`${successCount} entries saved, ${failCount} failed.`);
    }
    setSaving(false);
  }

  function getCategoryInfo(cat: string) {
    return allCategories.find((c) => c.value === cat) || { value: cat, label: cat, icon: "💵" };
  }

  const totalFormAmount = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />
      <MainContent className="overflow-auto">
        <div className="p-8">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Cash Collection & Payments</h1>
          <p className="text-sm text-muted-foreground">Track daily cash collection, fonepay, and cash expenses for riders and operations</p>
        </div>
        <Button onClick={openForm}>
          <Plus className="mr-2 h-4 w-4" /> Add Collection
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="text-lg font-bold">{formatCurrency(totalSummary.total_amount, companyCurrency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold">{totalSummary.total_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {categorySummary.slice(0, 2).map((cs) => {
          const info = getCategoryInfo(cs.category);
          return (
            <Card key={cs.category}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{info.icon}</span>
                  <div>
                    <p className="text-xs text-muted-foreground">{info.label}</p>
                    <p className="text-lg font-bold">{formatCurrency(cs.total, companyCurrency)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Category Breakdown */}
      {categorySummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categorySummary.map((cs) => {
                const info = getCategoryInfo(cs.category);
                const pct = totalSummary.total_amount > 0 ? (cs.total / totalSummary.total_amount) * 100 : 0;
                return (
                  <div key={cs.category} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <span>{info.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{info.label}</p>
                        <p className="text-xs text-muted-foreground">{cs.count} entries</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(cs.total, companyCurrency)}</p>
                      <p className="text-xs text-muted-foreground">{pct.toFixed(1)}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="flex gap-1 mb-1">
            <button
              className={`text-xs px-2 py-1 rounded ${dateMode === "single" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setDateMode("single")}
            >
              Single Day
            </button>
            <button
              className={`text-xs px-2 py-1 rounded ${dateMode === "range" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setDateMode("range")}
            >
              Range
            </button>
          </div>
          {dateMode === "single" ? (
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-40" />
          ) : (
            <div className="flex gap-2">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" placeholder="From" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" placeholder="To" />
            </div>
          )}
        </div>

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
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {allCategories.map((c) => (
            <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
          ))}
        </select>
      </div>

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : payments.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No cash entries for this date/period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Payment</th>
                    <th className="p-3">Staff</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">Receipt/Ref</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const catInfo = getCategoryInfo(p.category);
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 text-xs">{formatDate(p.date)}</td>
                        <td className="p-3">
                          <span className="mr-1">{catInfo.icon}</span>
                          <span className="text-xs">{catInfo.label}</span>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {p.paymentMethod === "fonepay" ? "📱 Fonepay" : p.paymentMethod === "cash" ? "💵 Cash" : (p.paymentMethod || "cash")}
                          </Badge>
                          {p.fonepayRef && <p className="text-xs text-muted-foreground mt-0.5">Ref: {p.fonepayRef}</p>}
                        </td>
                        <td className="p-3">
                          {p.staffName ? (
                            <div>
                              <p className="font-medium">{p.staffName}</p>
                              <p className="text-xs text-muted-foreground">{p.staffRole}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">General</span>
                          )}
                        </td>
                        <td className="p-3 max-w-[200px] truncate">{p.description || "-"}</td>
                        <td className="p-3 text-right font-semibold">{formatCurrency(p.amount, companyCurrency)}</td>
                        <td className="p-3 text-xs">{p.receiptNo || "-"}</td>
                        <td className="p-3">
                          <Badge className={
                            p.status === "approved" ? "bg-green-100 text-green-700" :
                            p.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }>
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="p-3" colSpan={5}>Total</td>
                    <td className="p-3 text-right">{formatCurrency(totalSummary.total_amount, companyCurrency)}</td>
                    <td className="p-3" colSpan={2}>{payments.length} entries</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Collection Modal — Multiple Lines */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Add Cash Collection / Payment</h2>
              <button onClick={() => setShowForm(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Common Fields */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div>
                <Label>Staff (optional)</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={formStaffId}
                  onChange={(e) => setFormStaffId(e.target.value)}
                >
                  <option value="">General (no specific staff)</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Collection Lines */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Collection Lines</Label>
                <Button size="sm" variant="outline" onClick={addLine}>
                  <Plus className="mr-1 h-3 w-3" /> Add Line
                </Button>
              </div>

              {lines.map((line, idx) => (
                <div key={line.id} className="rounded-lg border p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Line {idx + 1}</span>
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(line.id)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Category</Label>
                      <select
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={line.category}
                        onChange={(e) => updateLine(line.id, "category", e.target.value)}
                      >
                        {allCategories.map((c) => (
                          <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Payment Method</Label>
                      <select
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={line.paymentMethod}
                        onChange={(e) => updateLine(line.id, "paymentMethod", e.target.value)}
                      >
                        <option value="cash">💵 Cash</option>
                        <option value="fonepay">📱 Fonepay</option>
                        <option value="bank">🏦 Bank Transfer</option>
                        <option value="esewa">eSewa</option>
                        <option value="khalti">Khalti</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Amount *</Label>
                      <Input
                        type="number"
                        value={line.amount}
                        onChange={(e) => updateLine(line.id, "amount", e.target.value)}
                        placeholder="0"
                        className="h-8"
                      />
                    </div>
                  </div>

                  {/* Fonepay reference field — visible only when fonepay selected */}
                  {line.paymentMethod === "fonepay" && (
                    <div>
                      <Label className="text-xs">Fonepay Reference ID</Label>
                      <Input
                        value={line.fonepayRef}
                        onChange={(e) => updateLine(line.id, "fonepayRef", e.target.value)}
                        placeholder="Fonepay transaction reference"
                        className="h-8"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.id, "description", e.target.value)}
                        placeholder="e.g. Delivery cash collection"
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Receipt No.</Label>
                      <Input
                        value={line.receiptNo}
                        onChange={(e) => updateLine(line.id, "receiptNo", e.target.value)}
                        placeholder="Optional"
                        className="h-8"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total Preview */}
            <div className="rounded-lg bg-primary/5 p-3 text-center mb-4">
              <p className="text-xs text-muted-foreground">Total ({lines.filter(l => parseFloat(l.amount) > 0).length} items)</p>
              <p className="text-xl font-bold">{formatCurrency(totalFormAmount, companyCurrency)}</p>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !formDate || totalFormAmount <= 0}>
                {saving ? "Saving..." : `Add ${lines.filter(l => parseFloat(l.amount) > 0).length} Entries`}
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
