import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const passwordHash = await hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@packrs.com" },
    update: {},
    create: {
      email: "admin@packrs.com",
      passwordHash,
      name: "Admin User",
      role: "super_admin",
    },
  });
  console.log("Created admin user:", admin.email);

  // Create a sample company
  const company = await prisma.company.upsert({
    where: { id: "packrs-courier-main" },
    update: {},
    create: {
      id: "packrs-courier-main",
      name: "Packrs Courier",
      panVat: "123456789",
      currency: "NPR",
      createdById: admin.id,
    },
  });
  console.log("Created company:", company.name);

  // Link admin to company
  await prisma.companyUser.upsert({
    where: {
      companyId_userId: { companyId: company.id, userId: admin.id },
    },
    update: {},
    create: {
      companyId: company.id,
      userId: admin.id,
      role: "company_admin",
    },
  });

  // Create income categories
  const incomeCategories = [
    "Delivery Fee",
    "COD Commission",
    "Monthly Subscription",
    "Warehouse Rental",
    "Late Payment Fees",
  ];
  for (const name of incomeCategories) {
    await prisma.category.create({
      data: { companyId: company.id, name, type: "income" },
    });
  }

  // Create expense categories
  const expenseCategories = [
    "Fuel",
    "Salary",
    "Rent",
    "Vehicle Maintenance",
    "Office Supplies",
    "Internet & Phone",
    "Insurance",
    "Packaging Materials",
  ];
  for (const name of expenseCategories) {
    await prisma.category.create({
      data: { companyId: company.id, name, type: "expense" },
    });
  }
  console.log("Created categories");

  // Get categories for transactions
  const deliveryFee = await prisma.category.findFirst({
    where: { companyId: company.id, name: "Delivery Fee" },
  });
  const codCommission = await prisma.category.findFirst({
    where: { companyId: company.id, name: "COD Commission" },
  });
  const fuel = await prisma.category.findFirst({
    where: { companyId: company.id, name: "Fuel" },
  });
  const salary = await prisma.category.findFirst({
    where: { companyId: company.id, name: "Salary" },
  });
  const rent = await prisma.category.findFirst({
    where: { companyId: company.id, name: "Rent" },
  });

  // Create sample transactions for the last 6 months
  const now = new Date();
  const transactions = [];

  for (let monthOffset = 5; monthOffset >= 0; monthOffset--) {
    const month = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const monthStr = (m: Date, d: number) =>
      `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    // Income entries
    transactions.push({
      companyId: company.id,
      type: "income",
      amount: 85000 + Math.floor(Math.random() * 30000),
      categoryId: deliveryFee?.id,
      particulars: "Monthly delivery fees collection",
      date: monthStr(month, 5),
      paymentMethod: "bank",
      createdById: admin.id,
      source: "web",
    });
    transactions.push({
      companyId: company.id,
      type: "income",
      amount: 25000 + Math.floor(Math.random() * 15000),
      categoryId: codCommission?.id,
      particulars: "COD commission for the month",
      date: monthStr(month, 10),
      paymentMethod: "bank",
      createdById: admin.id,
      source: "web",
    });
    transactions.push({
      companyId: company.id,
      type: "income",
      amount: 15000 + Math.floor(Math.random() * 5000),
      categoryId: deliveryFee?.id,
      particulars: "Express delivery premium charges",
      date: monthStr(month, 20),
      paymentMethod: "esewa",
      createdById: admin.id,
      source: "web",
    });

    // Expense entries
    transactions.push({
      companyId: company.id,
      type: "expense",
      amount: 18000 + Math.floor(Math.random() * 5000),
      categoryId: fuel?.id,
      particulars: "Fleet fuel expenses",
      date: monthStr(month, 3),
      paymentMethod: "cash",
      createdById: admin.id,
      source: "web",
    });
    transactions.push({
      companyId: company.id,
      type: "expense",
      amount: 45000,
      categoryId: salary?.id,
      particulars: "Staff salaries",
      date: monthStr(month, 28),
      paymentMethod: "bank",
      createdById: admin.id,
      source: "web",
    });
    transactions.push({
      companyId: company.id,
      type: "expense",
      amount: 15000,
      categoryId: rent?.id,
      particulars: "Office and warehouse rent",
      date: monthStr(month, 1),
      paymentMethod: "bank",
      createdById: admin.id,
      source: "web",
    });
  }

  for (const txn of transactions) {
    await prisma.transaction.create({ data: txn });
  }
  console.log(`Created ${transactions.length} sample transactions`);

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
