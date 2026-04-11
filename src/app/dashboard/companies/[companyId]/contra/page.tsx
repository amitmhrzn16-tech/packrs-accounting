"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MainContent } from "@/components/dashboard/main-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus, ArrowRight, CheckCircle, Clock, AlertCircle, X, MoreVertical,
  Trash2, Edit2, ThumbsUp, ThumbsDown, Eye
} from "lucide-react";
import { toast } from "sonner";
import { ApprovalBadge, EntryActions, EntryLogViewer, ConfirmDeleteDialog } from "@/components/ui/entry-actions";

interface ContraEntry {
  id: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
  entryDate: string;
  referenceNo?: string;
  description?: string;
  approvalStatus?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "esewa", label: "eSewa" },
  { value: "khalti", label: "Khalti" },
  { value: "cheque", label: "Cheque" },
  { value: "fonepay", label: "Fonepay" },
];

export default function ContraPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [contraEntries, setContraEntries] = useState<ContraEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyCurrency, setCompanyCurrency] = useState("NPR");
  const [companyName, setCompanyName] = useState("");
  const [summary, setSummary] = useState<Record<string, number>>({});

  // Create form
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    fromAccount: "",
    toAccount: "",
    amount: "",
    entryDate: new Date().toISOString().split("T")[0],
    referenceNo: "",
    description: "",
  });

  // Edit form
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ContraEntry | null>(null);
  const [editForm, setEditForm] = useState({
    fromAccount: "",
    toAccount: "",
    amount: "",
    entryDate: "",
    referenceNo: "",
    description: "",
  });

  // Entry log viewer
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logViewerEntryId, setLogViewerEntryId] = useState("");

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState("");

  // Action menu
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [companyId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [contraRes, companyRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/contra`),
        fetch(`/api/companies/${companyId}`),
      ]);

      if (contraRes.ok) {
        const data = await contraRes.json();
        setContraEntries(data.contraEntries || []);
        setSummary(data.summary || {});
      }

      if (companyRes.ok) {
        const company = await companyRes.json();
        setCompanyCurrency(company.currency || "NPR");
        setCompanyName(company.name || "");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load contra entries");
    } finally {
      setLoading(false);
    }
  }

  const handleCreateChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setCreateForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!createForm.fromAccount || !createForm.toAccount || !createForm.amount || !createForm.entryDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (createForm.fromAccount === createForm.toAccount) {
      toast.error("From Account and To Account must be different");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/companies/${companyId}/contra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccount: createForm.fromAccount,
          toAccount: createForm.toAccount,
          amount: parseFloat(createForm.amount),
          entryDate: createForm.entryDate,
          referenceNo: createForm.referenceNo,
          description: createForm.description,
        }),
      });

      if (!response.ok) throw new Error("Failed to create contra entry");

      toast.success("Contra entry created successfully");
      setShowCreateDialog(false);
      setCreateForm({
        fromAccount: "",
        toAccount: "",
        amount: "",
        entryDate: new Date().toISOString().split("T")[0],
        referenceNo: "",
        description: "",
      });
      fetchData();
    } catch (error) {
      console.error("Error creating contra entry:", error);
      toast.error("Failed to create contra entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!editingEntry) return;

    if (editForm.fromAccount === editForm.toAccount) {
      toast.error("From Account and To Account must be different");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/companies/${companyId}/contra`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntry.id,
          action: "edit",
          fromAccount: editForm.fromAccount,
          toAccount: editForm.toAccount,
          amount: editForm.amount ? parseFloat(editForm.amount) : undefined,
          entryDate: editForm.entryDate,
          referenceNo: editForm.referenceNo,
          description: editForm.description,
        }),
      });

      if (!response.ok) throw new Error("Failed to update contra entry");

      toast.success("Contra entry updated successfully");
      setShowEditDialog(false);
      setEditingEntry(null);
      fetchData();
    } catch (error) {
      console.error("Error updating contra entry:", error);
      toast.error("Failed to update contra entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(entryId: string) {
    try {
      setSaving(true);
      const response = await fetch(`/api/companies/${companyId}/contra`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId, action: "approve" }),
      });

      if (!response.ok) throw new Error("Failed to approve");

      toast.success("Contra entry approved");
      fetchData();
    } catch (error) {
      console.error("Error approving contra entry:", error);
      toast.error("Failed to approve contra entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject(entryId: string) {
    try {
      setSaving(true);
      const response = await fetch(`/api/companies/${companyId}/contra`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId, action: "reject" }),
      });

      if (!response.ok) throw new Error("Failed to reject");

      toast.success("Contra entry rejected");
      fetchData();
    } catch (error) {
      console.error("Error rejecting contra entry:", error);
      toast.error("Failed to reject contra entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/companies/${companyId}/contra?id=${deleteTargetId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      toast.success("Contra entry deleted");
      setShowDeleteConfirm(false);
      setDeleteTargetId("");
      fetchData();
    } catch (error) {
      console.error("Error deleting contra entry:", error);
      toast.error("Failed to delete contra entry");
    } finally {
      setSaving(false);
    }
  }

  const toAccountOptions = PAYMENT_METHODS.filter(
    (m) => m.value !== createForm.fromAccount
  );

  const editToAccountOptions = PAYMENT_METHODS.filter(
    (m) => m.value !== editForm.fromAccount
  );

  return (
    <div className="flex h-screen">
      <Sidebar />
      <MainContent>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Contra Entries</h1>
              <p className="text-gray-500">Manage money transfers between payment methods</p>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Contra Entry
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Contra Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="fromAccount">From Account</Label>
                    <select
                      id="fromAccount"
                      name="fromAccount"
                      value={createForm.fromAccount}
                      onChange={handleCreateChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select account</option>
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="toAccount">To Account</Label>
                    <select
                      id="toAccount"
                      name="toAccount"
                      value={createForm.toAccount}
                      onChange={handleCreateChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select account</option>
                      {toAccountOptions.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      value={createForm.amount}
                      onChange={handleCreateChange}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="entryDate">Date</Label>
                    <Input
                      id="entryDate"
                      name="entryDate"
                      type="date"
                      value={createForm.entryDate}
                      onChange={handleCreateChange}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="referenceNo">Reference No</Label>
                    <Input
                      id="referenceNo"
                      name="referenceNo"
                      value={createForm.referenceNo}
                      onChange={handleCreateChange}
                      placeholder="e.g., DEPOSIT-001"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <textarea
                      id="description"
                      name="description"
                      value={createForm.description}
                      onChange={handleCreateChange}
                      placeholder="Notes about this transfer"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>

                  <Button type="submit" disabled={saving} className="w-full">
                    {saving ? "Creating..." : "Create Entry"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Summary Cards */}
          {Object.keys(summary).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Account Movement Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {Object.entries(summary).map(([account, movement]) => (
                    <div key={account} className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 capitalize">{account}</p>
                      <p className={`text-lg font-semibold ${movement > 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(movement, companyCurrency)}
                      </p>
                      <p className="text-xs text-gray-500">{movement > 0 ? "Inflow" : "Outflow"}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entries Table */}
          <Card>
            <CardHeader>
              <CardTitle>Contra Entries</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : contraEntries.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No contra entries yet. Create one to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">From Account</th>
                        <th className="text-center px-4 py-2"></th>
                        <th className="text-left px-4 py-2">To Account</th>
                        <th className="text-right px-4 py-2">Amount</th>
                        <th className="text-left px-4 py-2">Reference</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-left px-4 py-2">Approval</th>
                        <th className="text-center px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contraEntries.map((entry) => (
                        <tr key={entry.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2">{formatDate(entry.entryDate)}</td>
                          <td className="px-4 py-2 capitalize">{entry.fromAccount}</td>
                          <td className="px-4 py-2 text-center">
                            <ArrowRight className="w-4 h-4 inline text-gray-400" />
                          </td>
                          <td className="px-4 py-2 capitalize">{entry.toAccount}</td>
                          <td className="px-4 py-2 text-right font-semibold">
                            {formatCurrency(entry.amount, companyCurrency)}
                          </td>
                          <td className="px-4 py-2 text-gray-600">{entry.referenceNo || "-"}</td>
                          <td className="px-4 py-2">
                            <Badge variant={entry.approvalStatus === "approved" ? "default" : "secondary"}>
                              {entry.approvalStatus || "pending"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            {entry.approvalStatus === "approved" ? (
                              <Badge variant="outline" className="text-green-600 border-green-200">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Approved
                              </Badge>
                            ) : entry.approvalStatus === "rejected" ? (
                              <Badge variant="outline" className="text-red-600 border-red-200">
                                Rejected
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-200">
                                <Clock className="w-3 h-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <EntryActions
                              entryId={entry.id}
                              approvalStatus={entry.approvalStatus || "pending"}
                              onApprove={() => handleApprove(entry.id)}
                              onReject={() => handleReject(entry.id)}
                              onEdit={() => {
                                setEditingEntry(entry);
                                setEditForm({
                                  fromAccount: entry.fromAccount,
                                  toAccount: entry.toAccount,
                                  amount: entry.amount.toString(),
                                  entryDate: entry.entryDate,
                                  referenceNo: entry.referenceNo || "",
                                  description: entry.description || "",
                                });
                                setShowEditDialog(true);
                              }}
                              onDelete={() => {
                                setDeleteTargetId(entry.id);
                                setShowDeleteConfirm(true);
                              }}
                              onViewLog={() => {
                                setLogViewerEntryId(entry.id);
                                setShowLogViewer(true);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Contra Entry</DialogTitle>
            </DialogHeader>
            {editingEntry && (
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="editFromAccount">From Account</Label>
                  <select
                    id="editFromAccount"
                    name="fromAccount"
                    value={editForm.fromAccount}
                    onChange={handleEditChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select account</option>
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="editToAccount">To Account</Label>
                  <select
                    id="editToAccount"
                    name="toAccount"
                    value={editForm.toAccount}
                    onChange={handleEditChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select account</option>
                    {editToAccountOptions.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="editAmount">Amount</Label>
                  <Input
                    id="editAmount"
                    name="amount"
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={handleEditChange}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="editEntryDate">Date</Label>
                  <Input
                    id="editEntryDate"
                    name="entryDate"
                    type="date"
                    value={editForm.entryDate}
                    onChange={handleEditChange}
                  />
                </div>

                <div>
                  <Label htmlFor="editReferenceNo">Reference No</Label>
                  <Input
                    id="editReferenceNo"
                    name="referenceNo"
                    value={editForm.referenceNo}
                    onChange={handleEditChange}
                    placeholder="e.g., DEPOSIT-001"
                  />
                </div>

                <div>
                  <Label htmlFor="editDescription">Description</Label>
                  <textarea
                    id="editDescription"
                    name="description"
                    value={editForm.description}
                    onChange={handleEditChange}
                    placeholder="Notes about this transfer"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>

                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Entry Log Viewer */}
        {showLogViewer && (
          <EntryLogViewer
            companyId={companyId}
            module="contra"
            entryId={logViewerEntryId}
            onClose={() => setShowLogViewer(false)}
            title="Contra Entry Log"
          />
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <ConfirmDeleteDialog
            title="Delete Contra Entry"
            message="Are you sure you want to delete this contra entry? This action cannot be undone."
            onConfirm={handleDelete}
            onCancel={() => {
              setShowDeleteConfirm(false);
              setDeleteTargetId("");
            }}
            isLoading={saving}
          />
        )}
      </MainContent>
    </div>
  );
}
