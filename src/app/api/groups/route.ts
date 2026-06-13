import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import { z } from "zod";

const createGroupSchema = z.object({
  name: z.string().min(2, "Group name must be at least 2 characters"),
  description: z.string().optional()
});

// GET /api/groups - Retrieve all groups the current user belongs to
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch groups where the user is a member
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
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
            }
          }
        }
      },
      orderBy: {
        group: {
          updatedAt: 'desc'
        }
      }
    });

    const groups = memberships.map(m => m.group);

    return NextResponse.json(groups);
  } catch (error: any) {
    console.error("GET /api/groups error:", error);
    return NextResponse.json({ error: "Failed to retrieve groups" }, { status: 500 });
  }
}

// POST /api/groups - Create a new group and add the creator as a member
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const parsed = createGroupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { name, description } = parsed.data;

    // Create group and add creator as a member inside a transaction
    const group = await prisma.$transaction(async (tx) => {
      const newGroup = await tx.group.create({
        data: {
          name,
          description,
          createdById: userId,
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`
        }
      });

      await tx.groupMember.create({
        data: {
          groupId: newGroup.id,
          userId: userId
        }
      });

      return newGroup;
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/groups error:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
