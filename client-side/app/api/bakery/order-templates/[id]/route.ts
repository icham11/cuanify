import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    const id = parseInt((await params).id);

    const template = await prisma.orderTemplate.findFirst({
      where: { id, businessId: auth.businessId },
      include: {
        fields: {
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    const id = parseInt((await params).id);
    const body = await request.json();
    const { name, typeKey, isActive, fields } = body;

    const existing = await prisma.orderTemplate.findFirst({
      where: { id, businessId: auth.businessId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Template tidak ditemukan" },
        { status: 404 }
      );
    }

    // Delete existing fields first to replace with new ones
    await prisma.orderTemplateField.deleteMany({
      where: { templateId: id },
    });

    const template = await prisma.orderTemplate.update({
      where: { id },
      data: {
        name,
        typeKey,
        isActive,
        fields: {
          create: fields?.map((f: any, index: number) => ({
            key: f.key,
            label: f.label,
            aliases: f.aliases || [],
            isRequired: f.isRequired ?? false,
            displayOrder: f.displayOrder ?? index,
          })) || [],
        },
      },
      include: { fields: true },
    });

    return NextResponse.json(template);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Template dengan type key tersebut sudah ada." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    const id = parseInt((await params).id);

    const existing = await prisma.orderTemplate.findFirst({
      where: { id, businessId: auth.businessId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Template tidak ditemukan" },
        { status: 404 }
      );
    }

    await prisma.orderTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
