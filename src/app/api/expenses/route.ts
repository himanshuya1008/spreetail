import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import { calculateSplits } from "../../../lib/simplify";
import { z } from "zod";

const createExpenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  date: z.string().optional(),
  category: z.string().optional(),
  groupId: z.string(),
  payerId: z.string(),
  splitMethod: z.enum(['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARES']),
  participants: z.array(
    z.object({
      userId: z.string(),
      amountOwed: z.number().optional(),
      percentage: z.number().optional(),
      shares: z.number().optional()
    })
  ).min(1, "At least one participant is required")
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const parsed = createExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const {
      description,
      amount,
      date,
      category,
      groupId,
      payerId,
      splitMethod,
      participants
    } = parsed.data;

    // 1. Verify group membership for requester
    const requesterMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId
        }
      }
    });

    if (!requesterMembership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 2. Calculate owed amounts based on split method
    let calculatedSplits;
    try {
      calculatedSplits = calculateSplits(amount, payerId, participants, splitMethod);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // 3. Create expense and splits in a database transaction
    const expense = await prisma.$transaction(async (tx) => {
      // Create the main expense
      const newExpense = await tx.expense.create({
        data: {
          description,
          amount,
          date: date ? new Date(date) : new Date(),
          category: category || "General",
          createdById: userId,
          groupId
        }
      });

      // Prepare split objects
      // All participants owe money (owedAmount)
      // The payer pays the entire amount (paidAmount)
      // We must combine these because a user can be both the payer and a debtor (owes money).
      // Let's create a map of userId -> splitData
      const splitDataMap: Record<string, { owedAmount: number; paidAmount: number }> = {};

      // Initialize all split participants with calculated owedAmount
      calculatedSplits.forEach((split) => {
        splitDataMap[split.userId.toString()] = {
          owedAmount: split.owedAmount,
          paidAmount: 0
        };
      });

      // Ensure the payer is also tracked in the splits (even if they owe 0)
      if (!splitDataMap[payerId]) {
        splitDataMap[payerId] = {
          owedAmount: 0,
          paidAmount: 0
        };
      }

      // Assign the paidAmount to the payer
      splitDataMap[payerId].paidAmount = amount;

      // Save splits to database
      const splitPromises = Object.entries(splitDataMap).map(([splitUserId, data]) => {
        return tx.expenseSplit.create({
          data: {
            expenseId: newExpense.id,
            userId: splitUserId,
            owedAmount: data.owedAmount,
            paidAmount: data.paidAmount,
            // If they paid, hook up the paidByUser relation
            paidById: data.paidAmount > 0 ? splitUserId : null
          }
        });
      });

      await Promise.all(splitPromises);

      // Trigger a group updated time update
      await tx.group.update({
        where: { id: groupId },
        data: { updatedAt: new Date() }
      });

      return newExpense;
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/expenses error:", error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}
