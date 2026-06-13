import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { prisma } from "../../../../lib/prisma";
import { calculateSplits } from "../../../../lib/simplify";
import { z } from "zod";

const updateExpenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  date: z.string().optional(),
  category: z.string().optional(),
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: expenseId } = await params;
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if expense exists
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId }
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // Verify group membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: expense.groupId,
          userId
        }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Delete the expense (splits are deleted cascade automatically via schema mapping)
    await prisma.expense.delete({
      where: { id: expenseId }
    });

    // Update group updated time
    await prisma.group.update({
      where: { id: expense.groupId },
      data: { updatedAt: new Date() }
    });

    return NextResponse.json({ message: "Expense deleted successfully" });
  } catch (error: any) {
    console.error("DELETE /api/expenses/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: expenseId } = await params;
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const parsed = updateExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const {
      description,
      amount,
      date,
      category,
      payerId,
      splitMethod,
      participants
    } = parsed.data;

    // Check if expense exists
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId }
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // Verify group membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: expense.groupId,
          userId
        }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Calculate splits
    let calculatedSplits;
    try {
      calculatedSplits = calculateSplits(amount, payerId, participants, splitMethod);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // Run update in transaction
    const updatedExpense = await prisma.$transaction(async (tx) => {
      // 1. Update the base expense record
      const exp = await tx.expense.update({
        where: { id: expenseId },
        data: {
          description,
          amount,
          date: date ? new Date(date) : new Date(),
          category: category || "General"
        }
      });

      // 2. Clear old splits
      await tx.expenseSplit.deleteMany({
        where: { expenseId }
      });

      // 3. Re-create new splits
      const splitDataMap: Record<string, { owedAmount: number; paidAmount: number }> = {};

      calculatedSplits.forEach((split) => {
        splitDataMap[split.userId.toString()] = {
          owedAmount: split.owedAmount,
          paidAmount: 0
        };
      });

      if (!splitDataMap[payerId]) {
        splitDataMap[payerId] = {
          owedAmount: 0,
          paidAmount: 0
        };
      }

      splitDataMap[payerId].paidAmount = amount;

      const splitPromises = Object.entries(splitDataMap).map(([splitUserId, data]) => {
        return tx.expenseSplit.create({
          data: {
            expenseId: exp.id,
            userId: splitUserId,
            owedAmount: data.owedAmount,
            paidAmount: data.paidAmount,
            paidById: data.paidAmount > 0 ? splitUserId : null
          }
        });
      });

      await Promise.all(splitPromises);

      // Update group updated time
      await tx.group.update({
        where: { id: expense.groupId },
        data: { updatedAt: new Date() }
      });

      return exp;
    });

    return NextResponse.json(updatedExpense);
  } catch (error: any) {
    console.error("PUT /api/expenses/[id] error:", error);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}
