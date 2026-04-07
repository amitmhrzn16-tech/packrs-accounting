'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, TrendingDown, Calendar, Paperclip, X, Trash2, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MainContent } from "@/components/dashboard/main-content";
import CommentThread from '@/components/CommentThread';

interface Expense {
  id: string;
  date: string;
  particulars: string;
  category: { id: string; name: string } | null;
  paymentMethod: string;
  amount: number;
  referenceNo?: string;
}

interface Category {
  id: string;
  name: string;
}

export default function ExpensesPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: '',
    particulars: '',
    paymentMethod: 'Cash',
    referenceNo: '',
  });

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [expensesRes, categoriesRes, companyRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/transactions?type=expense&limit=50`),
        fetch(`/api/companies/${companyId}/categories?type=expense`),
        fetch(`/api/companies/${companyId}`),
      ]);

      if (expensesRes.ok) {
        const expensesData = await expensesRes.json();
        const list = expensesData.transactions || [];
        setExpenses(list);
        if (list.length > 0) {
          fetch('/api/transactions/comment-counts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactionIds: list.map((t: any) => t.id) }),
          })
            .then((r) => r.json())
            .then((d) => setCommentCounts(d.counts || {}))
            .catch(() => {});
        }
      }
      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        setCategories(categoriesData);
      }
      if (companyRes.ok) {
        const companyData = await companyRes.json();
        setCompanyName(companyData.name);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.amount || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      setIsSubmitting(true);
      let attachmentUrl = null;
      if (selectedFile) {
        setUploading(true);
        const fileFormData = new FormData();
        fileFormData.append('file', selectedFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fileFormData });
        if (!uploadRes.ok) throw new Error('Failed to upload file');
        const uploadData = await uploadRes.json();
        attachmentUrl = uploadData.url;
        setUploading(false);
      }
      const response = await fetch(`/api/companies/${companyId}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'expense',
          date: formData.date,
          amount: parseFloat(formData.amount),
          categoryId: formData.category,
          particulars: formData.particulars,
          paymentMethod: formData.paymentMethod.toLowerCase(),
          referenceNo: formData.referenceNo,
          attachmentUrl,
        }),
      });
      if (!response.ok) throw new Error('Failed to add expense');
      toast.success('Expense added successfully');
      setIsDialogOpen(false);
      setSelectedFile(null);
      setFormData({ date: new Date().toISOString().split('T')[0], amount: '', category: '', particulars: '', paymentMethod: 'Cash', referenceNo: '' });
      fetchData();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Failed to add expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === expenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(expenses.map((e) => e.id)));
    }
  };

  const handleDeleteSingle = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/companies/${companyId}/transactions/delete?id=${id}`, { method: 'DELETE' });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to delete'); }
      toast.success('Expense entry deleted');
      setDeleteConfirmId(null);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/companies/${companyId}/transactions/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to delete'); }
      const data = await res.json();
      toast.success(`Deleted ${data.deletedCount} entries`);
      setSelectedIds(new Set());
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />

      <MainContent className="overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-red-600" />
              <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add Expense</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                      <Input id="date" name="date" type="date" value={formData.date} onChange={handleInputChange} required className="pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount *</Label>
                    <Input id="amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleInputChange} placeholder="0.00" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <select id="category" name="category" value={formData.category} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select a category</option>
                      {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="particulars">Particulars</Label>
                    <Textarea id="particulars" name="particulars" value={formData.particulars} onChange={handleInputChange} placeholder="Enter expense details..." rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <select id="paymentMethod" name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="Cash">Cash</option>
                      <option value="Bank">Bank</option>
                      <option value="eSewa">eSewa</option>
                      <option value="Khalti">Khalti</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referenceNo">Reference No</Label>
                    <Input id="referenceNo" name="referenceNo" type="text" value={formData.referenceNo} onChange={handleInputChange} placeholder="e.g., INV-001" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attachment">Receipt / Invoice</Label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 transition-colors">
                          <Paperclip className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600 truncate">{selectedFile ? selectedFile.name : 'Attach PDF or image...'}</span>
                        </div>
                        <input id="attachment" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                      </label>
                      {selectedFile && (
                        <button type="button" onClick={() => setSelectedFile(null)} className="p-1 text-gray-400 hover:text-red-500">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">PDF, JPG, PNG, WebP — Max 10MB</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting || uploading}>
                    {uploading ? 'Uploading file...' : isSubmitting ? 'Adding...' : 'Add Expense'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Expenses Table */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-200 rounded-md animate-pulse" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingDown className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg font-medium">No expenses yet</p>
                <p className="text-gray-400 text-sm">Add your first expense to get started</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Expense Entries</span>
                  <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                      <Button size="sm" variant="destructive" className="gap-1" disabled={deleting} onClick={handleBulkDelete}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete {selectedIds.size} selected
                      </Button>
                    )}
                    <Badge variant="secondary">{expenses.length}</Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-3 px-2 w-10">
                          <button onClick={toggleSelectAll} className="text-gray-500 hover:text-gray-800">
                            {selectedIds.size === expenses.length && expenses.length > 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                          </button>
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Particulars</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Payment Method</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount</th>
                        <th className="py-3 px-2 w-10 text-center font-semibold text-gray-700">💬</th>
                        <th className="py-3 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((expense) => (
                        <tr key={expense.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedIds.has(expense.id) ? 'bg-red-50' : ''}`}>
                          <td className="py-3 px-2">
                            <button onClick={() => toggleSelect(expense.id)} className="text-gray-500 hover:text-gray-800">
                              {selectedIds.has(expense.id) ? <CheckSquare className="h-4 w-4 text-red-600" /> : <Square className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-gray-900">{formatDate(expense.date)}</td>
                          <td className="py-3 px-4 text-gray-900">{expense.particulars || '-'}</td>
                          <td className="py-3 px-4"><Badge variant="outline">{expense.category?.name || '—'}</Badge></td>
                          <td className="py-3 px-4 text-gray-900"><Badge variant="secondary">{expense.paymentMethod}</Badge></td>
                          <td className="py-3 px-4 text-right text-red-600 font-semibold">{formatCurrency(expense.amount)}</td>
                          <td className="py-3 px-2 text-center">
                            <CommentThread
                              transactionId={expense.id}
                              initialCount={commentCounts[expense.id] || 0}
                              onCountChange={(c) => setCommentCounts((prev) => ({ ...prev, [expense.id]: c }))}
                            />
                          </td>
                          <td className="py-3 px-2">
                            {deleteConfirmId === expense.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleDeleteSingle(expense.id)} disabled={deleting} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">
                                  {deleting ? '...' : 'Yes'}
                                </button>
                                <button onClick={() => setDeleteConfirmId(null)} className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirmId(expense.id)} className="text-gray-400 hover:text-red-500 transition-colors" title="Delete entry">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-red-50 border-t-2 border-red-200">
                        <td colSpan={5} className="py-3 px-4 font-bold text-gray-900 text-right">Total ({expenses.length} entries)</td>
                        <td className="py-3 px-4 text-right font-bold text-red-700 text-lg">{formatCurrency(expenses.reduce((sum, entry) => sum + entry.amount, 0))}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </MainContent>
    </div>
  );
}
