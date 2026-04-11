'use client';

import { useState, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Landmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MainContent } from '@/components/dashboard/main-content';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch: string | null;
  accountType: string;
  paymentMethod: string;
  openingBalance: number;
  isActive: boolean;
}

interface BankTransaction {
  id: string;
  date: string;
  type: 'income' | 'expense';
  amount: number;
  particulars: string | null;
  paymentMethod: string | null;
  isReconciled: boolean;
}

interface BankReconciliation {
  id: string;
  bankAccountId: string;
  reconciliationDate: string;
  statementBalance: number;
  bookBalance: number;
  difference: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PageProps {
  params: {
    companyId: string;
  };
}

export default function BankReconPage({ params }: PageProps) {
  const { companyId } = params;
  const [companyName, setCompanyName] = useState<string>('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [unreconciledTxns, setUnreconciledTxns] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal states
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  // Form states
  const [accountForm, setAccountForm] = useState({
    accountName: '',
    accountNumber: '',
    bankName: '',
    branch: '',
    accountType: 'savings',
    paymentMethod: 'bank',
    openingBalance: '',
  });

  const [reconForm, setReconForm] = useState({
    reconciliationDate: new Date().toISOString().split('T')[0],
    statementBalance: '',
  });

  const [selectedTxns, setSelectedTxns] = useState<Set<string>>(new Set());
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('bank');

  const PAYMENT_METHODS = ['bank', 'cash', 'esewa', 'khalti', 'cheque', 'fonepay'];

  // Load company and bank accounts
  useEffect(() => {
    loadCompanyData();
  }, [companyId]);

  // Auto-set payment method filter when account changes
  useEffect(() => {
    if (selectedAccount) {
      const acct = bankAccounts.find((a) => a.id === selectedAccount);
      if (acct) {
        setPaymentMethodFilter(acct.paymentMethod || 'bank');
      }
    }
  }, [selectedAccount, bankAccounts]);

  // Load reconciliation data when account or payment method selected
  useEffect(() => {
    if (selectedAccount) {
      loadReconciliationData();
    }
  }, [selectedAccount, paymentMethodFilter]);

  const loadCompanyData = async () => {
    try {
      setLoading(true);
      const [companyRes, accountsRes] = await Promise.all([
        fetch(`/api/companies/${companyId}`),
        fetch(`/api/companies/${companyId}/bank-accounts`),
      ]);

      if (companyRes.ok) {
        const company = await companyRes.json();
        setCompanyName(company.name);
      }

      if (accountsRes.ok) {
        const accounts = await accountsRes.json();
        setBankAccounts(accounts.filter((acc: BankAccount) => acc.isActive));
        if (accounts.length > 0) {
          setSelectedAccount(accounts[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading company data:', error);
      toast.error('Failed to load company data');
    } finally {
      setLoading(false);
    }
  };

  const loadReconciliationData = async () => {
    try {
      const res = await fetch(
        `/api/companies/${companyId}/bank-reconciliation?bankAccountId=${selectedAccount}&paymentMethod=${paymentMethodFilter}&_t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setReconciliations(data.reconciliations);
        setUnreconciledTxns(data.unreconciledTransactions);
        setSelectedTxns(new Set());
      }
    } catch (error) {
      console.error('Error loading reconciliation data:', error);
      toast.error('Failed to load reconciliation data');
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const method = editingAccount ? 'PUT' : 'POST';
      const payload = editingAccount
        ? { id: editingAccount.id, ...accountForm }
        : accountForm;

      const res = await fetch(
        `/api/companies/${companyId}/bank-accounts`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to save account');
        return;
      }

      toast.success(
        editingAccount ? 'Account updated successfully' : 'Account created successfully'
      );
      setShowAddAccount(false);
      setEditingAccount(null);
      setAccountForm({
        accountName: '',
        accountNumber: '',
        bankName: '',
        branch: '',
        accountType: 'savings',
        openingBalance: '',
      });
      loadCompanyData();
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error('Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  const handleEditAccount = (account: BankAccount) => {
    setEditingAccount(account);
    setAccountForm({
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      branch: account.branch || '',
      accountType: account.accountType,
      paymentMethod: account.paymentMethod || 'bank',
      openingBalance: account.openingBalance.toString(),
    });
    setShowAddAccount(true);
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this account?')) return;

    try {
      const res = await fetch(
        `/api/companies/${companyId}/bank-accounts?id=${accountId}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        toast.error('Failed to deactivate account');
        return;
      }

      toast.success('Account deactivated');
      loadCompanyData();
      if (selectedAccount === accountId) {
        setSelectedAccount('');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to deactivate account');
    }
  };

  const handleToggleTxn = (txnId: string) => {
    const newSelected = new Set(selectedTxns);
    if (newSelected.has(txnId)) {
      newSelected.delete(txnId);
    } else {
      newSelected.add(txnId);
    }
    setSelectedTxns(newSelected);
  };

  const handleReconcileSelected = async () => {
    if (selectedTxns.size === 0) {
      toast.error('Select at least one transaction');
      return;
    }

    setSaving(true);
    try {
      const promises = Array.from(selectedTxns).map((txnId) =>
        fetch(`/api/companies/${companyId}/bank-reconciliation`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reconcile_txn',
            transactionId: txnId,
            bankAccountId: selectedAccount,
          }),
        })
      );

      const results = await Promise.all(promises);
      const allOk = results.every((r) => r.ok);

      if (!allOk) {
        toast.error('Some transactions failed to reconcile');
        return;
      }

      toast.success(`${selectedTxns.size} transaction(s) reconciled`);
      setSelectedTxns(new Set());
      loadReconciliationData();
    } catch (error) {
      console.error('Error reconciling transactions:', error);
      toast.error('Failed to reconcile transactions');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (!reconForm.statementBalance) {
        toast.error('Statement balance required');
        return;
      }

      const res = await fetch(
        `/api/companies/${companyId}/bank-reconciliation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bankAccountId: selectedAccount,
            reconciliationDate: reconForm.reconciliationDate,
            statementBalance: parseFloat(reconForm.statementBalance),
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to create reconciliation');
        return;
      }

      toast.success('Reconciliation session created');
      setShowReconciliation(false);
      setReconForm({
        reconciliationDate: new Date().toISOString().split('T')[0],
        statementBalance: '',
      });
      loadReconciliationData();
    } catch (error) {
      console.error('Error creating reconciliation:', error);
      toast.error('Failed to create reconciliation');
    } finally {
      setSaving(false);
    }
  };

  const selectedAccountData = bankAccounts.find((a) => a.id === selectedAccount);
  const reconciledCount = unreconciledTxns.filter((t) => t.isReconciled).length;
  const unreconciledCount = unreconciledTxns.filter((t) => !t.isReconciled).length;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />
      <MainContent className="overflow-auto">
        <div className="p-8 space-y-6">
          {/* Bank Accounts Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Landmark className="w-5 h-5" />
                Bank Accounts
              </h2>
              <Button
                onClick={() => {
                  setEditingAccount(null);
                  setAccountForm({
                    accountName: '',
                    accountNumber: '',
                    bankName: '',
                    branch: '',
                    accountType: 'savings',
                    paymentMethod: 'bank',
                    openingBalance: '',
                  });
                  setShowAddAccount(true);
                }}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Account
              </Button>
            </div>

            {loading ? (
              <p className="text-gray-500">Loading accounts...</p>
            ) : bankAccounts.length === 0 ? (
              <p className="text-gray-500">No bank accounts yet</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bankAccounts.map((account) => (
                  <Card
                    key={account.id}
                    className={`cursor-pointer transition-all ${
                      selectedAccount === account.id
                        ? 'ring-2 ring-blue-500'
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => setSelectedAccount(account.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{account.accountName}</CardTitle>
                          <p className="text-sm text-gray-600">{account.bankName}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAccount(account);
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Edit2 className="w-4 h-4 text-gray-600" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAccount(account.id);
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-sm">
                        <p className="text-gray-600">Account #</p>
                        <p className="font-mono">{account.accountNumber}</p>
                      </div>
                      <div className="text-sm">
                        <p className="text-gray-600">Balance</p>
                        <p className="font-semibold text-lg">
                          {formatCurrency(account.openingBalance)}
                        </p>
                      </div>
                      <div className="text-sm">
                        <p className="text-gray-600">Payment Method</p>
                        <Badge variant="secondary" className="text-xs">
                          {(account.paymentMethod || 'bank').charAt(0).toUpperCase() + (account.paymentMethod || 'bank').slice(1)}
                        </Badge>
                      </div>
                      {account.branch && (
                        <p className="text-xs text-gray-500">Branch: {account.branch}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Reconciliation Section */}
          {selectedAccountData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Reconciliation
                </h2>
                <Button
                  onClick={() => setShowReconciliation(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  New Session
                </Button>
              </div>

              {/* Payment Method Filter */}
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium text-gray-700">Filter by Payment Method:</Label>
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="px-3 py-1.5 border rounded-md text-sm bg-white"
                >
                  <option value="">All Methods</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {selectedAccountData.accountName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Reconciliation Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">Statement Balance</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(selectedAccountData.openingBalance)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">Book Balance</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(selectedAccountData.openingBalance)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">Reconciled</p>
                      <p className="text-2xl font-bold text-green-600">{reconciledCount}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">Unreconciled</p>
                      <p className="text-2xl font-bold text-orange-600">{unreconciledCount}</p>
                    </div>
                  </div>

                  {/* Unreconciled Transactions */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Unreconciled Transactions</h3>
                      {selectedTxns.size > 0 && (
                        <Button
                          onClick={handleReconcileSelected}
                          disabled={saving}
                          className="gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark {selectedTxns.size} as Reconciled
                        </Button>
                      )}
                    </div>

                    {unreconciledTxns.length === 0 ? (
                      <p className="text-gray-500 text-sm">All transactions reconciled!</p>
                    ) : (
                      <div className="space-y-2">
                        {unreconciledTxns.map((txn) => (
                          <div
                            key={txn.id}
                            className="flex items-center gap-3 p-3 border rounded hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={selectedTxns.has(txn.id)}
                              onChange={() => handleToggleTxn(txn.id)}
                              className="w-4 h-4 cursor-pointer"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="font-medium text-sm">{txn.particulars || 'N/A'}</p>
                                <p
                                  className={`font-semibold ${
                                    txn.type === 'income'
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {txn.type === 'income' ? '+' : '-'}
                                  {formatCurrency(txn.amount)}
                                </p>
                              </div>
                              <p className="text-xs text-gray-500">
                                {formatDate(txn.date)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Reconciliation Sessions */}
              {reconciliations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Reconciliation History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {reconciliations.map((recon) => (
                        <div
                          key={recon.id}
                          className="flex items-center justify-between p-3 border rounded"
                        >
                          <div className="flex-1">
                            <p className="font-medium">
                              {formatDate(recon.reconciliationDate)}
                            </p>
                            <p className="text-sm text-gray-600">
                              Book: {formatCurrency(recon.bookBalance)} | Statement:{' '}
                              {formatCurrency(recon.statementBalance)}
                            </p>
                          </div>
                          <Badge
                            variant={
                              recon.status === 'completed' ? 'default' : 'secondary'
                            }
                          >
                            {recon.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Add/Edit Account Dialog */}
        <Dialog open={showAddAccount} onOpenChange={setShowAddAccount}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingAccount ? 'Edit Bank Account' : 'Add Bank Account'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <Label htmlFor="accountName">Account Name</Label>
                <Input
                  id="accountName"
                  value={accountForm.accountName}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, accountName: e.target.value })
                  }
                  placeholder="e.g., Main Checking"
                  required
                />
              </div>
              <div>
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input
                  id="accountNumber"
                  value={accountForm.accountNumber}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      accountNumber: e.target.value,
                    })
                  }
                  placeholder="e.g., 1234567890"
                  required
                />
              </div>
              <div>
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  value={accountForm.bankName}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, bankName: e.target.value })
                  }
                  placeholder="e.g., Nepal Bank Limited"
                  required
                />
              </div>
              <div>
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={accountForm.branch}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, branch: e.target.value })
                  }
                  placeholder="e.g., Kathmandu"
                />
              </div>
              <div>
                <Label htmlFor="accountType">Account Type</Label>
                <select
                  id="accountType"
                  value={accountForm.accountType}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, accountType: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="savings">Savings</option>
                  <option value="checking">Checking</option>
                  <option value="current">Current</option>
                </select>
              </div>
              <div>
                <Label htmlFor="paymentMethod">Linked Payment Method</Label>
                <select
                  id="paymentMethod"
                  value={accountForm.paymentMethod}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, paymentMethod: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Transactions with this payment method will be shown for reconciliation
                </p>
              </div>
              <div>
                <Label htmlFor="openingBalance">Opening Balance</Label>
                <Input
                  id="openingBalance"
                  type="number"
                  step="0.01"
                  value={accountForm.openingBalance}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      openingBalance: e.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddAccount(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Account'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reconciliation Dialog */}
        <Dialog open={showReconciliation} onOpenChange={setShowReconciliation}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Reconciliation Session</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateReconciliation} className="space-y-4">
              <div>
                <Label htmlFor="reconDate">Reconciliation Date</Label>
                <Input
                  id="reconDate"
                  type="date"
                  value={reconForm.reconciliationDate}
                  onChange={(e) =>
                    setReconForm({
                      ...reconForm,
                      reconciliationDate: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="statementBalance">Statement Balance</Label>
                <Input
                  id="statementBalance"
                  type="number"
                  step="0.01"
                  value={reconForm.statementBalance}
                  onChange={(e) =>
                    setReconForm({
                      ...reconForm,
                      statementBalance: e.target.value,
                    })
                  }
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowReconciliation(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Session'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </MainContent>
    </div>
  );
}
