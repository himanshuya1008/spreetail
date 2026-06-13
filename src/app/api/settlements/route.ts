import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import { z } from "zod";

const createSettlementSchema = z.object({
  groupId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: z.number().positive("Settlement amount must be positive")
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const parsed = createSettlementSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { groupId, fromUserId, toUserId, amount } = parsed.data;

    // 1. Verify requester is in the group
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

    // 2. Verify both fromUserId and toUserId are in the group
    const memberships = await prisma.groupMember.findMany({
      where: {
        groupId,
        userId: { in: [fromUserId, toUserId] }
      }
    });

    if (memberships.length < 2 && fromUserId !== toUserId) {
      return NextResponse.json(
        { error: "Payer or recipient is not a member of this group" },
        { status: 400 }
      );
    }

    // 3. Create settlement record
    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        fromUserId,
        toUserId,
        amount
      },
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
      }
    });

    // Update group updated time
    await prisma.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() }
    });

    return NextResponse.json(settlement, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/settlements error:", error);
    return NextResponse.json({ error: "Failed to record settlement" }, { status: 500 });
  }
}
