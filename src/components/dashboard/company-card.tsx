"use client";

import Link from "next/link";
import { Building2, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface CompanyCardProps {
  id: string;
  name: string;
  currency: string;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  transactionCount: number;
}

export function CompanyCard({
  id,
  name,
  currency,
  totalIncome,
  totalExpense,
  netBalance,
  transactionCount,
}: CompanyCardProps) {
  return (
    <Link href={`/dashboard/companies/${id}`}>
      <Card className="transition-all hover:shadow-md hover:border-primary/30 cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{name}</CardTitle>
              <p className="text-xs text-muted-foreground">{transactionCount} transactions</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> Income
              </p>
              <p className="text-sm font-semibold text-emerald-600">
                {formatCurrency(totalIncome, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-red-500" /> Expense
              </p>
              <p className="text-sm font-semibold text-red-600">
                {formatCurrency(totalExpense, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net</p>
              <p
                className={`text-sm font-semibold ${
                  netBalance >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {formatCurrency(netBalance, currency)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
