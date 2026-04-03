'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, TrendingUp, Calendar, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';

interface IncomeEntry {
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

interface PageProps {
  params: {
    companyId: string;
  };
}

const paymentMethods = ['Cash', 'Bank', 'eSewa', 'Khalti', 'Cheque'];

export default function IncomePage({ params }: PageProps) {
  const { companyId } = params;
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: '',
    particulars: '',
    paymentMethod: '',
    referenceNo: '',
  });

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [incomeRes, categoriesRes, companyRes] = await Promise.all([
        fetch(
          `/api/companies/${companyId}/transactions?type=income&limit=50`
        ),
        fetch(`/api/companies/${companyId}/categories?type=income`),
        fetch(`/api/companies/${companyId}`),
      ]);

      if (!incomeRes.ok || !categoriesRes.ok || !companyRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const incomeData = await incomeRes.json();
      const categoriesData = await categoriesRes.json();
      const companyData = await companyRes.json();

      setIncome(incomeData.transactions || []);
      setCategories(categoriesData);
      setCompanyName(companyData.name);
    } catch (error) {
      toast.error('Failed to load income data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.date || !formData.amount || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);

      // Upload file first if selected
      let attachmentUrl = null;
      if (selectedFile) {
        setUploading(true);
        const fileFormData = new FormData();
        fileFormData.append('file', selectedFile);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: fileFormData,
        });
        if (!uploadRes.ok) {
          throw new Error('Failed to upload file');
        }
        const uploadData = await uploadRes.json();
        attachmentUrl = uploadData.url;
        setUploading(false);
      }

      const response = await fetch(
        `/api/companies/${companyId}/transactions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'income',
            date: formData.date,
            amount: parseFloat(formData.amount),
            categoryId: formData.category,
            particulars: formData.particulars,
            paymentMethod: formData.paymentMethod.toLowerCase(),
            referenceNo: formData.referenceNo,
            attachmentUrl,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create income entry');
      }

      toast.success('Income entry added successfully');
      setDialogOpen(false);
      setSelectedFile(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        category: '',
        particulars: '',
        paymentMethod: '',
        referenceNo: '',
      });
      fetchData();
    } catch (error) {
      toast.error('Failed to add income entry');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />

      <div className="ml-64 flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <h1 className="text-3xl font-bold text-gray-900">Income</h1>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-green-600 hover:bg-green-700">
                  <Plus className="h-4 w-4" />
                  Add Income
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add Income Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">
                      Date <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleInputChange}
                      required
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount">
                      Amount <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={handleInputChange}
                      required
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Select a category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="particulars">Particulars</Label>
                    <Textarea
                      id="particulars"
                      name="particulars"
                      placeholder="Enter details about this income"
                      value={formData.particulars}
                      onChange={handleInputChange}
                      className="w-full"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <select
                      id="paymentMethod"
                      name="paymentMethod"
                      value={formData.paymentMethod}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Select payment method</option>
                      {paymentMethods.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="referenceNo">Reference No</Label>
                    <Input
                      id="referenceNo"
                      name="referenceNo"
                      placeholder="e.g., INV-001"
                      value={formData.referenceNo}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="attachment">Receipt / Invoice</Label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 transition-colors">
                          <Paperclip className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600 truncate">
                            {selectedFile ? selectedFile.name : 'Attach PDF or image...'}
                          </span>
                        </div>
                        <input
                          id="attachment"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          className="hidden"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      {selectedFile && (
                        <button
                          type="button"
                          onClick={() => setSelectedFile(null)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">PDF, JPG, PNG, WebP — Max 10MB</p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      disabled={submitting || uploading}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {uploading ? 'Uploading file...' : submitting ? 'Adding...' : 'Add Income'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Income Table */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-gray-200 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : income.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingUp className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600 text-lg">No income entries yet</p>
                <p className="text-gray-400 text-sm">
                  Add your first income entry to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Income Entries</span>
                  <Badge variant="secondary">{income.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">
                          Date
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">
                          Particulars
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">
                          Category
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">
                          Payment Method
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {income.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <td className="py-3 px-4 text-gray-700 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {formatDate(entry.date)}
                          </td>
                          <td className="py-3 px-4 text-gray-700">
                            {entry.particulars || '-'}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{entry.category?.name || '—'}</Badge>
                          </td>
                          <td className="py-3 px-4 text-gray-700">
                            <Badge variant="secondary">
                              {entry.paymentMethod}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-green-600">
                            {formatCurrency(entry.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 border-t-2 border-green-200">
                        <td colSpan={4} className="py-3 px-4 font-bold text-gray-900 text-right">
                          Total ({income.length} entries)
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-green-700 text-lg">
                          {formatCurrency(income.reduce((sum, entry) => sum + entry.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
