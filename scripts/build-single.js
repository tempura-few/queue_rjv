// ============================================================
// Build แบบ "ไฟล์เดียว" — รวม store.js + หน้าเว็บทุกไฟล์ (public/) เข้า server
// ผลลัพธ์: dist/server.bundle.js ไฟล์เดียว รันด้วย `node server.bundle.js`
// โหมด STORAGE=json ใช้ได้ทันที / โหมด STORAGE=mysql ต้องมี node_modules/mysql2
// วิธีใช้: node scripts/build-single.js
// ============================================================
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");

function collect(dir, base = "") {
  const out = {};
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? base + "/" + name : name;
    if (fs.statSync(full).isDirectory()) Object.assign(out, collect(full, rel));
    else out[rel] = fs.readFileSync(full, "utf8");
  }
  return out;
}

const assets = collect(PUB);

// ---------- ฝั่ง store: คง require ของตัวเอง (fs/path/crypto) เพราะถูกวางไว้บนสุด ----------
let storeSrc = fs.readFileSync(path.join(ROOT, "store.js"), "utf8").replace(/^"use strict";\s*/, "");
storeSrc = storeSrc.replace(/\bconst db = \{/, "const storeDb = {"); // กันชนชื่อกับฝั่ง server
storeSrc = storeSrc.replace(/\bdb\./g, "storeDb.");
storeSrc = storeSrc.replace(/Object\.assign\(db,/, "Object.assign(storeDb,");
storeSrc = storeSrc.replace(/^module\.exports = \{[\s\S]*?\};\s*$/m,
  'const store = (() => { const impl = MODE === "mysql" ? mysqlMode : jsonMode; return { mode: MODE, db: storeDb, makeUser, ...impl, init: () => impl.init() }; })();');

// ---------- ฝั่ง server: ตัด require ที่ store ประกาศแล้ว (fs/path/crypto) ----------
let src = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
src = src.replace(/^"use strict";\s*/, ""); // directive อยู่บนสุดของ bundle แล้ว
src = src.replace(/^const store = require\("\.\/store\.js"\);.*$/m, ""); // [BUNDLE-CUT]
src = src.replace(/^const (fs|path|crypto) = require\([^)]*\);\s*$/gm, "");

const banner =
  "// ===== สร้างด้วย scripts/build-single.js — ห้ามแก้ไฟล์นี้โดยตรง (แก้ต้นฉบับแล้ว build ใหม่) =====\n" +
  "// โหมด STORAGE=json ใช้ได้ทันที · โหมด STORAGE=mysql ต้องมี node_modules/mysql2 เคียงข้าง\n" +
  '"use strict";\n' +
  "globalThis.__EMBEDDED_ASSETS = " + JSON.stringify(assets) + ";\n";

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
const outFile = path.join(ROOT, "dist", "server.bundle.js");
fs.writeFileSync(outFile, banner + storeSrc + "\n" + src);

const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`สร้าง ${path.relative(ROOT, outFile)} แล้ว — ${kb(fs.statSync(outFile).size)} (store + หน้าเว็บ ${Object.keys(assets).length} ไฟล์)`);
console.log("วิธีรัน: node dist/server.bundle.js   (env เหมือนปกติ: PORT, STORAGE, MYSQL_*)");
