"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowDownUp,
  Calendar,
  Database,
} from "lucide-react";

interface DmsConfig {
  configured: boolean;
  id?: string;
  dmsBaseUrl?: string;
  dmsUsername?: string;
  hasPassword?: boolean;
  branchId?: string;
  branchName?: string;
  syncEnabled?: boolean;
  syncFrequency?: string;
  lastSyncAt?: string;
}

interface SyncLog {
  id: string;
  syncType: string;
  status: string;
  syncDate: string;
  incomeCount: number;
  expenseCount: number;
  matchedCount: number;
  newCount: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  transactionCount: number;
}

interface SyncResult {
  success: boolean;
  syncLogId: string;
  income: { fetched: number; matched: number; new: number };
  expense: { fetched: number; matched: number; new: number };
  errors: string[];
}

export default function DmsSyncPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { companyId } = params;

  // Config state
  const [config, setConfig] = useState<DmsConfig>({ configured: false });
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Form state
  const [dmsBaseUrl, setDmsBaseUrl] = useState(
    "https://dms.packrscourier.com.np/dmsadmin"
  );
  const [dmsUsername, setDmsUsername] = useState("");
  const [dmsPassword, setDmsPassword] = useState("");
  const [branchId, setBranchId] = useState("1");
  const [branchName, setBranchName] = useState("Head Office");
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncFrequency, setSyncFrequency] = useState("daily");
  const [savingConfig, setSavingConfig] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Logs state
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Set default dates to today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setFromDate(today);
    setToDate(today);
  }, []);

  // Load config on mount
  useEffect(() => {
    loadConfig();
    loadLogs();
  }, [companyId]);

  async function loadConfig() {
    try {
      setLoadingConfig(true);
      const res = await fetch(`/api/companies/${companyId}/dms-sync/config`);
      const data = await res.json();
      setConfig(data);

      if (data.configured) {
        setDmsBaseUrl(data.dmsBaseUrl || "");
        setDmsUsername(data.dmsUsername || "");
        setBranchId(data.branchId || "1");
        setBranchName(data.branchName || "Head Office");
        setSyncEnabled(data.syncEnabled ?? true);
        setSyncFrequency(data.syncFrequency || "daily");
      }
    } catch {
      toast.error("Failed to load DMS config");
    } finally {
      setLoadingConfig(false);
    }
  }

  async function loadLogs() {
    try {
      setLoadingLogs(true);
      const res = await fetch(
        `/api/companies/${companyId}/dms-sync/logs?limit=10`
      );
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      // Silent fail for logs
    } finally {
      setLoadingLogs(false);
    }
  }

  async function saveConfig() {
    try {
      setSavingConfig(true);

      const body: any = {
        dmsBaseUrl,
        dmsUsername,
        branchId,
        branchName,
        syncEnabled,
        syncFrequency,
      };

      if (dmsPassword) {
        body.dmsPassword = dmsPassword;
      }

      const res = await fetch(`/api/companies/${companyId}/dms-sync/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "DMS config saved");
        setDmsPassword(""); // Clear password field
        loadConfig();
      } else {
        toast.error(data.error || "Failed to save config");
      }
    } catch {
      toast.error("Failed to save DMS config");
    } finally {
      setSavingConfig(false);
    }
  }

  async function runSync() {
    try {
      setSyncing(true);
      setSyncResult(null);

      const res = await fetch(`/api/companies/${companyId}/dms-sync/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
      });

      const data = await res.json();
      setSyncResult(data);

      if (data.success) {
        toast.success(
          `Sync completed! ${data.income.new + data.expense.new} new, ${data.income.matched + data.expense.matched} matched`
        );
      } else {
        toast.error(data.errors?.[0] || "Sync failed");
      }

      loadLogs();
      loadConfig(); // Refresh last sync time
    } catch {
      toast.error("Failed to run DMS sync");
    } finally {
      setSyncing(false);
    }
  }

  function formatDateTime(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  if (loadingConfig) {
    return (
      <div className="flex h-screen">
        <Sidebar companyId={companyId} />
        <main className="flex-1 p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar companyId={companyId} />
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Database className="h-6 w-6" />
                DMS Integration
              </h1>
              <p className="text-gray-500 mt-1">
                Sync income and expense data from the DMS (Packrs Courier
                system)
              </p>
            </div>
            {config.configured && config.lastSyncAt && (
              <div className="text-right text-sm text-gray-500">
                <p>Last synced</p>
                <p className="font-medium">
                  {formatDateTime(config.lastSyncAt)}
                </p>
              </div>
            )}
          </div>

          {/* Configuration Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                DMS Connection Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dmsBaseUrl">DMS Base URL</Label>
                  <Input
                    id="dmsBaseUrl"
                    value={dmsBaseUrl}
                    onChange={(e) => setDmsBaseUrl(e.target.value)}
                    placeholder="https://dms.packrscourier.com.np/dmsadmin"
                  />
                </div>
                <div>
                  <Label htmlFor="dmsUsername">DMS Username (Email)</Label>
                  <Input
                    id="dmsUsername"
                    value={dmsUsername}
                    onChange={(e) => setDmsUsername(e.target.value)}
                    placeholder="admin@packrscourier.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dmsPassword">
                    DMS Password{" "}
                    {config.hasPassword && (
                      <span className="text-green-600 text-xs">
                        (saved - leave blank to keep)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="dmsPassword"
                    type="password"
                    value={dmsPassword}
                    onChange={(e) => setDmsPassword(e.target.value)}
                    placeholder={
                      config.hasPassword ? "Leave blank to keep current" : "Enter password"
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="branchName">Branch</Label>
                  <div className="flex gap-2">
                    <Input
                      id="branchName"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="Head Office"
                      className="flex-1"
                    />
                    <Input
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      placeholder="ID"
                      className="w-20"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="syncFrequency">Sync Frequency</Label>
                  <select
                    id="syncFrequency"
                    value={syncFrequency}
                    onChange={(e) => setSyncFrequency(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="daily">Daily (automatic)</option>
                    <option value="hourly">Hourly (automatic)</option>
                    <option value="manual">Manual only</option>
                  </select>
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncEnabled}
                      onChange={(e) => setSyncEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Auto-sync enabled</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {config.configured ? "Update Settings" : "Save Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Manual Sync Card */}
          {config.configured && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownUp className="h-5 w-5" />
                  Run Sync
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end gap-4">
                  <div>
                    <Label htmlFor="fromDate">From Date</Label>
                    <Input
                      id="fromDate"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="toDate">To Date</Label>
                    <Input
                      id="toDate"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={runSync}
                    disabled={syncing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {syncing ? "Syncing..." : "Sync Now"}
                  </Button>
                </div>

                {/* Sync Result */}
                {syncResult && (
                  <div
                    className={`p-4 rounded-lg border ${
                      syncResult.success
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {syncResult.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <span className="font-medium">
                        {syncResult.success ? "Sync Completed" : "Sync Failed"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-medium text-green-700">Income</p>
                        <p>
                          Fetched: {syncResult.income.fetched} | Matched:{" "}
                          {syncResult.income.matched} | New:{" "}
                          {syncResult.income.new}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-red-700">Expense</p>
                        <p>
                          Fetched: {syncResult.expense.fetched} | Matched:{" "}
                          {syncResult.expense.matched} | New:{" "}
                          {syncResult.expense.new}
                        </p>
                      </div>
                    </div>

                    {syncResult.errors.length > 0 && (
                      <div className="mt-3 text-sm text-red-600">
                        <p className="font-medium">Errors:</p>
                        {syncResult.errors.map((err, i) => (
                          <p key={i} className="ml-2">
                            - {err}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Sync History */}
          {config.configured && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Sync History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingLogs ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No sync history yet. Run your first sync above.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {log.status === "completed" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : log.status === "failed" ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                          ) : (
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                          )}
                          <div>
                            <p className="font-medium text-sm">
                              {log.syncDate}
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs"
                              >
                                {log.syncType}
                              </Badge>
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDateTime(log.startedAt)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p>
                            <span className="text-green-600">
                              {log.incomeCount} income
                            </span>
                            {" / "}
                            <span className="text-red-600">
                              {log.expenseCount} expense
                            </span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {log.matchedCount} matched, {log.newCount} new
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
