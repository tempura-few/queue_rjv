// ตัวเรียก API กลาง (ทุกหน้าใช้ร่วม)
async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign(
    { headers: { "Content-Type": "application/json" }, credentials: "same-origin" },
    opts
  ));
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || "เกิดข้อผิดพลาด (HTTP " + res.status + ")");
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- ตัวช่วยทั่วไป ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromISO(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
const fmtFullTh = (iso) => new Intl.DateTimeFormat("th-TH", { dateStyle: "full" }).format(fromISO(iso));
const fmtDayShort = (iso) => new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(fromISO(iso));
const fmtDateShort = (iso) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(fromISO(iso));
const fmtBaht = (n) => (n === 0 ? "ฟรี" : Number(n).toLocaleString("th-TH") + " บาท");
const nextDays = (n) => Array.from({ length: n }, (_, i) => toISO(new Date(Date.now() + i * 864e5)));
const phoneOk = (p) => /^(0\d{8,9}|\+\d{7,15})$/.test(String(p || "").replace(/[\s\-()]/g, ""));

function renderHeader(activePage) {
  // โหมดฝังในเว็บอื่น (เช่น WordPress): ?embed=1 — ซ่อนหัว/ท้ายเว็บ ให้พอดีหน้าที่ฝัง
  if (new URLSearchParams(location.search).get("embed") === "1") {
    document.body.classList.add("embed");
    const el = $("#siteHeader");
    if (el) el.remove();
    const f = document.querySelector(".site-footer");
    if (f) f.remove();
    return;
  }
  const el = $("#siteHeader");
  if (!el) return;
  el.innerHTML = `
    <div class="header-inner container">
      <a class="brand" href="index.html">
        <span class="brand-logo">🏥</span>
        <span class="brand-name">${CONFIG.hospitalName}</span>
      </a>
      <nav class="header-nav">
        ${activePage === "admin"
          ? `<span class="whoami" id="whoami"></span>
             <a class="nav-link" href="#" id="btnLogout">ออกจากระบบ</a>`
          : `<a class="nav-link ${activePage === "admin" ? "active" : ""}" href="login.html">หน้าเจ้าหน้าที่</a>`}
      </nav>
    </div>`;
}

const STATUS_META = {
  pending: { label: "รอยืนยัน", cls: "badge-pending" },
  confirmed: { label: "ยืนยันแล้ว", cls: "badge-confirmed" },
  cancelled: { label: "ยกเลิก", cls: "badge-cancelled" },
  noshow: { label: "ไม่มาตามนัด", cls: "badge-cancelled" },
};
