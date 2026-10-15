// ============================================================
// xlsxlite.js — สร้าง/อ่านไฟล์ .xlsx และอ่าน .csv ด้วย Node.js built-in ล้วน
// (ใช้แค่ zlib ในการคลาย ZIP — ไม่มี dependency เพิ่ม ตามสไตล์โปรเจกต์)
//
//   buildTemplate({services, slots, rights, exampleDate, exampleTime}) → Buffer .xlsx
//   readTable(buf, filename) → string[][]  (แถวแรก = หัวคอลัมน์)
//     - .xlsx: อ่าน worksheet แผ่นแรก, รองรับ sharedStrings/inlineStr,
//       วันที่-เวลาที่ Excel เก็บเป็นตัวเลข (serial) จะถูกแปลงเป็นข้อความ
//       "YYYY-MM-DD" / "HH:MM" โดยดู number format ของเซลล์
//     - .csv: รองรับตัวคั่น , ; และ tab, อ่าน UTF-8 (มี/ไม่มี BOM) และ
//       windows-874 (Excel ภาษาไทยมักบันทึก CSV เป็นรหัสนี้)
// ============================================================
"use strict";
const zlib = require("zlib");

// ---------- ZIP: เขียนแบบไม่บีบอัด (stored) — Excel เปิดได้ปกติ ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);      // version needed
    local.writeUInt16LE(0x0800, 6);  // flags: ชื่อไฟล์เป็น UTF-8
    local.writeUInt16LE(0, 8);       // method: stored (ไม่บีบอัด)
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28); // extra(30) comment(32) disk(34) attr(36..41) ว่าง
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, name]));
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

// ---------- ZIP: อ่าน (รองรับ stored + deflate — ไฟล์จาก Excel ปกติจะ deflate) ----------
function zipRead(buf) {
  const files = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ .xlsx ที่ถูกต้อง");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    // local header: 30 ไบต์ + ชื่อ + extra (ความยาว extra ของ local อาจต่างจาก central)
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + compSize);
    files.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------- XML เล็ก ๆ ----------
const xesc = (s) => String(s ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const xdecode = (s) => String(s)
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const attr = (tag, name) => { const m = tag.match(new RegExp(name + '="([^"]*)"')); return m ? xdecode(m[1]) : null; };

// ---------- แปลงวันที่/เวลาจาก serial ของ Excel ----------
// Excel นับวันตั้งแต่ 1900-01-00 (มีบั๊กปี 1900 อธิกสุรทิน) — จุดตั้งต้นจริงคือ 1899-12-30
function serialToParts(serial) {
  const days = Math.floor(serial);
  const frac = serial - days;
  const d = new Date(Date.UTC(1899, 11, 30) + days * 864e5);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const mins = Math.round(frac * 24 * 60);
  const time = `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { date, time };
}

// จับคู่ cellXfs ว่า style ไหนเป็นรูปแบบวันที่/เวลา → {xfIndex: 'date'|'time'|'datetime'}
function dateStyleMap(stylesXml) {
  const out = new Map();
  if (!stylesXml) return out;
  const BUILTIN = { 14: "date", 15: "date", 16: "date", 17: "date", 18: "time", 19: "time", 20: "time", 21: "time", 22: "datetime", 45: "time", 46: "time", 47: "datetime" };
  const custom = new Map();
  const fmtRe = /<numFmt\b[^>]*\/?>(?:<\/numFmt>)?/g;
  let m;
  while ((m = fmtRe.exec(stylesXml))) {
    const id = attr(m[0], "numFmtId"), code = attr(m[0], "formatCode");
    if (id && code != null) custom.set(id, code);
  }
  const kindOf = (id) => {
    if (custom.has(id)) {
      const c = custom.get(id).replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[\$-[^\]]*\]/g, "").replace(/AM\/PM/gi, "");
      const hasTime = /[hs]/i.test(c);
      const hasDate = /[dy]/i.test(c) || (/m/i.test(c) && !hasTime); // m ที่ไม่ได้อยู่กับ ชม. = เดือน
      return hasDate && hasTime ? "datetime" : hasDate ? "date" : hasTime ? "time" : null;
    }
    return BUILTIN[Number(id)] || null;
  };
  const cellXfs = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (cellXfs) {
    const xfs = cellXfs[1].match(/<xf\b[^>]*\/?>(?:<\/xf>)?/g) || [];
    xfs.forEach((xf, i) => {
      const id = attr(xf, "numFmtId");
      if (id != null) { const k = kindOf(id); if (k) out.set(i, k); }
    });
  }
  return out;
}

// ---------- อ่าน worksheet → แถวของค่าเซลล์ ----------
function colIndex(ref) {
  let c = 0;
  for (const ch of String(ref).replace(/\d+$/, "")) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}
function parseSheet(sheetXml, shared, styleMap) {
  const rows = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(sheetXml))) {
    // ใช้เลขแถวจริงจาก attribute r — แถวว่างที่โดนลบเนื้อหาจะกลายเป็นแถวว่างคั่น ไม่ทำให้เลขกลับกัน
    const rowNum = Number(attr(rm[1], "r")) || rows.length + 1;
    while (rows.length < rowNum - 1) rows.push([]);
    const cells = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const tags = cm[1], body = cm[2] || "";
      const ref = attr(tags, "r");
      const type = attr(tags, "t");
      const styleIdx = attr(tags, "s");
      let value = "";
      if (type === "inlineStr") {
        const ts = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
        value = ts.map((t) => xdecode(t.replace(/<[^>]*>/g, ""))).join("");
      } else {
        const vm = body.match(/<v>([\s\S]*?)<\/v>/);
        const raw = vm ? xdecode(vm[1]) : "";
        if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
        else if (type === "e" || raw === "") value = "";
        else if (styleIdx != null && styleMap.has(Number(styleIdx)) && /^\d+(\.\d+)?$/.test(raw)) {
          // เซลล์ตัวเลขที่มีรูปแบบวันที่/เวลา → แปลงเป็นข้อความมาตรฐาน
          const k = styleMap.get(Number(styleIdx));
          const { date, time } = serialToParts(Number(raw));
          value = k === "date" ? date : k === "time" ? time : `${date} ${time}`;
        } else value = raw; // ตัวเลขเก็บเป็นข้อความตรง ๆ (กันศูนย์หน้าเบอร์โทรหลุด)
      }
      cells[colIndex(ref || "")] = value;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

// ---------- อ่าน .xlsx ทั้งไฟล์ ----------
function readXlsx(buf) {
  const files = zipRead(buf);
  const get = (n) => files.get(n) ? files.get(n).toString("utf8") : "";
  // sharedStrings: สตริงที่ Excel รวมไว้ใช้ร่วม
  const shared = [];
  const ssXml = get("xl/sharedStrings.xml");
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let sm;
  while ((sm = siRe.exec(ssXml))) {
    const ts = sm[1].match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
    shared.push(ts.map((t) => xdecode(t.replace(/<[^>]*>/g, ""))).join(""));
  }
  const styleMap = dateStyleMap(get("xl/styles.xml"));
  // หา worksheet แผ่นแรกตามลำดับใน workbook (+ ตำแหน่งไฟล์จาก rels)
  const wbXml = get("xl/workbook.xml");
  const relsXml = get("xl/_rels/workbook.xml.rels");
  const relTarget = {};
  let rmm;
  const relRe = /<Relationship\b[^>]*\/?>(?:<\/Relationship>)?/g;
  while ((rmm = relRe.exec(relsXml))) {
    const id = attr(rmm[0], "Id"), target = attr(rmm[0], "Target");
    if (id && target) relTarget[id] = target.replace(/^\//, "").replace(/^(?!xl\/)/, "xl/");
  }
  const sheetRe = /<sheet\b[^>]*\/?>(?:<\/sheet>)?/g;
  let first = "";
  let shm;
  while ((shm = sheetRe.exec(wbXml))) {
    const rid = shm[0].match(/r:id="([^"]*)"/);
    const t = rid ? relTarget[xdecode(rid[1])] : "";
    if (t) { first = t; break; }
  }
  const sheetXml = first && files.has(first) ? files.get(first).toString("utf8") : get("xl/worksheets/sheet1.xml");
  if (!sheetXml) throw new Error("ไม่พบข้อมูลตารางในไฟล์ .xlsx");
  return parseSheet(sheetXml, shared, styleMap);
}

// ---------- CSV ----------
function decodeText(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString("utf8", 3);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch {}
  for (const enc of ["windows-874", "tis-620", "iso-8859-11"]) {
    try { return new TextDecoder(enc).decode(buf); } catch {}
  }
  return buf.toString("latin1");
}
function parseCsv(text) {
  const nl = text.indexOf("\n");
  const firstLine = nl >= 0 ? text.slice(0, nl) : text;
  const count = (s, ch) => s.split(ch).length - 1;
  const delim = [",", ";", "\t"].reduce((best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best), ",");
  const rows = [];
  let row = [], cell = "", inQ = false;
  const pushCell = () => { row.push(cell); cell = ""; };
  const pushRow = () => { pushCell(); if (row.some((c) => String(c).trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) pushCell();
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; pushRow(); }
    else cell += ch;
  }
  if (cell !== "" || row.length) pushRow();
  return rows;
}

function readTable(buf, filename) {
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
  const name = String(filename || "").toLowerCase();
  if (!isZip && !name.endsWith(".xlsx")) return parseCsv(decodeText(buf)); // .csv / .txt
  return readXlsx(buf);
}

// ---------- สร้างเทมเพลต .xlsx ----------
function colLetter(i) {
  let s = "";
  for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function sheetCell(col, rowIdx, value, style) {
  const ref = colLetter(col) + rowIdx;
  const s = style != null ? ` s="${style}"` : "";
  if (typeof value === "number" && isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  const t = String(value ?? "");
  const sp = /^\s|\s$|\n/.test(t) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"${s}><is><t${sp}>${xesc(t)}</t></is></c>`;
}
function sheetXml({ cols, widths, dataRows, freezeHeader, validations }) {
  const colXml = widths ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${i === 1 ? ' style="2"' : ""}/>`).join("")}</cols>` : "";
  const view = `<sheetViews><sheetView workbookViewId="0">${freezeHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ""}</sheetView></sheetViews>`;
  const rowsXml = dataRows.map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => sheetCell(c, r + 1, v, r === 0 ? 1 : undefined)).join("")}</row>`).join("");
  const dv = validations && validations.length
    ? `<dataValidations count="${validations.length}">${validations.map((v) =>
        `<dataValidation type="list" allowBlank="1" showErrorMessage="${v.strict ? 1 : 0}" sqref="${v.sqref}"><formula1>"${xesc(v.list)}"</formula1></dataValidation>`).join("")}</dataValidations>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${colXml}<sheetData>${rowsXml}</sheetData>${dv}</worksheet>`;
}

function buildTemplate({ services, slots, rights, exampleDate, exampleTime }) {
  const HEADERS = ["ลำดับ", "วันที่", "เวลา", "บริการ", "รายการย่อย", "ชื่อ-นามสกุล", "เบอร์โทร", "อีเมล", "สิทธิการรักษา", "หมายเหตุ"];
  const svcList = (services || []).filter((s) => s.active !== false);
  // สรุปเวลาของบริการสำหรับชีตอ้างอิง — โหมดรายวัน (slotsByDay) แสดงเวลาของแต่ละวัน
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DOW_TH = { 1: "จ", 2: "อ", 3: "พ", 4: "พฤ", 5: "ศ", 6: "ส", 0: "อา" };
  const svcSlotsNote = (s) => {
    if (s.slotsByDay && typeof s.slotsByDay === "object" && Object.keys(s.slotsByDay).length)
      return " (เวลารายวัน: " + DOW_ORDER.filter((d) => (s.slotsByDay[String(d)] || []).length).map((d) => `${DOW_TH[d]} ${s.slotsByDay[String(d)].join(",")}`).join(" · ") + ")";
    return s.slots ? " (เวลาเฉพาะ: " + s.slots.join(", ") + ")" : "";
  };
  // เลือกบริการที่มีรายการย่อยมาทำแถวตัวอย่าง (รายการย่อยเป็น optional — บางบริการอาจไม่มี)
  const withItems = svcList.filter((s) => Array.isArray(s.items) && s.items.length);
  const s0 = withItems[0] || svcList[0] || { name: "บริการ", items: [{ name: "รายการ" }] };
  const s1 = withItems[1] || s0;
  const sampleRows = [
    [1, exampleDate, exampleTime, s0.name, s0.items[0].name, "ตัวอย่าง สมชาย ใจดี", "0812345678", "", rights[0] || "ชำระเงินเอง", "แถวตัวอย่าง — ลบแถวนี้ก่อนใช้งานจริง"],
    [2, exampleDate, exampleTime, s0.name, s0.items[Math.min(1, s0.items.length - 1)].name, "ตัวอย่าง Aye Chan", "+959876543210", "aye.chan@email.com", rights[rights.length - 1] || "อื่น ๆ", ""],
    [3, exampleDate, exampleTime, s1.name, s1.items[0].name, "ตัวอย่าง มาลี มีสุข", "", "", rights[1] || "อื่น ๆ", "ไม่ทราบเบอร์ — เว้นว่างได้"],
  ];
  const svcNames = svcList.map((s) => s.name);
  const joinable = (arr) => arr.every((x) => !/["“”,]/.test(x)) && `"${arr.join(",")}"`.length <= 255;
  const sheet1 = sheetXml({
    widths: [6, 13, 8, 18, 22, 24, 15, 22, 24, 26],
    dataRows: [HEADERS, ...sampleRows],
    freezeHeader: true,
    validations: [
      joinable(svcNames) ? { sqref: "D2:D2000", list: svcNames.join(","), strict: true } : null,
      joinable(rights) ? { sqref: "I2:I2000", list: rights.join(","), strict: true } : null,
      joinable(slots) ? { sqref: "C2:C2000", list: slots.join(","), strict: false } : null,
    ].filter(Boolean),
  });
  const refRows = [
    ["ค่าที่กรอกได้ (อ้างอิง)", ""],
    ["วิธีใช้", "1 แถว = 1 ผู้รับบริการ · ลบแถวตัวอย่างออกก่อนส่ง · ต้องมี วันที่ เวลา บริการ ชื่อ ทุกแถว"],
    ["รูปแบบวันที่", `${exampleDate} หรือ 15/10/2026 (ค.ศ.) หรือ 15/10/2569 (พ.ศ.) — พิมพ์เป็นวันที่ Excel ก็ได้`],
    ["รูปแบบเวลา", `${exampleTime} (ต้องตรงกับช่วงเวลาที่เปิดของบริการนั้น ๆ)`],
    ["เบอร์โทร", "0812345678 หรือ +95… — เว้นว่างได้ถ้าไม่ทราบ (ไม่มีเบอร์แนะนำใส่อีเมลแทน)"],
    ["อีเมล", "กรอกถ้ามี (แนะนำสำหรับผู้ป่วยต่างชาติ — ใช้ติดต่อเมื่อโทรไม่ได้) เว้นว่างได้"],
    ["สิทธิการรักษา", rights.join(" · ")],
    ["ช่วงเวลา (ค่ากลาง)", slots.join(", ")],
    ...svcList.map((s) => [`${s.icon || "•"} ${s.name}${svcSlotsNote(s)}`, (s.items || []).map((i) => i.name).join(" · ")]),
    ["หมายเหตุ", "ตอนนำเข้า ระบบจะตรวจทุกแถวก่อน — แถวที่ไม่ผ่าน (เช่น เวลาเต็ม/ข้อมูลไม่ครบ) จะถูกข้ามพร้อมบอกเหตุผล"],
  ];
  const sheet2 = sheetXml({ widths: [30, 90], dataRows: refRows.map((r) => [r[0], r[1]]) });
  const xmlDecl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const parts = [
    { name: "[Content_Types].xml", data: xmlDecl +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>" },
    { name: "_rels/.rels", data: xmlDecl +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>" },
    { name: "xl/workbook.xml", data: xmlDecl +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="รายชื่อจองคิว" sheetId="1" r:id="rId1"/><sheet name="ค่าที่กรอกได้" sheetId="2" r:id="rId2"/></sheets>' +
      "</workbook>" },
    { name: "xl/_rels/workbook.xml.rels", data: xmlDecl +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>" },
    { name: "xl/styles.xml", data: xmlDecl +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      "<xf/>" + // 0: ปกติ
      '<xf fontId="1" applyFont="1"/>' + // 1: หัวตารางตัวหนา
      '<xf numFmtId="49" applyNumberFormat="1"/> ' + // 2: ข้อความ (คอลัมน์วันที่ — กัน Excel เปลี่ยนเป็นเลข/จัดรูปแบบเอง)
      "</cellXfs>" +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>" },
    { name: "xl/worksheets/sheet1.xml", data: sheet1 },
    { name: "xl/worksheets/sheet2.xml", data: sheet2 },
  ];
  return zipStore(parts);
}

const xlsxlite = { zipStore, zipRead, readXlsx, parseCsv, decodeText, readTable, buildTemplate };
module.exports = xlsxlite;
