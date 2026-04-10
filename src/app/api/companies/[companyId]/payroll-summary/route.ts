import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// GET — comprehensive payroll summary for reports
export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const access = await verifyAccess(session.user.id, params.companyId);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const month = url.searchParams.get("month"); // optional: YYYY-MM

    // Staff summary
    const staffSummary: any[] = await prisma.$queryRawUnsafe(
      `SELECT role, COUNT(*) as count, SUM(salary_amount) as total_salary
       FROM staff WHERE company_id = ? AND is_active = 1
       GROUP BY role ORDER BY count DESC`,
      params.companyId
    );

    // Salary payments summary
    let salaryWhere = `company_id = '${params.companyId}'`;
    if (month) salaryWhere += ` AND month = '${month}'`;
    const salarySummary: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total_payments,
              COALESCE(SUM(amount), 0) as gross_salary,
              COALESCE(SUM(deductions), 0) as total_deductions,
              COALESCE(SUM(bonus), 0) as total_bonus,
              COALESCE(SUM(net_amount), 0) as net_paid
       FROM salary_payments WHERE ${salaryWhere}`
    );

    // Salary by payment method
    const salaryByMethod: any[] = await prisma.$queryRawUnsafe(
      `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(net_amount), 0) as total
       FROM salary_payments WHERE ${salaryWhere}
       GROUP BY payment_method ORDER BY total DESC`
    );

    // Monthly salary trend (last 6 months)
    const salaryTrend: any[] = await prisma.$queryRawUnsafe(
      `SELECT month, COALESCE(SUM(net_amount), 0) as total, COUNT(*) as staff_count
       FROM salary_payments WHERE company_id = ?
       GROUP BY month ORDER BY month DESC LIMIT 6`,
      params.companyId
    );

    // Advance payments summary
    const advanceSummary: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total_advances,
              COALESCE(SUM(amount), 0) as total_given,
              COALESCE(SUM(due_amount), 0) as total_outstanding,
              COALESCE(SUM(amount - due_amount), 0) as total_recovered
       FROM advance_payments WHERE company_id = ?`,
      params.companyId
    );

    // Top advance holders
    const topAdvanceHolders: any[] = await prisma.$queryRawUnsafe(
      `SELECT s.name, s.role, SUM(ap.due_amount) as total_due, COUNT(ap.id) as advance_count
       FROM advance_payments ap
       LEFT JOIN staff s ON s.id = ap.staff_id
       WHERE ap.company_id = ? AND ap.status != 'recovered'
       GROUP BY ap.staff_id ORDER BY total_due DESC LIMIT 10`,
      params.companyId
    );

    // Daily cash summary
    let cashWhere = `company_id = '${params.companyId}'`;
    if (month) {
      cashWhere += ` AND date LIKE '${month}%'`;
    }
    const cashSummary: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total_entries, COALESCE(SUM(amount), 0) as total_amount
       FROM daily_cash_payments WHERE ${cashWhere} AND status = 'approved'`
    );

    const cashByCategory: any[] = await prisma.$queryRawUnsafe(
      `SELECT category, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM daily_cash_payments WHERE ${cashWhere} AND status = 'approved'
       GROUP BY category ORDER BY total DESC`
    );

    // Convert all BigInt values from Prisma/SQLite to plain numbers for JSON serialization
    return NextResponse.json({
      staffSummary: staffSummary.map((s: any) => ({
        role: s.role,
        count: Number(s.count),
        totalSalary: Number(s.total_salary || 0),
      })),
      salary: {
        total_payments: Number(salarySummary[0]?.total_payments || 0),
        gross_salary: Number(salarySummary[0]?.gross_salary || 0),
        total_deductions: Number(salarySummary[0]?.total_deductions || 0),
        total_bonus: Number(salarySummary[0]?.total_bonus || 0),
        net_paid: Number(salarySummary[0]?.net_paid || 0),
        byMethod: salaryByMethod.map((m: any) => ({
          method: m.payment_method,
          count: Number(m.count),
          total: Number(m.total),
        })),
        trend: salaryTrend.reverse().map((t: any) => ({
          month: t.month,
          total: Number(t.total),
          staff_count: Number(t.staff_count),
        })),
      },
      advances: {
        total_advances: Number(advanceSummary[0]?.total_advances || 0),
        total_given: Number(advanceSummary[0]?.total_given || 0),
        total_outstanding: Number(advanceSummary[0]?.total_outstanding || 0),
        total_recovered: Number(advanceSummary[0]?.total_recovered || 0),
        topHolders: topAdvanceHolders.map((h: any) => ({
          name: h.name,
          role: h.role,
          totalDue: Number(h.total_due),
          advanceCount: Number(h.advance_count),
        })),
      },
      dailyCash: {
        total_entries: Number(cashSummary[0]?.total_entries || 0),
        total_amount: Number(cashSummary[0]?.total_amount || 0),
        byCategory: cashByCategory.map((c: any) => ({
          category: c.category,
          count: Number(c.count),
          total: Number(c.total),
        })),
      },
    });
  } catch (error) {
    console.error("GET /payroll-summary error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
