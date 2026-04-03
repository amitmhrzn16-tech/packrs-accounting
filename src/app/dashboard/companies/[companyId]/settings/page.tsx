"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
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
import {
  Settings,
  Plus,
  Trash2,
  Tags,
  CreditCard,
  Wallet,
  TrendingUp,
  TrendingDown,
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

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"general" | "categories" | "payment">("general");

  useEffect(() => {
    fetchAll();
  }, [companyId]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [companyRes, incomeCatRes, expenseCatRes] = await Promise.all([
        fetch(`/api/companies/${companyId}`),
        fetch(`/api/companies/${companyId}/categories?type=income`),
        fetch(`/api/companies/${companyId}/categories?type=expense`),
      ]);

      if (companyRes.ok) {
        const data = await companyRes.json();
        setCompanyName(data.name || "");
        setPanVat(data.panVat || "");
        setCurrency(data.currency || "NPR");
        // Opening balance could be stored in company metadata — for now use fiscalYearStart field
        setOpeningBalance(data.openingBalance || "");
      }

      if (incomeCatRes.ok) {
        setIncomeCategories(await incomeCatRes.json());
      }
      if (expenseCatRes.ok) {
        setExpenseCategories(await expenseCatRes.json());
      }
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  const [savingBalance, setSavingBalance] = useState(false);

  async function saveCompanyInfo(e: React.FormEvent) {
    e.preventDefault();
    setSavingCompany(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName, panVat, currency }),
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
        <div className="flex-1 ml-64 p-8">
          <div className="space-y-4">
            <div className="h-10 bg-gray-200 rounded animate-pulse w-48" />
            <div className="h-96 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />
      <div className="flex-1 ml-64 overflow-auto">
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
                        <option value="NPR">NPR — Nepalese Rupee</option>
                        <option value="USD">USD — US Dollar</option>
                        <option value="INR">INR — Indian Rupee</option>
                        <option value="EUR">EUR — Euro</option>
                        <option value="GBP">GBP — British Pound</option>
                      </select>
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
                    Set the opening balance for this company. This is the starting balance when you begin tracking in the system.
                  </p>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Label htmlFor="openingBalance">Opening Balance ({currency})</Label>
                      <Input
                        id="openingBalance"
                        type="number"
                        step="0.01"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                        placeholder="0.00"
                        className="mt-1.5"
                      />
                    </div>
                    <Button
                      onClick={saveOpeningBalance}
                      disabled={savingBalance}
                    >
                      {savingBalance ? "Saving..." : "Save Balance"}
                    </Button>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
