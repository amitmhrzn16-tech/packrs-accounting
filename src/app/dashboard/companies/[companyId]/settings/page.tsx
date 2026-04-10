"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MainContent } from "@/components/dashboard/main-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES } from "@/lib/utils";
import {
  Settings,
  Plus,
  Trash2,
  Tags,
  CreditCard,
  Wallet,
  TrendingUp,
  TrendingDown,
  Banknote,
  Coins,
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  isActive: boolean;
  children?: Category[];
}

export default function CompanySettings({
  params,
}: {
  params: { companyId: string };
}) {
  const { companyId } = params;

  // Company info
  const [companyName, setCompanyName] = useState("");
  const [panVat, setPanVat] = useState("");
  const [currency, setCurrency] = useState("NPR");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  // Categories
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<"income" | "expense">("income");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  // Payment methods (stored locally, configurable per company)
  const defaultPaymentMethods = ["Cash", "Bank Transfer", "eSewa", "Khalti", "Cheque", "Fonepay"];
  const [paymentMethods, setPaymentMethods] = useState<string[]>(defaultPaymentMethods);
  const [newPaymentMethod, setNewPaymentMethod] = useState("");

  // Opening balances by payment method
  const [paymentMethodBalances, setPaymentMethodBalances] = useState<Record<string, number>>({});
  const [savingPaymentBalances, setSavingPaymentBalances] = useState(false);

  // Payroll settings
  interface PayrollField { id: string; settingType: string; fieldName: string; fieldLabel: string; fieldType: string; defaultValue: string; }
  const [salaryDeductionFields, setSalaryDeductionFields] = useState<PayrollField[]>([]);
  const [salaryBonusFields, setSalaryBonusFields] = useState<PayrollField[]>([]);
  const [dailyCashCategories, setDailyCashCategories] = useState<PayrollField[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"salary_deduction" | "salary_bonus" | "daily_cash_category">("salary_deduction");
  const [newFieldDefault, setNewFieldDefault] = useState("");
  const [addingField, setAddingField] = useState(false);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"general" | "categories" | "payment" | "payroll">("general");

  useEffect(() => {
    fetchAll();
  }, [companyId]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [companyRes, incomeCatRes, expenseCatRes, balancesRes, salaryDedRes, salaryBonusRes, cashCatRes] = await Promise.all([
        fetch(`/api/companies/${companyId}`),
        fetch(`/api/companies/${companyId}/categories?type=income`),
        fetch(`/api/companies/${companyId}/categories?type=expense`),
        fetch(`/api/companies/${companyId}/payment-balances`),
        fetch(`/api/companies/${companyId}/payroll-settings?type=salary_deduction`).catch(() => null),
        fetch(`/api/companies/${companyId}/payroll-settings?type=salary_bonus`).catch(() => null),
        fetch(`/api/companies/${companyId}/payroll-settings?type=daily_cash_category`).catch(() => null),
      ]);

      if (companyRes.ok) {
        const data = await companyRes.json();
        setCompanyName(data.name || "");
        setPanVat(data.panVat || "");
        setCurrency(data.currency || "NPR");
        setSlackWebhookUrl(data.slackWebhookUrl || "");
        // Opening balance could be stored in company metadata — for now use fiscalYearStart field
        setOpeningBalance(data.openingBalance || "");
      }

      if (incomeCatRes.ok) {
        setIncomeCategories(await incomeCatRes.json());
      }
      if (expenseCatRes.ok) {
        setExpenseCategories(await expenseCatRes.json());
      }

      if (balancesRes.ok) {
        const balances = await balancesRes.json();
        const balanceMap: Record<string, number> = {};
        balances.forEach((b: { payment_method: string; opening_balance: number }) => {
          balanceMap[b.payment_method] = b.opening_balance;
        });
        setPaymentMethodBalances(balanceMap);
      }

      // Payroll settings
      if (salaryDedRes?.ok) {
        const d = await salaryDedRes.json();
        setSalaryDeductionFields(d.settings || []);
      }
      if (salaryBonusRes?.ok) {
        const d = await salaryBonusRes.json();
        setSalaryBonusFields(d.settings || []);
      }
      if (cashCatRes?.ok) {
        const d = await cashCatRes.json();
        setDailyCashCategories(d.settings || []);
      }
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  const [savingBalance, setSavingBalance] = useState(false);

  // Calculate total opening balance from payment method balances
  const totalOpeningBalance = Object.values(paymentMethodBalances).reduce(
    (sum, balance) => sum + (balance || 0),
    0
  );

  async function savePaymentMethodBalances() {
    setSavingPaymentBalances(true);
    try {
      const balances = paymentMethods.map((method) => ({
        paymentMethod: method,
        openingBalance: paymentMethodBalances[method] || 0,
      }));

      const res = await fetch(`/api/companies/${companyId}/payment-balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balances }),
      });
      if (!res.ok) throw new Error();
      toast.success("Opening balances saved");
    } catch {
      toast.error("Failed to save opening balances");
    } finally {
      setSavingPaymentBalances(false);
    }
  }

  async function saveCompanyInfo(e: React.FormEvent) {
    e.preventDefault();
    setSavingCompany(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName, panVat, currency, slackWebhookUrl }),
      });
      if (!res.ok) throw new Error();
      toast.success("Company details saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingCompany(false);
    }
  }

  async function saveOpeningBalance() {
    setSavingBalance(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingBalance: openingBalance || "0" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Opening balance saved");
    } catch {
      toast.error("Failed to save opening balance");
    } finally {
      setSavingBalance(false);
    }
  }

  async function addCategory() {
    if (!newCategoryName.trim()) {
      toast.error("Category name is required");
      return;
    }
    setAddingCategory(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim(), type: newCategoryType }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Category "${newCategoryName}" added`);
      setNewCategoryName("");
      setCategoryDialogOpen(false);
      // Refresh categories
      const [incRes, expRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/categories?type=income`),
        fetch(`/api/companies/${companyId}/categories?type=expense`),
      ]);
      if (incRes.ok) setIncomeCategories(await incRes.json());
      if (expRes.ok) setExpenseCategories(await expRes.json());
    } catch {
      toast.error("Failed to add category");
    } finally {
      setAddingCategory(false);
    }
  }

  async function addPayrollField() {
    if (!newFieldLabel.trim()) {
      toast.error("Field label is required");
      return;
    }
    setAddingField(true);
    try {
      const fieldName = newFieldLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
      const res = await fetch(`/api/companies/${companyId}/payroll-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settingType: newFieldType,
          fieldName,
          fieldLabel: newFieldLabel.trim(),
          fieldType: "number",
          defaultValue: newFieldDefault || "0",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`"${newFieldLabel}" added`);
      setNewFieldLabel("");
      setNewFieldDefault("");
      // Refresh
      fetchAll();
    } catch {
      toast.error("Failed to add field");
    } finally {
      setAddingField(false);
    }
  }

  async function removePayrollField(fieldId: string) {
    try {
      const res = await fetch(`/api/companies/${companyId}/payroll-settings?id=${fieldId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Field removed");
      fetchAll();
    } catch {
      toast.error("Failed to remove field");
    }
  }

  function addPaymentMethod() {
    if (!newPaymentMethod.trim()) return;
    if (paymentMethods.includes(newPaymentMethod.trim())) {
      toast.error("Payment method already exists");
      return;
    }
    setPaymentMethods([...paymentMethods, newPaymentMethod.trim()]);
    setNewPaymentMethod("");
    toast.success("Payment method added");
  }

  function removePaymentMethod(method: string) {
    setPaymentMethods(paymentMethods.filter((m) => m !== method));
    toast.success("Payment method removed");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar companyId={companyId} companyName="Loading..." />
        <MainContent className="p-8">
          <div className="space-y-4">
            <div className="h-10 bg-gray-200 rounded animate-pulse w-48" />
            <div className="h-96 bg-gray-200 rounded animate-pulse" />
          </div>
        </MainContent>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />
      <MainContent className="overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <Settings className="h-8 w-8 text-gray-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
              <p className="text-gray-500">Manage company settings, categories, and payment methods</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
            {[
              { key: "general" as const, label: "General", icon: Settings },
              { key: "categories" as const, label: "Categories", icon: Tags },
              { key: "payment" as const, label: "Payment Methods", icon: CreditCard },
              { key: "payroll" as const, label: "Payroll & Cash", icon: Banknote },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ═══════════ GENERAL TAB ═══════════ */}
          {activeTab === "general" && (
            <div className="space-y-6 max-w-2xl">
              <Card>
                <CardHeader>
                  <CardTitle>Company Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={saveCompanyInfo} className="space-y-5">
                    <div>
                      <Label htmlFor="name">Company Name *</Label>
                      <Input
                        id="name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="panVat">PAN / VAT Number</Label>
                      <Input
                        id="panVat"
                        value={panVat}
                        onChange={(e) => setPanVat(e.target.value)}
                        placeholder="e.g., 123456789"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="currency">Currency</Label>
                      <select
                        id="currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {c.name} ({c.symbol})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="slackWebhookUrl">Slack Webhook URL</Label>
                      <Input
                        id="slackWebhookUrl"
                        type="url"
                        value={slackWebhookUrl}
                        onChange={(e) => setSlackWebhookUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className="mt-1.5"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">
                        New comments and new income/expense entries will be posted to this Slack channel.
                        Leave blank to use the global SLACK_WEBHOOK_URL fallback (if configured).
                      </p>
                    </div>
                    <Button type="submit" disabled={savingCompany}>
                      {savingCompany ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Opening Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                    The opening balance is the sum of all payment method opening balances. Set them in the Payment Methods tab.
                  </p>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Label htmlFor="totalBalance">Total Opening Balance ({currency})</Label>
                      <Input
                        id="totalBalance"
                        type="number"
                        step="0.01"
                        value={totalOpeningBalance.toFixed(2)}
                        readOnly
                        className="mt-1.5 bg-gray-50 text-gray-600"
                      />
                    </div>
                    <div className="text-sm text-gray-500">
                      Read-only (sum of payment methods)
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ CATEGORIES TAB ═══════════ */}
          {activeTab === "categories" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-gray-500">
                  Manage income and expense categories for this company
                </p>
                <Button
                  onClick={() => setCategoryDialogOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Add Category
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Income Categories */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-emerald-700">
                      <TrendingUp className="h-5 w-5" />
                      Income Categories
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {incomeCategories.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">
                        No income categories yet
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {incomeCategories.map((cat) => (
                          <div
                            key={cat.id}
                            className="flex items-center justify-between px-3 py-2.5 bg-emerald-50 rounded-lg border border-emerald-100"
                          >
                            <span className="text-sm font-medium text-gray-800">
                              {cat.name}
                            </span>
                            <Badge variant="success" className="text-xs">
                              Income
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Expense Categories */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-700">
                      <TrendingDown className="h-5 w-5" />
                      Expense Categories
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {expenseCategories.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">
                        No expense categories yet
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {expenseCategories.map((cat) => (
                          <div
                            key={cat.id}
                            className="flex items-center justify-between px-3 py-2.5 bg-red-50 rounded-lg border border-red-100"
                          >
                            <span className="text-sm font-medium text-gray-800">
                              {cat.name}
                            </span>
                            <Badge variant="destructive" className="text-xs">
                              Expense
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Add Category Dialog */}
              <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Category</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="catName">Category Name</Label>
                      <Input
                        id="catName"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="e.g., Vehicle Maintenance"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label>Type</Label>
                      <div className="flex gap-3 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setNewCategoryType("income")}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                            newCategoryType === "income"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-gray-200 text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          <TrendingUp className="h-4 w-4" /> Income
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewCategoryType("expense")}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                            newCategoryType === "expense"
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-gray-200 text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          <TrendingDown className="h-4 w-4" /> Expense
                        </button>
                      </div>
                    </div>
                    <Button
                      onClick={addCategory}
                      disabled={addingCategory}
                      className="w-full"
                    >
                      {addingCategory ? "Adding..." : "Add Category"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════ PAYROLL & CASH TAB ═══════════ */}
          {activeTab === "payroll" && (
            <div className="max-w-2xl space-y-6">
              {/* Salary Deduction Fields */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    Salary Deduction Fields
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                    Add custom deduction fields (TDS, PF, Insurance, SSF, etc.) that will appear automatically when paying salary.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <Input
                      value={newFieldType === "salary_deduction" ? newFieldLabel : ""}
                      onChange={(e) => { setNewFieldLabel(e.target.value); setNewFieldType("salary_deduction"); }}
                      placeholder="e.g., TDS, Provident Fund, Insurance..."
                      onFocus={() => setNewFieldType("salary_deduction")}
                      onKeyDown={(e) => e.key === "Enter" && newFieldType === "salary_deduction" && addPayrollField()}
                    />
                    <Input
                      value={newFieldType === "salary_deduction" ? newFieldDefault : ""}
                      onChange={(e) => setNewFieldDefault(e.target.value)}
                      placeholder="Default"
                      className="w-24"
                      type="number"
                      onFocus={() => setNewFieldType("salary_deduction")}
                    />
                    <Button onClick={() => { setNewFieldType("salary_deduction"); addPayrollField(); }} disabled={addingField} className="shrink-0 gap-1">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                  {salaryDeductionFields.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No salary deduction fields configured yet</p>
                  ) : (
                    <div className="space-y-2">
                      {salaryDeductionFields.map((f) => (
                        <div key={f.id} className="flex items-center justify-between px-4 py-3 bg-red-50 rounded-lg border border-red-100">
                          <div>
                            <span className="text-sm font-medium">{f.fieldLabel}</span>
                            {f.defaultValue && f.defaultValue !== "0" && (
                              <span className="ml-2 text-xs text-gray-500">Default: {f.defaultValue}</span>
                            )}
                          </div>
                          <button onClick={() => removePayrollField(f.id)} className="p-1 text-gray-400 hover:text-red-500" title="Remove">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Salary Bonus Fields */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Salary Bonus / Allowance Fields
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                    Add custom bonus/allowance fields (Overtime, Incentive, Fuel Allowance, etc.).
                  </p>
                  <div className="flex gap-2 mb-4">
                    <Input
                      value={newFieldType === "salary_bonus" ? newFieldLabel : ""}
                      onChange={(e) => { setNewFieldLabel(e.target.value); setNewFieldType("salary_bonus"); }}
                      placeholder="e.g., Overtime, Fuel Allowance, Incentive..."
                      onFocus={() => setNewFieldType("salary_bonus")}
                      onKeyDown={(e) => e.key === "Enter" && newFieldType === "salary_bonus" && addPayrollField()}
                    />
                    <Input
                      value={newFieldType === "salary_bonus" ? newFieldDefault : ""}
                      onChange={(e) => setNewFieldDefault(e.target.value)}
                      placeholder="Default"
                      className="w-24"
                      type="number"
                      onFocus={() => setNewFieldType("salary_bonus")}
                    />
                    <Button onClick={() => { setNewFieldType("salary_bonus"); addPayrollField(); }} disabled={addingField} className="shrink-0 gap-1">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                  {salaryBonusFields.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No bonus fields configured yet</p>
                  ) : (
                    <div className="space-y-2">
                      {salaryBonusFields.map((f) => (
                        <div key={f.id} className="flex items-center justify-between px-4 py-3 bg-green-50 rounded-lg border border-green-100">
                          <div>
                            <span className="text-sm font-medium">{f.fieldLabel}</span>
                            {f.defaultValue && f.defaultValue !== "0" && (
                              <span className="ml-2 text-xs text-gray-500">Default: {f.defaultValue}</span>
                            )}
                          </div>
                          <button onClick={() => removePayrollField(f.id)} className="p-1 text-gray-400 hover:text-red-500" title="Remove">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Daily Cash Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-amber-500" />
                    Daily Cash Categories
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                    Add custom daily cash categories that will appear in the Daily Cash page dropdown.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <Input
                      value={newFieldType === "daily_cash_category" ? newFieldLabel : ""}
                      onChange={(e) => { setNewFieldLabel(e.target.value); setNewFieldType("daily_cash_category"); }}
                      placeholder="e.g., Parking, Toll, Courier Bag..."
                      onFocus={() => setNewFieldType("daily_cash_category")}
                      onKeyDown={(e) => e.key === "Enter" && newFieldType === "daily_cash_category" && addPayrollField()}
                    />
                    <Button onClick={() => { setNewFieldType("daily_cash_category"); addPayrollField(); }} disabled={addingField} className="shrink-0 gap-1">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                  {dailyCashCategories.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No custom daily cash categories yet (defaults are still available)</p>
                  ) : (
                    <div className="space-y-2">
                      {dailyCashCategories.map((f) => (
                        <div key={f.id} className="flex items-center justify-between px-4 py-3 bg-amber-50 rounded-lg border border-amber-100">
                          <span className="text-sm font-medium">{f.fieldLabel}</span>
                          <button onClick={() => removePayrollField(f.id)} className="p-1 text-gray-400 hover:text-red-500" title="Remove">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ PAYMENT METHODS TAB ═══════════ */}
          {activeTab === "payment" && (
            <div className="max-w-2xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Payment Methods
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                    Configure the payment methods available when recording transactions.
                  </p>

                  {/* Add new */}
                  <div className="flex gap-2 mb-6">
                    <Input
                      value={newPaymentMethod}
                      onChange={(e) => setNewPaymentMethod(e.target.value)}
                      placeholder="e.g., Connect IPS"
                      onKeyDown={(e) => e.key === "Enter" && addPaymentMethod()}
                    />
                    <Button onClick={addPaymentMethod} className="gap-1 shrink-0">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>

                  {/* List */}
                  <div className="space-y-2">
                    {paymentMethods.map((method) => (
                      <div
                        key={method}
                        className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium">{method}</span>
                        </div>
                        <button
                          onClick={() => removePaymentMethod(method)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Opening Balances by Payment Method */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Opening Balances by Payment Method
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-6">
                    Set the opening balance for each payment method. The total will be calculated automatically.
                  </p>

                  <div className="space-y-4 mb-6">
                    {paymentMethods.map((method) => (
                      <div key={method} className="flex items-end gap-4">
                        <div className="flex-1">
                          <Label htmlFor={`balance-${method}`} className="text-sm">
                            {method}
                          </Label>
                          <Input
                            id={`balance-${method}`}
                            type="number"
                            step="0.01"
                            value={paymentMethodBalances[method] || ""}
                            onChange={(e) =>
                              setPaymentMethodBalances({
                                ...paymentMethodBalances,
                                [method]: parseFloat(e.target.value) || 0,
                              })
                            }
                            placeholder="0.00"
                            className="mt-1.5"
                          />
                        </div>
                        <div className="text-sm text-gray-500 min-w-fit">{currency}</div>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-blue-900">
                        Total Opening Balance
                      </span>
                      <span className="text-lg font-bold text-blue-900">
                        {totalOpeningBalance.toFixed(2)} {currency}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={savePaymentMethodBalances}
                    disabled={savingPaymentBalances}
                    className="w-full"
                  >
                    {savingPaymentBalances ? "Saving..." : "Save Opening Balances"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </MainContent>
    </div>
  );
}
