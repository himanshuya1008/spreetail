import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import { simplifyDebts, RawTransaction } from "../../../lib/simplify";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch all memberships for this user
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: {
        groupId: true
      }
    });

    const groupIds = memberships.map((m) => m.groupId);

    if (groupIds.length === 0) {
      return NextResponse.json({
        groups: [],
        totalBalance: 0,
        totalYouOwe: 0,
        totalYouAreOwed: 0,
        recentActivity: [],
        chartData: []
      });
    }

    // Fetch all groups with members, expenses, and settlements in parallel
    const groups = await prisma.group.findMany({
      where: { id: { in: groupIds } },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true
              }
            }
          }
        },
        expenses: {
          include: {
            splits: true
          }
        },
        settlements: true
      }
    });

    let totalBalance = 0;
    let totalYouOwe = 0;
    let totalYouAreOwed = 0;
    const groupSummaries = [];
    const categoryTotals: Record<string, number> = {};

    // Calculate balances for each group
    for (const group of groups) {
      const rawTransactions: RawTransaction[] = [];

      // Add expense transactions
      group.expenses.forEach((expense) => {
        const payers = expense.splits.filter((s) => s.paidAmount > 0);
        const debtors = expense.splits.filter((s) => s.owedAmount > 0);

        payers.forEach((payer) => {
          const payerPaid = payer.paidAmount;
          if (payerPaid <= 0) return;

          debtors.forEach((debtor) => {
            if (debtor.userId === payer.userId) return;

            const ratio = debtor.owedAmount / expense.amount;
            const debt = payerPaid * ratio;
            if (debt > 0) {
              rawTransactions.push({
                fromUserId: debtor.userId,
                toUserId: payer.userId,
                amount: debt
              });
            }
          });
        });

        // Track user's spending by category
        // Only if the user owes money on this expense
        const userSplit = expense.splits.find((s) => s.userId === userId);
        if (userSplit && userSplit.owedAmount > 0) {
          const cat = expense.category || "General";
          categoryTotals[cat] = (categoryTotals[cat] || 0) + userSplit.owedAmount;
        }
      });

      // Add settlement transactions
      group.settlements.forEach((settlement) => {
        rawTransactions.push({
          fromUserId: settlement.toUserId,
          toUserId: settlement.fromUserId,
          amount: settlement.amount
        });
      });

      // Calculate net balances in this group
      let groupNetBalance = 0;
      rawTransactions.forEach((tx) => {
        if (tx.fromUserId.toString() === userId) {
          groupNetBalance -= tx.amount;
        }
        if (tx.toUserId.toString() === userId) {
          groupNetBalance += tx.amount;
        }
      });

      const roundedNet = Number(groupNetBalance.toFixed(2));
      totalBalance += roundedNet;

      if (roundedNet < 0) {
        totalYouOwe += Math.abs(roundedNet);
      } else if (roundedNet > 0) {
        totalYouAreOwed += roundedNet;
      }

      // Simplify debts for this group to see direct connections
      const simplified = simplifyDebts(rawTransactions);
      const userSimplified = simplified.filter(
        (d) => d.fromUserId.toString() === userId || d.toUserId.toString() === userId
      );

      groupSummaries.push({
        id: group.id,
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
        updatedAt: group.updatedAt,
        netBalance: roundedNet,
        simplifiedDebts: userSimplified,
        memberCount: group.members.length
      });
    }

    // Fetch the 5 most recent expenses across all user's groups for "recent activity"
    const recentExpenses = await prisma.expense.findMany({
      where: { groupId: { in: groupIds } },
      take: 5,
      orderBy: { date: "desc" },
      include: {
        creator: {
          select: {
            name: true
          }
        },
        group: {
          select: {
            name: true
          }
        }
      }
    });

    const recentActivity = recentExpenses.map((exp) => ({
      id: exp.id,
      type: "EXPENSE",
      description: exp.description,
      amount: exp.amount,
      date: exp.date,
      creatorName: exp.creator.name,
      groupName: exp.group.name
    }));

    // Format category spending for charts
    const chartData = Object.entries(categoryTotals).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2))
    }));

    return NextResponse.json({
      groups: groupSummaries,
      totalBalance: Number(totalBalance.toFixed(2)),
      totalYouOwe: Number(totalYouOwe.toFixed(2)),
      totalYouAreOwed: Number(totalYouAreOwed.toFixed(2)),
      recentActivity,
      chartData
    });
  } catch (error: any) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "Failed to retrieve dashboard details" }, { status: 500 });
  }
}
