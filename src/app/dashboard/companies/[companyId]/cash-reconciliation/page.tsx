'use client';

import { useState, useEffect } from 'react';
import {
  Wallet,
  Calculator,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ArrowDownUp,
  Calendar,
  ClipboardCheck,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sidebar } from '@/components/dashboard/sidebar';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';

interface CashTransaction {
  id: string;
  date: string;
  type: 'income' | 'expense';
  amount: number;
  particulars: string | null;
  category: { id: string; name: string } | null;
}

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  net: number;
}

interface CashData {
  systemCashBalance: number;
  totalCashIncome: number;
  totalCashExpense: number;
  cashIncomeCount: number;
  cashExpenseCount: number;
  totalCashTransactions: number;
  cashTransactions: CashTransaction[];
  monthlyData: MonthlyData[];
}

interface CashCountResult {
  date: string;
  physicalCash: number;
  systemBalance: number;
  discrepancy: number;
}

interface CashCountHistory {
  id: string;
  timestamp: string;
  newValues: string;
}

export default function CashReconciliationPage({
  params,
}: {
  params: { companyId: string };
}) {
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [cashData, setCashData] = useState<CashData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'count' | 'history' | 'transactions'>(
    'overview'
  );

  // Date filter
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Cash count form
  const [countDate, setCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [physicalCash, setPhysicalCash] = useState('');
  const [countNotes, setCountNotes] = useState('');
  const [counting, setCounting] = useState(false);
  const [countResult, setCountResult] = useState<CashCountResult | null>(null);

  // Adjustment dialog
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  // Cash count history
  const [cashCountHistory, setCashCountHistory] = useState<CashCountHistory[]>([]);

  useEffect(() => {
    fetchData();
    fetchCashCountHistory();
  }, [params.companyId]);

  async function fetchData() {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (dateFrom) queryParams.set('dateFrom', dateFrom);
      if (dateTo) queryParams.set('dateTo', dateTo);

      const [cashRes, companyRes] = await Promise.all([
        fetch(
          `/api/companies/${params.companyId}/cash-reconciliation?${queryParams.toString()}`
        ),
        fetch(`/api/companies/${params.companyId}`),
      ]);

      if (cashRes.ok) {
        const data = await cashRes.json();
        setCashData(data);
      } else {
        toast.error('Failed to load cash data');
      }

      if (companyRes.ok) {
        const data = await companyRes.json();
        setCompanyName(data.name);
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCashCountHistory() {
    try {
      const res = await fetch(`/api/companies/${params.companyId}/cash-reconciliation`);
      if (!res.ok) return;
      // We'll get history from audit logs - for now use the data we already have
    } catch {
      // ignore
    }
  }

  function applyDateFilter() {
    fetchData();
  }

  function clearDateFilter() {
    setDateFrom('');
    setDateTo('');
    setTimeout(() => fetchData(), 0);
  }

  async function submitCashCount() {
    if (!physicalCash) {
      toast.error('Please enter the physical cash amount');
      return;
    }

    setCounting(true);
    try {
      const res = await fetch(
        `/api/companies/${params.companyId}/cash-reconciliation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cash_count',
            physicalCash,
            date: countDate,
            notes: countNotes,
          }),
        }
      );

      if (!res.ok) throw new Error();

      const result = await res.json();
      setCountResult(result);
      toast.success('Cash count recorded');
    } catch {
      toast.error('Failed to submit cash count');
    } finally {
      setCounting(false);
    }
  }

  async function adjustDiscrepancy() {
    if (!countResult || countResult.discrepancy === 0) return;

    setAdjusting(true);
    try {
      const isPositive = countResult.discrepancy > 0;
      const res = await fetch(
        `/api/companies/${params.companyId}/cash-reconciliation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'adjust',
            amount: Math.abs(countResult.discrepancy),
            type: isPositive ? 'income' : 'expense',
            particulars: `Cash ${isPositive ? 'surplus' : 'shortage'} adjustment - ${countResult.date}`,
            date: countResult.date,
          }),
        }
      );

      if (!res.ok) throw new Error();

      toast.success(
        `Cash ${isPositive ? 'surplus' : 'shortage'} of ${formatCurrency(Math.abs(countResult.discrepancy))} adjusted`
      );
      setAdjustDialogOpen(false);
      setCountResult(null);
      setPhysicalCash('');
      setCountNotes('');
      fetchData();
    } catch {
      toast.error('Failed to adjust discrepancy');
    } finally {
      setAdjusting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar companyId={params.companyId} companyName="Loading..." />
        <div className="flex-1 ml-64 p-8">
          <div className="space-y-4">
            <div className="h-10 bg-gray-200 rounded animate-pulse w-64" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
            <div className="h-96 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar companyId={params.companyId} companyName={companyName} />
      <div className="flex-1 ml-64 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <Wallet className="h-8 w-8 text-amber-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Cash Reconciliation</h1>
              <p className="text-gray-500">
                Compare physical cash with system records
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
            {[
              { key: 'overview' as const, label: 'Overview', icon: Wallet },
              { key: 'count' as const, label: 'Cash Count', icon: Calculator },
              { key: 'transactions' as const, label: 'Cash Transactions', icon: ArrowDownUp },
              { key: 'history' as const, label: 'Monthly Summary', icon: FileText },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ═══════════ OVERVIEW TAB ═══════════ */}
          {activeTab === 'overview' && cashData && (
            <div className="space-y-6">
              {/* Date Filter */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-end gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">From Date</Label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-44"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">To Date</Label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-44"
                      />
                    </div>
                    <Button onClick={applyDateFilter} size="sm">
                      Apply
                    </Button>
                    {(dateFrom || dateTo) && (
                      <Button onClick={clearDateFilter} variant="outline" size="sm">
                        Clear
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="pt-4 pb-4 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="h-4 w-4 text-amber-500" />
                      <p className="text-xs text-gray-500 uppercase font-medium">
                        System Cash Balance
                      </p>
                    </div>
                    <p
                      className={`text-2xl font-bold ${
                        cashData.systemCashBalance >= 0
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(cashData.systemCashBalance)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-4 pb-4 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <p className="text-xs text-gray-500 uppercase font-medium">
                        Cash Income
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(cashData.totalCashIncome)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {cashData.cashIncomeCount} entries
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="pt-4 pb-4 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      <p className="text-xs text-gray-500 uppercase font-medium">
                        Cash Expenses
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(cashData.totalCashExpense)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {cashData.cashExpenseCount} entries
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-4 pb-4 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowDownUp className="h-4 w-4 text-purple-500" />
                      <p className="text-xs text-gray-500 uppercase font-medium">
                        Total Cash Txns
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-purple-600">
                      {cashData.totalCashTransactions}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Cash Count */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-amber-600" />
                    Quick Cash Count
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                    Enter your physical cash on hand to check against the system balance.
                  </p>
                  <div className="flex items-end gap-4">
                    <div className="flex-1 max-w-xs">
                      <Label htmlFor="quickCash">Physical Cash Amount</Label>
                      <Input
                        id="quickCash"
                        type="number"
                        step="0.01"
                        value={physicalCash}
                        onChange={(e) => setPhysicalCash(e.target.value)}
                        placeholder="0.00"
                        className="mt-1"
                      />
                    </div>
                    <Button
                      onClick={submitCashCount}
                      disabled={counting || !physicalCash}
                    >
                      {counting ? 'Checking...' : 'Check Balance'}
                    </Button>
                  </div>

                  {/* Quick Count Result */}
                  {countResult && (
                    <div className="mt-4 p-4 rounded-lg border-2 bg-gray-50">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Physical Cash</p>
                          <p className="text-lg font-bold text-gray-900">
                            {formatCurrency(countResult.physicalCash)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">System Balance</p>
                          <p className="text-lg font-bold text-blue-600">
                            {formatCurrency(countResult.systemBalance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Discrepancy</p>
                          <p
                            className={`text-lg font-bold ${
                              countResult.discrepancy === 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {countResult.discrepancy > 0 ? '+' : ''}
                            {formatCurrency(countResult.discrepancy)}
                          </p>
                        </div>
                      </div>

                      {countResult.discrepancy === 0 ? (
                        <div className="mt-3 flex items-center justify-center gap-2 text-green-600">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="font-medium">Cash is balanced!</span>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            <span className="text-sm font-medium">
                              {countResult.discrepancy > 0
                                ? `Cash surplus of ${formatCurrency(Math.abs(countResult.discrepancy))}`
                                : `Cash shortage of ${formatCurrency(Math.abs(countResult.discrepancy))}`}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAdjustDialogOpen(true)}
                          >
                            Record Adjustment
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Cash Transactions */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Cash Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  {cashData.cashTransactions.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No cash transactions found
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">
                              Date
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">
                              Particulars
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">
                              Category
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">
                              Type
                            </th>
                            <th className="text-right py-2 px-3 font-semibold text-gray-700">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cashData.cashTransactions.slice(0, 20).map((txn) => (
                            <tr
                              key={txn.id}
                              className="border-b border-gray-100 hover:bg-gray-50"
                            >
                              <td className="py-2 px-3">{formatDate(txn.date)}</td>
                              <td className="py-2 px-3">{txn.particulars || '-'}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline">
                                  {txn.category?.name || '—'}
                                </Badge>
                              </td>
                              <td className="py-2 px-3">
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
                              <td
                                className={`py-2 px-3 text-right font-semibold ${
                                  txn.type === 'income'
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {txn.type === 'income' ? '+' : '-'}
                                {formatCurrency(txn.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-amber-50 border-t-2 border-amber-200">
                            <td
                              colSpan={4}
                              className="py-3 px-3 font-bold text-gray-900 text-right"
                            >
                              Net Cash Balance
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-bold text-lg ${
                                cashData.systemCashBalance >= 0
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {formatCurrency(cashData.systemCashBalance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ CASH COUNT TAB ═══════════ */}
          {activeTab === 'count' && (
            <div className="space-y-6 max-w-2xl">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-amber-600" />
                    Physical Cash Count
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-6">
                    Count the physical cash on hand and enter the total below. The system
                    will compare it against the recorded cash transactions and show any
                    discrepancy.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="countDate">
                        <Calendar className="h-4 w-4 inline mr-1" />
                        Count Date
                      </Label>
                      <Input
                        id="countDate"
                        type="date"
                        value={countDate}
                        onChange={(e) => setCountDate(e.target.value)}
                        className="mt-1 max-w-xs"
                      />
                    </div>

                    <div>
                      <Label htmlFor="physicalAmount">Physical Cash Amount *</Label>
                      <Input
                        id="physicalAmount"
                        type="number"
                        step="0.01"
                        value={physicalCash}
                        onChange={(e) => setPhysicalCash(e.target.value)}
                        placeholder="Enter total cash counted..."
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="countNotes">Notes (optional)</Label>
                      <Textarea
                        id="countNotes"
                        value={countNotes}
                        onChange={(e) => setCountNotes(e.target.value)}
                        placeholder="e.g., End of day count, includes petty cash..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>

                    <Button
                      onClick={submitCashCount}
                      disabled={counting || !physicalCash}
                      className="w-full"
                    >
                      {counting ? 'Processing...' : 'Submit Cash Count'}
                    </Button>
                  </div>

                  {/* Count Result */}
                  {countResult && (
                    <div className="mt-6 space-y-4">
                      <div className="p-5 rounded-xl border-2 bg-white shadow-sm">
                        <h3 className="font-semibold text-gray-900 mb-4">
                          Reconciliation Result — {formatDate(countResult.date)}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
                            <p className="text-xs text-amber-600 uppercase font-medium">
                              Physical Cash
                            </p>
                            <p className="text-xl font-bold text-amber-700 mt-1">
                              {formatCurrency(countResult.physicalCash)}
                            </p>
                          </div>

                          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                            <p className="text-xs text-blue-600 uppercase font-medium">
                              System Balance
                            </p>
                            <p className="text-xl font-bold text-blue-700 mt-1">
                              {formatCurrency(countResult.systemBalance)}
                            </p>
                          </div>

                          <div
                            className={`p-3 rounded-lg border text-center ${
                              countResult.discrepancy === 0
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                            }`}
                          >
                            <p
                              className={`text-xs uppercase font-medium ${
                                countResult.discrepancy === 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              Discrepancy
                            </p>
                            <p
                              className={`text-xl font-bold mt-1 ${
                                countResult.discrepancy === 0
                                  ? 'text-green-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {countResult.discrepancy > 0 ? '+' : ''}
                              {formatCurrency(countResult.discrepancy)}
                            </p>
                          </div>
                        </div>

                        {countResult.discrepancy === 0 ? (
                          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 justify-center text-green-700">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="font-semibold">
                              Cash is perfectly balanced!
                            </span>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="font-medium text-amber-800">
                                  {countResult.discrepancy > 0
                                    ? 'Cash Surplus Detected'
                                    : 'Cash Shortage Detected'}
                                </p>
                                <p className="text-sm text-amber-700 mt-1">
                                  {countResult.discrepancy > 0
                                    ? `There is ${formatCurrency(Math.abs(countResult.discrepancy))} more cash than expected. This could be due to unrecorded income.`
                                    : `There is ${formatCurrency(Math.abs(countResult.discrepancy))} less cash than expected. This could be due to unrecorded expenses.`}
                                </p>
                              </div>
                            </div>

                            <Button
                              onClick={() => setAdjustDialogOpen(true)}
                              className="w-full"
                              variant="outline"
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Record Adjustment to Fix Discrepancy
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ CASH TRANSACTIONS TAB ═══════════ */}
          {activeTab === 'transactions' && cashData && (
            <div className="space-y-4">
              {/* Date Filter */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-end gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">From Date</Label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-44"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">To Date</Label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-44"
                      />
                    </div>
                    <Button onClick={applyDateFilter} size="sm">
                      Apply
                    </Button>
                    {(dateFrom || dateTo) && (
                      <Button onClick={clearDateFilter} variant="outline" size="sm">
                        Clear
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>All Cash Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  {cashData.cashTransactions.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No cash transactions found for the selected period
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">
                              Date
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">
                              Particulars
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">
                              Category
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700">
                              Type
                            </th>
                            <th className="text-right py-2 px-3 font-semibold text-gray-700">
                              Cash In
                            </th>
                            <th className="text-right py-2 px-3 font-semibold text-gray-700">
                              Cash Out
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cashData.cashTransactions.map((txn) => (
                            <tr
                              key={txn.id}
                              className="border-b border-gray-100 hover:bg-gray-50"
                            >
                              <td className="py-2 px-3">{formatDate(txn.date)}</td>
                              <td className="py-2 px-3">{txn.particulars || '-'}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline">
                                  {txn.category?.name || '—'}
                                </Badge>
                              </td>
                              <td className="py-2 px-3">
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
                              <td className="py-2 px-3 text-right font-semibold text-green-600">
                                {txn.type === 'income'
                                  ? formatCurrency(txn.amount)
                                  : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-red-600">
                                {txn.type === 'expense'
                                  ? formatCurrency(txn.amount)
                                  : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-green-50 border-t-2 border-green-200">
                            <td
                              colSpan={4}
                              className="py-3 px-3 font-bold text-gray-900 text-right"
                            >
                              Totals ({cashData.cashTransactions.length} entries)
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-green-700">
                              {formatCurrency(cashData.totalCashIncome)}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-red-700">
                              {formatCurrency(cashData.totalCashExpense)}
                            </td>
                          </tr>
                          <tr className="bg-amber-50">
                            <td
                              colSpan={4}
                              className="py-2 px-3 font-bold text-gray-900 text-right"
                            >
                              Net Cash Balance
                            </td>
                            <td
                              colSpan={2}
                              className={`py-2 px-3 text-right font-bold text-lg ${
                                cashData.systemCashBalance >= 0
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {formatCurrency(cashData.systemCashBalance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ MONTHLY SUMMARY TAB ═══════════ */}
          {activeTab === 'history' && cashData && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Cash Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {cashData.monthlyData.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No monthly cash data available
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">
                              Month
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">
                              Cash In
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">
                              Cash Out
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">
                              Net
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cashData.monthlyData.map((m) => (
                            <tr
                              key={m.month}
                              className="border-b border-gray-100 hover:bg-gray-50"
                            >
                              <td className="py-3 px-4 font-medium text-gray-900">
                                {m.month}
                              </td>
                              <td className="py-3 px-4 text-right text-green-600 font-semibold">
                                {formatCurrency(m.income)}
                              </td>
                              <td className="py-3 px-4 text-right text-red-600 font-semibold">
                                {formatCurrency(m.expense)}
                              </td>
                              <td
                                className={`py-3 px-4 text-right font-bold ${
                                  m.net >= 0 ? 'text-blue-600' : 'text-red-600'
                                }`}
                              >
                                {m.net > 0 ? '+' : ''}
                                {formatCurrency(m.net)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-amber-50 border-t-2 border-amber-200">
                            <td className="py-3 px-4 font-bold text-gray-900">
                              Total
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-green-700">
                              {formatCurrency(
                                cashData.monthlyData.reduce(
                                  (sum, m) => sum + m.income,
                                  0
                                )
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-red-700">
                              {formatCurrency(
                                cashData.monthlyData.reduce(
                                  (sum, m) => sum + m.expense,
                                  0
                                )
                              )}
                            </td>
                            <td
                              className={`py-3 px-4 text-right font-bold text-lg ${
                                cashData.systemCashBalance >= 0
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {formatCurrency(cashData.systemCashBalance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ ADJUST DISCREPANCY DIALOG ═══════════ */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Cash Adjustment</DialogTitle>
          </DialogHeader>
          {countResult && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Physical Cash:</span>
                  <span className="font-semibold">
                    {formatCurrency(countResult.physicalCash)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">System Balance:</span>
                  <span className="font-semibold">
                    {formatCurrency(countResult.systemBalance)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-500">Discrepancy:</span>
                  <span
                    className={`font-bold ${
                      countResult.discrepancy > 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {countResult.discrepancy > 0 ? '+' : ''}
                    {formatCurrency(countResult.discrepancy)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                {countResult.discrepancy > 0 ? (
                  <p>
                    This will create a <strong>cash income</strong> entry of{' '}
                    <strong>{formatCurrency(Math.abs(countResult.discrepancy))}</strong>{' '}
                    to record the surplus.
                  </p>
                ) : (
                  <p>
                    This will create a <strong>cash expense</strong> entry of{' '}
                    <strong>{formatCurrency(Math.abs(countResult.discrepancy))}</strong>{' '}
                    to record the shortage.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setAdjustDialogOpen(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={adjustDiscrepancy}
                  disabled={adjusting}
                  className="flex-1"
                >
                  {adjusting ? 'Adjusting...' : 'Confirm Adjustment'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
