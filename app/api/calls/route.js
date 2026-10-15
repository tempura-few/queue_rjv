import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!core.db.bookings.some((b) => b.code === body.code)) return NextResponse.json({ error: "ไม่พบคิว" }, { status: 404 });
  await core.store.markCall(body.code, new Date().toISOString());
  await core.audit(user, "call_marked", body.code);
  return NextResponse.json({ ok: true });
}
