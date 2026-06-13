import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import "dotenv/config";

async function main() {
  console.log("Start seeding...");

  // Clean the database
  await prisma.chatMessage.deleteMany({});
  await prisma.settlement.deleteMany({});
  await prisma.expenseSplit.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.groupMember.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.user.deleteMany({});

  console.log("Database cleared. Seeding users...");

  // Create Users
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("password123", salt);

  const alice = await prisma.user.create({
    data: {
      name: "Alice Smith",
      email: "alice@example.com",
      passwordHash,
      avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=Alice"
    }
  });

  const bob = await prisma.user.create({
    data: {
      name: "Bob Jones",
      email: "bob@example.com",
      passwordHash,
      avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=Bob"
    }
  });

  const charlie = await prisma.user.create({
    data: {
      name: "Charlie Brown",
      email: "charlie@example.com",
      passwordHash,
      avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=Charlie"
    }
  });

  const david = await prisma.user.create({
    data: {
      name: "David Miller",
      email: "david@example.com",
      passwordHash,
      avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=David"
    }
  });

  console.log(`Users seeded: ${alice.name}, ${bob.name}, ${charlie.name}, ${david.name}`);

  // Create Groups
  const group1 = await prisma.group.create({
    data: {
      name: "Roomies Trip 2026",
      description: "Expenses for our cabin trip to Tahoe",
      createdById: alice.id,
      avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=Tahoe"
    }
  });

  const group2 = await prisma.group.create({
    data: {
      name: "Apartment 4B Bills",
      description: "Rent, utilities, and groceries for Apartment 4B",
      createdById: bob.id,
      avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=Apt"
    }
  });

  console.log(`Groups seeded: ${group1.name}, ${group2.name}`);

  // Create Group Memberships
  // Group 1: Alice, Bob, Charlie
  await prisma.groupMember.createMany({
    data: [
      { groupId: group1.id, userId: alice.id },
      { groupId: group1.id, userId: bob.id },
      { groupId: group1.id, userId: charlie.id }
    ]
  });

  // Group 2: Alice, Bob, David
  await prisma.groupMember.createMany({
    data: [
      { groupId: group2.id, userId: alice.id },
      { groupId: group2.id, userId: bob.id },
      { groupId: group2.id, userId: david.id }
    ]
  });

  console.log("Group memberships created.");

  // Create Expenses Group 1 (Tahoe Cabin)
  // Expense 1: Alice paid $300 for Cabin Rental, split equally (100 each)
  const exp1 = await prisma.expense.create({
    data: {
      description: "Cabin Rental",
      amount: 300.00,
      category: "Lodging",
      createdById: alice.id,
      groupId: group1.id,
      date: new Date("2026-06-10T12:00:00Z")
    }
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: exp1.id, userId: alice.id, owedAmount: 100.00, paidAmount: 300.00, paidById: alice.id },
      { expenseId: exp1.id, userId: bob.id, owedAmount: 100.00, paidAmount: 0.00 },
      { expenseId: exp1.id, userId: charlie.id, owedAmount: 100.00, paidAmount: 0.00 }
    ]
  });

  // Expense 2: Bob paid $150.00 for Groceries, split equally (50 each)
  const exp2 = await prisma.expense.create({
    data: {
      description: "Dinner & Drinks",
      amount: 150.00,
      category: "Food",
      createdById: bob.id,
      groupId: group1.id,
      date: new Date("2026-06-11T19:00:00Z")
    }
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: exp2.id, userId: alice.id, owedAmount: 50.00, paidAmount: 0.00 },
      { expenseId: exp2.id, userId: bob.id, owedAmount: 50.00, paidAmount: 150.00, paidById: bob.id },
      { expenseId: exp2.id, userId: charlie.id, owedAmount: 50.00, paidAmount: 0.00 }
    ]
  });

  // Expense 3: Charlie paid $60.00 for Gasoline, split unequally (Alice owes 30, Bob owes 20, Charlie owes 10)
  const exp3 = await prisma.expense.create({
    data: {
      description: "Gasoline",
      amount: 60.00,
      category: "Transport",
      createdById: charlie.id,
      groupId: group1.id,
      date: new Date("2026-06-12T10:00:00Z")
    }
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: exp3.id, userId: alice.id, owedAmount: 30.00, paidAmount: 0.00 },
      { expenseId: exp3.id, userId: bob.id, owedAmount: 20.00, paidAmount: 0.00 },
      { expenseId: exp3.id, userId: charlie.id, owedAmount: 10.00, paidAmount: 60.00, paidById: charlie.id }
    ]
  });

  console.log("Mock expenses seeded for Roomies Trip.");

  // Create Settlements (Bob settled with Alice $50.00)
  await prisma.settlement.create({
    data: {
      groupId: group1.id,
      fromUserId: bob.id,
      toUserId: alice.id,
      amount: 50.00,
      date: new Date("2026-06-12T15:00:00Z")
    }
  });

  console.log("Mock settlements seeded.");

  console.log("Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
