"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, authClear, toISO, fmtFullTh, fmtDayShort, fmtDateShort, STATUS_META, svcDays, fmtDays, DAY_ORDER, DAY_LABELS, ALL_DAYS } from "@/lib/client.js";
import { CONFIG } from "@/lib/config.js";
import { ROLES, can } from "@/lib/roles.js";
import ThDatePicker from "@/components/ThDatePicker.js";

const PAGE_SIZES = [10, 20, 50, 100];
const ACT = {
  login_ok: "เข้าสู่ระบบ", login_fail: "ล็อกอินไม่สำเร็จ", booking_online: "จองออนไลน์", booking_walkin: "รับคิว walk-in",
  booking_batch: "รับคิวชุด", status_change: "เปลี่ยนสถานะ", reschedule: "เลื่อนนัด", call_marked: "ทำเครื่องหมายโทรแล้ว",
  export_csv: "ส่งออก CSV", services_update: "แก้ไขบริการ", slots_update: "แก้ไขช่วงเวลากลาง",
  agency_import: "นำเข้าคิวจากไฟล์ (ตัวแทน)", agency_import_parse: "ตรวจไฟล์นำเข้า", settings_update: "แก้ไขค่าตั้ง",
  user_create: "เพิ่มผู้ใช้", user_update: "แก้ไขผู้ใช้", user_delete: "ลบผู้ใช้",
};
const roleLabel = (r) => (ROLES[r] ? ROLES[r].label : r);
const SVC_ICONS = ["🩺", "🦷", "✨", "💉", "🌿", "🧠", "👁️", "🦴", "💆", "👶", "🫀", "🔬"];
const DAY_LABELS_FULL = { 1: "จันทร์", 2: "อังคาร", 3: "พุธ", 4: "พฤหัสบดี", 5: "ศุกร์", 6: "เสาร์", 0: "อาทิตย์" };
const getService = (list, id) => list.find((s) => s.id === id);
const slotsFor = (list, id) => { const s = getService(list, id); return s && Array.isArray(s.slots) && s.slots.length ? s.slots : null; };
const nowHHMM = () => String(new Date().getHours()).padStart(2, "0") + String(new Date().getMinutes()).padStart(2, "0");
const chBadge = (source, agencyCode) => {
  const ch = CONFIG.channels[source] || CONFIG.channels.online;
  return <span className={"ch-badge " + ch.cls}>{ch.icon} {ch.label}{agencyCode ? " · " + agencyCode : ""}</span>;
};
// ช่องทางติดต่อของคิว — เบอร์ว่าง/เป็นขีด (ไม่ทราบเบอร์) ใช้อีเมลแสดงแทน
const contactOf = (b) => (b.phone && b.phone !== "-" ? b.phone : b.email ? "✉ " + b.email : "ไม่มีช่องทางติดต่อ");

function Pager({ view, kind, onPage, onSize }) {
  if (!view.total) return null;
  const totalPages = Math.max(1, Math.ceil(view.total / view.size));
  const from = (view.page - 1) * view.size + 1;
  const to = Math.min(view.total, view.page * view.size);
  const nums = [...new Set([1, totalPages, view.page - 1, view.page, view.page + 1])].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const btns = [];
  let prev = 0;
  for (const p of nums) {
    if (p - prev > 1) btns.push(<span key={"gap" + p} className="pg-gap">…</span>);
    btns.push(<button type="button" key={p} className={"pg-btn" + (p === view.page ? " cur" : "")} onClick={() => onPage(p)}>{p}</button>);
    prev = p;
  }
  return (
    <div className="pager">
      <span className="pg-info">แสดง {from}–{to} จาก {view.total.toLocaleString("th-TH")} แถว</span>
      <span className="pg-controls">
        <button type="button" className="pg-btn" disabled={view.page <= 1} onClick={() => onPage(view.page - 1)}>‹</button>
        {btns}
        <button type="button" className="pg-btn" disabled={view.page >= totalPages} onClick={() => onPage(view.page + 1)}>›</button>
        <select className="pg-size" value={view.size} onChange={(e) => onSize(Number(e.target.value))} title="แถวต่อหน้า">
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="pg-per">แถว/หน้า</span>
      </span>
    </div>
  );
}

function Modal({ show, children, onClose, wide }) {
  if (!show) return null;
  return (
    <div className={"modal-overlay" + (show ? " show" : "")} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={wide ? { maxWidth: 840 } : undefined}>{children}</div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [services, setServices] = useState([]);
  const [globalSlots, setGlobalSlots] = useState([]);
  const [tab, setTab] = useState("queue");
  // ตัวกรองวันที่ 2 โหมด: "single" = วันเดียว / "range" = ช่วงจาก–ถึง
  const [dateF, setDateF] = useState({
    mode: "all", // เปิดมาแล้วเห็นคิวทุกวันตามค่าเริ่มต้น — กด "วัน"/"ช่วงวันที่" เพื่อกรองเฉพาะวัน
    date: toISO(new Date()),
    from: toISO(new Date()),
    to: toISO(new Date(Date.now() + 6 * 864e5)),
  });
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // กรองสถานะในตารางคิวรายวัน
  const [agencyFilter, setAgencyFilter] = useState("all"); // กรองตามตัวแทน (ใช้ร่วมกับตัวกรองวันที่/บริการ/สถานะได้)
  const [agencyCodesLive, setAgencyCodesLive] = useState([]); // โค้ดตัวแทนจริงจากฐานข้อมูล (รวมตัวที่พิมพ์เองนอกลิสต์ config)
  const [qSearch, setQSearch] = useState("");
  const [queue, setQueue] = useState({ rows: [], stats: null, page: 1, size: 20, total: 0 });
  const [upcoming, setUpcoming] = useState({ rows: [], calls: {}, page: 1, size: 20, total: 0 });
  // ตัวกรองเฉพาะแท็บ "นัดที่กำลังจะถึง" — เวลาสัมพัทธ์ (วันนี้/พรุ่งนี้/7 วัน) + สถานะโทร ไม่ใช่ตัวกรองวันที่แบบตารางคิว
  const [upWhen, setUpWhen] = useState("all");
  const [upCall, setUpCall] = useState("all");
  const [cb, setCb] = useState({ rows: [], page: 1, size: 20, total: 0 }); // คำขอรอนัดหมาย (บริการไม่มีเวลานัด)
  const [reports, setReports] = useState(null);
  const [logs, setLogs] = useState([]);
  // ตัวกรองของเมนู "ประวัติการใช้งาน" (แท็บแยกสำหรับ admin) — กรอง/แบ่งหน้าฝั่ง client จาก audit ที่โหลดมาทั้งก้อน
  const [logF, setLogF] = useState({ action: "all", user: "all", range: "all", q: "" });
  const [logPage, setLogPage] = useState(1);
  const [logSize, setLogSize] = useState(20);
  const [daysAheadVal, setDaysAheadVal] = useState(14);
  const [daysAheadOrig, setDaysAheadOrig] = useState(14);
  const [daysAheadMsg, setDaysAheadMsg] = useState("");
  // สิทธิการรักษา (Payment / coverage) — rightsCfg = ค่าที่ใช้จริงตามค่าตั้ง, rightsEdit = ฉบับแก้ไขในหน้าตั้งค่า
  const [rightsCfg, setRightsCfg] = useState([]);
  const [rightsEdit, setRightsEdit] = useState([]);
  const [rightsMsg, setRightsMsg] = useState("");
  // เงื่อนไขแท็บ "นัดที่กำลังจะถึง" (โหลดจาก /api/config — บันทึกผ่าน /api/settings)
  const [upCfg, setUpCfg] = useState({ days: 7, includeToday: false, includeNoshow: true });
  const [upCfgOrig, setUpCfgOrig] = useState({ days: 7, includeToday: false, includeNoshow: true });
  const [upCfgMsg, setUpCfgMsg] = useState("");
  // ขั้นยืนยันก่อนเอาค่าตั้งใหม่ไปใช้จริง: { title, changes: [{label, from, to}], action }
  const [confirmSet, setConfirmSet] = useState(null);
  // โมดัลต่าง ๆ
  const [walkin, setWalkin] = useState(null); // {name,phone,service,time,times,rights,agency,loading}
  const [batch, setBatch] = useState(null); // {agency,service,date,time,times,rights,names}
  const [imp, setImp] = useState(null); // {agency, rows, busy}
  const [resched, setResched] = useState(null); // {code,info,date,time,times,err}
  const [cbSched, setCbSched] = useState(null); // นัดเวลาให้คำขอรอนัดหมาย: {code,info,slots,date,time,err}
  // ผลการโทรจากแท็บนัดที่กำลังจะถึง: {code,serviceId,info,mode:""|"resched",date,time,origDate,origTime,times,err,busy}
  const [callResult, setCallResult] = useState(null);
  const [svcModal, setSvcModal] = useState(null); // {id,icon,name,desc,cap,items,slotsWorking,days}
  // popup รายละเอียดผู้จอง — เปิดจากการคลิกแถวในตารางคิวรายวัน (นอกคอลัมน์ "จัดการ")
  const [detail, setDetail] = useState(null);
  // แท็บ "ปฏิทินว่าง" — ภาพรวมที่นั่งคงเหลือรายเดือนของทุกบริการ
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [calData, setCalData] = useState(null);
  const [calSvc, setCalSvc] = useState("all"); // กรองดูเฉพาะบริการ (all = ทุกบริการ)
  const [calDay, setCalDay] = useState(null); // วันที่คลิกเพื่อเจาะดูรายช่วงเวลา (ข้อมูลมาจาก /api/calendar ชุดเดียวกับชิปในช่องวัน)
  // แท็บจัดการผู้ใช้ (admin) — {id,name,username,role} + โมดัลเพิ่ม/แก้ไข {id?,name,username,role,password,invalid}
  const [staff, setStaff] = useState([]);
  const [userModal, setUserModal] = useState(null);
  const impFileRef = useRef(null);

  const svc = useCallback((id) => getService(services, id) || { icon: "❓", name: "บริการที่ถูกลบ", items: [] }, [services]);
  // ปฏิทินในโมดัลเจ้าหน้าที่ (คิวชุด/เลื่อนนัด/นัดคำขอรอนัดหมาย) ปิดวันที่บริการนั้นไม่เปิด
  const dayDisabled = useCallback((serviceId) => (d) => !svcDays(getService(services, serviceId)).includes(d.getDay()), [services]);

  // ปฏิทินว่าง — โหลดข้อมูลที่นั่งคงเหลือของทั้งเดือน (รวมช่องว่างเกินเดือนที่ปฏิทิน 6 สัปดาห์แสดง)
  const loadCalendar = useCallback(async (monthDate) => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    start.setDate(1 - ((start.getDay() + 6) % 7)); // ถอยไปวันจันทร์ก่อนหน้าวันที่ 1 (สัปดาห์ไทยเริ่มจันทร์)
    const end = new Date(start);
    end.setDate(start.getDate() + 41);
    try {
      setCalData(await api(`/api/calendar?from=${toISO(start)}&to=${toISO(end)}`));
    } catch (e) { alert(e.message); }
  }, []);
  useEffect(() => { if (tab === "calendar") loadCalendar(calMonth); }, [tab, calMonth, loadCalendar]);

  // ---------- เริ่มระบบ ----------
  useEffect(() => {
    (async () => {
      try {
        const { user } = await api("/api/me");
        setMe(user);
        document.title = "หน้าเจ้าหน้าที่ — " + CONFIG.hospitalName;
      } catch { router.replace("/login"); return; }
      const [a, b] = await Promise.all([api("/api/services"), api("/api/slots")]);
      setServices(a.services);
      setGlobalSlots(b.slots);
      api("/api/config").then(({ daysAhead, upcoming, rights }) => {
        setDaysAheadVal(daysAhead);
        setDaysAheadOrig(daysAhead);
        if (upcoming) { setUpCfg(upcoming); setUpCfgOrig(upcoming); }
        if (Array.isArray(rights) && rights.length) { setRightsCfg(rights); setRightsEdit(rights.map((r) => ({ ...r }))); }
      }).catch(() => {});
    })();
  }, [router]);

  // โหลดข้อมูลไม่ได้ (เช่น token หมดอายุเพราะ server restart) ต้องแจ้งให้เห็น ไม่ปล่อยเงียบ
  // ให้ปุ่มกดแล้ว "ไม่มีอะไรเกิดขึ้น" — 401 เด้งไปหน้าล็อกอิน, error อื่นเด้งข้อความ
  const handleLoadError = useCallback((e) => {
    if (e && e.status === 401) router.replace("/login");
    else alert("โหลดข้อมูลไม่สำเร็จ: " + (e && e.message ? e.message : e));
  }, [router]);

  const fetchQueuePage = useCallback(async (page, size, filters) => {
    // กรองบางส่วนที่ผู้เรียกส่งมา (เช่นหลังบันทึก walk-in อยากกระโดดไปดูวันนั้น) ยังคงค่าตัวกรองอื่นจาก state เดิม
    const f = Object.assign({ mode: dateF.mode, date: dateF.date, from: dateF.from, to: dateF.to, service: serviceFilter, status: statusFilter, agency: agencyFilter, q: qSearch }, filters || {});
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    else if (f.mode === "all") { /* ทุกวัน — ไม่ส่งเงื่อนไขวันที่ */ }
    else if (f.mode === "range") {
      if (f.from) params.set("from", f.from);
      if (f.to) params.set("to", f.to);
    } else if (f.date) params.set("date", f.date);
    if (f.service !== "all" && f.service) params.set("service", f.service);
    if (f.status && f.status !== "all") params.set("status", f.status);
    if (f.agency && f.agency !== "all") params.set("agency", f.agency);
    params.set("page", page); params.set("pageSize", size);
    let rows, stats, pagination, agencyCodes;
    try {
      ({ bookings: rows, stats, pagination, agencyCodes } = await api("/api/bookings?" + params));
    } catch (e) { handleLoadError(e); return; }
    if (Array.isArray(agencyCodes)) setAgencyCodesLive(agencyCodes);
    const total = pagination ? pagination.total : (stats ? stats.total : rows.length);
    const totalPages = pagination ? pagination.totalPages : Math.max(1, Math.ceil(total / size));
    const p = Math.min(page, totalPages);
    if (!rows.length && page > totalPages) return fetchQueuePage(totalPages, size, filters);
    setQueue((v) => ({ rows, stats, page: p, size, total }));
  }, [dateF, serviceFilter, statusFilter, agencyFilter, qSearch, handleLoadError]);

  const fetchUpcomingPage = useCallback(async (page, size, service) => {
    const params = new URLSearchParams();
    const svcF = service !== undefined ? service : serviceFilter;
    if (svcF !== "all") params.set("service", svcF);
    if (upWhen !== "all") params.set("when", upWhen);
    if (upCall !== "all") params.set("call", upCall);
    params.set("page", page); params.set("pageSize", size);
    let list, calls, pagination;
    try {
      ({ bookings: list, calls, pagination } = await api("/api/upcoming?" + params));
    } catch (e) { handleLoadError(e); return; }
    const total = pagination ? pagination.total : 0;
    const totalPages = pagination ? pagination.totalPages : Math.max(1, Math.ceil(total / size));
    const p = Math.min(page, totalPages);
    if (!list.length && page > totalPages) return fetchUpcomingPage(totalPages, size, service);
    setUpcoming((v) => ({ rows: list, calls, page: p, size, total }));
  }, [serviceFilter, upWhen, upCall, handleLoadError]);

  // แท็บรอนัดหมาย: โชว์เฉพาะที่ยัง "รอนัดหมาย" เป็นค่าเริ่มต้น — นัดเสร็จ (confirmed) หายจากลิสต์งานทันที จะดูย้อนหลังได้ผ่านตัวกรอง
  const [cbStatus, setCbStatus] = useState("pending");
  const fetchCallbacksPage = useCallback(async (page, size) => {
    const params = new URLSearchParams();
    params.set("callback", "1");
    if (serviceFilter !== "all") params.set("service", serviceFilter);
    if (cbStatus !== "all") params.set("status", cbStatus);
    params.set("page", page); params.set("pageSize", size);
    let rows, pagination;
    try {
      ({ bookings: rows, pagination } = await api("/api/bookings?" + params));
    } catch (e) { handleLoadError(e); return; }
    const total = pagination ? pagination.total : 0;
    const totalPages = pagination ? pagination.totalPages : Math.max(1, Math.ceil(total / size));
    const p = Math.min(page, totalPages);
    if (!rows.length && page > totalPages) return fetchCallbacksPage(totalPages, size);
    setCb({ rows, page: p, size, total });
  }, [serviceFilter, cbStatus, handleLoadError]);
  // สลับตัวกรองสถานะในแท็บรอนัดหมาย → โหลดหน้า 1 ใหม่ทันที (effect บูตหลักกันซ้ำด้วย bootedRef)
  useEffect(() => { if (me) fetchCallbacksPage(1, 20); }, [cbStatus]);

  // หน้ารายงาน — เลือกช่วงได้: 7/30/90 วันล่าสุด หรือทั้งหมด (repDays: "7" | "30" | "90" | "all")
  const [repDays, setRepDays] = useState("30");
  // tooltip ลอยติดเมาส์บนกราฟแนวโน้มรายวัน — { date, x, y } เก็บวันที่ของแท่ง + พิกัดเคอร์เซอร์
  const [repHover, setRepHover] = useState(null);
  function repMove(e) {
    const col = e.target && e.target.closest ? e.target.closest(".rep-bar-col") : null;
    if (!col || !col.dataset.date) { setRepHover(null); return; }
    setRepHover({ date: col.dataset.date, x: e.clientX, y: e.clientY });
  }
  const loadReports = useCallback(async () => {
    let rep;
    try {
      rep = await api("/api/report?days=" + repDays);
    } catch (e) { handleLoadError(e); return; }
    setReports(rep);
  }, [repDays, handleLoadError]);
  useEffect(() => { if (tab === "report") loadReports(); }, [tab, loadReports]);

  // ประวัติการใช้งาน (เมนูแยก — admin เท่านั้น) โหลด audit ทั้งก้อน (เก็บสูงสุด 500 รายการ) มากรองฝั่ง client
  const loadLogs = useCallback(async () => {
    try {
      const { logs: l } = await api("/api/logs");
      setLogs(l);
    } catch (e) { handleLoadError(e); }
  }, [handleLoadError]);

  // แท็บจัดการผู้ใช้ (admin เท่านั้น)
  const fetchUsers = useCallback(async () => {
    try {
      const { users } = await api("/api/users");
      setStaff(users);
    } catch (e) { handleLoadError(e); }
  }, [handleLoadError]);

  // โหลดครั้งแรกเมื่อ services/me พร้อม
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current || !services.length || !me) return;
    bootedRef.current = true;
    fetchQueuePage(1, 20);
    fetchUpcomingPage(1, 20);
    fetchCallbacksPage(1, 20);
    loadReports();
    if (can(me.role, "logs.view")) loadLogs();
  }, [services, me, fetchQueuePage, fetchUpcomingPage, fetchCallbacksPage, loadReports, loadLogs]);

  // ฟิลเตอร์เปลี่ยน → กลับหน้า 1
  useEffect(() => {
    if (!bootedRef.current) return;
    fetchQueuePage(1, queue.size);
  }, [dateF, serviceFilter, statusFilter, agencyFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!bootedRef.current) return;
    fetchUpcomingPage(1, upcoming.size);
  }, [serviceFilter, upWhen, upCall]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!bootedRef.current) return;
    fetchCallbacksPage(1, cb.size);
  }, [serviceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ค้นหาแบบ debounce
  useEffect(() => {
    if (!bootedRef.current) return;
    const t = setTimeout(() => fetchQueuePage(1, queue.size), 300);
    return () => clearTimeout(t);
  }, [qSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // เข้าเมนูประวัติการใช้งาน / จัดการผู้ใช้ → ดึงข้อมูลใหม่ให้สด / ตัวกรองเปลี่ยน → กลับไปหน้า 1
  useEffect(() => {
    if (tab === "history" && me && can(me.role, "logs.view")) loadLogs();
    if (tab === "users" && me && can(me.role, "users.manage")) fetchUsers();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLogPage(1); }, [logF]);

  // ตัวเลือกตัวกรองประวัติใช้ข้อมูลจริง — มีกิจกรรม/ผู้ใช้แบบไหนใน audit จึงมีให้เลือกแบบนั้น (เรียงตามชื่อไทยที่แสดง)
  const logActions = useMemo(() => [...new Set(logs.map((l) => l.action))].sort((a, b) => (ACT[a] || a).localeCompare(ACT[b] || b, "th")), [logs]);
  const logUsers = useMemo(() => [...new Set(logs.map((l) => l.user))].sort(), [logs]);
  const filteredLogs = useMemo(() => {
    const q = logF.q.trim().toLowerCase();
    return logs.filter((l) => {
      if (logF.action !== "all" && l.action !== logF.action) return false;
      if (logF.user !== "all" && l.user !== logF.user) return false;
      if (logF.range !== "all") {
        const at = new Date(l.at);
        if (logF.range === "today") { if (at.toDateString() !== new Date().toDateString()) return false; }
        else if (Date.now() - at.getTime() > Number(logF.range) * 864e5) return false;
      }
      if (q && !((l.detail || "").toLowerCase().includes(q) || l.user.toLowerCase().includes(q) || (ACT[l.action] || l.action).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [logs, logF]);

  // ---------- ปุ่มจัดการในแถว ----------
  async function rowAction(code, act) {
    try {
      await api("/api/bookings/" + code, { method: "PATCH", body: JSON.stringify({ status: act }) });
      fetchQueuePage(queue.page, queue.size); // รีเฟรชหน้าเดิมที่ดูอยู่
      loadReports();
    } catch (e) { alert(e.message); }
  }

  async function openResched(code) {
    try {
      const { bookings } = await api("/api/bookings?q=" + code);
      const b = bookings.find((x) => x.code === code);
      if (!b) return;
      setResched({ code, serviceId: b.serviceId, info: `${b.name} · ${svc(b.serviceId).name} · ปัจจุบัน ${b.date ? fmtFullTh(b.date) + " " + b.time + " น." : "📞 รอนัดหมาย (ยังไม่มีวัน–เวลา)"}`, date: b.date, time: b.time, times: [], err: "" });
      const { slots } = await api(`/api/availability?service=${b.serviceId}&date=${b.date}`);
      setResched((r) => r && { ...r, times: slots });
    } catch (e) { alert(e.message); }
  }

  async function reschedFill(date) {
    const b = { ...resched, date };
    setResched(b);
    const { bookings } = await api("/api/bookings?q=" + b.code);
    const bk = bookings.find((x) => x.code === b.code);
    if (!bk || !date) return;
    const { slots } = await api(`/api/availability?service=${bk.serviceId}&date=${date}`);
    setResched((r) => r && { ...r, times: slots, time: date === bk.date ? bk.time : "" });
  }

  async function submitResched(e) {
    e.preventDefault();
    try {
      await api("/api/bookings/" + resched.code, { method: "PATCH", body: JSON.stringify({ date: resched.date, time: resched.time }) });
      setResched(null);
      fetchQueuePage(queue.page, queue.size);
      fetchUpcomingPage(upcoming.page, upcoming.size);
    } catch (err) {
      setResched((r) => r && { ...r, err: err.message });
    }
  }

  // ---------- walk-in (รับ prefill จากคำขอรอนัดหมายได้) ----------
  async function openWalkin(prefill) {
    const active = services.filter((s) => s.active !== false);
    const serviceId = (prefill && prefill.service) || (active[0] ? active[0].id : "");
    setWalkin({
      name: prefill ? prefill.name : "",
      phone: prefill ? prefill.phone : "",
      email: prefill ? (prefill.email || "") : "",
      service: serviceId, date: toISO(new Date()), time: "", times: [],
      rights: (rightsCfg[0] && rightsCfg[0].th) || CONFIG.rightsOptions[0], agency: "",
      cbCode: prefill ? prefill.cbCode : undefined,
    });
    await fillWalkinTimes(serviceId, toISO(new Date()));
  }
  async function fillWalkinTimes(serviceId, date) {
    const day = date || toISO(new Date());
    const { slots } = await api(`/api/availability?service=${serviceId}&date=${day}`);
    // วันนี้: walk-in รับได้ทุกช่วง (แม้ออนไลน์เต็มหรือเวลาผ่านแล้ว) — คนมาแล้วต้องรับ เริ่มที่ช่วงถัดไป
    // วันอื่น: เริ่มที่ช่วงแรกที่ยังว่างตามปกติ
    let def = "";
    if (day === toISO(new Date())) {
      const hhmm = nowHHMM();
      const upcoming = slots.filter((x) => x.time.replace(":", "") > hhmm);
      def = upcoming[0] ? upcoming[0].time : (slots.length ? slots[slots.length - 1].time : "");
    } else {
      const open = slots.filter((x) => x.remaining > 0);
      def = open[0] ? open[0].time : (slots.length ? slots[0].time : "");
    }
    setWalkin((w) => w && { ...w, times: slots, time: def, date: day });
  }
  async function submitWalkin(e) {
    e.preventDefault();
    const w = walkin;
    if (!w.name.trim()) return setWalkin({ ...w, touched: { ...w.touched, name: true } });
    try {
      const r = await api("/api/walkin", { method: "POST", body: JSON.stringify({
        serviceId: w.service, date: w.date || toISO(new Date()), time: w.time, name: w.name.trim(), phone: w.phone.trim(),
        email: w.email.trim() || undefined, rights: w.rights, agencyCode: w.agency.trim().toUpperCase() || undefined,
      })});
      setWalkin(null);
      const day = w.date || toISO(new Date());
      setDateF((v) => ({ ...v, mode: "single", date: day }));
      setQSearch("");
      fetchQueuePage(1, queue.size, { mode: "single", date: day, service: serviceFilter, q: "" });
      loadReports();
      alert("บันทึกคิวแล้ว: " + r.code + " (คิวที่ " + r.qno + ")");
      // ถ้าจองจากคำขอรอนัดหมาย — ทำเครื่องหมายคำขอนั้นว่านัดแล้ว
      if (w.cbCode) {
        try {
          await api("/api/bookings/" + w.cbCode, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
        } catch {}
        fetchCallbacksPage(1, cb.size);
      }
    } catch (err) { alert(err.message); }
  }

  // ---------- คำขอรอนัดหมาย ----------
  // โทรแล้วได้เวลาแน่นอน → นัดเวลาตรง ๆ บนคำขอ (เซฟวัน+เวลา คำขอกลายเป็นนัดจริง ไม่สร้างคิวซ้ำ)
  function openCbSched(b) {
    const s = svc(b.serviceId);
    const slots = (s.slots && s.slots.length ? s.slots : globalSlots);
    setCbSched({ code: b.code, info: `${b.name} · ${s.icon} ${s.name} · ${contactOf(b)}`, slots, date: b.date || toISO(new Date()), time: b.time || "", err: "" });
  }
  async function submitCbSched(e) {
    e.preventDefault();
    const m = cbSched;
    if (!m.date) { setCbSched({ ...m, err: "เลือกวันที่นัดก่อน" }); return; }
    if (!m.time) { setCbSched({ ...m, err: "เลือกเวลานัดก่อน" }); return; }
    try {
      await api("/api/bookings/" + m.code, { method: "PATCH", body: JSON.stringify({ status: "confirmed", date: m.date, time: m.time }) });
      setCbSched(null);
      fetchCallbacksPage(cb.page, cb.size);
      fetchQueuePage(1, queue.size);      // คำขอที่มีวันนัดแล้วจะโผล่ในตารางคิวของวันนั้น
      fetchUpcomingPage(1, upcoming.size); // และในแท็บนัดที่กำลังจะถึง
      loadReports();
    } catch (err) { setCbSched({ ...m, err: err.message }); }
  }
  async function cbAction(code, act) {
    try {
      await api("/api/bookings/" + code, { method: "PATCH", body: JSON.stringify({ status: act }) });
      fetchCallbacksPage(cb.page, cb.size);
      loadReports();
    } catch (e) { alert(e.message); }
  }

  // ---------- รับคิวเป็นชุด ----------
  async function openBatch() {
    const active = services.filter((s) => s.active !== false);
    setBatch({
      agency: "", service: active[0] ? active[0].id : "", date: toISO(new Date(Date.now() + 864e5)),
      time: "", times: [], rights: (rightsCfg[0] && rightsCfg[0].th) || CONFIG.rightsOptions[0], names: "",
    });
    await fillBatchTimes(active[0] ? active[0].id : "", toISO(new Date(Date.now() + 864e5)));
  }
  async function fillBatchTimes(serviceId, date) {
    const { slots } = await api(`/api/availability?service=${serviceId}&date=${date}`);
    const hhmm = nowHHMM();
    const isToday = date === toISO(new Date());
    const ok = slots.filter((x) => x.remaining > 0 && !(isToday && x.time.replace(":", "") <= hhmm));
    setBatch((b) => b && { ...b, times: ok, time: ok[0] ? ok[0].time : "" });
  }
  async function submitBatch(e) {
    e.preventDefault();
    const b = batch;
    const rows = b.names.split("\n").map((l) => l.trim()).filter(Boolean)
      .map((line) => { const parts = line.split(/[,;\t]/).map((p) => p.trim()); return { name: parts[0] || "", phone: parts[1] || "", email: parts[2] || "" }; })
      .filter((r) => r.name);
    if (!b.agency.trim() || !rows.length) { setBatch({ ...b, invalid: !b.agency.trim() || !rows.length }); return; }
    try {
      const r = await api("/api/batch", { method: "POST", body: JSON.stringify({
        agencyCode: b.agency.trim(), serviceId: b.service, date: b.date, time: b.time,
        rights: b.rights, rows,
      })});
      setBatch(null);
      setDateF((v) => ({ ...v, mode: "single", date: b.date }));
      setQSearch("");
      fetchQueuePage(1, queue.size, { mode: "single", date: b.date, service: serviceFilter, q: "" });
      loadReports();
      alert(`บันทึก ${r.count} คิวจากตัวแทน ${b.agency.trim().toUpperCase()} เรียบร้อย`);
    } catch (err) { alert(err.message); }
  }

  // ---------- นำเข้า Excel/CSV ----------
  async function onImportFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 3e6) { alert("ไฟล์ใหญ่เกินไป (รับสูงสุด ~3 MB)"); e.target.value = ""; return; }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const r = await api("/api/agency-import/parse", { method: "POST", body: JSON.stringify({ filename: f.name, data: btoa(bin) }) });
      setImp((v) => ({ ...v, rows: r.rows }));
    } catch (err) { alert(err.message); e.target.value = ""; }
  }
  async function submitImport(e) {
    e.preventDefault();
    const okRows = imp.rows.filter((r) => r.ok).map((r) => r.raw);
    if (!imp.agency.trim() || !okRows.length) { setImp({ ...imp, invalid: !imp.agency.trim() }); return; }
    try {
      const r = await api("/api/agency-import", { method: "POST", body: JSON.stringify({ agencyCode: imp.agency.trim(), rows: okRows }) });
      setImp(null);
      if (impFileRef.current) impFileRef.current.value = "";
      if (r.firstDate) { setDateF((v) => ({ ...v, mode: "single", date: r.firstDate })); setQSearch(""); fetchQueuePage(1, queue.size, { mode: "single", date: r.firstDate, service: serviceFilter, q: "" }); }
      else fetchQueuePage(queue.page, queue.size);
      loadReports();
      let msg = `นำเข้าสำเร็จ ${r.count} คิวจากตัวแทน ${imp.agency.trim().toUpperCase()}`;
      if (r.skipped && r.skipped.length) {
        msg += `\n\nข้าม ${r.skipped.length} แถว:\n` + r.skipped.slice(0, 10).map((s) => `• แถวที่ ${s.row} ${s.name || ""}: ${s.error}`).join("\n");
        if (r.skipped.length > 10) msg += `\n… และอีก ${r.skipped.length - 10} แถว`;
      }
      alert(msg);
    } catch (err) { alert(err.message); }
  }

  // ---------- ส่งออก CSV (ผ่าน fetch + blob เพราะต้องแนบ token — โหลดตรง ๆ ด้วย location.href จะโดน 401) ----------
  async function exportCsv() {
    try {
      const token = localStorage.getItem("q_token");
      const qs = (dateF.mode === "range"
        ? `?from=${encodeURIComponent(dateF.from || "")}&to=${encodeURIComponent(dateF.to || "")}`
        : dateF.mode === "all" ? "?all=1"
        : `?date=${encodeURIComponent(dateF.date || "")}`)
        + (serviceFilter !== "all" ? `&service=${encodeURIComponent(serviceFilter)}` : "")
        + (statusFilter !== "all" ? `&status=${encodeURIComponent(statusFilter)}` : "")
        + (agencyFilter !== "all" ? `&agency=${encodeURIComponent(agencyFilter)}` : "");
      const res = await fetch("/api/export.csv" + qs, { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (!res.ok) { alert("ส่งออกไม่สำเร็จ (HTTP " + res.status + ")"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = dateF.mode === "range"
        ? `queue-${dateF.from || "start"}-to-${dateF.to || "now"}.csv`
        : `queue-${dateF.date || "today"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      loadReports();
    } catch (e) { alert(e.message); }
  }

  // ---------- จัดการบริการ ----------
  async function saveServicesList(list) {
    try {
      const { services: sv } = await api("/api/services", { method: "PUT", body: JSON.stringify({ services: list }) });
      setServices(sv);
      fetchQueuePage(queue.page, queue.size);
    } catch (err) { alert(err.message); }
  }
  function openSvcModal(s) {
    if (!can(me.role, "services.manage")) { alert("เฉพาะผู้ดูแลระบบที่แก้ไขบริการได้"); return; }
    setSvcModal({
      id: s ? s.id : null,
      mode: s ? (s.bookingMode || "slot") : "slot",
      icon: s ? s.icon : "🩺", name: s ? s.name : "", desc: s ? s.desc : "", cap: s ? (s.capacity || 4) : 4,
      nameEn: s ? (s.nameEn || "") : "", descEn: s ? (s.descEn || "") : "",
      items: s ? s.items.map((i) => ({ name: i.name, nameEn: i.nameEn || "", price: i.price })) : [{ name: "", nameEn: "", price: 0 }],
      slotsWorking: s && Array.isArray(s.slots) ? [...s.slots] : null,
      slotMode: s && s.slotsByDay && Object.keys(s.slotsByDay).length ? "perDay" : "uniform",
      perDay: (() => { const base = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
        if (s && s.slotsByDay) for (const [k, v] of Object.entries(s.slotsByDay)) base[k] = Array.isArray(v) ? [...v] : [];
        return base; })(),
      days: svcDays(s), // วันที่ให้บริการ — ค่าเริ่มต้นทุกวัน (จ อ พ พฤ ศ ส อา)
    });
  }
  async function submitSvc(e) {
    e.preventDefault();
    const m = svcModal;
    const rows = m.items.filter((r) => r.name.trim()); // รายการย่อย optional — ไม่มีก็ได้
    if (!m.name.trim()) { setSvcModal({ ...m, invalid: true }); return; }
    const list = services.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }));
    const icon = m.icon.trim() || "🩺";
    const mode = m.mode === "callback" ? "callback" : "slot";
    const nameEn = (m.nameEn || "").trim() || undefined, descEn = (m.descEn || "").trim() || undefined;
    // เวลาให้บริการ: perDay = ตั้งรายวัน (วันที่ไม่มีเวลา = ปิด) / uniform = วันเปิด + ชุดเวลาเดียวทุกวัน
    const perDay = mode !== "callback" && m.slotMode === "perDay";
    const perDayObj = {};
    if (perDay) for (const d of DAY_ORDER) perDayObj[String(d)] = [...(m.perDay && m.perDay[String(d)] ? m.perDay[String(d)] : [])].sort();
    // เลือกครบ 7 วัน = เก็บเป็นไม่มีค่า days (เปิดทุกวัน) ให้ข้อมูลเบาและเข้ากับบริการเดิม
    let dayList = DAY_ORDER.filter((d) => (Array.isArray(m.days) ? m.days : ALL_DAYS).includes(d));
    if (perDay) dayList = DAY_ORDER.filter((d) => perDayObj[String(d)].length);
    if (mode !== "callback" && !dayList.length) { alert(perDay ? "ต้องตั้งเวลาอย่างน้อย 1 วัน (โหมดรายวัน)" : "ต้องเลือกวันให้บริการอย่างน้อย 1 วัน"); return; }
    if (m.id) {
      const s = list.find((x) => x.id === m.id);
      Object.assign(s, { icon, name: m.name.trim(), desc: m.desc.trim(), nameEn, descEn, capacity: Math.min(99, Math.max(1, parseInt(m.cap, 10) || 4)), bookingMode: mode });
      s.items = rows.map((r, idx) => ({ id: s.items[idx] ? s.items[idx].id : `${s.id}-it${idx}-${Date.now().toString(36)}`, name: r.name.trim(), nameEn: (r.nameEn || "").trim() || undefined, price: Math.max(0, parseInt(r.price, 10) || 0) }));
      if (mode !== "callback") {
        if (perDay) { s.slotsByDay = perDayObj; delete s.slots; }
        else { if (m.slotsWorking !== null) s.slots = [...m.slotsWorking]; else delete s.slots; delete s.slotsByDay; }
        if (dayList.length < 7) s.days = dayList; else delete s.days;
      } else { delete s.slots; delete s.slotsByDay; delete s.days; } // บริการไม่มีเวลานัดไม่ใช้ช่วงเวลา/วัน
    } else {
      const id = "svc-" + Date.now().toString(36);
      list.push({
        id, icon, name: m.name.trim(), desc: m.desc.trim(), nameEn, descEn, capacity: Math.min(99, Math.max(1, parseInt(m.cap, 10) || 4)), bookingMode: mode,
        items: rows.map((r, idx) => ({ id: `${id}-${idx}`, name: r.name.trim(), nameEn: (r.nameEn || "").trim() || undefined, price: Math.max(0, parseInt(r.price, 10) || 0) })),
        ...(mode !== "callback"
          ? (perDay
            ? { slotsByDay: perDayObj }
            : (m.slotsWorking !== null ? { slots: [...m.slotsWorking] } : {}))
          : {}),
        ...(mode !== "callback" && dayList.length < 7 ? { days: dayList } : {}),
      });
    }
    try {
      await saveServicesList(list);
      setSvcModal(null);
    } catch (err) { alert(err.message); }
  }
  async function svcAction(act, id) {
    const s = getService(services, id);
    const list = services.map((x) => ({ ...x, items: x.items.map((i) => ({ ...i })) }));
    const target = list.find((x) => x.id === id);
    if (act === "edit") return openSvcModal(s);
    if (act === "toggle") target.active = target.active === false ? true : false;
    if (act === "delete") {
      const used = (await api("/api/bookings?service=" + id)).stats.total;
      if (!confirm(used ? `มีคิว ${used} รายการอ้างถึงบริการนี้ — ยืนยันการลบ?` : `ลบบริการ "${s.name}"?`)) return;
      return saveServicesList(list.filter((x) => x.id !== id));
    }
    saveServicesList(list);
  }
  async function saveSlots(next) {
    try {
      const { slots } = await api("/api/slots", { method: "PUT", body: JSON.stringify({ slots: next }) });
      setGlobalSlots(slots);
    } catch (err) { alert(err.message); }
  }
  // ทุกการแก้ค่าตั้งต้องผ่านหน้ายืนยันก่อน (เปรียบเทียบค่าเดิม → ค่าใหม่) ค่อยเอาไปใช้จริง
  const thBool = (v) => (v ? "รวม" : "ไม่รวม");
  function saveDaysAhead() {
    setDaysAheadMsg("");
    const n = Number(daysAheadVal);
    if (!(Number.isInteger(n) && n >= 1 && n <= 90)) { alert("ระยะเวลาเปิดจองล่วงหน้าต้องเป็นจำนวนเต็ม 1–90 วัน"); return; }
    if (n === Number(daysAheadOrig)) { setDaysAheadMsg("ค่าเดิม — ยังไม่มีการเปลี่ยนแปลง"); return; }
    setConfirmSet({
      title: "📅 แก้ไขระยะเวลาเปิดจองล่วงหน้า",
      changes: [{ label: "เปิดจองล่วงหน้า (วัน)", from: daysAheadOrig, to: n }],
      action: async () => {
        const { settings } = await api("/api/settings", { method: "PUT", body: JSON.stringify({ daysAhead: n }) });
        setDaysAheadOrig(settings.daysAhead);
        setDaysAheadMsg("บันทึกแล้ว ✓ เปิดจองล่วงหน้า " + settings.daysAhead + " วัน");
      },
    });
  }
  function saveUpCfg() {
    setUpCfgMsg("");
    const n = Number(upCfg.days);
    if (!(Number.isInteger(n) && n >= 1 && n <= 90)) { alert("จำนวนวันต้องเป็นจำนวนเต็ม 1–90 วัน"); return; }
    const next = { days: n, includeToday: !!upCfg.includeToday, includeNoshow: !!upCfg.includeNoshow };
    const changes = [];
    if (next.days !== Number(upCfgOrig.days)) changes.push({ label: "จำนวนวันข้างหน้า", from: upCfgOrig.days, to: next.days });
    if (!!next.includeToday !== !!upCfgOrig.includeToday) changes.push({ label: "รวมวันนี้", from: thBool(upCfgOrig.includeToday), to: thBool(next.includeToday) });
    if (!!next.includeNoshow !== !!upCfgOrig.includeNoshow) changes.push({ label: "รวมสถานะไม่มาตามนัด", from: thBool(upCfgOrig.includeNoshow), to: thBool(next.includeNoshow) });
    if (!changes.length) { setUpCfgMsg("ค่าเดิม — ยังไม่มีการเปลี่ยนแปลง"); return; }
    setConfirmSet({
      title: '📞 แก้ไขเงื่อนไขแท็บ "นัดที่กำลังจะถึง"',
      changes,
      action: async () => {
        await api("/api/settings", { method: "PUT", body: JSON.stringify({ upcomingDays: next.days, upcomingIncludeToday: next.includeToday, upcomingIncludeNoshow: next.includeNoshow }) });
        setUpCfgOrig(next);
        setUpCfgMsg("บันทึกแล้ว ✓");
        fetchUpcomingPage(upcoming.page, upcoming.size); // รีเฟรชแท็บนัดที่กำลังจะถึงให้เห็นผลทันที
      },
    });
  }
  function saveRights() {
    setRightsMsg("");
    const rows = rightsEdit.map((r) => ({ th: (r.th || "").trim(), en: (r.en || "").trim() })).filter((r) => r.th);
    if (!rows.length) { alert("ต้องมีสิทธิการรักษาอย่างน้อย 1 รายการ"); return; }
    if (new Set(rows.map((r) => r.th)).size !== rows.length) { alert("ชื่อสิทธิการรักษา (ไทย) ซ้ำกัน กรุณาตรวจอีกครั้ง"); return; }
    const old = rightsCfg.map((r) => r.th).join(", ");
    const now = rows.map((r) => r.th).join(", ");
    if (old === now) { setRightsMsg("ค่าเดิม — ยังไม่มีการเปลี่ยนแปลง"); return; }
    setConfirmSet({
      title: "💳 แก้ไขสิทธิการรักษา (Payment / coverage)",
      changes: [{ label: "รายการสิทธิ์", from: old || "—", to: now }],
      note: "คิวเดิมที่บันทึกสิทธิ์เก่าไว้จะแสดงชื่อเดิมตามที่บันทึก — รายการที่ถูกลบจะไม่ให้เลือกใหม่อีก",
      action: async () => {
        const { settings } = await api("/api/settings", { method: "PUT", body: JSON.stringify({ rights: rows }) });
        const saved = Array.isArray(settings.rights) && settings.rights.length ? settings.rights : rows;
        setRightsCfg(saved);
        setRightsEdit(saved.map((r) => ({ ...r })));
        setRightsMsg("บันทึกแล้ว ✓ " + saved.length + " รายการ");
      },
    });
  }
  async function applyConfirmSet() {
    if (!confirmSet) return;
    try {
      await confirmSet.action();
      setConfirmSet(null);
    } catch (err) { alert(err.message); }
  }

  async function logout(e) {
    e.preventDefault();
    authClear();
    await api("/api/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }

  // ---------- ผลการโทร (ปุ่ม "โทรแล้ว" ในแท็บนัดที่กำลังจะถึง) ----------
  // โทรแล้วผลลัพธ์เป็นได้หลายแบบ — เปิดป็อปอัปให้เลือก: ยืนยัน / เลื่อนนัด / ยกเลิก / เก็บแค่ประวัติโทร
  function openCallResult(b) {
    const s = svc(b.serviceId);
    setCallResult({
      code: b.code, serviceId: b.serviceId,
      info: `${b.name} · ${s.icon} ${s.name} · นัดปัจจุบัน ${fmtDateShort(b.date)} ${b.time} น. · ${contactOf(b)}`,
      mode: "", date: b.date, time: b.time, origDate: b.date, origTime: b.time,
      times: [], err: "", busy: false,
    });
  }
  async function enterCallResched() {
    setCallResult((r) => r && { ...r, mode: "resched", err: "" });
    try {
      const { slots } = await api(`/api/availability?service=${callResult.serviceId}&date=${callResult.date}`);
      setCallResult((r) => r && { ...r, times: slots, time: r.date === r.origDate ? r.origTime : "" });
    } catch (e) { setCallResult((r) => r && { ...r, err: e.message }); }
  }
  async function callReschedFill(date) {
    setCallResult((r) => r && { ...r, date, err: "" });
    if (!date) return;
    try {
      const { slots } = await api(`/api/availability?service=${callResult.serviceId}&date=${date}`);
      setCallResult((r) => r && { ...r, times: slots, time: date === r.origDate ? r.origTime : "" });
    } catch (e) { setCallResult((r) => r && { ...r, err: e.message }); }
  }
  async function submitCallResult(kind) {
    const m = callResult;
    if (kind === "resched" && (!m.date || !m.time)) { setCallResult({ ...m, err: "เลือกวันที่และเวลานัดใหม่ก่อน" }); return; }
    setCallResult({ ...m, busy: true, err: "" });
    try {
      if (kind === "confirmed") {
        await api("/api/bookings/" + m.code, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
      } else if (kind === "cancelled") {
        await api("/api/bookings/" + m.code, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      } else if (kind === "resched") {
        await api("/api/bookings/" + m.code, { method: "PATCH", body: JSON.stringify({ date: m.date, time: m.time }) });
      }
      await api("/api/calls", { method: "POST", body: JSON.stringify({ code: m.code }) }); // ทุกผลลัพธ์บันทึกประวัติว่าโทรแล้ว
      setUpcoming((u) => ({ ...u, calls: { ...u.calls, [m.code]: Date.now() } }));
      setCallResult(null);
      fetchUpcomingPage(upcoming.page, upcoming.size); // ยกเลิก/เลื่อนออกนอกช่วง → หายจากลิสต์ทันที
      fetchQueuePage(queue.page, queue.size);          // สถานะ/เวลาใหม่ต้องสะท้อนในตารางคิวด้วย
      loadReports();
    } catch (err) {
      setCallResult((r) => r && { ...r, busy: false, err: err.message });
    }
  }

  // ---------- จัดการผู้ใช้ (admin) ----------
  function openUserModal(u) {
    setUserModal({
      id: u ? u.id : null,
      name: u ? u.name : "",
      username: u ? u.username : "",
      role: u ? u.role : "cs",
      password: "",
      invalid: false,
    });
  }
  async function submitUser(e) {
    e.preventDefault();
    const m = userModal;
    const username = m.username.trim();
    const password = m.password;
    // ตรวจฝั่งหน้าก่อน — ที่เหลือ (ชื่อซ้ำ/สิทธิ์ admin คนสุดท้าย ฯลฯ) server ตรวจอีกชั้น
    if (!m.name.trim() || !/^[a-zA-Z0-9_.-]{3,50}$/.test(username) || (!m.id && password.length < 6) || (password && password.length < 6)) {
      setUserModal({ ...m, invalid: true });
      return;
    }
    try {
      if (m.id)
        await api("/api/users", { method: "PATCH", body: JSON.stringify({ id: m.id, name: m.name.trim(), username, role: m.role, password: password || undefined }) });
      else
        await api("/api/users", { method: "POST", body: JSON.stringify({ name: m.name.trim(), username, role: m.role, password }) });
      setUserModal(null);
      fetchUsers();
    } catch (err) { alert(err.message); }
  }
  async function delUser(u) {
    if (!confirm(`ลบผู้ใช้ "${u.name}" (${u.username})?\nการลบไม่กระทบประวัติการใช้งานเดิมที่บันทึกไว้`)) return;
    try {
      await api("/api/users?id=" + encodeURIComponent(u.id), { method: "DELETE" });
      fetchUsers();
    } catch (e) { alert(e.message); }
  }

  if (!me) return <main className="container"><p className="hint" style={{ padding: 40 }}>กำลังโหลด…</p></main>;

  const q = qSearch.trim();
  // ป้ายช่วงเวลาของแท็บนัดที่กำลังจะถึง ตามตัวกรองเวลาสัมพัทธ์ที่เลือกอยู่
  const upWhenLabel = upWhen === "today" ? "วันนี้" : upWhen === "tomorrow" ? "พรุ่งนี้" : upWhen === "week" ? "7 วันข้างหน้า" : `${upCfg.includeToday ? "วันนี้" : "พรุ่งนี้"}–${upCfg.days} วันข้างหน้า`;
  // markCall อัปเดตสถานะโทรใน state ทันที — กรองแถวซ้ำฝั่ง client ให้ตรงตัวกรอง "ยังไม่โทร" โดยไม่ต้องรอรีเฟรช
  const upVisible = upcoming.rows.filter((b) => upCall === "all" || (upCall === "called") === !!upcoming.calls[b.code]);
  const impOk = imp ? imp.rows.filter((r) => r.ok) : [];
  // มุมมองแบ่งหน้าของประวัติการใช้งาน (กันหน้าเกินจำนวนหน้าจริงหลังกรอง)
  const logView = { page: Math.min(logPage, Math.max(1, Math.ceil(filteredLogs.length / logSize))), size: logSize, total: filteredLogs.length };
  const logRows = filteredLogs.slice((logView.page - 1) * logSize, logView.page * logSize);
  const logFilterOn = logF.action !== "all" || logF.user !== "all" || logF.range !== "all" || logF.q.trim() !== "";

  return (
    <>
      <div className="admin-shell">
        {/* sidebar เดียวจบ: แบรนด์ + เมนู + ปุ่มรับคิว + ผู้ใช้ (มือถือกลายเป็นแถบบน) */}
        <aside className="admin-sidebar">
          <div className="side-brand">
            {/* logo จริงจากเว็บหลัก รพ. บนชิปขาวให้เห็นชัดบนพื้นน้ำเงินเข้ม */}
            <span className="brand-logo"><img src="/rajavej-logo.png" alt={CONFIG.hospitalName} /></span>
            <span>
              <b>{CONFIG.hospitalName}</b>
              <span className="si-sub">ระบบคิวกลาง — ทุกช่องทางในที่เดียว</span>
            </span>
          </div>
          <nav className="side-nav">
            {[
              ["queue", "📋", "ตารางคิวรายวัน", "คิวรายวัน + ค้นหา"],
              ["calendar", "🗓️", "ปฏิทินว่าง", "ที่นั่งคงเหลือรายเดือน"],
              ["upcoming", "📞", "นัดที่กำลังจะถึง", (upCfg.includeToday ? "วันนี้" : "พรุ่งนี้") + " – " + upCfg.days + " วัน"],
              ["callbacks", "☎️", "รอนัดหมาย", "ไม่มีเวลานัด · คำขอจากผู้ป่วย"],
              ["report", "📊", "รายงาน", "ภาพรวม · แนวโน้ม · ตัวแทน"],
              ["history", "🧾", "ประวัติการใช้งาน", "ใคร ทำอะไร เมื่อไหร่", "logs.view"],
              ["services", "⚙️", "จัดการบริการ", "บริการ · เวลา · ระยะจอง", "services.manage"],
              ["users", "👥", "จัดการผู้ใช้", "บัญชี · สิทธิ์ 3 ระดับ", "users.manage"],
            ].filter(([, , , , perm]) => !perm || can(me.role, perm)).map(([k, ico, label, sub]) => (
              <button key={k} type="button" className={"side-item" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>
                <span className="si-ico">{ico}</span>
                <span>{label}<span className="si-sub">{sub}</span></span>
              </button>
            ))}
          </nav>
          <div className="side-sep" />
          <div className="side-actions">
            <button type="button" className="side-btn" onClick={openWalkin}>➕ รับคิว walk-in</button>
            {can(me.role, "agency.manage") && <button type="button" className="side-btn" onClick={openBatch}>📦 รับคิวเป็นชุด (ตัวแทน)</button>}
            {can(me.role, "agency.manage") && <button type="button" className="side-btn" onClick={() => { setImp({ agency: "", rows: [] }); }}>📥 นำเข้า Excel (ตัวแทน)</button>}
          </div>
          <div className="side-user">
            <div className="side-who">
              <b>👤 {me.name}</b>
              <span className="si-sub">{roleLabel(me.role)}</span>
            </div>
            <button type="button" className="side-logout" onClick={logout}>⇦ ออกจากระบบ</button>
          </div>
        </aside>

        <main className="admin-main">
          {/* แถบตัวกรองนี้เป็นของตารางคิวรายวันเท่านั้น — แท็บอื่น (นัดที่กำลังจะถึง/รอนัดหมาย ฯลฯ) มีตัวกรองเฉพาะของหน้านั้นอยู่ในตัวหน้า */}
          {tab === "queue" && (
          <div className="admin-top">
            <div className="admin-tools">
              <div className="date-mode" role="group" aria-label="โหมดตัวกรองวันที่">
                <button type="button" className={"dm-btn" + (dateF.mode === "single" ? " active" : "")}
                  onClick={() => setDateF((v) => ({ ...v, mode: "single" }))}>วัน</button>
                <button type="button" className={"dm-btn" + (dateF.mode === "range" ? " active" : "")}
                  onClick={() => setDateF((v) => ({ ...v, mode: "range" }))}>ช่วงวันที่</button>
                <button type="button" className={"dm-btn" + (dateF.mode === "all" ? " active" : "")}
                  onClick={() => setDateF((v) => ({ ...v, mode: "all" }))}>ทุกวัน</button>
              </div>
              {dateF.mode === "single" ? (
                <ThDatePicker label="วันที่" value={dateF.date} onChange={(v) => setDateF((p) => ({ ...p, date: v }))} />
              ) : dateF.mode === "range" ? (
                <>
                  <ThDatePicker label="ตั้งแต่" value={dateF.from} onChange={(v) => setDateF((p) => ({ ...p, from: v }))} />
                  <span className="range-sep">ถึง</span>
                  <ThDatePicker label="ถึง" value={dateF.to} onChange={(v) => setDateF((p) => ({ ...p, to: v }))} />
                </>
              ) : (
                <span className="range-sep" style={{ padding: "0 4px" }}>แสดงคิวทุกวัน</span>
              )}
              <select className="date-input" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                <option value="all">ทุกบริการ</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
              <select className="date-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">ทุกสถานะ</option>
                <option value="pending">รอยืนยัน</option>
                <option value="confirmed">ยืนยันแล้ว</option>
                <option value="noshow">ไม่มาตามนัด</option>
                <option value="cancelled">ยกเลิก</option>
              </select>
              <select className="date-input" value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)} title="กรองตามตัวแทน — ใช้ร่วมกับตัวกรองอื่นได้ และออกกับไฟล์ CSV">
                <option value="all">ทุกตัวแทน</option>
                {/* โค้ดที่พบจริงในฐานข้อมูล + ลิสต์ config (config มาทีหลัง = ชนะด้วยชื่อที่ตั้งไว้) รวมกันไม่ซ้ำ */}
                {[...new Map([...agencyCodesLive.map((c) => [c, { code: c, name: null }]), ...CONFIG.agencyCodes.map((a) => [a.code, a])]).values()]
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((a) => <option key={a.code} value={a.code}>🤝 {a.code}{a.name ? " — " + a.name : ""}</option>)}
              </select>
              <input type="search" className="date-input search-input" placeholder="🔍 ค้นหา ชื่อ/เบอร์/อีเมล/รหัส (ทุกวัน)" value={qSearch} onChange={(e) => setQSearch(e.target.value)} />
              <button className="btn btn-ghost btn-sm" type="button" onClick={exportCsv}>⬇ CSV</button>
            </div>
          </div>
          )}
          <div className="admin-content">

        {tab === "queue" && (
          <section className="admin-pane active">
            <div className="stat-grid">
              {queue.stats && [
                [queue.stats.total, q ? "ผลการค้นหา" : dateF.mode === "range" ? "คิวช่วงที่เลือก" : "คิววันที่เลือก", ""],
                [queue.stats.online, "🌐 ออนไลน์", "c-online"],
                [queue.stats.walkin, "🚶 Walk-in", "c-walkin"],
                [queue.stats.agency, "🤝 ตัวแทน", "c-agency"],
                [queue.stats.pending, "รอยืนยัน", "c-pending"],
                [queue.stats.confirmed, "ยืนยันแล้ว", "c-confirmed"],
              ].map(([num, lbl, cls]) => (
                <div className={"stat-card " + cls} key={lbl}><div className="num">{num}</div><div className="lbl">{lbl}</div></div>
              ))}
            </div>
            <div className="table-card">
              <div className="table-scroll">
                {!queue.total ? (
                  <div className="empty-state"><div style={{ fontSize: 40, marginBottom: 8 }}>🗂️</div>{q ? <>ไม่พบคิวที่ตรงกับ &quot;{q}&quot;</> : dateF.mode === "all" ? <>ไม่มีคิว <b>ทุกวัน</b> เลย</> : dateF.mode === "range" ? <>ไม่มีคิวช่วง <b>{dateF.from ? fmtDateShort(dateF.from) : "เริ่ม"} – {dateF.to ? fmtDateShort(dateF.to) : "ปัจจุบัน"}</b></> : <>ไม่มีคิววันที่ <b>{dateF.date ? fmtFullTh(dateF.date) : "ทุกวัน (ยังไม่ได้เลือกวันที่)"}</b></>}</div>
                ) : (
                  <>
                    <table className="booking-table">
                      <thead><tr>
                        <th>#</th>
                        {(q || dateF.mode === "all") && <th>วันที่</th>}
                        <th>เวลา</th><th>คิวที่</th><th>ผู้จอง</th><th>ช่องทาง</th><th>บริการ</th><th>สิทธิ์</th><th>สถานะ</th><th>จัดการ</th>
                      </tr></thead>
                      <tbody>
                        {queue.rows.map((b, idx) => {
                          const s = svc(b.serviceId);
                          const item = s.items.find((i) => i.id === b.itemId);
                          const meta = STATUS_META[b.status] || { label: b.status, cls: "" };
                          return (
                            <tr key={b.code} className="tr-click" title="คลิกเพื่อดูรายละเอียดผู้จอง" onClick={() => setDetail(b)}>
                              <td className="td-seq">{(queue.page - 1) * queue.size + idx + 1}</td>
                              {(q || dateF.mode === "all") && (
                                <td className="td-time">
                                  {b.date
                                    ? <>{fmtDateShort(b.date)}<span className="td-sub">{fmtDayShort(b.date)}</span></>
                                    : <span className="td-sub">📞 รอนัดหมาย (ยังไม่มีวัน–เวลา)</span>}
                                </td>
                              )}
                              <td className="td-time">{b.time || "—"}{b.createdAt ? <span className="td-sub">สร้าง {new Date(b.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span> : null}</td>
                              <td className="td-qno"><b>{b.qno}</b></td>
                              <td className="td-name"><b>👤 {b.name}</b><span>{[b.phone && b.phone !== "-" ? b.phone : null, b.email ? "✉ " + b.email : null, b.code].filter(Boolean).join(" · ")}{b.note ? " · 📝 " + b.note : ""}</span></td>
                              <td>{chBadge(b.source, b.agencyCode)}</td>
                              <td>{s.icon} {s.name}<span className="td-sub">{item ? item.name : ""}</span></td>
                              <td>{b.rights}</td>
                              <td><span className={"badge " + meta.cls}>{meta.label}</span></td>
                              <td onClick={(e) => e.stopPropagation()}><div className="row-actions">
                                {b.status === "pending" && <button className="btn-confirm" onClick={() => rowAction(b.code, "confirmed")}>ยืนยัน</button>}
                                {b.status !== "cancelled" && <button className="btn-confirm" onClick={() => openResched(b.code)}>เลื่อน</button>}
                                {b.status === "confirmed" && <button className="btn-cancel-row" onClick={() => rowAction(b.code, "noshow")}>ไม่มา</button>}
                                {b.status !== "cancelled" && <button className="btn-cancel-row" onClick={() => rowAction(b.code, "cancelled")}>ยกเลิก</button>}
                              </div></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <Pager view={queue} kind="queue" onPage={(p) => fetchQueuePage(p, queue.size)} onSize={(sz) => fetchQueuePage(1, sz)} />
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "calendar" && (
          <section className="admin-pane active">
            <div className="table-card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>🗓️ ปฏิทินว่าง</h2>
              <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>
                ตัวเลขคือ <b>ที่นั่งว่างรวมทั้งวัน</b> และ <b>เวลาหลัง ·</b> คือช่วงเร็วสุดที่ยังจองได้ · เหลือง = ใกล้เต็ม (เหลือ ≤ ¼ ของความจุ) · เทา = วันที่บริการไม่เปิด · คลิกที่วันเพื่อดูรายช่วงเวลา
              </p>
              <div className="cal-toolbar">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}>‹</button>
                <span className="cal-month-label">{new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(calMonth)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}>›</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const n = new Date(); setCalMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>เดือนนี้</button>
                <span style={{ flex: 1 }} />
                <select className="form-select" style={{ width: "auto" }} value={calSvc} onChange={(e) => setCalSvc(e.target.value)}>
                  <option value="all">ทุกบริการ</option>
                  {(calData ? calData.services : []).map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
              {!calData ? (
                <div className="empty-state"><div style={{ fontSize: 40, marginBottom: 8 }}>🗓️</div>กำลังโหลดปฏิทิน…</div>
              ) : (
                (() => {
                  const todayStr = toISO(new Date());
                  const start = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
                  start.setDate(1 - ((start.getDay() + 6) % 7)); // เริ่มสัปดาห์วันจันทร์ — ตรงกับหัวคอลัมน์ จ อ พ พฤ ศ ส อา
                  const svcList = calSvc === "all" ? calData.services : calData.services.filter((s) => s.id === calSvc);
                  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
                  return (
                    <div className="cal-grid">
                      {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((w) => <div key={w} className="cal-dow">{w}</div>)}
                      {cells.map((d) => {
                        const iso = toISO(d);
                        const info = calData.days[iso] || {};
                        const past = iso < todayStr;
                        return (
                          <div key={iso}
                            className={"cal-cell" + (d.getMonth() === calMonth.getMonth() ? "" : " out") + (past ? " past" : "") + (iso === todayStr ? " today" : "")}
                            onClick={() => { if (!past) setCalDay(iso); }}>
                            <span className="cal-date">{d.getDate()}</span>
                            <span className="cal-chips">
                              {svcList.map((s) => {
                                const v = info[s.id];
                                if (!v) return null;
                                const cls = !v.open ? "closed" : v.left === 0 ? "full" : v.left <= Math.ceil(v.total * 0.25) ? "few" : "free";
                                const label = !v.open ? "–" : v.left === 0 ? "เต็ม" : v.next ? v.left + " · " + v.next : v.left + " · หมดวัน";
                                const tip = !v.open
                                  ? `${s.name}: ไม่เปิดบริการวันนี้`
                                  : v.left === 0
                                    ? `${s.name}: เต็มทั้งวัน (${v.total} ที่)`
                                    : v.next
                                      ? `${s.name}: ว่าง ${v.left}/${v.total} ที่ · ช่วงเร็วสุด ${v.next} น.`
                                      : `${s.name}: เหลือ ${v.left}/${v.total} ที่ แต่ช่วงเวลาของวันนี้ผ่านมาหมดแล้ว`;
                                return <span key={s.id} className={"cal-chip " + cls} title={tip}>{s.icon} {label}</span>;
                              })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          </section>
        )}

        {tab === "upcoming" && (
          <section className="admin-pane active">
            <div className="table-card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>📞 นัดที่กำลังจะถึง</h2>
              <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>ช่วงเริ่มต้นตามเงื่อนไขที่ตั้งไว้: {upCfg.includeToday ? "วันนี้" : "พรุ่งนี้"} – {upCfg.days} วันข้างหน้า · กด &quot;โทรแล้ว&quot; เมื่อติดต่อยืนยันเรียบร้อย</p>
              {/* ตัวกรองหน้านี้เป็น "เวลาที่ใกล้จะถึง" แบบสัมพัทธ์ — ต่างจากตัวกรองวันที่แบบเลือกเองของตารางคิวรายวัน */}
              <div className="admin-tools" style={{ marginBottom: 14 }}>
                <div className="date-mode" role="group" aria-label="ช่วงเวลาที่ใกล้จะถึง">
                  <button type="button" className={"dm-btn" + (upWhen === "all" ? " active" : "")} onClick={() => setUpWhen("all")}>ทั้งหมด</button>
                  <button type="button" className={"dm-btn" + (upWhen === "today" ? " active" : "")} onClick={() => setUpWhen("today")}>วันนี้</button>
                  <button type="button" className={"dm-btn" + (upWhen === "tomorrow" ? " active" : "")} onClick={() => setUpWhen("tomorrow")}>พรุ่งนี้</button>
                  <button type="button" className={"dm-btn" + (upWhen === "week" ? " active" : "")} onClick={() => setUpWhen("week")}>7 วันข้างหน้า</button>
                </div>
                <select className="date-input" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                  <option value="all">ทุกบริการ</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
                <select className="date-input" value={upCall} onChange={(e) => setUpCall(e.target.value)} title="กรองตามสถานะการโทรยืนยัน">
                  <option value="all">ทุกสถานะโทร</option>
                  <option value="pending">ยังไม่โทร</option>
                  <option value="called">โทรแล้ว</option>
                </select>
              </div>
              {!upcoming.total ? (
                <div className="empty-state">
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📞</div>
                  ไม่มีนัด{upCall === "pending" ? "ที่ยังไม่ได้โทร" : upCall === "called" ? "ที่โทรแล้ว" : ""}ในช่วง <b>{upWhenLabel}</b>
                  {serviceFilter !== "all" && <> ของบริการ <b>{svc(serviceFilter).icon} {svc(serviceFilter).name}</b></>}
                </div>
              ) : !upVisible.length ? (
                <div className="empty-state"><div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>รายการในหน้านี้โทรครบแล้ว — ดูหน้าถัดไป หรือเปลี่ยนตัวกรองช่วงเวลา/สถานะโทร</div>
              ) : (
                <>
                  <div className="upcoming-list">
                    {upVisible.map((b) => {
                      const s = svc(b.serviceId);
                      const called = !!upcoming.calls[b.code];
                      return (
                        <div className="upcoming-item" key={b.code}>
                          <span className="when">{fmtDateShort(b.date)} {b.time} น.</span>
                          <span className="who"><b>{b.name}</b><span>{s.icon} {s.name} · คิวที่ {b.qno} · {contactOf(b)} · {chBadge(b.source, b.agencyCode)}</span></span>
                          <button className={"btn-called" + (called ? " done" : "")} disabled={called}
                            onClick={() => openCallResult(b)}>{called ? "✓ โทรแล้ว" : "📞 โทรแล้ว"}</button>
                        </div>
                      );
                    })}
                  </div>
                  <Pager view={upcoming} kind="upcoming" onPage={(p) => fetchUpcomingPage(p, upcoming.size)} onSize={(sz) => fetchUpcomingPage(1, sz)} />
                </>
              )}
            </div>
          </section>
        )}

        {tab === "callbacks" && (
          <section className="admin-pane active">
            <div className="table-card">
              <div className="admin-tools" style={{ marginBottom: 14, padding: "14px 14px 0" }}>
                <select className="date-input" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                  <option value="all">ทุกบริการ</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
                <select className="date-input" value={cbStatus} onChange={(e) => setCbStatus(e.target.value)}>
                  <option value="pending">⏳ รอนัดหมาย (ค้างทำ)</option>
                  <option value="confirmed">✅ นัดแล้ว</option>
                  <option value="cancelled">ยกเลิก</option>
                  <option value="all">ทั้งหมด</option>
                </select>
                <span className="hint" style={{ color: "var(--muted)", alignSelf: "center" }}>นัดเวลาเสร็จคำขอจะย้ายไป "นัดแล้ว" พร้อมแสดงวัน–เวลานัด</span>
              </div>
              <div className="table-scroll">
              {!cb.total ? (
                <div className="empty-state"><div style={{ fontSize: 40, marginBottom: 8 }}>☎️</div>ยังไม่มีคำขอรอนัดหมาย</div>
              ) : (
                <>
                  <table className="booking-table">
                    <thead><tr><th>ส่งเมื่อ</th><th>รหัส</th><th>ผู้ขอ</th><th>บริการ</th><th>นัดหมายที่ตกลงกัน</th><th>สิทธิ์</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                    <tbody>
                      {cb.rows.map((b) => {
                        const s = svc(b.serviceId);
                        const item = s.items.find((i) => i.id === b.itemId);
                        const st = { pending: "รอนัดหมาย", cancelled: "ยกเลิก" }[b.status]
                          || (b.date ? "นัดแล้ว" : "ติดต่อแล้ว — ยังไม่นัดเวลา");
                        const stCls = { pending: "badge-pending", confirmed: "badge-confirmed", cancelled: "badge-cancelled" }[b.status] || "";
                        return (
                          <tr key={b.code}>
                            <td className="td-time">{new Date(b.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                            <td className="td-qno"><b>{b.code}</b><span className="td-sub">คำขอที่ {b.qno}</span></td>
                            <td className="td-name"><b>{b.name}</b><span>{b.phone}{b.email ? " · ✉ " + b.email : ""}{b.note ? " · 📝 " + b.note : ""}</span></td>
                            <td>{s.icon} {s.name}<span className="td-sub">{item ? item.name : ""}</span></td>
                            <td className="td-time">{b.date
                              ? <><b>{fmtDateShort(b.date)}</b><span className="td-sub">{fmtDayShort(b.date)} · เวลา {b.time} น.</span></>
                              : <span className="td-sub">— {b.status === "confirmed" ? "ติดต่อแล้วแต่ยังไม่ได้นัดเวลา" : "ยังไม่ได้นัด"}</span>}</td>
                            <td>{b.rights}</td>
                            <td><span className={"badge " + stCls}>{st}</span></td>
                            <td><div className="row-actions">
                              {b.status !== "cancelled" && <button className="btn-confirm" onClick={() => openCbSched(b)}>{b.date ? "ปรับเวลานัด" : "📅 นัดเวลา"}</button>}
                              {b.status !== "cancelled" && <button className="btn-cancel-row" onClick={() => cbAction(b.code, "cancelled")}>ยกเลิก</button>}
                            </div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pager view={cb} kind="cb" onPage={(p) => fetchCallbacksPage(p, cb.size)} onSize={(sz) => fetchCallbacksPage(1, sz)} />
                </>
              )}
            </div></div>
          </section>
        )}

        {tab === "report" && (
          <section className="admin-pane active">
            <div className="table-card rep-toolbar">
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>📊 รายงานภาพรวม</h2>
                <p className="hint" style={{ color: "var(--muted)", margin: 0, fontSize: "0.9rem" }}>
                  {reports ? (reports.mode === "all"
                    ? `ข้อมูลทุกวันตั้งแต่เริ่มใช้ระบบ · แนวโน้มกราฟแสดง 90 วันล่าสุด`
                    : `ช่วง ${fmtDateShort(reports.from)} – ${fmtDateShort(reports.to)} · เฉลี่ย ${reports.kpi.avgPerDay} คิว/วัน (นับเฉพาะวันที่มีคิว)`) : "กำลังโหลด…"}
                </p>
              </div>
              <div className="rep-range">
                {[["7", "7 วันล่าสุด"], ["30", "30 วันล่าสุด"], ["90", "90 วันล่าสุด"], ["all", "ทั้งหมด"]].map(([v, l]) => (
                  <button key={v} type="button" className={"rep-range-btn" + (repDays === v ? " on" : "")} onClick={() => setRepDays(v)}>{l}</button>
                ))}
              </div>
            </div>
            {reports && (() => {
              const k = reports.kpi;
              const fmtN = (n) => Number(n || 0).toLocaleString("th-TH");
              const pct = (n) => (k.total ? Math.round((n / k.total) * 100) : 0);
              const CH_COLORS = { online: "#2563eb", walkin: "#0d9488", agency: "#f59e0b", callback: "#94a3b8" };
              const maxDaily = Math.max(1, ...reports.daily.map((d) => d.total));
              const maxSlot = Math.max(1, ...reports.bySlot.map((s) => s.total));
              const maxDow = Math.max(1, ...reports.byDow.map((s) => s.total));
              const maxSvc = Math.max(1, ...reports.byService.map((s) => s.total));
              const chTotal = reports.byChannel.reduce((n, c) => n + c.total, 0) || 1;
              let acc = 0;
              const donutSegs = reports.byChannel.filter((c) => c.total > 0).map((c) => {
                const seg = { ch: c.ch, from: acc, to: acc + c.total / chTotal };
                acc += c.total / chTotal;
                return seg;
              });
              const C = 2 * Math.PI * 54; // วงรัศมี 54 (SVG r=54)
              return (
                <>
                  {repHover && (() => {
                    const d = reports.daily.find((x) => x.date === repHover.date);
                    if (!d) return null;
                    // ชิดขอบจอฝั่งไหนก็พลิกกล่องไปอีกฝั่งให้ไม่หลุดนอกจอ
                    const flipX = repHover.x > window.innerWidth - 300;
                    const flipY = repHover.y > window.innerHeight - 130;
                    return (
                      <div className="rep-tip" style={{
                        left: repHover.x + (flipX ? -16 : 16),
                        top: repHover.y + (flipY ? -16 : 16),
                        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
                      }}>
                        <b>{fmtFullTh(d.date)}</b>
                        รวม {d.total} คิว · 🌐 ออนไลน์ {d.online} · 🚶 walk-in {d.walkin} · 🤝 ตัวแทน {d.agency}
                      </div>
                    );
                  })()}
                  <div className="stat-grid">
                    <div className="stat-card c-confirmed"><div className="num">{k.successRate === null ? "—" : k.successRate + "%"}</div><div className="lbl">อัตรานัดสำเร็จ · มา {fmtN(k.successShown)}/ไม่มา {fmtN(k.successMissed)} (ถึงวันนัดแล้ว)</div></div>
                    <div className="stat-card"><div className="num">{fmtN(k.total)}</div><div className="lbl">คิวทั้งหมดในช่วง · วันนี้ {fmtN(k.todayTotal)}</div></div>
                    <div className="stat-card c-confirmed"><div className="num">{fmtN(k.confirmed)}</div><div className="lbl">ยืนยันแล้ว ({pct(k.confirmed)}%)</div></div>
                    <div className="stat-card c-pending"><div className="num">{fmtN(k.pending)}</div><div className="lbl">รอยืนยัน ({pct(k.pending)}%)</div></div>
                    <div className="stat-card c-cancelled"><div className="num">{fmtN(k.noshow)}</div><div className="lbl">ไม่มาตามนัด ({pct(k.noshow)}%)</div></div>
                    <div className="stat-card c-cancelled"><div className="num">{fmtN(k.cancelled)}</div><div className="lbl">ยกเลิก ({pct(k.cancelled)}%)</div></div>
                    <div className="stat-card c-walkin"><div className="num">{fmtN(k.unique)}</div><div className="lbl">ผู้ป่วย (ไม่ซ้ำชื่อ+เบอร์)</div></div>
                    <div className="stat-card c-agency"><div className="num">{fmtN(k.activeDays)}</div><div className="lbl">วันที่มีคิว · เฉลี่ย {k.avgPerDay}/วัน</div></div>
                  </div>

                  <div className="rep-two">
                    <div className="table-card rep-card">
                      <h3>📈 แนวโน้มคิวรายวัน <span className="rep-sub">(คิวที่ไม่ถูกยกเลิก · แบ่งสีตามช่องทาง)</span></h3>
                      {(() => {
                        const d = repHover && reports.daily.find((x) => x.date === repHover.date);
                        return (
                          <div className="rep-hover-info">
                            {d
                              ? <><b>{fmtFullTh(d.date)}</b> — รวม {d.total} คิว · 🌐 ออนไลน์ {d.online} · 🚶 walk-in {d.walkin} · 🤝 ตัวแทน {d.agency}</>
                              : <span className="hint" style={{ color: "var(--muted)" }}>ชี้เมาส์ (หรือแตะ) ที่แท่งของวันใดก็ได้เพื่อดูรายละเอียด</span>}
                          </div>
                        );
                      })()}
                      <div className="rep-bars" onMouseMove={repMove} onMouseLeave={() => setRepHover(null)}>
                        {reports.daily.map((d) => (
                          <div key={d.date} className="rep-bar-col" data-date={d.date}>
                            <div className="rep-bar" style={{ height: Math.max(3, (d.total / maxDaily) * 100) + "%" }}>
                              {d.online > 0 && <div style={{ flex: d.online, background: CH_COLORS.online }} />}
                              {d.walkin > 0 && <div style={{ flex: d.walkin, background: CH_COLORS.walkin }} />}
                              {d.agency > 0 && <div style={{ flex: d.agency, background: CH_COLORS.agency }} />}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* แกนวันที่แถบแยก — แต่ละป้ายกว้างเท่ากลุ่มแท่งของมัน (กันป้ายถูกบีบแคบเท่าหนึ่งแท่งแล้วล้นทับกันตอนวันเยอะ ๆ) */}
                      <div className="rep-axis">
                        {(() => {
                          const n = reports.daily.length;
                          const step = Math.ceil(n / 14) || 1;
                          const slots = [];
                          for (let i = 0; i < n; i += step) slots.push({ i, span: Math.min(step, n - i) });
                          return slots.map((s) => (
                            <span key={s.i} style={{ flex: s.span }}>{reports.daily[s.i].date.slice(8)}/{reports.daily[s.i].date.slice(5, 7)}</span>
                          ));
                        })()}
                      </div>
                      <div className="rep-legend">
                        <span><i style={{ background: CH_COLORS.online }} /> ออนไลน์</span>
                        <span><i style={{ background: CH_COLORS.walkin }} /> Walk-in</span>
                        <span><i style={{ background: CH_COLORS.agency }} /> ตัวแทน</span>
                      </div>
                    </div>

                    <div className="table-card rep-card">
                      <h3>🥧 สัดส่วนช่องทาง</h3>
                      <div className="rep-donut-wrap">
                        <svg viewBox="0 0 140 140" className="rep-donut">
                          {donutSegs.map((s) => (
                            <circle key={s.ch} cx="70" cy="70" r="54" fill="none" stroke={CH_COLORS[s.ch]} strokeWidth="18"
                              strokeDasharray={`${(s.to - s.from) * C} ${C}`} strokeDashoffset={-s.from * C}
                              transform="rotate(-90 70 70)" />
                          ))}
                          <text x="70" y="66" textAnchor="middle" className="rep-donut-num">{fmtN(chTotal)}</text>
                          <text x="70" y="82" textAnchor="middle" className="rep-donut-lbl">คิว</text>
                        </svg>
                        <div className="rep-legend rep-legend-col">
                          {reports.byChannel.map((c) => {
                            const ch = CONFIG.channels[c.ch];
                            return (
                              <span key={c.ch}><i style={{ background: CH_COLORS[c.ch] }} /> {ch.icon} {ch.label} <b>{fmtN(c.total)}</b> ({Math.round((c.total / chTotal) * 100)}%)</span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rep-two">
                    <div className="table-card rep-card">
                      <h3>🩺 คิวแยกตามบริการ</h3>
                      {reports.byService.map((s) => (
                        <div key={s.id} className="rep-hrow" title={`${s.name}: ${s.total} คิว · ยืนยันแล้ว ${s.confirmed}`}>
                          <span className="rep-hname">{s.icon} {s.name}</span>
                          <div className="rep-hbar"><div style={{ width: (s.total / maxSvc) * 100 + "%" }} /></div>
                          <span className="rep-hval"><b>{fmtN(s.total)}</b> คิว · ยืนยัน {fmtN(s.confirmed)}</span>
                        </div>
                      ))}
                      {!reports.byService.length && <p className="hint" style={{ color: "var(--muted)" }}>ยังไม่มีข้อมูลในช่วงนี้</p>}
                    </div>

                    <div className="table-card rep-card">
                      <h3>⏰ ช่วงเวลายอดนิยม</h3>
                      <div className="rep-bars rep-bars-slot">
                        {reports.bySlot.map((s) => (
                          <div key={s.time} className="rep-bar-col" title={`${s.time} น. — ${s.total} คิว`}>
                            <div className="rep-bar" style={{ height: Math.max(3, (s.total / maxSlot) * 100) + "%", background: "var(--primary)" }} />
                            <span className="rep-bar-lbl">{s.time.slice(0, 5)}</span>
                          </div>
                        ))}
                      </div>
                      <h3 style={{ marginTop: 14 }}>📅 กระจายตามวันสัปดาห์</h3>
                      <div className="rep-bars rep-bars-slot">
                        {reports.byDow.map((s) => (
                          <div key={s.dow} className="rep-bar-col" title={`${s.label} — ${s.total} คิว`}>
                            <div className="rep-bar" style={{ height: Math.max(3, (s.total / maxDow) * 100) + "%", background: "#0d9488" }} />
                            <span className="rep-bar-lbl">{s.label.slice(0, 3)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rep-two">
                    <div className="table-card rep-card">
                      <h3>🤝 อันดับตัวแทน <span className="rep-sub">(เรียงตามจำนวนคิวที่ส่งมา — เห็นว่าตัวแทนไหนนำลูกค้ามากี่คน มาจริงกี่คน)</span></h3>
                      <table className="mini-table">
                        {reports.agencies.length ? (
                          <>
                            <thead><tr><th>รหัส</th><th>ตัวแทน</th><th>คิว</th><th>มาตามนัด</th><th>ไม่มา</th><th>ยกเลิก</th><th>รอยืนยัน</th><th>มาจริง</th><th>สัดส่วน</th></tr></thead>
                            <tbody>{reports.agencies.map((a) => {
                              const names = Object.fromEntries(CONFIG.agencyCodes.map((x) => [x.code, x.name]));
                              const maxA = reports.agencies[0].total || 1;
                              return (
                                <tr key={a.code}>
                                  <td><b>{a.code}</b></td>
                                  <td>{names[a.code] || "-"}</td>
                                  <td><b>{fmtN(a.total)}</b><div className="rep-hbar" style={{ width: 90, marginTop: 4 }}><div style={{ width: (a.total / maxA) * 100 + "%" }} /></div></td>
                                  <td>{fmtN(a.confirmed)}</td>
                                  <td>{fmtN(a.noshow)}</td>
                                  <td>{fmtN(a.cancelled)}</td>
                                  <td>{fmtN(a.pending)}</td>
                                  <td>{a.successRate === null ? "—" : a.successRate + "%"}</td>
                                  <td>{Math.round((a.total / (reports.agencies.reduce((n, x) => n + x.total, 0) || 1)) * 100)}%</td>
                                </tr>
                              );
                            })}</tbody>
                          </>
                        ) : (
                          <tbody><tr><td className="empty-state" style={{ padding: 24 }}>ยังไม่มีคิวจากตัวแทนในช่วงนี้</td></tr></tbody>
                        )}
                      </table>
                    </div>

                    <div className="table-card rep-card">
                      <h3>🔥 รายการย่อยยอดนิยม <span className="rep-sub">(8 อันดับแรก ไม่นับคิวที่ยกเลิก)</span></h3>
                      <table className="mini-table">
                        {reports.topItems.length ? (
                          <>
                            <thead><tr><th>รายการ</th><th>บริการ</th><th>คิว</th></tr></thead>
                            <tbody>{reports.topItems.map((it, i) => (
                              <tr key={i}><td><b>{it.icon} {it.name}</b></td><td>{it.service}</td><td>{fmtN(it.total)}</td></tr>
                            ))}</tbody>
                          </>
                        ) : (
                          <tbody><tr><td className="empty-state" style={{ padding: 24 }}>ยังไม่มีข้อมูลรายการย่อยในช่วงนี้</td></tr></tbody>
                        )}
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {tab === "history" && can(me.role, "logs.view") && (
          <section className="admin-pane active">
            <div className="table-card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>🧾 ประวัติการใช้งาน</h2>
              <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>ใคร ทำอะไร เมื่อไหร่ (ตามข้อกำหนด PDPA) — เก็บรายการล่าสุดไม่เกิน 500 รายการ</p>
              <div className="admin-tools" style={{ marginBottom: 14 }}>
                <div className="date-mode" role="group" aria-label="ช่วงเวลาของประวัติ">
                  <button type="button" className={"dm-btn" + (logF.range === "all" ? " active" : "")} onClick={() => setLogF((f) => ({ ...f, range: "all" }))}>ทั้งหมด</button>
                  <button type="button" className={"dm-btn" + (logF.range === "today" ? " active" : "")} onClick={() => setLogF((f) => ({ ...f, range: "today" }))}>วันนี้</button>
                  <button type="button" className={"dm-btn" + (logF.range === "7" ? " active" : "")} onClick={() => setLogF((f) => ({ ...f, range: "7" }))}>7 วันล่าสุด</button>
                  <button type="button" className={"dm-btn" + (logF.range === "30" ? " active" : "")} onClick={() => setLogF((f) => ({ ...f, range: "30" }))}>30 วันล่าสุด</button>
                </div>
                <select className="date-input" value={logF.action} onChange={(e) => setLogF((f) => ({ ...f, action: e.target.value }))} title="กรองตามกิจกรรม">
                  <option value="all">ทุกกิจกรรม</option>
                  {logActions.map((a) => <option key={a} value={a}>{ACT[a] || a}</option>)}
                </select>
                <select className="date-input" value={logF.user} onChange={(e) => setLogF((f) => ({ ...f, user: e.target.value }))} title="กรองตามผู้ใช้">
                  <option value="all">ทุกผู้ใช้</option>
                  {logUsers.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="search" className="date-input search-input" placeholder="🔍 ค้นหา รายละเอียด/ผู้ใช้" value={logF.q} onChange={(e) => setLogF((f) => ({ ...f, q: e.target.value }))} />
                <button className="btn btn-ghost btn-sm" type="button" onClick={loadLogs}>🔄 รีเฟรช</button>
              </div>
              <div className="log-meta">
                <span>พบ {filteredLogs.length.toLocaleString("th-TH")} รายการ จาก {logs.length.toLocaleString("th-TH")} รายการที่เก็บไว้</span>
                {logFilterOn && (
                  <button type="button" className="log-clear" onClick={() => setLogF({ action: "all", user: "all", range: "all", q: "" })}>✕ ล้างตัวกรอง</button>
                )}
              </div>
              {!logs.length ? (
                <div className="empty-state"><div style={{ fontSize: 40, marginBottom: 8 }}>🧾</div>ยังไม่มีประวัติการใช้งานเลย</div>
              ) : !filteredLogs.length ? (
                <div className="empty-state"><div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>ไม่พบรายการที่ตรงกับตัวกรอง</div>
              ) : (
                <>
                  <div className="audit-list page">
                    {logRows.map((l, i) => (
                      <div className="audit-item" key={(logView.page - 1) * logSize + i}>
                        <span className="a-at">{new Date(l.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
                        <span className="a-user">{l.user}</span>
                        <span className="a-act">{ACT[l.action] || l.action}</span>
                        <span className="a-det" title={l.detail}>{l.detail}</span>
                      </div>
                    ))}
                  </div>
                  <Pager view={logView} kind="log" onPage={setLogPage} onSize={(sz) => { setLogSize(sz); setLogPage(1); }} />
                </>
              )}
            </div>
          </section>
        )}

        {tab === "services" && can(me.role, "services.manage") && (
          <section className="admin-pane active">
            <div className="table-card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>⚙️ บริการที่เปิดให้จองล่วงหน้า</h2>
              <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>เพิ่ม/แก้ไข/ปิดบริการ รายการย่อย ความจุ และช่วงเวลาเฉพาะ — หน้าจองผู้ป่วยใช้ค่าที่ตั้งไว้ทันที</p>
              <div className="admin-tools" style={{ marginBottom: 14 }}>
                <span className="hint" style={{ alignSelf: "center", color: "var(--muted)", fontSize: "0.88rem" }}>
                  {services.length} บริการ ({services.filter((s) => s.active !== false).length} ที่เปิดให้จอง)
                </span>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => openSvcModal(null)}>➕ เพิ่มบริการ</button>
              </div>
              <table className="mini-table">
                <thead><tr><th>บริการ</th><th>ประเภท</th><th>วันให้บริการ</th><th>รายการย่อย</th><th>ความจุ/ช่วง</th><th>ช่วงเวลา</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                <tbody>{services.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.icon} {s.name}</b><span className="td-sub">{s.desc}</span></td>
                    <td>{s.bookingMode === "callback" ? "☎️ ไม่มีเวลานัด" : "📅 เลือกวัน–เวลา"}</td>
                    <td>{s.bookingMode === "callback" ? "—" : fmtDays(svcDays(s))}</td>
                    <td>{s.items.length ? `${s.items.length} รายการ` : "— ไม่มีรายการย่อย"}</td>
                    <td>{s.capacity || 4} คน</td>
                    <td>{s.bookingMode === "callback" ? "—" : s.slotsByDay
                      ? <><b>รายวัน</b><span className="td-sub">{DAY_ORDER.filter((d) => (s.slotsByDay[String(d)] || []).length).map((d) => `${DAY_LABELS[d]} ${s.slotsByDay[String(d)].length} ช่วง`).join(" · ")}</span></>
                      : s.slots ? <><b>{s.slots.length} ช่วง</b> (เฉพาะ)<span className="td-sub">{s.slots[0]}–{s.slots[s.slots.length - 1]}</span></> : <>{globalSlots.length} ช่วง (กลาง)</>}</td>
                    <td>{s.active === false ? <span className="badge badge-cancelled">ปิดชั่วคราว</span> : <span className="badge badge-confirmed">เปิดจองได้</span>}</td>
                    <td><div className="row-actions">
                      <button className="btn-confirm" onClick={() => svcAction("edit", s.id)}>แก้ไข</button>
                      <button className="btn-cancel-row" onClick={() => svcAction("toggle", s.id)}>{s.active === false ? "เปิดใช้" : "ปิด"}</button>
                      <button className="btn-cancel-row" onClick={() => svcAction("delete", s.id)}>ลบ</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ height: 16 }} />
            <div className="table-card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>🕐 ช่วงเวลากลาง</h2>
              <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>ใช้กับบริการที่ไม่ได้ตั้งเวลาเฉพาะ</p>
              <div className="slot-chips">
                {globalSlots.map((t) => (
                  <span className="slot-admin-chip" key={t}>{t}
                    <button type="button" className="chip-x" title="ลบช่วงเวลานี้" onClick={() => {
                      if (globalSlots.length <= 1) { alert("ต้องมีช่วงเวลาอย่างน้อย 1 ช่วง"); return; }
                      saveSlots(globalSlots.filter((x) => x !== t));
                    }}>✕</button>
                  </span>
                ))}
              </div>
              <div className="slot-add">
                <input type="time" className="time-input" onChange={(e) => (e.target.dataset.v = e.target.value)} id="slotTimeInput" />
                <button className="btn btn-primary btn-sm" type="button" onClick={() => {
                  const input = document.getElementById("slotTimeInput");
                  if (!input.value) { alert("เลือกเวลาก่อน"); return; }
                  if (globalSlots.includes(input.value)) { alert(`มีช่วงเวลา ${input.value} อยู่แล้ว`); return; }
                  saveSlots([...globalSlots, input.value].sort());
                  input.value = "";
                }}>+ เพิ่มช่วงเวลา</button>
              </div>
            </div>
            {can(me.role, "settings.manage") && (
              <>
                <div style={{ height: 16 }} />
                <div className="table-card" style={{ padding: 20 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>📅 ระยะเวลาเปิดจองล่วงหน้า</h2>
                  <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>ผู้ป่วยเลือกวันนัดได้ล่วงหน้าไม่เกินกี่วัน (นับจากวันนี้) — มีผลทันทีทุกช่องทาง</p>
                  <div className="slot-add">
                    <input type="number" className="time-input" min="1" max="90" style={{ width: 90 }} value={daysAheadVal} onChange={(e) => setDaysAheadVal(e.target.value)} />
                    <span className="hint" style={{ alignSelf: "center", color: "var(--muted)" }}>วัน</span>
                    <button className="btn btn-primary btn-sm" type="button" onClick={saveDaysAhead}>บันทึก</button>
                    <span className="hint" style={{ alignSelf: "center", color: "var(--muted)" }}>{daysAheadMsg}</span>
                  </div>
                </div>
                <div style={{ height: 16 }} />
                <div className="table-card" style={{ padding: 20 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>💳 สิทธิการรักษา (Payment / coverage)</h2>
                  <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>
                    ตัวเลือกใน dropdown ของหน้าจอง — กรอกทั้งชื่อไทยและอังกฤษ (โหมด EN จะแสดงชื่ออังกฤษ ถ้าเว้นว่างจะแสดงชื่อไทย)
                  </p>
                  {rightsEdit.map((r, idx) => (
                    <div className="svc-item-row" key={idx}>
                      <input className="form-input" placeholder="ชื่อสิทธิ์ เช่น ประกันสังคม" value={r.th}
                        onChange={(e) => setRightsEdit(rightsEdit.map((x, i) => i === idx ? { ...x, th: e.target.value } : x))} />
                      <input className="form-input si-en" placeholder="English เช่น Social Security" value={r.en || ""}
                        onChange={(e) => setRightsEdit(rightsEdit.map((x, i) => i === idx ? { ...x, en: e.target.value } : x))} />
                      <button type="button" className="btn-remove-item" title="ลบรายการนี้"
                        onClick={() => setRightsEdit(rightsEdit.filter((_, i) => i !== idx))}>✕</button>
                    </div>
                  ))}
                  <div className="slot-add" style={{ marginTop: 4 }}>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setRightsEdit([...rightsEdit, { th: "", en: "" }])}>+ เพิ่มสิทธิ์</button>
                    <button className="btn btn-primary btn-sm" type="button" onClick={saveRights}>บันทึก</button>
                    <span className="hint" style={{ alignSelf: "center", color: "var(--muted)" }}>{rightsMsg}</span>
                  </div>
                </div>
                <div style={{ height: 16 }} />
                <div className="table-card" style={{ padding: 20 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>📞 เงื่อนไขแท็บ "นัดที่กำลังจะถึง"</h2>
                  <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>กำหนดว่าแท็บนัดที่กำลังจะถึงจะดึงคิวช่วงไหน — มีผลทันที</p>
                  <div className="slot-add" style={{ flexWrap: "wrap" }}>
                    <input type="number" className="time-input" min="1" max="90" style={{ width: 90 }} value={upCfg.days}
                      onChange={(e) => setUpCfg((v) => ({ ...v, days: e.target.value }))} />
                    <span className="hint" style={{ alignSelf: "center", color: "var(--muted)" }}>วันข้างหน้า</span>
                    <label className="dm-btn" style={{ cursor: "pointer" }}>
                      <input type="checkbox" style={{ marginRight: 6 }} checked={!!upCfg.includeToday}
                        onChange={(e) => setUpCfg((v) => ({ ...v, includeToday: e.target.checked }))} />
                      รวมวันนี้ด้วย
                    </label>
                    <label className="dm-btn" style={{ cursor: "pointer" }}>
                      <input type="checkbox" style={{ marginRight: 6 }} checked={!!upCfg.includeNoshow}
                        onChange={(e) => setUpCfg((v) => ({ ...v, includeNoshow: e.target.checked }))} />
                      รวมสถานะ "ไม่มาตามนัด"
                    </label>
                    <button className="btn btn-primary btn-sm" type="button" onClick={saveUpCfg}>บันทึก</button>
                    <span className="hint" style={{ alignSelf: "center", color: "var(--muted)" }}>{upCfgMsg}</span>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {tab === "users" && can(me.role, "users.manage") && (
          <section className="admin-pane active">
            <div className="table-card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>👥 บัญชีเจ้าหน้าที่</h2>
              <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>เพิ่ม/แก้ไขบัญชีและสิทธิ์การใช้งาน — ตั้งรหัสผ่านใหม่ได้จากปุ่ม "แก้ไข" (เว้นว่างไว้ = คงรหัสเดิม)</p>
              <div className="admin-tools" style={{ marginBottom: 14 }}>
                <span className="hint" style={{ alignSelf: "center", color: "var(--muted)", fontSize: "0.88rem" }}>
                  {staff.length} บัญชี ({staff.filter((u) => u.role === "admin").length} admin · {staff.filter((u) => u.role === "sale").length} sale · {staff.filter((u) => u.role === "cs").length} cs)
                </span>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => openUserModal(null)}>➕ เพิ่มผู้ใช้</button>
              </div>
              <table className="mini-table">
                <thead><tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>สิทธิ์</th><th>จัดการ</th></tr></thead>
                <tbody>{staff.map((u) => (
                  <tr key={u.id}>
                    <td><b>👤 {u.name}</b>{u.id === me.id ? <span className="td-sub"> (บัญชีที่ใช้อยู่)</span> : null}</td>
                    <td>{u.username}</td>
                    <td><span className={"badge role-" + u.role}>{roleLabel(u.role)}</span></td>
                    <td><div className="row-actions">
                      <button className="btn-confirm" onClick={() => openUserModal(u)}>แก้ไข</button>
                      <button className="btn-cancel-row" onClick={() => delUser(u)}>ลบ</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ height: 16 }} />
            <div className="table-card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>🔑 สิทธิ์ของแต่ละบทบาท</h2>
              <p className="hint" style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "0.9rem" }}>ทุกบทบาททำงานคิวพื้นฐานได้ (ดู/ค้นหา/ยืนยัน/เลื่อน/ยกเลิก, รับ walk-in, โทรยืนยัน, จัดนัดหมาย, รายงาน) — ต่างกันที่ส่วนเพิ่มด้านล่าง</p>
              <table className="mini-table">
                <thead><tr><th>บทบาท</th><th>ทำส่วนเพิ่มนี้ได้</th></tr></thead>
                <tbody>
                  <tr><td><span className="badge role-admin">{ROLES.admin.label}</span></td>
                    <td>ทุกอย่าง — รวมถึงจัดการผู้ใช้ จัดการบริการ/ช่วงเวลา ค่าตั้งระบบ และดูประวัติการใช้งาน</td></tr>
                  <tr><td><span className="badge role-sale">{ROLES.sale.label}</span></td>
                    <td>งานตัวแทน: รับคิวเป็นชุด และนำเข้าคิวจากไฟล์ Excel/CSV ของตัวแทน</td></tr>
                  <tr><td><span className="badge role-cs">{ROLES.cs.label}</span></td>
                    <td>งานคิวพื้นฐานอย่างเดียว</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        )}
          </div>
        </main>
      </div>

      {/* โมดัลรับคิว walk-in */}
      <Modal show={!!walkin} onClose={() => setWalkin(null)}>
        {walkin && (
          <>
            <h2>🚶 รับคิวผู้ป่วย walk-in</h2>
            <p className="hint">กรอกสั้นๆ ให้ครบแล้วกดบันทึก — ค่าเริ่มต้นเป็นวันนี้ เลือกวันอื่นได้ถ้าผู้ป่วยนัดมาลงทะเบียนล่วงหน้า</p>
            <form onSubmit={submitWalkin} noValidate>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className={"form-field" + (walkin.touched?.name && !walkin.name.trim() ? " invalid" : "")}>
                  <label>ชื่อ–นามสกุล *</label>
                  <input className="form-input" value={walkin.name} onChange={(e) => setWalkin({ ...walkin, name: e.target.value })} />
                  <span className="err">กรุณากรอกชื่อ</span>
                </div>
                <div className="form-field"><label>เบอร์โทร (ถ้ามี — ไม่มีเบอร์กรอกอีเมลแทนก็ได้)</label>
                  <input className="form-input" type="tel" placeholder="08XXXXXXXX หรือ +95…" value={walkin.phone} onChange={(e) => setWalkin({ ...walkin, phone: e.target.value })} />
                </div>
                <div className="form-field"><label>อีเมล (ถ้ามี)</label>
                  <input className="form-input" type="email" placeholder="name@email.com — ใช้ติดต่อเมื่อโทรไม่ได้" value={walkin.email} onChange={(e) => setWalkin({ ...walkin, email: e.target.value })} />
                </div>
                <div className="form-field"><label>แผนก *</label>
                  <select className="form-select" value={walkin.service} onChange={(e) => { setWalkin({ ...walkin, service: e.target.value }); fillWalkinTimes(e.target.value, walkin.date); }}>
                    {services.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                  </select>
                </div>
                <div className="form-field"><label>วันที่ *</label>
                  <ThDatePicker label="เลือกวันที่" value={walkin.date}
                    onChange={(v) => { if (v) fillWalkinTimes(walkin.service, v); else fillWalkinTimes(walkin.service, toISO(new Date())); }}
                    minDate={new Date()} maxDate={new Date(Date.now() + daysAheadVal * 864e5)}
                    shouldDisableDate={dayDisabled(walkin.service)} />
                </div>
                <div className="form-field"><label>เวลาคิว *</label>
                  <select className="form-select" value={walkin.time} onChange={(e) => setWalkin({ ...walkin, time: e.target.value })}>
                    {walkin.times.length
                      ? walkin.times.map((x) => (
                          <option key={x.time} value={x.time}>
                            {x.time}{x.remaining > 0 ? ` (เหลือ ${x.remaining} ที่)` : " (ออนไลน์เต็ม — รับ walk-in ได้)"}
                          </option>
                        ))
                      : <option value="">— ไม่มีช่วงเวลาในระบบ —</option>}
                  </select>
                </div>
                <div className="form-field"><label>สิทธิการรักษา</label>
                  <select className="form-select" value={walkin.rights} onChange={(e) => setWalkin({ ...walkin, rights: e.target.value })}>
                    {(rightsCfg.length ? rightsCfg : CONFIG.rightsOptions.map((r) => ({ th: r }))).map((r) => <option key={r.th}>{r.th}</option>)}
                  </select>
                </div>
                <div className="form-field"><label>รหัสตัวแทน (ถ้ามาจากตัวแทน)</label>
                  <input className="form-input" placeholder="เช่น AG-001 (เว้นว่างถ้าไม่มี)" value={walkin.agency} onChange={(e) => setWalkin({ ...walkin, agency: e.target.value })} />
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setWalkin(null)}>ยกเลิก</button>
                <button className="btn btn-primary btn-sm" type="submit">บันทึกคิว ✓</button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* โมดัลรับคิวเป็นชุด */}
      <Modal show={!!batch} onClose={() => setBatch(null)}>
        {batch && (
          <>
            <h2>📦 รับคิวเป็นชุดจากตัวแทน</h2>
            <p className="hint">วางรายชื่อจาก LINE / Excel — บรรทัดละ 1 คน รูปแบบ <b>ชื่อ, เบอร์โทร, อีเมล</b> (คั่น comma/tab ก็ได้ เบอร์กับอีเมลเว้นว่างได้) — <b>แนะนำใส่เบอร์ทุกคน</b> ไม่ใส่ก็ได้แต่จะติดต่อผู้ป่วยรายนั้นไม่ได้</p>
            <form onSubmit={submitBatch} noValidate>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className={"form-field" + (batch.invalid && !batch.agency.trim() ? " invalid" : "")}>
                  <label>รหัสตัวแทน *</label>
                  <input className="form-input" list="agencyList" placeholder="เช่น AG-001" value={batch.agency} onChange={(e) => setBatch({ ...batch, agency: e.target.value })} />
                  <datalist id="agencyList">{CONFIG.agencyCodes.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</datalist>
                  <span className="err">กรุณาใส่รหัสตัวแทน</span>
                </div>
                <div className="form-field"><label>บริการ *</label>
                  <select className="form-select" value={batch.service} onChange={(e) => { setBatch({ ...batch, service: e.target.value }); fillBatchTimes(e.target.value, batch.date); }}>
                    {services.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <div className="form-field"><label>วันที่ *</label>
                    <ThDatePicker label="เลือกวันที่" value={batch.date} shouldDisableDate={dayDisabled(batch.service)} onChange={(v) => { setBatch((b) => ({ ...b, date: v })); fillBatchTimes(batch.service, v); }} />
                  </div>
                  <div className="form-field"><label>เวลาคิว *</label>
                    <select className="form-select" value={batch.time} onChange={(e) => setBatch({ ...batch, time: e.target.value })}>
                      {batch.times.length
                        ? batch.times.map((x) => <option key={x.time} value={x.time}>{x.time} (เหลือ {x.remaining} ที่)</option>)
                        : <option value="">— ไม่เหลือช่วงเวลาว่าง —</option>}
                    </select>
                  </div>
                </div>
                <div className="form-field"><label>สิทธิการรักษา</label>
                  <select className="form-select" value={batch.rights} onChange={(e) => setBatch({ ...batch, rights: e.target.value })}>
                    {(rightsCfg.length ? rightsCfg : CONFIG.rightsOptions.map((r) => ({ th: r }))).map((r) => <option key={r.th}>{r.th}</option>)}
                  </select>
                </div>
                <div className={"form-field" + (batch.invalid && !batch.names.split("\n").map((l) => l.trim()).filter(Boolean).length ? " invalid" : "")}>
                  <label>รายชื่อ (บรรทัดละ 1 คน) *</label>
                  <textarea className="form-input" rows={6} placeholder={"สมชาย ใจดี, 0812345678\nAye Chan, +959876543210, aye@email.com"} value={batch.names} onChange={(e) => setBatch({ ...batch, names: e.target.value })} />
                  {(() => {
                    const rows = batch.names.split("\n").map((l) => l.trim()).filter(Boolean)
                      .map((line) => { const parts = line.split(/[,;\t]/).map((p) => p.trim()); return { name: parts[0] || "", phone: parts[1] || "", email: parts[2] || "" }; })
                      .filter((r) => r.name);
                    const noPhone = rows.filter((r) => !r.phone).length;
                    if (!rows.length) return null;
                    return (
                      <span className="hint" style={{ display: "block", marginTop: 6, fontSize: "0.85rem", color: noPhone ? "#b45309" : "var(--muted)" }}>
                        นับได้ {rows.length} คน{noPhone ? ` — ⚠️ มี ${noPhone} คนที่ยังไม่ได้ใส่เบอร์โทร (จะติดต่อไม่ได้)` : " — ทุกคนมีเบอร์โทรครบ ✓"}
                      </span>
                    );
                  })()}
                  <span className="err">ต้องมีรายชื่ออย่างน้อย 1 คน</span>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setBatch(null)}>ยกเลิก</button>
                <button className="btn btn-primary btn-sm" type="submit">บันทึกทั้งชุด ✓</button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* โมดัลนำเข้าไฟล์ Excel/CSV */}
      <Modal show={!!imp} onClose={() => setImp(null)} wide>
        {imp && (
          <>
            <h2>📥 นำเข้าคิวจากไฟล์ Excel / CSV (ตัวแทน)</h2>
            <p className="hint">โหลดเทมเพลต → ตัวแทนกรอกรายชื่อ (ต่างวัน/ต่างเวลา/ต่างบริการในไฟล์เดียวได้) → เลือกไฟล์ → ตรวจดู preview → นำเข้า</p>
            <div className="import-steps">
              <a className="btn btn-ghost btn-sm" href="/api/agency-template" download="agency-queue-template.xlsx">⬇ ดาวน์โหลดเทมเพลต (.xlsx)</a>
              <span className="hint" style={{ alignSelf: "center" }}>หรือ</span>
              <input type="file" className="form-input" accept=".xlsx,.csv" ref={impFileRef} onChange={onImportFile} />
            </div>
            {imp.rows.length > 0 && (
              <>
                <div className="imp-summary">
                  อ่านได้ <b>{imp.rows.length}</b> แถว · <b style={{ color: "var(--primary-dark)" }}>{impOk.length}</b> แถวพร้อมนำเข้า
                  {impOk.length < imp.rows.length ? <> · <b style={{ color: "var(--danger)" }}>{imp.rows.length - impOk.length}</b> แถวมีปัญหา (จะถูกข้าม)</> : null}
                </div>
                <div className="table-scroll imp-table">
                  <table className="mini-table">
                    <thead><tr><th>แถว</th><th>วันที่</th><th>เวลา</th><th>บริการ</th><th>ชื่อ</th><th>เบอร์โทร</th><th>อีเมล</th><th>สิทธิ์</th><th>ผลการตรวจ</th></tr></thead>
                    <tbody>{imp.rows.map((r) => {
                      const raw = r.raw || {};
                      return (
                        <tr key={r.row}>
                          <td>{r.row}</td>
                          <td>{r.date || raw.date || "-"}</td>
                          <td>{r.time || raw.time || "-"}</td>
                          <td>{r.service || raw.service || "-"}</td>
                          <td>{r.name || raw.name || "-"}</td>
                          <td>{r.phone || raw.phone || (r.ok ? "-" : "")}</td>
                          <td>{r.email || raw.email || (r.ok ? "-" : "")}</td>
                          <td>{r.rights || (r.ok ? "" : raw.rights)}</td>
                          <td>{r.ok
                            ? <span className="badge badge-confirmed">✓ พร้อมนำเข้า</span>
                            : <><span className="badge badge-cancelled">✗ ข้าม</span><span className="imp-err">{r.error}</span></>}
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </>
            )}
            <form onSubmit={submitImport} noValidate>
              <div className={"form-field" + (imp.invalid && !imp.agency.trim() ? " invalid" : "")} style={{ marginTop: 14 }}>
                <label>รหัสตัวแทนของทั้งไฟล์นี้ *</label>
                <input className="form-input" list="agencyList2" placeholder="เช่น AG-001" value={imp.agency} onChange={(e) => setImp({ ...imp, agency: e.target.value })} />
                <datalist id="agencyList2">{CONFIG.agencyCodes.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</datalist>
                <span className="err">กรุณาใส่รหัสตัวแทน</span>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setImp(null)}>ยกเลิก</button>
                <button className="btn btn-primary btn-sm" type="submit" disabled={!impOk.length}>
                  {impOk.length ? `นำเข้า ${impOk.length} คิว ✓` : "นำเข้าคิว ✓"}
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* โมดัลเลื่อนนัด */}
      <Modal show={!!resched} onClose={() => setResched(null)}>
        {resched && (
          <>
            <h2>📅 เลื่อนนัด</h2>
            <p className="hint">{resched.info}</p>
            <form onSubmit={submitResched} noValidate>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="form-field"><label>วันที่ใหม่ *</label>
                    <ThDatePicker label="เลือกวันที่ใหม่" value={resched.date} onChange={reschedFill} shouldDisableDate={dayDisabled(resched.serviceId)} sx={{ width: "100%" }} />
                  </div>
                <div className="form-field"><label>เวลาใหม่ *</label>
                  <select className="form-select" value={resched.time} onChange={(e) => setResched({ ...resched, time: e.target.value })}>
                    {resched.times.map((x) => <option key={x.time} value={x.time}>{x.time} (เหลือ {x.remaining} ที่)</option>)}
                  </select>
                  {resched.err && <span className="err" style={{ display: "block" }}>{resched.err}</span>}
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setResched(null)}>ยกเลิก</button>
                <button className="btn btn-primary btn-sm" type="submit">บันทึกการเลื่อน ✓</button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* โมดัลนัดเวลาให้คำขอรอนัดหมาย — โทรแล้วตกลงเวลาแน่นอน บันทึกที่คำขอเลย ไม่ต้องสร้างคิวใหม่ */}
      <Modal show={!!cbSched} onClose={() => setCbSched(null)}>
        {cbSched && (
          <form onSubmit={submitCbSched} noValidate>
            <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>📅 นัดเวลาให้คำขอรอนัดหมาย</h2>
            <p className="hint" style={{ margin: "0 0 14px" }}>{cbSched.info}</p>
            <div className="form-grid">
              <div className="form-field"><label>วันที่นัด *</label>
                <ThDatePicker label="เลือกวันที่นัด" value={cbSched.date}
                  onChange={(v) => setCbSched((m) => ({ ...m, date: v }))}
                  minDate={new Date()} maxDate={new Date(Date.now() + 90 * 864e5)} shouldDisableDate={dayDisabled(cbSched.serviceId)} sx={{ width: "100%" }} />
              </div>
              <div className="form-field"><label>เวลานัด *</label>
                <select className="form-select" value={cbSched.time} onChange={(e) => setCbSched((m) => ({ ...m, time: e.target.value }))}>
                  <option value="">— เลือกเวลา —</option>
                  {cbSched.slots.map((t) => <option key={t} value={t}>{t} น.</option>)}
                </select>
              </div>
            </div>
            <p className="hint" style={{ margin: "0 0 8px", fontSize: "0.85rem" }}>บันทึกแล้วคำขอจะกลายเป็นนัดจริง — ขึ้นในตารางคิวของวันนัด และแท็บนัดที่กำลังจะถึงทันที</p>
            {cbSched.err && <div className="err-box" style={{ display: "block" }}>⚠️ {cbSched.err}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setCbSched(null)}>ยกเลิก</button>
              <button className="btn btn-primary btn-sm" type="submit">บันทึกนัด ✓</button>
            </div>
          </form>
        )}
      </Modal>

      {/* โมดัลผลการโทร — กด "โทรแล้ว" ในแท็บนัดที่กำลังจะถึง แล้วเลือกว่าตกลงกันยังไง */}
      <Modal show={!!callResult} onClose={() => { if (!(callResult && callResult.busy)) setCallResult(null); }}>
        {callResult && callResult.mode !== "resched" && (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>📞 ผลการโทรเป็นยังไงบ้าง</h2>
            <p className="hint" style={{ margin: "0 0 6px" }}>{callResult.info}</p>
            <div className="call-opts">
              <button type="button" className="call-opt" disabled={callResult.busy} onClick={() => submitCallResult("confirmed")}>
                <span className="co-ico">✅</span>
                <span><b>ยืนยันมาตามนัด</b><span className="co-sub">เปลี่ยนสถานะเป็น "ยืนยันแล้ว"</span></span>
              </button>
              <button type="button" className="call-opt" disabled={callResult.busy} onClick={enterCallResched}>
                <span className="co-ico">📅</span>
                <span><b>เลื่อนนัด</b><span className="co-sub">เลือกวันที่–เวลาใหม่ให้ผู้ป่วย</span></span>
              </button>
              <button type="button" className="call-opt co-danger" disabled={callResult.busy} onClick={() => submitCallResult("cancelled")}>
                <span className="co-ico">✕</span>
                <span><b>ยกเลิกนัด</b><span className="co-sub">เปลี่ยนสถานะเป็น "ยกเลิก"</span></span>
              </button>
              <button type="button" className="call-opt" disabled={callResult.busy} onClick={() => submitCallResult("mark")}>
                <span className="co-ico">☎️</span>
                <span><b>บันทึกว่าโทรแล้ว</b><span className="co-sub">ไม่เปลี่ยนสถานะนัด — ใช้ตอนยังติดต่อไม่ได้ จะได้โทรใหม่</span></span>
              </button>
            </div>
            {callResult.err && <p className="err" style={{ margin: "8px 0 0" }}>{callResult.err}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" type="button" disabled={callResult.busy} onClick={() => setCallResult(null)}>ปิด (ยังไม่บันทึก)</button>
            </div>
          </>
        )}
        {callResult && callResult.mode === "resched" && (
          <form onSubmit={(e) => { e.preventDefault(); submitCallResult("resched"); }} noValidate>
            <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>📅 เลื่อนนัดหลังโทรแล้ว</h2>
            <p className="hint" style={{ margin: "0 0 14px" }}>{callResult.info}</p>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="form-field"><label>วันที่ใหม่ *</label>
                <ThDatePicker label="เลือกวันที่ใหม่" value={callResult.date} onChange={callReschedFill} shouldDisableDate={dayDisabled(callResult.serviceId)} sx={{ width: "100%" }} />
              </div>
              <div className="form-field"><label>เวลาใหม่ *</label>
                <select className="form-select" value={callResult.time} onChange={(e) => setCallResult({ ...callResult, time: e.target.value })}>
                  {callResult.times.length
                    ? callResult.times.map((x) => <option key={x.time} value={x.time}>{x.time} (เหลือ {x.remaining} ที่)</option>)
                    : <option value="">— เลือกวันที่ก่อน —</option>}
                </select>
                {callResult.err && <span className="err" style={{ display: "block" }}>{callResult.err}</span>}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" type="button" disabled={callResult.busy} onClick={() => setCallResult({ ...callResult, mode: "", err: "" })}>← กลับ</button>
              <button className="btn btn-primary btn-sm" type="submit" disabled={callResult.busy}>บันทึกการเลื่อน ✓</button>
            </div>
          </form>
        )}
      </Modal>

      {/* โมดัลเพิ่ม/แก้ไขบริการ */}
      <Modal show={!!svcModal} onClose={() => setSvcModal(null)}>
        {svcModal && (
          <>
            <h2>{svcModal.id ? "✏️ แก้ไขบริการ" : "➕ เพิ่มบริการใหม่"}</h2>
            <p className="hint">ตั้งชื่อหมวดบริการ รายการย่อย ความจุ และช่วงเวลา</p>
            <form onSubmit={submitSvc} noValidate>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="form-field"><label>ไอคอน</label>
                  <div className="icon-picks">
                    {SVC_ICONS.map((i) => (
                      <button type="button" key={i} className={"icon-chip" + (svcModal.icon === i ? " sel" : "")}
                        onClick={() => setSvcModal({ ...svcModal, icon: i })}>{i}</button>
                    ))}
                  </div>
                  <input className="form-input" type="text" maxLength={4} placeholder="🩺" value={svcModal.icon} onChange={(e) => setSvcModal({ ...svcModal, icon: e.target.value })} />
                </div>
                <div className={"form-field" + (svcModal.invalid && !svcModal.name.trim() ? " invalid" : "")}>
                  <label>ชื่อบริการ *</label>
                  <input className="form-input" value={svcModal.name} onChange={(e) => setSvcModal({ ...svcModal, name: e.target.value })} />
                  <span className="err">กรุณาใส่ชื่อบริการ</span>
                </div>
                <div className="form-field"><label>ชื่อบริการ — English (แสดงตอนผู้ป่วยสลับภาษา EN)</label>
                  <input className="form-input" placeholder="เช่น Health Check-up" value={svcModal.nameEn} onChange={(e) => setSvcModal({ ...svcModal, nameEn: e.target.value })} />
                </div>
                <div className="form-field"><label>คำอธิบายสั้น ๆ</label>
                  <input className="form-input" value={svcModal.desc} onChange={(e) => setSvcModal({ ...svcModal, desc: e.target.value })} />
                </div>
                <div className="form-field"><label>คำอธิบาย — English</label>
                  <input className="form-input" placeholder="Annual health check-up packages…" value={svcModal.descEn} onChange={(e) => setSvcModal({ ...svcModal, descEn: e.target.value })} />
                </div>
                <div className="form-field"><label>ประเภทการรับคิว *</label>
                  <select className="form-select" value={svcModal.mode} onChange={(e) => setSvcModal({ ...svcModal, mode: e.target.value })}>
                    <option value="slot">📅 เลือกวัน–เวลาเอง (ปกติ)</option>
                    <option value="callback">☎️ ไม่มีเวลานัด — โรงพยาบาลติดต่อกลับนัดให้</option>
                  </select>
                  {svcModal.mode === "callback" && (
                    <span className="hint" style={{ display: "block", marginTop: 6, fontSize: "0.82rem" }}>
                      ผู้ป่วยไม่ต้องเลือกวัน–เวลา กรอกข้อมูลติดต่อแล้วรอเจ้าหน้าที่โทรกลับนัด — คำขอจะไปปรากฏในเมนู &quot;รอนัดหมาย&quot;
                    </span>
                  )}
                </div>
                {svcModal.mode !== "callback" && (
                <div className="form-field"><label>ความจุต่อช่วงเวลา (คน) *</label>
                  <input className="form-input" type="number" min="1" max="99" value={svcModal.cap} onChange={(e) => setSvcModal({ ...svcModal, cap: e.target.value })} />
                </div>
                )}
                {svcModal.mode !== "callback" && (
                <div className="form-field">
                  <label>🕐 เวลาให้บริการ *</label>
                  <div className="date-mode" role="group" aria-label="โหมดเวลาให้บริการ" style={{ marginBottom: 8 }}>
                    <button type="button" className={"dm-btn" + (svcModal.slotMode !== "perDay" ? " active" : "")}
                      onClick={() => setSvcModal({ ...svcModal, slotMode: "uniform" })}>เวลาเดียวกันทุกวัน</button>
                    <button type="button" className={"dm-btn" + (svcModal.slotMode === "perDay" ? " active" : "")}
                      onClick={() => setSvcModal({ ...svcModal, slotMode: "perDay" })}>ตั้งเวลารายวัน</button>
                  </div>
                  {svcModal.slotMode === "perDay" ? (
                    <>
                      <p className="hint" style={{ margin: "0 0 6px", fontSize: "0.85rem" }}>
                        ตั้งเวลาแยกแต่ละวันได้ — วันที่ไม่มีเวลาเลย = ไม่ให้บริการวันนั้น (หน้าจองจะปิดวันนั้นให้เอง)
                      </p>
                      {DAY_ORDER.map((d) => {
                        const times = svcModal.perDay[d] || [];
                        return (
                          <div key={d} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "5px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                            <b style={{ width: 80, fontSize: "0.88rem", color: times.length ? "var(--ink)" : "var(--muted)" }}>{DAY_LABELS_FULL[d]}</b>
                            <div className="slot-chips" style={{ marginBottom: 0, flex: 1, minWidth: 0 }}>
                              {times.map((t) => (
                                <span className="slot-admin-chip" key={t}>{t}
                                  <button type="button" className="chip-x" title="ลบเวลานี้"
                                    onClick={() => setSvcModal({ ...svcModal, perDay: { ...svcModal.perDay, [d]: times.filter((x) => x !== t) } })}>✕</button>
                                </span>
                              ))}
                              {!times.length && <span className="hint" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>— ไม่ให้บริการ —</span>}
                            </div>
                            <input type="time" className="time-input" id={"pd" + d} style={{ width: 88 }} />
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                              const input = document.getElementById("pd" + d);
                              if (!input.value) { alert("เลือกเวลาก่อน"); return; }
                              if (times.includes(input.value)) { alert(`มีเวลา ${input.value} อยู่แล้ว`); return; }
                              setSvcModal({ ...svcModal, perDay: { ...svcModal.perDay, [d]: [...times, input.value].sort() } });
                              input.value = "";
                            }}>+ เพิ่ม</button>
                            <button type="button" className="btn btn-ghost btn-sm" title="ใช้เวลาของวันนี้กับทุกวัน" onClick={() => {
                              if (!times.length) { alert("เพิ่มเวลาของวันนี้ก่อน แล้วค่อยคัดลอก"); return; }
                              const copy = {}; for (const x of DAY_ORDER) copy[x] = [...times];
                              setSvcModal({ ...svcModal, perDay: copy });
                            }}>⧉ ทุกวัน</button>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <label style={{ fontSize: "0.88rem", margin: "6px 0 4px" }}>📅 วันที่ให้บริการ</label>
                      <div className="day-chips">
                        {DAY_ORDER.map((d) => {
                          const on = svcModal.days.includes(d);
                          return (
                            <button type="button" key={d} className={"day-chip" + (on ? " sel" : "")}
                              onClick={() => {
                                if (on && svcModal.days.length <= 1) { alert("ต้องเลือกวันให้บริการอย่างน้อย 1 วัน"); return; }
                                setSvcModal({ ...svcModal, days: on ? svcModal.days.filter((x) => x !== d) : [...svcModal.days, d] });
                              }}>{DAY_LABELS[d]}</button>
                          );
                        })}
                      </div>
                      <span className="hint" style={{ display: "block", marginTop: 6, fontSize: "0.85rem" }}>
                        ผู้ป่วยจองล่วงหน้าได้เฉพาะวันที่เลือก (ปฏิทินหน้าจองจะปิดวันอื่นให้อัตโนมัติ) — {svcModal.days.length === 7 ? "ปัจจุบัน: ทุกวัน" : `ปัจจุบัน: ${fmtDays(svcModal.days)}`}
                      </span>
                      <label style={{ fontSize: "0.88rem", margin: "10px 0 4px" }}>ช่วงเวลา (ใช้ทุกวันที่เปิด)</label>
                      <p className="hint" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
                        {svcModal.slotsWorking !== null
                          ? `กำหนดเวลาเฉพาะของบริการนี้ ${svcModal.slotsWorking.length} ช่วง`
                          : `กำลังใช้ค่ากลาง ${globalSlots.length} ช่วง — เพิ่ม/ลบที่นี่เพื่อกำหนดเวลาเฉพาะ`}
                      </p>
                      <div className="slot-chips">
                        {(svcModal.slotsWorking !== null ? svcModal.slotsWorking : globalSlots).map((t) => (
                          <span className="slot-admin-chip" key={t}>{t}
                            <button type="button" className="chip-x" onClick={() => {
                              const base = svcModal.slotsWorking !== null ? svcModal.slotsWorking : [...globalSlots];
                              if (base.length <= 1) { alert("ต้องมีช่วงเวลาอย่างน้อย 1 ช่วง"); return; }
                              setSvcModal({ ...svcModal, slotsWorking: base.filter((x) => x !== t) });
                            }}>✕</button>
                          </span>
                        ))}
                      </div>
                      <div className="slot-add">
                        <input type="time" className="time-input" id="svSlotInput" />
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => {
                          const input = document.getElementById("svSlotInput");
                          if (!input.value) { alert("เลือกเวลาก่อน"); return; }
                          const base = svcModal.slotsWorking !== null ? svcModal.slotsWorking : [...globalSlots];
                          if (base.includes(input.value)) { alert(`มีช่วงเวลา ${input.value} อยู่แล้ว`); return; }
                          setSvcModal({ ...svcModal, slotsWorking: [...base, input.value].sort() });
                          input.value = "";
                        }}>+ เพิ่มเวลา</button>
                        {svcModal.slotsWorking !== null && (
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSvcModal({ ...svcModal, slotsWorking: null })}>↺ ใช้ค่ากลาง</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                )}
                <div className="form-field">
                  <label>รายการย่อย (ถ้ามี — ไม่ใส่ก็ได้ บริการไม่มีรายการย่อยก็จองได้)</label>
                  <div>
                    {svcModal.items.map((it, idx) => (
                      <div className="svc-item-row" key={idx}>
                        <input className="form-input si-name" placeholder="ชื่อรายการ เช่น ปรึกษาแพทย์" value={it.name}
                          onChange={(e) => setSvcModal({ ...svcModal, items: svcModal.items.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) })} />
                        <input className="form-input si-en" placeholder="Item name (EN)" value={it.nameEn || ""}
                          onChange={(e) => setSvcModal({ ...svcModal, items: svcModal.items.map((x, i) => i === idx ? { ...x, nameEn: e.target.value } : x) })} />
                        <button type="button" className="btn-remove-item" title="ลบรายการนี้" onClick={() => setSvcModal({ ...svcModal, items: svcModal.items.filter((_, i) => i !== idx) })}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-ghost btn-sm" type="button" style={{ marginTop: 4 }} onClick={() => setSvcModal({ ...svcModal, items: [...svcModal.items, { name: "", nameEn: "", price: 0 }] })}>+ เพิ่มรายการ</button>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSvcModal(null)}>ยกเลิก</button>
                <button className="btn btn-primary btn-sm" type="submit">บันทึกบริการ ✓</button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* popup รายละเอียดผู้จอง — คลิกแถวในตารางคิวรายวัน (นอกคอลัมน์ "จัดการ") */}
      <Modal show={!!detail} onClose={() => setDetail(null)}>
        {detail && (() => {
          const s = svc(detail.serviceId);
          const item = (s.items || []).find((i) => i.id === detail.itemId);
          const meta = STATUS_META[detail.status] || { label: detail.status, cls: "" };
          return (
            <>
              <h2>👤 รายละเอียดผู้จอง</h2>
              <div className="detail-head">
                <div>
                  <div className="detail-name">{detail.name}</div>
                  <div className="hint" style={{ color: "var(--muted)" }}>
                    {detail.code} · คิวที่ {detail.qno} · <span className={"badge " + meta.cls}>{meta.label}</span>
                  </div>
                </div>
                {chBadge(detail.source, detail.agencyCode)}
              </div>
              <dl className="detail-grid">
                <div><dt>เบอร์โทรศัพท์</dt><dd>{detail.phone && detail.phone !== "-" ? <a href={"tel:" + detail.phone}>{detail.phone}</a> : <span style={{ color: "var(--muted)", fontWeight: 400 }}>ไม่ระบุเบอร์</span>}</dd></div>
                {detail.email ? <div><dt>อีเมล</dt><dd><a href={"mailto:" + detail.email}>{detail.email}</a></dd></div> : null}
                <div><dt>บริการ</dt><dd>{s.icon} {s.name}</dd></div>
                {item && <div><dt>รายการ</dt><dd>{item.name}</dd></div>}
                <div><dt>วัน–เวลานัด</dt><dd>{detail.date ? <>{fmtFullTh(detail.date)} เวลา {detail.time} น.</> : "📞 รอนัดหมาย — ยังไม่มีวัน–เวลานัด"}</dd></div>
                <div><dt>สิทธิการรักษา</dt><dd>{detail.rights || "—"}</dd></div>
                {detail.agencyCode ? <div><dt>รหัสตัวแทน</dt><dd>{detail.agencyCode}</dd></div> : null}
                <div><dt>หมายเหตุ</dt><dd>{detail.note || "—"}</dd></div>
                <div><dt>สร้างเมื่อ</dt><dd>{detail.createdAt ? new Date(detail.createdAt).toLocaleString("th-TH", { dateStyle: "full", timeStyle: "short" }) + " น." : "—"}</dd></div>
              </dl>
              <div className="modal-actions">
                <button className="btn btn-primary btn-sm" type="button" onClick={() => setDetail(null)}>ปิดหน้าต่าง</button>
              </div>
            </>
          );
        })()}
      </Modal>

      {/* popup เจาะดูที่นั่งรายช่วงเวลาของวันที่คลิกในปฏิทินว่าง — ใช้ข้อมูลชุดเดียวกับชิปในช่องวัน (จาก /api/calendar) */}
      <Modal show={!!calDay} onClose={() => setCalDay(null)}>
        {calDay && calData && (() => {
          const day = calData.days[calDay] || {};
          const svcList = calSvc === "all" ? calData.services : calData.services.filter((s) => s.id === calSvc);
          return (
            <>
              <h2>🗓️ ที่นั่งรายช่วงเวลา — {fmtFullTh(calDay)}</h2>
              <p className="hint" style={{ color: "var(--muted)", margin: "0 0 12px" }}>ตัวเลขคือที่นั่งที่ยังว่างของช่วงเวลานั้น · เหลือง = ใกล้เต็ม (เหลือ ≤ ¼ ของความจุ) · แดง = เต็ม · เทา = เวลาผ่านมาแล้ว</p>
              {calDay > calData.bookUntil && (
                <p className="hint" style={{ margin: "0 0 12px", padding: "8px 12px", background: "var(--primary-softer)", borderRadius: 10, color: "var(--primary-dark)" }}>
                  ℹ️ วันนี้ยังไม่เปิดให้จองล่วงหน้า (เปิดจองได้ถึง {fmtDateShort(calData.bookUntil)}) — ตัวเลขนี้เป็นภาพรวมความจุไว้วางแผน
                </p>
              )}
              {svcList.map((s) => {
                const v = day[s.id];
                if (!v) return null;
                return (
                  <div key={s.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                      <b style={{ color: "var(--ink)" }}>{s.icon} {s.name}</b>
                      <span className="hint" style={{ color: v.open ? "var(--muted)" : "#9ca3af", fontSize: "0.85rem" }}>
                        {v.open ? `ว่างรวม ${v.left}/${v.total} ที่` : "ไม่เปิดบริการวันนี้"}
                      </span>
                    </div>
                    {v.open ? (
                      <div className="slot-chips" style={{ marginBottom: 0 }}>
                        {v.slots.map((x) => (
                          <span key={x.t} className={"cal-chip " + (x.past ? "closed" : x.left === 0 ? "full" : x.left <= Math.ceil(s.cap * 0.25) ? "few" : "free")}>
                            {x.t} · {x.past ? "ผ่านแล้ว" : x.left > 0 ? `ว่าง ${x.left}` : "เต็ม"}
                          </span>
                        ))}
                        {!v.slots.length && <span className="hint" style={{ color: "var(--muted)" }}>ไม่มีช่วงเวลา</span>}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="modal-actions">
                <button className="btn btn-primary btn-sm" type="button" onClick={() => setCalDay(null)}>ปิดหน้าต่าง</button>
              </div>
            </>
          );
        })()}
      </Modal>

      {/* โมดัลเพิ่ม/แก้ไขผู้ใช้ (admin) */}
      <Modal show={!!userModal} onClose={() => setUserModal(null)}>
        {userModal && (
          <>
            <h2>{userModal.id ? "✏️ แก้ไขผู้ใช้" : "➕ เพิ่มผู้ใช้ใหม่"}</h2>
            <p className="hint">{userModal.id ? "แก้ข้อมูลบัญชี/สิทธิ์ — เว้นช่องรหัสผ่านไว้ = คงรหัสเดิม" : "ตั้งบัญชีใหม่ให้เจ้าหน้าที่เข้าใช้ระบบคิวได้ทันที"}</p>
            <form onSubmit={submitUser} noValidate>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className={"form-field" + (userModal.invalid && !userModal.name.trim() ? " invalid" : "")}>
                  <label>ชื่อ–นามสกุล *</label>
                  <input className="form-input" value={userModal.name} onChange={(e) => setUserModal({ ...userModal, name: e.target.value })} />
                  <span className="err">กรุณากรอกชื่อ</span>
                </div>
                <div className={"form-field" + (userModal.invalid && !/^[a-zA-Z0-9_.-]{3,50}$/.test(userModal.username.trim()) ? " invalid" : "")}>
                  <label>ชื่อผู้ใช้ (ใช้ล็อกอิน) *</label>
                  <input className="form-input" value={userModal.username} autoComplete="off" onChange={(e) => setUserModal({ ...userModal, username: e.target.value })} />
                  <span className="err">ตัวอังกฤษ ตัวเลข . _ - ยาว 3–50 ตัวอักษร</span>
                </div>
                <div className="form-field">
                  <label>สิทธิ์ *</label>
                  <select className="form-select" value={userModal.role} onChange={(e) => setUserModal({ ...userModal, role: e.target.value })}>
                    {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                  </select>
                </div>
                <div className={"form-field" + (userModal.invalid && ((!userModal.id && userModal.password.length < 6) || (userModal.password && userModal.password.length < 6)) ? " invalid" : "")}>
                  <label>{userModal.id ? "รหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)" : "รหัสผ่าน *"}</label>
                  <input className="form-input" type="password" autoComplete="new-password" value={userModal.password} onChange={(e) => setUserModal({ ...userModal, password: e.target.value })} />
                  <span className="err">รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร</span>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setUserModal(null)}>ยกเลิก</button>
                <button className="btn btn-primary btn-sm" type="submit">{userModal.id ? "บันทึก ✓" : "เพิ่มผู้ใช้ ✓"}</button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* ยืนยันก่อนเอาค่าตั้งใหม่ไปใช้จริง — แสดงเทียบค่าเดิม → ค่าใหม่ทุกฟิลด์ที่เปลี่ยน */}
      <Modal show={!!confirmSet} onClose={() => setConfirmSet(null)}>
        {confirmSet && (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", color: "var(--ink)" }}>{confirmSet.title}</h2>
            <p className="hint" style={{ margin: "0 0 14px" }}>ตรวจสอบค่าใหม่ให้ถูกต้อง — กดยืนยันแล้วค่าจะมีผลกับระบบทันที</p>
            <table className="mini-table" style={{ width: "100%" }}>
              <thead><tr><th>รายการ</th><th>ค่าเดิม</th><th>ค่าใหม่</th></tr></thead>
              <tbody>
                {confirmSet.changes.map((c) => (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td style={{ color: "var(--muted)" }}>{String(c.from)}</td>
                    <td><b>{String(c.to)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {confirmSet.note && <p className="hint" style={{ margin: "10px 0 0", color: "#b45309" }}>⚠️ {confirmSet.note}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirmSet(null)}>ยกเลิก</button>
              <button className="btn btn-primary btn-sm" type="button" onClick={applyConfirmSet}>✓ ยืนยันและบันทึก</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
