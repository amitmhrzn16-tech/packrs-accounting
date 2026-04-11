"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MainContent } from "@/components/dashboard/main-content";
import { StatCard } from "@/components/charts/stat-card";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { CategoryPieChart } from "@/components/charts/category-pie-chart";
import { BalanceLineChart } from "@/components/charts/balance-line-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowDownUp,
  CreditCard,
  Landmark,
  Users,
  Banknote,
  AlertTriangle,
  Coins,
} from "lucide-react";
import Link from "next/link";

interface PaymentMethodEntry {
  method: string;
  amount: number;
  count: number;
}

interface ReportData {
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalTransactions: number;
  monthlyData: Array<{
    month: string;
    income: number;
    expense: number;
  }>;
  topExpenseCategories: Array<{
    categoryName: string;
    amount: number;
  }>;
  incomeByPaymentMethod: PaymentMethodEntry[];
  expenseByPaymentMethod: PaymentMethodEntry[];
  recentTransactions: Array<{
    id: string;
    date: string;
    particulars: string;
    type: "income" | "expense";
    amount: number;
  }>;
}

interface CompanyData {
  name: string;
}

export default function CompanyDashboard({
  params,
}: {
  params: { companyId: string };
}) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payrollData, setPayrollData] = useState<{
    staffCount: number;
    riderCount: number;
    totalPayroll: number;
    totalAdvanceDue: number;
    recentSalaries: number;
    dailyCashToday: number;
    staffList: Array<{ id: string; name: string; role: string; joinDate: string; salaryAmount: number }>;
  } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const _t = Date.now();
        const [reportsRes, companyRes, staffRes, salaryRes, dailyCashRes, advanceRes] = await Promise.all([
          fetch(`/api/companies/${params.companyId}/reports?_t=${_t}`, { cache: "no-store" }),
          fetch(`/api/companies/${params.companyId}?_t=${_t}`, { cache: "no-store" }),
          fetch(`/api/companies/${params.companyId}/staff?isActive=true&_t=${_t}`, { cache: "no-store" }).catch(() => null),
          fetch(`/api/companies/${params.companyId}/salary-payments?month=${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}&_t=${_t}`, { cache: "no-store" }).catch(() => null),
          fetch(`/api/companies/${params.companyId}/daily-cash?date=${new Date().toISOString().split("T")[0]}&_t=${_t}`, { cache: "no-store" }).catch(() => null),
          fetch(`/api/companies/${params.companyId}/advance-payments?_t=${_t}`, { cache: "no-store" }).catch(() => null),
        ]);

        if (!reportsRes.ok || !companyRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const reports = await reportsRes.json();
        const company = await companyRes.json();

        setReportData(reports);
        setCompanyData(company);

        // Payroll data
        try {
          const staffData = staffRes?.ok ? await staffRes.json() : { staff: [] };
          const salaryData = salaryRes?.ok ? await salaryRes.json() : { summary: { total_paid: 0 } };
          const cashData = dailyCashRes?.ok ? await dailyCashRes.json() : { summary: { total_amount: 0 } };
          const advanceData = advanceRes?.ok ? await advanceRes.json() : { summary: { total_outstanding: 0 } };
          const staffList = staffData.staff || [];
          setPayrollData({
            staffCount: staffList.length,
            riderCount: staffList.filter((s: any) => s.role === "rider").length,
            totalPayroll: staffList.reduce((sum: number, s: any) => sum + (s.salaryAmount || 0), 0),
            totalAdvanceDue: Number(advanceData.summary?.total_outstanding) || 0,
            recentSalaries: Number(salaryData.summary?.total_paid) || 0,
            dailyCashToday: Number(cashData.summary?.total_amount) || 0,
            staffList: staffList.map((s: any) => ({
              id: s.id,
              name: s.name,
              role: s.role,
              joinDate: s.joinDate || "",
              salaryAmount: s.salaryAmount || 0,
            })),
          });
        } catch {}
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An error occurred"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params.companyId]);

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar companyId={params.companyId} companyName="Loading..." />
        <MainContent className="p-8">
          <div className="space-y-4">
            <div className="h-10 bg-gray-300 rounded animate-pulse"></div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 bg-gray-300 rounded animate-pulse"
                ></div>
              ))}
            </div>
            <div className="h-96 bg-gray-300 rounded animate-pulse"></div>
          </div>
        </MainContent>
      </div>
    );
  }

  if (error || !reportData || !companyData) {
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar companyId={params.companyId} companyName="Error" />
        <MainContent className="p-8">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p>Error loading dashboard: {error}</p>
          </div>
        </MainContent>
      </div>
    );
  }

  // Transform expense categories for pie chart
  const categoryColors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
  ];
  const chartCategoryData = reportData.topExpenseCategories.map(
    (cat, index) => ({
      name: cat.categoryName,
      value: cat.amount,
      color: categoryColors[index % categoryColors.length],
    })
  );

  // Build running balance data from monthly data (starting from opening balance)
  let runningBalance = reportData.openingBalance || 0;
  const balanceData = reportData.monthlyData.map((m) => {
    runningBalance += m.income - m.expense;
    return { date: m.month, balance: runningBalance };
  });

  const recentTransactions = reportData.recentTransactions.slice(0, 10);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        companyId={params.companyId}
        companyName={companyData.name}
      />
      <MainContent className="p-8 overflow-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {companyData.name}
          </h1>
          <p className="text-gray-500 mt-2">Dashboard Overview</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <StatCard
            title="Opening Balance"
            value={formatCurrency(reportData.openingBalance || 0)}
            icon={<Landmark className="h-5 w-5 text-indigo-500" />}
          />
          <StatCard
            title="Total Income"
            value={formatCurrency(reportData.totalIncome)}
            icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
          />
          <StatCard
            title="Total Expenses"
            value={formatCurrency(reportData.totalExpense)}
            icon={<TrendingDown className="h-5 w-5 text-red-500" />}
          />
          <StatCard
            title="Net Balance"
            value={formatCurrency(reportData.netBalance)}
            icon={<Wallet className="h-5 w-5 text-blue-500" />}
          />
          <StatCard
            title="Total Transactions"
            value={(reportData.totalTransactions || 0).toString()}
            icon={<ArrowDownUp className="h-5 w-5 text-purple-500" />}
          />
        </div>

        {/* Payment Method Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-500" />
                Income by Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportData.incomeByPaymentMethod && reportData.incomeByPaymentMethod.length > 0 ? (
                <div className="space-y-3">
                  {reportData.incomeByPaymentMethod.map((pm) => (
                    <div key={pm.method} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="capitalize">{pm.method}</Badge>
                        <span className="text-xs text-gray-500">{pm.count} txns</span>
                      </div>
                      <span className="font-semibold text-emerald-600">{formatCurrency(pm.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t-2 border-emerald-200">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-bold text-emerald-700">{formatCurrency(reportData.totalIncome)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No income data</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-red-500" />
                Expenses by Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportData.expenseByPaymentMethod && reportData.expenseByPaymentMethod.length > 0 ? (
                <div className="space-y-3">
                  {reportData.expenseByPaymentMethod.map((pm) => (
                    <div key={pm.method} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="capitalize">{pm.method}</Badge>
                        <span className="text-xs text-gray-500">{pm.count} txns</span>
                      </div>
                      <span className="font-semibold text-red-600">{formatCurrency(pm.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t-2 border-red-200">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-bold text-red-700">{formatCurrency(reportData.totalExpense)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No expense data</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payroll & Staff Quick View */}
        {payrollData && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  Payroll & Staff Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Link href={`/dashboard/companies/${params.companyId}/staff`} className="block rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                    <p className="text-xs text-muted-foreground">Total Staff</p>
                    <p className="text-xl font-bold">{payrollData.staffCount}</p>
                    <p className="text-xs text-blue-500">{payrollData.riderCount} riders</p>
                  </Link>
                  <Link href={`/dashboard/companies/${params.companyId}/salary`} className="block rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                    <p className="text-xs text-muted-foreground">Monthly Payroll</p>
                    <p className="text-lg font-bold">{formatCurrency(payrollData.totalPayroll)}</p>
                    <p className="text-xs text-muted-foreground">agreed/month</p>
                  </Link>
                  <Link href={`/dashboard/companies/${params.companyId}/salary`} className="block rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                    <p className="text-xs text-muted-foreground">Paid This Month</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(payrollData.recentSalaries)}</p>
                  </Link>
                  <Link href={`/dashboard/companies/${params.companyId}/advances`} className="block rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                    <p className="text-xs text-muted-foreground">Advances Due</p>
                    <p className="text-lg font-bold text-orange-600">{formatCurrency(payrollData.totalAdvanceDue)}</p>
                    <p className="text-xs text-orange-500">outstanding</p>
                  </Link>
                  <Link href={`/dashboard/companies/${params.companyId}/daily-cash`} className="block rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                    <p className="text-xs text-muted-foreground">Today&apos;s Cash</p>
                    <p className="text-lg font-bold">{formatCurrency(payrollData.dailyCashToday)}</p>
                    <p className="text-xs text-muted-foreground">spent today</p>
                  </Link>
                  <div className="flex items-center justify-center rounded-lg border p-3 bg-primary/5">
                    <Link href={`/dashboard/companies/${params.companyId}/staff`} className="text-sm text-primary font-medium hover:underline">
                      Manage Staff →
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Staff & Riders with Joining Date */}
        {payrollData && payrollData.staffList && payrollData.staffList.length > 0 && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-500" />
                  Staff &amp; Riders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Name</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Role</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Joining Date</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollData.staffList.slice(0, 15).map((s) => (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-900">{s.name}</td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className="capitalize text-xs">{s.role.replace("_", " ")}</Badge>
                          </td>
                          <td className="py-2 px-3 text-gray-600">
                            {s.joinDate ? new Date(s.joinDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">{formatCurrency(s.salaryAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {payrollData.staffList.length > 15 && (
                    <div className="text-center pt-3">
                      <Link href={`/dashboard/companies/${params.companyId}/staff`} className="text-sm text-primary hover:underline">
                        View all {payrollData.staffList.length} staff →
                      </Link>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Income vs Expense Chart */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Income vs Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeExpenseChart data={reportData.monthlyData} />
            </CardContent>
          </Card>
        </div>

        {/* Balance Trend */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Balance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <BalanceLineChart data={balanceData} />
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Top Expense Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryPieChart data={chartCategoryData} />
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentTransactions.length > 0 ? (
                  recentTransactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between border-b pb-4 last:border-b-0"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {transaction.particulars}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(
                            transaction.date
                          ).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            transaction.type === "income"
                              ? "default"
                              : "secondary"
                          }
                          className={
                            transaction.type === "income"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {transaction.type === "income"
                            ? "Income"
                            : "Expense"}
                        </Badge>
                        <span
                          className={`text-sm font-semibold ${
                            transaction.type === "income"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {transaction.type === "income" ? "+" : "-"}
                          {formatCurrency(transaction.amount)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No transactions yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </MainContent>
    </div>
  );
}
