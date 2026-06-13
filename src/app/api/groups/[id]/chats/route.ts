import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { prisma } from "../../../../../lib/prisma";
import { z } from "zod";

const createMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  expenseId: z.string().nullable().optional()
});

// GET /api/groups/[id]/chats - Get chat messages
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

    // Check membership
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

    const { searchParams } = new URL(request.url);
    const expenseId = searchParams.get("expenseId");

    // Fetch messages
    const messages = await prisma.chatMessage.findMany({
      where: {
        groupId,
        expenseId: expenseId || null
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return NextResponse.json(messages);
  } catch (error: any) {
    console.error("GET /api/groups/[id]/chats error:", error);
    return NextResponse.json({ error: "Failed to retrieve messages" }, { status: 500 });
  }
}

// POST /api/groups/[id]/chats - Save new message
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

    // Check membership
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

    const body = await request.json();
    const parsed = createMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { message, expenseId } = parsed.data;

    // Create the message
    const chatMessage = await prisma.chatMessage.create({
      data: {
        message,
        userId,
        groupId,
        expenseId: expenseId || null
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    return NextResponse.json(chatMessage, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/groups/[id]/chats error:", error);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}
