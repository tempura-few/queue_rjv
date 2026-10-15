import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  await core.ensureInit();
  const sp = new URL(request.url).searchParams;
  const serviceId = sp.get("service");
  const date = sp.get("date");
  const s = core.svc(serviceId);
  if (!s || !core.isDateOk(date)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  return NextResponse.json({ slots: core.slotsForDate(serviceId, date).map((t) => ({ time: t, remaining: core.remaining(serviceId, date, t) })) });
}
