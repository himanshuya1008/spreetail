import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { prisma } from "../../../../../lib/prisma";
import { parseCsv, normalizeName } from "../../../../../lib/csvParser";
import { calculateSplits } from "../../../../../lib/simplify";
import bcrypt from "bcryptjs";

export async function POST(
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

    // 1. Check if group exists and user is a member
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

    // Get body parameters
    const { csvContent, clearExisting } = await request.json();
    if (!csvContent) {
      return NextResponse.json({ error: "CSV content is required" }, { status: 400 });
    }

    // 2. Parse CSV and collect raw data + anomalies
    const { records, settlements, anomalies } = parseCsv(csvContent);

    // 3. Find all unique user names involved in the CSV
    const namesSet = new Set<string>();
    records.forEach((r) => {
      namesSet.add(r.paidBy);
      r.splitWith.forEach((name) => namesSet.add(name));
    });
    settlements.forEach((s) => {
      namesSet.add(s.fromUser);
      namesSet.add(s.toUser);
    });

    const uniqueNames = Array.from(namesSet).filter(Boolean);

    // 4. Resolve users in database (find or create + enroll in group)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash("password123", salt);

    const nameToUserIdMap: Record<string, string> = {};

    for (const name of uniqueNames) {
      // Look for a user with the same name (case-insensitive)
      let dbUser = await prisma.user.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive"
          }
        }
      });

      // If not exists, create the user
      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            name,
            email: `${name.toLowerCase()}.${groupId.substring(0, 5)}@example.com`,
            passwordHash,
            avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${name}`
          }
        });
      }

      nameToUserIdMap[name] = dbUser.id;

      // Ensure they are enrolled in the group
      const memberRecord = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId: dbUser.id
          }
        }
      });

      if (!memberRecord) {
        await prisma.groupMember.create({
          data: {
            groupId,
            userId: dbUser.id
          }
        });
      }
    }

    // 5. Run Database transaction for seeding
    await prisma.$transaction(async (tx) => {
      // Optional: Clear existing transactions to allow a clean slate import
      if (clearExisting) {
        // Clear chat messages first (referential integrity)
        await tx.chatMessage.deleteMany({ where: { groupId } });
        // Clear settlements
        await tx.settlement.deleteMany({ where: { groupId } });
        // Clear expense splits
        await tx.expenseSplit.deleteMany({
          where: {
            expense: { groupId }
          }
        });
        // Clear expenses
        await tx.expense.deleteMany({ where: { groupId } });
      }

      // Create expenses and splits
      for (const record of records) {
        const payerId = nameToUserIdMap[record.paidBy];
        
        // Create main expense
        const expense = await tx.expense.create({
          data: {
            description: record.description,
            amount: record.amount,
            date: record.date,
            category: "General",
            createdById: userId, // Creator is the logged-in user
            groupId
          }
        });

        // Map participants name to ID
        const participantsData = record.participants.map((p) => ({
          userId: nameToUserIdMap[p.name],
          amountOwed: p.amountOwed,
          percentage: p.percentage,
          shares: p.shares
        }));

        // Calculate Splits using core engine logic
        const calculatedSplits = calculateSplits(
          record.amount,
          payerId,
          participantsData,
          record.splitType
        );

        // Prep split maps
        const splitDataMap: Record<string, { owedAmount: number; paidAmount: number }> = {};
        
        // Initialize owedAmounts
        calculatedSplits.forEach((split) => {
          splitDataMap[split.userId.toString()] = {
            owedAmount: split.owedAmount,
            paidAmount: 0
          };
        });

        // Ensure payer is tracked
        if (!splitDataMap[payerId]) {
          splitDataMap[payerId] = {
            owedAmount: 0,
            paidAmount: 0
          };
        }

        // Add paidAmount to payer
        splitDataMap[payerId].paidAmount = record.amount;

        // Insert Splits into DB
        for (const [splitUserId, data] of Object.entries(splitDataMap)) {
          await tx.expenseSplit.create({
            data: {
              expenseId: expense.id,
              userId: splitUserId,
              owedAmount: data.owedAmount,
              paidAmount: data.paidAmount,
              paidById: data.paidAmount > 0 ? splitUserId : null
            }
          });
        }
      }

      // Create settlements
      for (const settlement of settlements) {
        const fromUserId = nameToUserIdMap[settlement.fromUser];
        const toUserId = nameToUserIdMap[settlement.toUser];

        if (fromUserId && toUserId) {
          await tx.settlement.create({
            data: {
              groupId,
              fromUserId,
              toUserId,
              amount: settlement.amount,
              date: settlement.date
            }
          });
        }
      }

      // Update group timestamp
      await tx.group.update({
        where: { id: groupId },
        data: { updatedAt: new Date() }
      });
    });

    // Count statistics
    const stats = {
      totalRows: records.length + settlements.length + anomalies.filter(a => a.actionTaken.includes("Skipped")).length,
      importedExpenses: records.length,
      importedSettlements: settlements.length,
      skippedRows: anomalies.filter(a => a.actionTaken.includes("Skipped")).length,
      anomaliesFound: anomalies.length
    };

    return NextResponse.json({
      success: true,
      stats,
      anomalies
    });

  } catch (error: any) {
    console.error("POST /api/groups/[id]/import error:", error);
    return NextResponse.json({ error: error.message || "Failed to import CSV data" }, { status: 500 });
  }
}
