import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { prisma } from "../../../../../lib/prisma";
import { z } from "zod";

const addMemberSchema = z.object({
  email: z.string().email("Invalid email format")
});

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

    // Check if the current user is a member (has authority to invite)
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

    const body = await request.json();
    const parsed = addMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const targetEmail = parsed.data.email.toLowerCase();

    // Find user by email
    const targetUser = await prisma.user.findUnique({
      where: { email: targetEmail }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found. They must sign up for WanderLust first." },
        { status: 404 }
      );
    }

    // Check if they are already in the group
    const existingMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUser.id
        }
      }
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: "User is already a member of this group" },
        { status: 400 }
      );
    }

    // Add user as group member
    const newMembership = await prisma.groupMember.create({
      data: {
        groupId,
        userId: targetUser.id
      },
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
    });

    // Return the added user details
    return NextResponse.json(newMembership.user, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/groups/[id]/members error:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
