import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { prisma } from "../../../../lib/prisma";
import { simplifyDebts, RawTransaction } from "../../../../lib/simplify";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params;
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if the user is a member of the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId
        }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch the group with all relations
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        },
        expenses: {
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                avatarUrl: true
              }
            },
            splits: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true
                  }
                },
                paidByUser: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          },
          orderBy: {
            date: "desc"
          }
        },
        settlements: {
          include: {
            fromUser: {
              select: {
                id: true,
                name: true,
                avatarUrl: true
              }
            },
            toUser: {
              select: {
                id: true,
                name: true,
                avatarUrl: true
              }
            }
          },
          orderBy: {
            date: "desc"
          }
        }
      }
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Calculate balances and construct raw transaction graph
    const rawTransactions: RawTransaction[] = [];

    // 1. Process expenses
    group.expenses.forEach((expense) => {
      // Find who paid what
      // If we support multiple payers, splits store paidAmount per user.
      // If a split has paidAmount > 0, it means that user paid.
      // The users who have owedAmount > 0 owe money.
      const payers = expense.splits.filter((s) => s.paidAmount > 0);
      const debtors = expense.splits.filter((s) => s.owedAmount > 0);

      // We map the splits to transactions: debtors owe payers
      payers.forEach((payer) => {
        const payerTotalPaid = payer.paidAmount;
        if (payerTotalPaid <= 0) return;

        debtors.forEach((debtor) => {
          if (debtor.userId === payer.userId) return; // Can't owe yourself
          
          // Debtor owes their share of this payer's payment
          // Pro-rata distribution: (debtor.owedAmount / totalExpenseAmount) * payer.paidAmount
          const shareRatio = debtor.owedAmount / expense.amount;
          const debtToPayer = payerTotalPaid * shareRatio;

          if (debtToPayer > 0) {
            rawTransactions.push({
              fromUserId: debtor.userId,
              toUserId: payer.userId,
              amount: debtToPayer
            });
          }
        });
      });
    });

    // 2. Process settlements (representing direct paybacks)
    // If A settled with B $20, it means A gave B $20. This offsets A's debt to B.
    // So we add a transaction where B owes A $20 (to offset B's credit or A's debt).
    group.settlements.forEach((settlement) => {
      rawTransactions.push({
        fromUserId: settlement.toUserId, // Receiver "owes back" to sender to offset the debt
        toUserId: settlement.fromUserId,
        amount: settlement.amount
      });
    });

    // Calculate simplified debts
    const simplifiedDebts = simplifyDebts(rawTransactions);

    // Calculate individual net balances in this group
    const memberBalances: Record<string, number> = {};
    group.members.forEach((m) => {
      memberBalances[m.userId] = 0;
    });

    // Run net balance calculations
    rawTransactions.forEach((tx) => {
      const uFrom = tx.fromUserId.toString();
      const uTo = tx.toUserId.toString();
      if (memberBalances[uFrom] !== undefined) memberBalances[uFrom] -= tx.amount;
      if (memberBalances[uTo] !== undefined) memberBalances[uTo] += tx.amount;
    });

    // Convert balances into display format
    const formattedBalances = Object.entries(memberBalances).map(([userId, balance]) => {
      return {
        userId,
        balance: Number(balance.toFixed(2))
      };
    });

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        creatorId: group.createdById
      },
      members: group.members.map((m) => m.user),
      expenses: group.expenses,
      settlements: group.settlements,
      balances: formattedBalances,
      simplifiedDebts
    });
  } catch (error: any) {
    console.error("GET /api/groups/[id] error:", error);
    return NextResponse.json({ error: "Failed to retrieve group details" }, { status: 500 });
  }
}
