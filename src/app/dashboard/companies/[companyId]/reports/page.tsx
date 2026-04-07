'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MainContent } from "@/components/dashboard/main-content";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { IncomeExpenseChart } from '@/components/charts/income-expense-chart';
import { CategoryPieChart } from '@/components/charts/category-pie-chart';
import { BalanceLineChart } from '@/components/charts/balance-line-chart';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowDownUp,
  Calendar,
  FileText,
  Download,
  Filter,
  CreditCard,
} from 'lucide-react';

interface ReportData {
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalIncomeCount: number;
  totalExpenseCount: number;
  totalTransactions: number;
  monthlyData: Array<{ month: string; income: number; expense: number }>;
  topExpenseCategories: Array<{ categoryName: string; amount: number }>;
  topIncomeCategories: Array<{ categoryName: string; amount: number }>;
  paymentMethods: Array<{ method: string; total: number; count: number }>;
  recentTransactions: Array<{
    id: string;
    date: string;
    particulars: string;
    type: 'income' | 'expense';
    amount: number;
    category?: { id: string; name: string } | null;
    paymentMethod?: string;
  }>;
  dateRange: { from: string | null; to: string | null };
}

export default function ReportsPage({ params }: { params: { companyId: string } }) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  // Quick date presets
  const setPreset = (preset: string) => {
    const now = new Date();
    let from = '';
    let to = now.toISOString().slice(0, 10);

    switch (preset) {
      case 'today':
        from = to;
        break;
      case 'this-week': {
        const monday = new Date(now);
        monday.setDate(now.getDate() - now.getDay() + 1);
        from = monday.toISOString().slice(0, 10);
        break;
      }
      case 'this-month':
        from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        break;
      case 'last-month': {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        from = lastMonth.toISOString().slice(0, 10);
        to = lastMonthEnd.toISOString().slice(0, 10);
        break;
      }
      case 'this-quarter': {
        const quarter = Math.floor(now.getMonth() / 3);
        from = `${now.getFullYear()}-${String(quarter * 3 + 1).padStart(2, '0')}-01`;
        break;
      }
      case 'this-year':
        from = `${now.getFullYear()}-01-01`;
        break;
      case 'last-year':
        from = `${now.getFullYear() - 1}-01-01`;
        to = `${now.getFullYear() - 1}-12-31`;
        break;
      case 'all':
        from = '';
        to = '';
        break;
    }

    setDateFrom(from);
    setDateTo(to);
  };

  useEffect(() => {
    fetchCompanyName();
    fetchReport();
  }, []);

  const fetchCompanyName = async () => {
    try {
      const res = await fetch(`/api/companies/${params.companyId}`);
      if (res.ok) {
        const data = await res.json();
        setCompanyName(data.name);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReport = async (from?: string, to?: string) => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (from) queryParams.set('dateFrom', from);
      if (to) queryParams.set('dateTo', to);

      const url = `/api/companies/${params.companyId}/reports${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      const res = await fetch(url);

      if (res.ok) {
        const data = await res.json();
        setReportData(data);
        setAppliedFrom(from || '');
        setAppliedTo(to || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = () => {
    fetchReport(dateFrom, dateTo);
  };

  const categoryColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const expensePieData = reportData?.topExpenseCategories.map((cat, i) => ({
    name: cat.categoryName,
    value: cat.amount,
    color: categoryColors[i % categoryColors.length],
  })) || [];

  const incomePieData = reportData?.topIncomeCategories.map((cat, i) => ({
    name: cat.categoryName,
    value: cat.amount,
    color: ['#10b981', '#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b'][i % 5],
  })) || [];

  let runningBalance = 0;
  const balanceData = (reportData?.monthlyData || []).map((m) => {
    runningBalance += m.income - m.expense;
    return { date: m.month, balance: runningBalance };
  });

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar companyId={params.companyId} companyName={companyName} />
      <MainContent className="p-8 overflow-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileText className="h-8 w-8 text-blue-600" />
            Financial Reports
          </h1>
          <p className="text-gray-500 mt-1">
            Generate detailed transaction reports by date range
          </p>
        </div>

        {/* Date Filter Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5 text-gray-500" />
              Report Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Quick Presets */}
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Quick Select</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Today', value: 'today' },
                    { label: 'This Week', value: 'this-week' },
                    { label: 'This Month', value: 'this-month' },
                    { label: 'Last Month', value: 'last-month' },
                    { label: 'This Quarter', value: 'this-quarter' },
                    { label: 'This Year', value: 'this-year' },
                    { label: 'Last Year', value: 'last-year' },
                    { label: 'All Time', value: 'all' },
                  ].map((preset) => (
                    <Button
                      key={preset.value}
                      variant="outline"
                      size="sm"
                      onClick={() => setPreset(preset.value)}
                      className="text-xs"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom Date Range */}
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <Label className="text-sm font-medium text-gray-700 mb-1 block">From Date</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-sm font-medium text-gray-700 mb-1 block">To Date</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full"
                  />
                </div>
                <Button
                  onClick={handleGenerateReport}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 px-8"
                >
                  {loading ? 'Loading...' : 'Generate Report'}
                </Button>
              </div>

              {/* Applied filter indicator */}
              {(appliedFrom || appliedTo) && (
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 rounded-lg px-4 py-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span>
                    Showing report for:{' '}
                    <strong>
                      {appliedFrom || 'Beginning'} to {appliedTo || 'Now'}
                    </strong>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-xs text-blue-600"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                      fetchReport();
                    }}
                  >
                    Clear Filter
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {reportData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="pt-4 pb-4 px-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Opening Balance</p>
                  <p className="text-xl font-bold text-indigo-600 mt-1">{formatCurrency(reportData.openingBalance || 0)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="pt-4 pb-4 px-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Total Income</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(reportData.totalIncome)}</p>
                  <p className="text-xs text-gray-400 mt-1">{reportData.totalIncomeCount} entries</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="pt-4 pb-4 px-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Total Expense</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(reportData.totalExpense)}</p>
                  <p className="text-xs text-gray-400 mt-1">{reportData.totalExpenseCount} entries</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4 pb-4 px-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Net Balance</p>
                  <p className={`text-xl font-bold mt-1 ${reportData.netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(reportData.netBalance)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="pt-4 pb-4 px-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Total Transactions</p>
                  <p className="text-xl font-bold text-purple-600 mt-1">{reportData.totalTransactions}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="pt-4 pb-4 px-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Income Count</p>
                  <p className="text-xl font-bold text-emerald-600 mt-1">{reportData.totalIncomeCount}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="pt-4 pb-4 px-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Expense Count</p>
                  <p className="text-xl font-bold text-amber-600 mt-1">{reportData.totalExpenseCount}</p>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Income vs Expense Chart */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Monthly Income vs Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                {reportData.monthlyData.length > 0 ? (
                  <IncomeExpenseChart data={reportData.monthlyData} />
                ) : (
                  <p className="text-gray-500 text-center py-8">No data for selected period</p>
                )}
              </CardContent>
            </Card>

            {/* Balance Trend */}
            {balanceData.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Balance Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <BalanceLineChart data={balanceData} />
                </CardContent>
              </Card>
            )}

            {/* Category Breakdown Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Top Income Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Top Income Sources
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {incomePieData.length > 0 ? (
                    <>
                      <CategoryPieChart data={incomePieData} />
                      <div className="mt-4 space-y-2">
                        {reportData.topIncomeCategories.map((cat, i) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-gray-700">{cat.categoryName}</span>
                            <span className="font-semibold text-green-600">{formatCurrency(cat.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-500 text-center py-8">No income data</p>
                  )}
                </CardContent>
              </Card>

              {/* Top Expense Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    Top Expense Categories
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {expensePieData.length > 0 ? (
                    <>
                      <CategoryPieChart data={expensePieData} />
                      <div className="mt-4 space-y-2">
                        {reportData.topExpenseCategories.map((cat, i) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-gray-700">{cat.categoryName}</span>
                            <span className="font-semibold text-red-600">{formatCurrency(cat.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-500 text-center py-8">No expense data</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Payment Method Breakdown */}
            {reportData.paymentMethods.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-gray-500" />
                    Payment Method Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Payment Method</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-700">Transactions</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-700">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.paymentMethods.map((pm, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 capitalize">{pm.method}</td>
                            <td className="py-3 px-4 text-right">{pm.count}</td>
                            <td className="py-3 px-4 text-right font-semibold">{formatCurrency(pm.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Transactions within range */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownUp className="h-5 w-5 text-gray-500" />
                  Recent Transactions
                  {(appliedFrom || appliedTo) && (
                    <Badge variant="secondary" className="text-xs ml-2">
                      Filtered
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Date</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Description</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Category</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Type</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Payment</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.recentTransactions.length > 0 ? (
                        reportData.recentTransactions.map((txn) => (
                          <tr key={txn.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{txn.date}</td>
                            <td className="py-3 px-4 text-gray-900 max-w-xs truncate">{txn.particulars}</td>
                            <td className="py-3 px-4 text-gray-600">{txn.category?.name || '—'}</td>
                            <td className="py-3 px-4">
                              <Badge
                                className={
                                  txn.type === 'income'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }
                              >
                                {txn.type === 'income' ? 'Income' : 'Expense'}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-gray-600 capitalize">{txn.paymentMethod || '—'}</td>
                            <td className={`py-3 px-4 text-right font-semibold ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                              {txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-500">
                            No transactions found for selected period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!reportData && !loading && (
          <div className="text-center py-16">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700">Select a date range to generate a report</h3>
            <p className="text-gray-500 mt-2">Use the quick presets above or pick custom dates</p>
          </div>
        )}
      </MainContent>
    </div>
  );
}
