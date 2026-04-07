'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MainContent } from "@/components/dashboard/main-content";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Search, Filter, ChevronLeft, ChevronRight, Check, Minus } from 'lucide-react';

interface Transaction {
  id: string;
  date: string;
  type: 'income' | 'expense';
  particulars: string;
  category: { id: string; name: string } | null;
  paymentMethod: string;
  amount: number;
  isReconciled: boolean;
}

interface ApiResponse {
  transactions: Transaction[];
  total: number;
  totalPages: number;
  page: number;
}

interface PageProps {
  params: {
    companyId: string;
  };
}

export default function TransactionsPage({ params }: PageProps) {
  const { companyId } = params;
  const [companyName, setCompanyName] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Fetch company name
  useEffect(() => {
    const fetchCompanyName = async () => {
      try {
        const response = await fetch(`/api/companies/${companyId}`);
        if (!response.ok) throw new Error('Failed to fetch company');
        const data = await response.json();
        setCompanyName(data.name);
      } catch (error) {
        toast.error('Failed to load company details');
      }
    };

    fetchCompanyName();
  }, [companyId]);

  // Fetch transactions with filters
  const fetchTransactions = async (page: number = 1) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('page', page.toString());
      queryParams.append('limit', '20');

      if (searchQuery) queryParams.append('search', searchQuery);
      if (typeFilter !== 'all') queryParams.append('type', typeFilter);
      if (paymentMethodFilter !== 'all') queryParams.append('paymentMethod', paymentMethodFilter);
      if (dateFrom) queryParams.append('dateFrom', dateFrom);
      if (dateTo) queryParams.append('dateTo', dateTo);

      const response = await fetch(
        `/api/companies/${companyId}/transactions?${queryParams.toString()}`
      );

      if (!response.ok) throw new Error('Failed to fetch transactions');

      const data: ApiResponse = await response.json();
      setTransactions(data.transactions);
      setTotalPages(data.totalPages);
      setTotalTransactions(data.total);
      setCurrentPage(data.page);
    } catch (error) {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  // Fetch transactions when filters change
  useEffect(() => {
    setCurrentPage(1);
    fetchTransactions(1);
  }, [searchQuery, typeFilter, paymentMethodFilter, dateFrom, dateTo]);

  // Fetch transactions when page changes
  useEffect(() => {
    if (currentPage > 1) {
      fetchTransactions(currentPage);
    }
  }, [currentPage]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setPaymentMethodFilter('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const startIndex = (currentPage - 1) * 20 + 1;
  const endIndex = Math.min(currentPage * 20, totalTransactions);

  const LoadingSkeleton = () => (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 rounded animate-pulse"></div>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />

      <MainContent className="overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">All Transactions</h1>
            <p className="text-gray-600 mt-2">View and manage all income and expense transactions</p>
          </div>

          {/* Filter Bar */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* First Row: Search and Type */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="relative">
                    <Label htmlFor="search" className="text-sm font-medium text-gray-700 mb-2 block">
                      Search Particulars
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="search"
                        type="text"
                        placeholder="Search particulars..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="type-filter" className="text-sm font-medium text-gray-700 mb-2 block">
                      Transaction Type
                    </Label>
                    <select
                      id="type-filter"
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Types</option>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="method-filter" className="text-sm font-medium text-gray-700 mb-2 block">
                      Payment Method
                    </Label>
                    <select
                      id="method-filter"
                      value={paymentMethodFilter}
                      onChange={(e) => setPaymentMethodFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Methods</option>
                      <option value="cash">Cash</option>
                      <option value="bank">Bank</option>
                      <option value="esewa">eSewa</option>
                      <option value="khalti">Khalti</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>

                {/* Second Row: Date Range */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="date-from" className="text-sm font-medium text-gray-700 mb-2 block">
                      Date From
                    </Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="date-to" className="text-sm font-medium text-gray-700 mb-2 block">
                      Date To
                    </Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearFilters}
                      className="w-full"
                    >
                      <Filter className="w-4 h-4 mr-2" />
                      Clear Filters
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transactions Table */}
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <LoadingSkeleton />
              ) : transactions.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No transactions found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Type</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Particulars</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Category</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Payment Method</th>
                          <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Amount</th>
                          <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Reconciled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((transaction, index) => (
                          <tr
                            key={transaction.id}
                            className={`border-b border-gray-200 ${
                              index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                            } hover:bg-gray-100 transition-colors`}
                          >
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {formatDate(transaction.date)}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <Badge
                                variant={transaction.type === 'income' ? 'default' : 'secondary'}
                                className={
                                  transaction.type === 'income'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }
                              >
                                {transaction.type === 'income' ? 'Income' : 'Expense'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{transaction.particulars}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{transaction.category?.name || '—'}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                              {transaction.paymentMethod}
                            </td>
                            <td className="px-6 py-4 text-sm text-right font-semibold">
                              <span
                                className={
                                  transaction.type === 'income'
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }
                              >
                                {transaction.type === 'income' ? '+' : '-'}
                                {formatCurrency(transaction.amount)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {transaction.isReconciled ? (
                                <Check className="w-4 h-4 text-green-600 mx-auto" />
                              ) : (
                                <Minus className="w-4 h-4 text-gray-300 mx-auto" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {startIndex} to {endIndex} of {totalTransactions} transactions
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Previous
                      </Button>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">
                          Page {currentPage} of {totalPages}
                        </span>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </MainContent>
    </div>
  );
}
