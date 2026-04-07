"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MainContent } from "@/components/dashboard/main-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  X,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "company_admin" | "accountant" | "viewer";
  companies: Array<{ companyId: string; companyName: string; role: string }>;
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
}

type DialogType = null | "create" | "edit" | "permissions";

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form states
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"super_admin" | "company_admin" | "accountant" | "viewer">("viewer");
  const [newPassword, setNewPassword] = useState("");

  // Permissions dialog states
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCompanyRole, setSelectedCompanyRole] = useState("accountant");
  const [userCompanies, setUserCompanies] = useState<Array<{ companyId: string; companyName: string; role: string }>>([]);

  // Fetch users and companies
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, companiesRes] = await Promise.all([
          fetch("/api/users"),
          fetch("/api/companies?all=true"),
        ]);

        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(Array.isArray(usersData) ? usersData : []);
        } else if (usersRes.status === 403) {
          toast.error("Only super admins can manage users");
        }

        if (companiesRes.ok) {
          const companiesData = await companiesRes.json();
          setCompanies(companiesData.companies || companiesData || []);
        }
      } catch (error) {
        toast.error("Failed to load data");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Open create dialog
  const handleCreateUser = () => {
    setUserName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setRole("viewer");
    setSelectedUser(null);
    setDialogType("create");
  };

  // Open edit dialog
  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setUserName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setPassword("");
    setConfirmPassword("");
    setNewPassword("");
    setDialogType("edit");
  };

  // Open permissions dialog
  const handleManagePermissions = (user: User) => {
    setSelectedUser(user);
    setUserCompanies(user.companies);
    setSelectedCompanyId("");
    setSelectedCompanyRole("accountant");
    setDialogType("permissions");
  };

  // Submit create user
  const handleSubmitCreateUser = async () => {
    if (!userName.trim() || !email || !password || !confirmPassword) {
      toast.error("All fields are required");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          email,
          password,
          role,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        toast.error(error.message || "Failed to create user");
        return;
      }

      const newUser = await res.json();
      setUsers([...users, { ...newUser, companies: [], createdAt: new Date().toISOString() }]);
      toast.success("User created successfully");
      setDialogType(null);
    } catch (error) {
      toast.error("Failed to create user");
      console.error(error);
    }
  };

  // Submit edit user
  const handleSubmitEditUser = async () => {
    if (!selectedUser || !userName.trim() || !email) {
      toast.error("Full name and email are required");
      return;
    }

    if (newPassword && newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }

    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          email,
          role,
          ...(newPassword && { password: newPassword }),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        toast.error(error.message || "Failed to update user");
        return;
      }

      const updatedUser = await res.json();
      setUsers(users.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u)));
      toast.success("User updated successfully");
      setDialogType(null);
    } catch (error) {
      toast.error("Failed to update user");
      console.error(error);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        toast.error("Failed to delete user");
        return;
      }

      setUsers(users.filter((u) => u.id !== userId));
      toast.success("User deleted successfully");
      setDeleteConfirm(null);
    } catch (error) {
      toast.error("Failed to delete user");
      console.error(error);
    }
  };

  // Add company access
  const handleAddCompanyAccess = async () => {
    if (!selectedUser || !selectedCompanyId) {
      toast.error("Please select a company");
      return;
    }

    try {
      const res = await fetch(`/api/users/${selectedUser.id}/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          role: selectedCompanyRole,
        }),
      });

      if (!res.ok) {
        toast.error("Failed to add company access");
        return;
      }

      const newCompany = await res.json();
      setUserCompanies([...userCompanies, newCompany]);
      // Also update the user in the main users list
      if (selectedUser) {
        setUsers(users.map(u => u.id === selectedUser.id
          ? { ...u, companies: [...u.companies, newCompany] }
          : u
        ));
      }
      setSelectedCompanyId("");
      setSelectedCompanyRole("accountant");
      toast.success("Company access added");
    } catch (error) {
      toast.error("Failed to add company access");
      console.error(error);
    }
  };

  // Remove company access
  const handleRemoveCompanyAccess = async (companyId: string) => {
    if (!selectedUser) return;

    try {
      const res = await fetch(
        `/api/users/${selectedUser.id}/companies?companyId=${companyId}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        toast.error("Failed to remove company access");
        return;
      }

      const updatedCompanies = userCompanies.filter((c) => c.companyId !== companyId);
      setUserCompanies(updatedCompanies);
      // Also update the user in the main users list
      if (selectedUser) {
        setUsers(users.map(u => u.id === selectedUser.id
          ? { ...u, companies: updatedCompanies }
          : u
        ));
      }
      toast.success("Company access removed");
    } catch (error) {
      toast.error("Failed to remove company access");
      console.error(error);
    }
  };

  const getRoleBadgeColor = (roleValue: string) => {
    switch (roleValue) {
      case "super_admin":
        return "bg-purple-100 text-purple-800";
      case "company_admin":
        return "bg-blue-100 text-blue-800";
      case "accountant":
        return "bg-green-100 text-green-800";
      case "viewer":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRoleLabel = (roleValue: string) => {
    return roleValue.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <MainContent>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="border-b bg-card px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">User Management</h1>
              </div>
              <Button onClick={handleCreateUser} className="gap-2">
                <Plus className="h-4 w-4" />
                Create User
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8">
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="h-12 rounded-lg bg-muted animate-pulse"
                      />
                    ))}
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No users found
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-semibold">
                            Name
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Email
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Role
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Companies
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Created
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-4">{user.name}</td>
                            <td className="py-3 px-4">{user.email}</td>
                            <td className="py-3 px-4">
                              <Badge className={getRoleBadgeColor(user.role)}>
                                {getRoleLabel(user.role)}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              {user.companies.length > 0 ? (
                                <span className="text-muted-foreground">
                                  {user.companies
                                    .map((c) => c.companyName)
                                    .filter(Boolean)
                                    .join(", ")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  None
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleManagePermissions(user)}
                                  className="p-1 rounded hover:bg-accent"
                                  title="Manage permissions"
                                >
                                  <Shield className="h-4 w-4 text-blue-600" />
                                </button>
                                <button
                                  onClick={() => handleEditUser(user)}
                                  className="p-1 rounded hover:bg-accent"
                                  title="Edit user"
                                >
                                  <Pencil className="h-4 w-4 text-amber-600" />
                                </button>
                                {deleteConfirm === user.id ? (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleDeleteUser(user.id)}
                                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="px-2 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(user.id)}
                                    className="p-1 rounded hover:bg-accent"
                                    title="Delete user"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </button>
                                )}
                              </div>
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
        </div>
      </MainContent>

      {/* Create User Dialog */}
      <Dialog open={dialogType === "create"} onOpenChange={(open) => !open && setDialogType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="full-name">Full Name</Label>
              <Input
                id="full-name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) =>
                  setRole(
                    e.target.value as
                      | "super_admin"
                      | "company_admin"
                      | "accountant"
                      | "viewer"
                  )
                }
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="viewer">Viewer</option>
                <option value="accountant">Accountant</option>
                <option value="company_admin">Company Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => setDialogType(null)}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmitCreateUser}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={dialogType === "edit"} onOpenChange={(open) => !open && setDialogType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-full-name">Full Name</Label>
              <Input
                id="edit-full-name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div>
              <Label htmlFor="edit-role">Role</Label>
              <select
                id="edit-role"
                value={role}
                onChange={(e) =>
                  setRole(
                    e.target.value as
                      | "super_admin"
                      | "company_admin"
                      | "accountant"
                      | "viewer"
                  )
                }
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="viewer">Viewer</option>
                <option value="accountant">Accountant</option>
                <option value="company_admin">Company Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div>
              <Label htmlFor="new-password">New Password (optional)</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
              />
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => setDialogType(null)}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmitEditUser}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Permissions Dialog */}
      <Dialog open={dialogType === "permissions"} onOpenChange={(open) => !open && setDialogType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Manage Permissions - {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Current Companies */}
            <div>
              <h3 className="font-semibold mb-3">Current Company Access</h3>
              {userCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No company access assigned
                </p>
              ) : (
                <div className="space-y-2">
                  {userCompanies.map((company) => (
                    <div
                      key={company.companyId}
                      className="flex items-center justify-between bg-muted p-2 rounded"
                    >
                      <div>
                        <p className="text-sm font-medium">{company.companyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {getRoleLabel(company.role)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveCompanyAccess(company.companyId)}
                        className="p-1 rounded hover:bg-accent"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Company Access */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Add Company Access</h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="company-select">Company</Label>
                  <select
                    id="company-select"
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">Select a company...</option>
                    {companies
                      .filter(
                        (c) => !userCompanies.find((uc) => uc.companyId === c.id)
                      )
                      .map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="company-role">Role</Label>
                  <select
                    id="company-role"
                    value={selectedCompanyRole}
                    onChange={(e) => setSelectedCompanyRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="accountant">Accountant</option>
                    <option value="company_admin">Company Admin</option>
                  </select>
                </div>
                <Button
                  onClick={handleAddCompanyAccess}
                  className="w-full"
                  disabled={!selectedCompanyId}
                >
                  Add Access
                </Button>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setDialogType(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
