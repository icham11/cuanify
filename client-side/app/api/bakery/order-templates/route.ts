import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const templates = await prisma.orderTemplate.findMany({
      where: { businessId: auth.businessId },
      include: {
        fields: {
          orderBy: { displayOrder: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(templates);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const { name, typeKey, isActive, fields } = body;

    if (!name || !typeKey) {
      return NextResponse.json(
        { error: "Nama dan Type Key wajib diisi" },
        { status: 400 }
      );
    }

    const template = await prisma.orderTemplate.create({
      data: {
        businessId: auth.businessId,
        name,
        typeKey,
        isActive: isActive ?? true,
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
