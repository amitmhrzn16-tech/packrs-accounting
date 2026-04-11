'use client';

import { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, Check, X, ArrowLeftRight, AlertTriangle, Plus, RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MainContent } from "@/components/dashboard/main-content";
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';

interface PreviewData {
  batchId: string;
  headers: string[];
  previewRows: (string | number)[][];
  suggestedMapping: Record<string, number>;
  totalRows: number;
}

interface ColumnMapping {
  date: number;
  description: number;
  debit: number;
  credit: number;
  balance?: number;
}

interface ImportResult {
  imported: number;
  matched: number;
  unmatched: number;
  transactions: number;
  error?: string;
  debug?: any;
}

interface MatchedTxn {
  id: string;
  bankDate: string;
  bankDescription: string;
  bankAmount: number;
  bookDate: string;
  bookParticulars: string;
  bookAmount: number;
  confidence: number;
}

interface UnmatchedBankEntry {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface UnmatchedBookEntry {
  id: string;
  date: string;
  type: 'Income' | 'Expense';
  particulars: string;
  amount: number;
}

interface Category {
  id: string;
  name: string;
}

interface ReconciliationData {
  totalBankTxns: number;
  matched: number;
  unmatchedBank: number;
  unmatchedBook: number;
  matchedTransactions: MatchedTxn[];
  unmatchedBankEntries: UnmatchedBankEntry[];
  unmatchedBookEntries: UnmatchedBookEntry[];
}

export default function ReconciliationPage({ params }: { params: { companyId: string } }) {
  const [activeTab, setActiveTab] = useState<'import' | 'reconciliation'>('import');
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Import wizard state
  const [step, setStep] = useState<'upload' | 'mapping'>(
    'upload'
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    date: 0,
    description: 1,
    debit: 2,
    credit: 3,
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Reconciliation state
  const [reconciliationData, setReconciliationData] = useState<ReconciliationData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBankTxn, setSelectedBankTxn] = useState<UnmatchedBankEntry | null>(null);
  const [newEntryForm, setNewEntryForm] = useState({
    categoryId: '',
    paymentMethod: 'Bank',
    particulars: '',
  });
  const [reconPaymentMethod, setReconPaymentMethod] = useState<string>('bank');
  const PAYMENT_METHODS_LIST = ['bank', 'cash', 'esewa', 'khalti', 'cheque', 'fonepay'];

  // Fetch company name
  useEffect(() => {
    const fetchCompanyName = async () => {
      try {
        const res = await fetch(`/api/companies/${params.companyId}`);
        if (res.ok) {
          const data = await res.json();
          setCompanyName(data.name);
        }
      } catch (error) {
        console.error('Failed to fetch company:', error);
      }
    };

    fetchCompanyName();
  }, [params.companyId]);

  // Fetch reconciliation data when tab is active or payment method changes
  useEffect(() => {
    if (activeTab === 'reconciliation') {
      fetchReconciliationData();
    }
  }, [activeTab, reconPaymentMethod]);

  const fetchReconciliationData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/companies/${params.companyId}/reconciliation?paymentMethod=${reconPaymentMethod}&_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        // Map API response shape to UI expected shape
        setReconciliationData({
          totalBankTxns: data.summary?.totalBankTransactions ?? 0,
          matched: data.summary?.matchedCount ?? 0,
          unmatchedBank: data.summary?.unmatchedBankCount ?? 0,
          unmatchedBook: data.summary?.unmatchedBookCount ?? 0,
          matchedTransactions: (data.matched || []).map((m: any) => ({
            id: m.bankTransaction?.id || '',
            bankDate: m.bankTransaction?.date || '',
            bankDescription: m.bankTransaction?.description || '',
            bankAmount: (m.bankTransaction?.debit ?? 0) || (m.bankTransaction?.credit ?? 0),
            bookDate: m.bookEntry?.date || '',
            bookParticulars: m.bookEntry?.particulars || '',
            bookAmount: m.bookEntry?.amount || 0,
            confidence: m.bankTransaction?.matchConfidence || 0,
          })),
          unmatchedBankEntries: (data.unmatchedBank || []).map((entry: any) => ({
            id: entry.id,
            date: entry.date || '',
            description: entry.description || '',
            debit: entry.debit ?? 0,
            credit: entry.credit ?? 0,
            balance: entry.balance ?? 0,
          })),
          unmatchedBookEntries: (data.unmatchedBook || []).map((entry: any) => ({
            id: entry.id,
            date: entry.date || '',
            type: entry.type === 'income' ? 'Income' : 'Expense',
            particulars: entry.particulars || '',
            amount: entry.amount || 0,
          })),
        });
      }
    } catch (error) {
      toast.error('Failed to fetch reconciliation data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`/api/companies/${params.companyId}/categories`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const validTypes = ['.xlsx', '.xls', '.csv', '.pdf'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!validTypes.includes(fileExtension)) {
        toast.error('Please upload a .xlsx, .xls, .csv, or .pdf file');
        return;
      }

      setSelectedFile(file);
      handleUpload(file);
    }
  };

  const handleUpload = async (file: File) => {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('step', 'preview');

      const res = await fetch(`/api/companies/${params.companyId}/import`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
        const sm = data.suggestedMapping;
        setColumnMapping({
          date: sm?.date ?? 0,
          description: sm?.description ?? 1,
          debit: sm?.debit ?? 2,
          credit: sm?.credit ?? 3,
          balance: sm?.balance,
        });
        setStep('mapping');
      } else {
        toast.error('Failed to process file');
      }
    } catch (error) {
      toast.error('Upload failed');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData) return;

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('step', 'confirm');
      formData.append('batchId', previewData.batchId);
      formData.append('mapping', JSON.stringify(columnMapping));

      const res = await fetch(`/api/companies/${params.companyId}/import`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setImportResult(data);
        if (data.imported > 0) {
          toast.success(`Imported ${data.imported} transactions (${data.transactions} entries created)`);
          // Refresh reconciliation data so the Reconciliation tab shows the new entries
          fetchReconciliationData();
        } else if (data.error) {
          toast.error(data.error);
          console.error('Import debug:', data.debug);
        } else {
          toast.error('No valid rows found. Check column mapping.');
        }
      } else {
        const errorData = await res.json().catch(() => null);
        toast.error(errorData?.error || 'Import confirmation failed');
      }
    } catch (error) {
      toast.error('Import failed');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEntry = async () => {
    if (!selectedBankTxn || !newEntryForm.categoryId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/companies/${params.companyId}/reconciliation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          bankTxnId: selectedBankTxn.id,
          newEntry: {
            categoryId: newEntryForm.categoryId,
            particulars: newEntryForm.particulars || selectedBankTxn.description,
            paymentMethod: newEntryForm.paymentMethod,
          },
        }),
      });

      if (res.ok) {
        toast.success('Entry created and matched');
        setDialogOpen(false);
        setSelectedBankTxn(null);
        setNewEntryForm({ categoryId: '', paymentMethod: 'Bank', particulars: '' });
        fetchReconciliationData();
      } else {
        toast.error('Failed to create entry');
      }
    } catch (error) {
      toast.error('Failed to create entry');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectMatch = async (txnId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/companies/${params.companyId}/reconciliation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          txnId,
        }),
      });

      if (res.ok) {
        toast.success('Match rejected');
        fetchReconciliationData();
      } else {
        toast.error('Failed to reject match');
      }
    } catch (error) {
      toast.error('Failed to reject match');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = (bankTxn: UnmatchedBankEntry) => {
    if (!categories.length) {
      fetchCategories();
    }
    setSelectedBankTxn(bankTxn);
    setNewEntryForm({
      categoryId: '',
      paymentMethod: 'Bank',
      particulars: bankTxn.description,
    });
    setDialogOpen(true);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence > 0.8) {
      return <Badge className="bg-green-100 text-green-800">High ({(confidence * 100).toFixed(0)}%)</Badge>;
    } else if (confidence > 0.5) {
      return <Badge className="bg-yellow-100 text-yellow-800">Medium ({(confidence * 100).toFixed(0)}%)</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Low ({(confidence * 100).toFixed(0)}%)</Badge>;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={params.companyId} companyName={companyName} />

      <MainContent className="overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Bank Reconciliation</h1>
            <p className="text-gray-600 mt-2">Import and reconcile your bank statements</p>
          </div>

          {/* Tab buttons */}
          <div className="flex gap-4 mb-8 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'import'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Import Statement
            </button>
            <button
              onClick={() => setActiveTab('reconciliation')}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'reconciliation'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Reconciliation
            </button>
          </div>

          {/* TAB 1: Import Statement */}
          {activeTab === 'import' && (
            <div className="space-y-8">
              {step === 'upload' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 1: Upload Bank Statement</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 transition-colors">
                        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-gray-900 font-medium mb-2">Drop your file here or click to browse</p>
                        <p className="text-gray-600 text-sm mb-6">Supported formats: .xlsx, .xls, .csv, .pdf</p>
                        <Input
                          type="file"
                          accept=".xlsx,.xls,.csv,.pdf"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="file-upload"
                          disabled={loading}
                        />
                        <Label htmlFor="file-upload" className="cursor-pointer">
                          <Button
                            variant="outline"
                            disabled={loading}
                            onClick={() => document.getElementById('file-upload')?.click()}
                          >
                            {loading ? 'Processing...' : 'Select File'}
                          </Button>
                        </Label>
                      </div>

                      {selectedFile && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                          <div>
                            <p className="font-medium text-blue-900">{selectedFile.name}</p>
                            <p className="text-sm text-blue-700">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 'mapping' && previewData && !importResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 2: Column Mapping & Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Column Mapping Controls */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-2 block">Date Column</Label>
                          <select
                            value={columnMapping.date}
                            onChange={(e) =>
                              setColumnMapping({ ...columnMapping, date: parseInt(e.target.value) })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {previewData.headers.map((header, idx) => (
                              <option key={idx} value={idx}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-2 block">Description Column</Label>
                          <select
                            value={columnMapping.description}
                            onChange={(e) =>
                              setColumnMapping({
                                ...columnMapping,
                                description: parseInt(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {previewData.headers.map((header, idx) => (
                              <option key={idx} value={idx}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-2 block">Debit Column</Label>
                          <select
                            value={columnMapping.debit}
                            onChange={(e) =>
                              setColumnMapping({
                                ...columnMapping,
                                debit: parseInt(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {previewData.headers.map((header, idx) => (
                              <option key={idx} value={idx}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-2 block">Credit Column</Label>
                          <select
                            value={columnMapping.credit}
                            onChange={(e) =>
                              setColumnMapping({
                                ...columnMapping,
                                credit: parseInt(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {previewData.headers.map((header, idx) => (
                              <option key={idx} value={idx}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-2 block">Balance Column (Optional)</Label>
                          <select
                            value={columnMapping.balance ?? ''}
                            onChange={(e) =>
                              setColumnMapping({
                                ...columnMapping,
                                balance: e.target.value ? parseInt(e.target.value) : undefined,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- None --</option>
                            {previewData.headers.map((header, idx) => (
                              <option key={idx} value={idx}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Preview Table */}
                      <div>
                        <p className="font-medium text-gray-900 mb-4">
                          {previewData.totalRows} rows will be imported
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                            <thead className="bg-gray-100 border-b border-gray-200">
                              <tr>
                                {previewData.headers.map((header, idx) => (
                                  <th key={idx} className="px-4 py-2 text-left font-medium text-gray-900">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.previewRows.slice(0, 10).map((row, rowIdx) => (
                                <tr key={rowIdx} className="border-b border-gray-200 hover:bg-gray-50">
                                  {row.map((cell, cellIdx) => (
                                    <td key={cellIdx} className="px-4 py-2 text-gray-700">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-4 justify-end pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setStep('upload');
                            setSelectedFile(null);
                            setPreviewData(null);
                          }}
                          disabled={loading}
                        >
                          Back
                        </Button>
                        <Button onClick={handleConfirmImport} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                          {loading ? 'Processing...' : 'Confirm & Import'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {importResult && (
                <Card className="border-l-4 border-l-green-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-green-600" />
                      Import Complete
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-green-50 p-4 rounded-lg">
                          <p className="text-sm text-gray-600">Imported</p>
                          <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <p className="text-sm text-gray-600">Auto-matched</p>
                          <p className="text-2xl font-bold text-blue-600">{importResult.matched}</p>
                        </div>
                        <div className="bg-amber-50 p-4 rounded-lg">
                          <p className="text-sm text-gray-600">Unmatched</p>
                          <p className="text-2xl font-bold text-amber-600">{importResult.unmatched}</p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setStep('upload');
                            setSelectedFile(null);
                            setPreviewData(null);
                            setImportResult(null);
                          }}
                        >
                          Import Another
                        </Button>
                        <Button
                          onClick={() => setActiveTab('reconciliation')}
                          className="bg-blue-600 hover:bg-blue-700 gap-2"
                        >
                          View Reconciliation <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 2: Reconciliation Dashboard */}
          {activeTab === 'reconciliation' && (
            <div className="space-y-8">
              {/* Payment Method Filter */}
              <div className="flex items-center gap-3 bg-white p-3 rounded-lg border">
                <Label className="text-sm font-medium text-gray-700">Payment Method:</Label>
                <select
                  value={reconPaymentMethod}
                  onChange={(e) => setReconPaymentMethod(e.target.value)}
                  className="px-3 py-1.5 border rounded-md text-sm bg-white"
                >
                  <option value="">All Methods</option>
                  {PAYMENT_METHODS_LIST.map((m) => (
                    <option key={m} value={m}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 ml-2">
                  Filter which payment method transactions to include in reconciliation
                </p>
              </div>

              {loading && !reconciliationData && (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin">
                    <RefreshCw className="h-8 w-8 text-gray-400" />
                  </div>
                </div>
              )}

              {reconciliationData && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <p className="text-sm text-gray-600 mb-2">Total Bank Txns</p>
                        <p className="text-3xl font-bold text-gray-900">{reconciliationData.totalBankTxns}</p>
                      </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-green-500">
                      <CardContent className="pt-6">
                        <p className="text-sm text-gray-600 mb-2">Matched</p>
                        <p className="text-3xl font-bold text-green-600">{reconciliationData.matched}</p>
                      </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500">
                      <CardContent className="pt-6">
                        <p className="text-sm text-gray-600 mb-2">Unmatched Bank</p>
                        <p className="text-3xl font-bold text-amber-600">{reconciliationData.unmatchedBank}</p>
                      </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-red-500">
                      <CardContent className="pt-6">
                        <p className="text-sm text-gray-600 mb-2">Unmatched Book</p>
                        <p className="text-3xl font-bold text-red-600">{reconciliationData.unmatchedBook}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Matched Transactions */}
                  {reconciliationData.matchedTransactions.length > 0 && (
                    <Card className="border-l-4 border-l-green-500">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-green-600" />
                          Matched Transactions ({reconciliationData.matched})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Bank Date</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Bank Description</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-900">Amount</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-900"></th>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Book Date</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Particulars</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-900">Amount</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-900">Confidence</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-900">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconciliationData.matchedTransactions.map((txn) => (
                                <tr key={txn.id} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="px-4 py-3 text-gray-700">{formatDate(txn.bankDate)}</td>
                                  <td className="px-4 py-3 text-gray-700">{txn.bankDescription}</td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {formatCurrency(txn.bankAmount)}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <ArrowLeftRight className="h-4 w-4 text-gray-400 inline" />
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">{formatDate(txn.bookDate)}</td>
                                  <td className="px-4 py-3 text-gray-700">{txn.bookParticulars}</td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {formatCurrency(txn.bookAmount)}
                                  </td>
                                  <td className="px-4 py-3 text-center">{getConfidenceBadge(txn.confidence)}</td>
                                  <td className="px-4 py-3 text-center">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 border-red-300 hover:bg-red-50"
                                      onClick={() => handleRejectMatch(txn.id)}
                                      disabled={loading}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Unmatched Bank Entries */}
                  {reconciliationData.unmatchedBankEntries.length > 0 && (
                    <Card className="border-l-4 border-l-amber-500">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                          Unmatched Bank Entries ({reconciliationData.unmatchedBank})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Date</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Description</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-900">Debit</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-900">Credit</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-900">Balance</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-900">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconciliationData.unmatchedBankEntries.map((entry) => (
                                <tr key={entry.id} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="px-4 py-3 text-gray-700">{formatDate(entry.date)}</td>
                                  <td className="px-4 py-3 text-gray-700">{entry.description}</td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {entry.debit ? formatCurrency(entry.debit) : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {entry.credit ? formatCurrency(entry.credit) : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {formatCurrency(entry.balance)}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                      onClick={() => openCreateDialog(entry)}
                                      disabled={loading}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Unmatched Book Entries */}
                  {reconciliationData.unmatchedBookEntries.length > 0 && (
                    <Card className="border-l-4 border-l-red-500">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          Unmatched Book Entries ({reconciliationData.unmatchedBook})
                        </CardTitle>
                        <p className="text-sm text-gray-600 mt-2">
                          These entries exist in your books but have no matching bank transaction
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Date</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Type</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-900">Particulars</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-900">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconciliationData.unmatchedBookEntries.map((entry) => (
                                <tr key={entry.id} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="px-4 py-3 text-gray-700">{formatDate(entry.date)}</td>
                                  <td className="px-4 py-3">
                                    <Badge
                                      className={
                                        entry.type === 'Income'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-red-100 text-red-800'
                                      }
                                    >
                                      {entry.type}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">{entry.particulars}</td>
                                  <td className="px-4 py-3 text-right text-gray-700">
                                    {formatCurrency(entry.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {reconciliationData.matchedTransactions.length === 0 &&
                    reconciliationData.unmatchedBankEntries.length === 0 &&
                    reconciliationData.unmatchedBookEntries.length === 0 && (
                      <Card>
                        <CardContent className="pt-12 pb-12 text-center">
                          <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">No data yet. Import a bank statement to begin reconciliation.</p>
                        </CardContent>
                      </Card>
                    )}
                </>
              )}
            </div>
          )}
        </div>
      </MainContent>

      {/* Create Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Book Entry</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Date</Label>
              <Input
                type="date"
                value={selectedBankTxn?.date || ''}
                disabled
                className="bg-gray-50 text-gray-700"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Amount</Label>
              <Input
                type="text"
                value={
                  selectedBankTxn?.debit
                    ? formatCurrency(selectedBankTxn.debit)
                    : selectedBankTxn?.credit
                      ? formatCurrency(selectedBankTxn.credit)
                      : ''
                }
                disabled
                className="bg-gray-50 text-gray-700"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Description</Label>
              <Input
                type="text"
                value={selectedBankTxn?.description || ''}
                disabled
                className="bg-gray-50 text-gray-700"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Category *</Label>
              <select
                value={newEntryForm.categoryId}
                onChange={(e) =>
                  setNewEntryForm({
                    ...newEntryForm,
                    categoryId: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Category --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Payment Method</Label>
              <select
                value={newEntryForm.paymentMethod}
                onChange={(e) =>
                  setNewEntryForm({
                    ...newEntryForm,
                    paymentMethod: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Bank">Bank</option>
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
                <option value="Credit Card">Credit Card</option>
              </select>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Particulars</Label>
              <Input
                type="text"
                value={newEntryForm.particulars}
                onChange={(e) =>
                  setNewEntryForm({
                    ...newEntryForm,
                    particulars: e.target.value,
                  })
                }
                placeholder="Additional details"
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleCreateEntry} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                {loading ? 'Creating...' : 'Create Entry'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
