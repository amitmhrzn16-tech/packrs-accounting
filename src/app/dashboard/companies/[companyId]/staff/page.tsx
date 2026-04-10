"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MainContent } from "@/components/dashboard/main-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  Plus, Search, Edit2, UserX, UserCheck, Phone, Mail, Bike, User, Users,
  Briefcase, CreditCard, AlertTriangle, X
} from "lucide-react";

interface Staff {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: string;
  designation?: string;
  salaryAmount: number;
  joinDate?: string;
  isActive: boolean;
  bankAccount?: string;
  bankName?: string;
  emergencyContact?: string;
  address?: string;
  notes?: string;
  totalAdvanceDue: number;
}

const STAFF_ROLES = [
  { value: "rider", label: "Rider", icon: "🏍️" },
  { value: "office_staff", label: "Office Staff", icon: "🏢" },
  { value: "manager", label: "Manager", icon: "👔" },
  { value: "driver", label: "Driver", icon: "🚗" },
  { value: "helper", label: "Helper", icon: "🤝" },
];

interface PageProps {
  params: { companyId: string };
}

export default function StaffPage({ params }: PageProps) {
  const companyId = params.companyId;

  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyCurrency, setCompanyCurrency] = useState("NPR");
  const [companyName, setCompanyName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", role: "rider", designation: "",
    salaryAmount: "", joinDate: "", bankAccount: "", bankName: "",
    emergencyContact: "", address: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompany();
    fetchStaff();
  }, [companyId, roleFilter, showInactive]);

  async function fetchCompany() {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      const data = await res.json();
      setCompanyCurrency(data.currency || "NPR");
      setCompanyName(data.name || "");
    } catch {}
  }

  async function fetchStaff() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.set("role", roleFilter);
      if (!showInactive) params.set("isActive", "true");
      const res = await fetch(`/api/companies/${companyId}/staff?${params}`);
      const data = await res.json();
      setStaff(data.staff || []);
    } catch (err) {
      console.error("Failed to fetch staff:", err);
    }
    setLoading(false);
  }

  function openCreateForm() {
    setEditingStaff(null);
    setForm({
      name: "", phone: "", email: "", role: "rider", designation: "",
      salaryAmount: "", joinDate: "", bankAccount: "", bankName: "",
      emergencyContact: "", address: "", notes: "",
    });
    setShowForm(true);
  }

  function openEditForm(s: Staff) {
    setEditingStaff(s);
    setForm({
      name: s.name, phone: s.phone || "", email: s.email || "",
      role: s.role, designation: s.designation || "",
      salaryAmount: String(s.salaryAmount || ""), joinDate: s.joinDate || "",
      bankAccount: s.bankAccount || "", bankName: s.bankName || "",
      emergencyContact: s.emergencyContact || "", address: s.address || "",
      notes: s.notes || "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        salaryAmount: parseFloat(form.salaryAmount) || 0,
        ...(editingStaff ? { id: editingStaff.id, isActive: editingStaff.isActive } : {}),
      };
      const res = await fetch(`/api/companies/${companyId}/staff`, {
        method: editingStaff ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowForm(false);
        fetchStaff();
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  }

  async function toggleActive(s: Staff) {
    if (s.isActive) {
      await fetch(`/api/companies/${companyId}/staff?id=${s.id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/companies/${companyId}/staff`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...s, isActive: true }),
      });
    }
    fetchStaff();
  }

  const filtered = staff.filter((s) =>
    !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.phone && s.phone.includes(searchTerm)) ||
    (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalSalary = staff.reduce((sum, s) => sum + (s.salaryAmount || 0), 0);
  const totalDue = staff.reduce((sum, s) => sum + (s.totalAdvanceDue || 0), 0);
  const riderCount = staff.filter((s) => s.role === "rider").length;
  const officeCount = staff.filter((s) => s.role !== "rider").length;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar companyId={companyId} companyName={companyName} />
      <MainContent className="overflow-auto">
        <div className="p-8">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff & Riders</h1>
          <p className="text-sm text-muted-foreground">Manage your riders, drivers, and office staff</p>
        </div>
        <Button onClick={openCreateForm}>
          <Plus className="mr-2 h-4 w-4" /> Add Staff
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Staff</p>
                <p className="text-xl font-bold">{staff.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Bike className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Riders</p>
                <p className="text-xl font-bold">{riderCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-xs text-muted-foreground">Monthly Payroll</p>
                <p className="text-lg font-bold">{formatCurrency(totalSalary, companyCurrency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Advances Due</p>
                <p className="text-lg font-bold text-orange-600">{formatCurrency(totalDue, companyCurrency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, email..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          {STAFF_ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show Inactive
        </label>
      </div>

      {/* Staff Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">No staff found. Add your first rider or staff member!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const roleInfo = STAFF_ROLES.find((r) => r.value === s.role);
            return (
              <Card key={s.id} className={`relative ${!s.isActive ? "opacity-60" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg">
                        {roleInfo?.icon || "👤"}
                      </div>
                      <div>
                        <h3 className="font-semibold">{s.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          {roleInfo?.label || s.role}{s.designation ? ` · ${s.designation}` : ""}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEditForm(s)} className="rounded p-1 hover:bg-accent" title="Edit">
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => toggleActive(s)} className="rounded p-1 hover:bg-accent" title={s.isActive ? "Deactivate" : "Activate"}>
                        {s.isActive ? <UserX className="h-4 w-4 text-red-400" /> : <UserCheck className="h-4 w-4 text-green-500" />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {s.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3" /> {s.phone}
                      </div>
                    )}
                    {s.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" /> {s.email}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Salary</p>
                      <p className="font-semibold">{formatCurrency(s.salaryAmount, companyCurrency)}</p>
                    </div>
                    {s.totalAdvanceDue > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-orange-500">Advance Due</p>
                        <p className="font-semibold text-orange-600">
                          {formatCurrency(s.totalAdvanceDue, companyCurrency)}
                        </p>
                      </div>
                    )}
                  </div>

                  {!s.isActive && (
                    <Badge variant="destructive" className="absolute right-2 top-2 text-xs">Inactive</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingStaff ? "Edit Staff" : "Add New Staff"}</h2>
              <button onClick={() => setShowForm(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
                </div>
                <div>
                  <Label>Role</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Designation</Label>
                  <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Rider" />
                </div>
                <div>
                  <Label>Monthly Salary</Label>
                  <Input type="number" value={form.salaryAmount} onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Join Date</Label>
                  <Input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
                </div>
                <div>
                  <Label>Emergency Contact</Label>
                  <Input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Contact number" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bank Name</Label>
                  <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. Kumari Bank" />
                </div>
                <div>
                  <Label>Bank Account</Label>
                  <Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} placeholder="Account number" />
                </div>
              </div>

              <div>
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
              </div>

              <div>
                <Label>Notes</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !form.name}>
                  {saving ? "Saving..." : editingStaff ? "Update" : "Add Staff"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
        </div>
      </MainContent>
    </div>
  );
}
