import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// สาธารณะ: เทมเพลต Excel สำหรับตัวแทน (ไม่มีข้อมูลผู้ป่วย — ส่งไฟล์ให้ตัวแทนได้เลย)
export async function GET() {
  await core.ensureInit();
  const buf = core.xlsxlite.buildTemplate({
    services: core.db.services, slots: core.db.slots, rights: core.RIGHTS_WHITELIST,
    exampleDate: core.datePlus(2), exampleTime: core.db.slots[0] || "09:00",
  });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="agency-queue-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
