"use client";

import { useEffect, useState } from "react";
import { Plus, Building2, TrendingUp, TrendingDown, Wallet, ArrowDownUp, CreditCard, Landmark } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { CompanyCard } from "@/components/dashboard/company-card";
import { StatCard } from "@/components/charts/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface PaymentMethodEntry {
  method: string;
  amount: number;
  count: number;
}

interface CompanyData {
  id: string;
  name: string;
  currency: string;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  transactionCount: number;
  incomeByPaymentMethod: PaymentMethodEntry[];
  expenseByPaymentMethod: PaymentMethodEntry[];
}

export default function MasterDashboard() {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      const res = await fetch("/api/companies");
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch {
      toast.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCompany(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          panVat: formData.get("panVat") || undefined,
          currency: formData.get("currency") || "NPR",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to create company");
        return;
      }

      toast.success("Company created successfully!");
      setDialogOpen(false);
      fetchCompanies();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  const totals = companies.reduce(
    (acc, c) => ({
      openingBalance: acc.openingBalance + (c.openingBalance || 0),
      income: acc.income + c.totalIncome,
      expense: acc.expense + c.totalExpense,
      net: acc.net + c.netBalance,
      transactions: acc.transactions + c.transactionCount,
    }),
    { openingBalance: 0, income: 0, expense: 0, net: 0, transactions: 0 }
  );

  // Aggregate payment methods across all companies
  const aggregatePaymentMethods = (type: 'incomeByPaymentMethod' | 'expenseByPaymentMethod') => {
    const map = new Map<string, { amount: number; count: number }>();
    companies.forEach((c) => {
      (c[type] || []).forEach((pm) => {
        const existing = map.get(pm.method) || { amount: 0, count: 0 };
        map.set(pm.method, {
          amount: existing.amount + pm.amount,
          count: existing.count + pm.count,
        });
      });
    });
    return Array.from(map.entries())
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.amount - a.amount);
  };

  const totalIncomeByMethod = aggregatePaymentMethods('incomeByPaymentMethod');
  const totalExpenseByMethod = aggregatePaymentMethods('expenseByPaymentMethod');

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64">
        <div className="border-b bg-card">
          <div className="flex h-16 items-center justify-between px-8">
            <div>
              <h1 className="text-xl font-bold">Master Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Overview of all companies
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New Company
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Company</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateCompany} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name</Label>
                    <Input id="name" name="name" placeholder="e.g. Packrs Courier" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="panVat">PAN/VAT Number</Label>
                    <Input id="panVat" name="panVat" placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input id="currency" name="currency" placeholder="NPR" defaultValue="NPR" />
                  </div>
                  <Button type="submit" className="w-full" disabled={creating}>
                    {creating ? "Creating..." : "Create Company"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              title="Opening Balance"
              value={formatCurrency(totals.openingBalance)}
              icon={<Landmark className="h-4 w-4 text-indigo-500" />}
            />
            <StatCard
              title="Total Income"
              value={formatCurrency(totals.income)}
              icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
            />
            <StatCard
              title="Total Expenses"
              value={formatCurrency(totals.expense)}
              icon={<TrendingDown className="h-4 w-4 text-red-500" />}
            />
            <StatCard
              title="Net Balance"
              value={formatCurrency(totals.net)}
              icon={<Wallet className="h-4 w-4 text-blue-500" />}
            />
            <StatCard
              title="Total Transactions"
              value={totals.transactions.toString()}
              icon={<ArrowDownUp className="h-4 w-4 text-orange-500" />}
            />
            <StatCard
              title="Companies"
              value={companies.length.toString()}
              icon={<Building2 className="h-4 w-4 text-purple-500" />}
            />
          </div>

          {/* Payment Method Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-5 w-5 text-emerald-500" />
                  Income by Payment Channel
                </CardTitle>
              </CardHeader>
              <CardContent>
                {totalIncomeByMethod.length > 0 ? (
                  <div className="space-y-3">
                    {totalIncomeByMethod.map((pm) => (
                      <div key={pm.method} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="capitalize">{pm.method}</Badge>
                          <span className="text-xs text-muted-foreground">{pm.count} txns</span>
                        </div>
                        <span className="font-semibold text-emerald-600">{formatCurrency(pm.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t-2 border-emerald-200">
                      <span className="font-bold">Total</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(totals.income)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No income data</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-5 w-5 text-red-500" />
                  Expenses by Payment Channel
                </CardTitle>
              </CardHeader>
              <CardContent>
                {totalExpenseByMethod.length > 0 ? (
                  <div className="space-y-3">
                    {totalExpenseByMethod.map((pm) => (
                      <div key={pm.method} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="capitalize">{pm.method}</Badge>
                          <span className="text-xs text-muted-foreground">{pm.count} txns</span>
                        </div>
                        <span className="font-semibold text-red-600">{formatCurrency(pm.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t-2 border-red-200">
                      <span className="font-bold">Total</span>
                      <span className="font-bold text-red-700">{formatCurrency(totals.expense)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No expense data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Company Cards */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-40 rounded-xl border bg-card animate-pulse" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-1">No companies yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first company to get started
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create Company
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {companies.map((company) => (
                <CompanyCard key={company.id} {...company} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
