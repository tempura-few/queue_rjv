import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await core.ensureInit();
  return NextResponse.json({ slots: core.db.slots });
}

export async function PUT(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user || !core.can(user.role, "services.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.slots) || !body.slots.length || body.slots.some((t) => !/^\d{2}:\d{2}$/.test(t)))
    return NextResponse.json({ error: "รูปแบบช่วงเวลาไม่ถูกต้อง" }, { status: 400 });
  core.db.slots = [...new Set(body.slots)].sort();
  await core.store.replaceSlots();
  await core.audit(user, "slots_update", core.db.slots.join(","));
  return NextResponse.json({ slots: core.db.slots });
}
