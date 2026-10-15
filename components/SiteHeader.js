"use client";

import Link from "next/link";
import { CONFIG } from "@/lib/config.js";
import { useLang } from "@/lib/i18n.js";

// หัวเว็บกลาง — admin ให้ส่ง me/onLogout มาแสดงชื่อผู้ใช้ + ปุ่มออกจากระบบแทนลิงก์ล็อกอิน
// หน้าผู้ป่วยมีปุ่มสลับภาษา ไทย/EN/မြန်မာ (หลังบ้านคงไทยเท่านั้นจึงไม่แสดงปุ่มนี้ในโหมด admin)
export default function SiteHeader({ activePage, me, onLogout }) {
  const [lang, setLang] = useLang();
  const C = lang === "th" ? CONFIG : CONFIG[lang]; // ข้อความของภาษาที่เลือก (en/my)
  return (
    <header className="site-header">
      <div className="header-inner container">
        <Link className="brand" href="/">
          {/* logo จริงจากเว็บหลัก รพ. (มีชื่อโรงพยาบาลอยู่ในตัวรูปแล้ว) */}
          <img className="brand-logo" src="/rajavej-logo.png" alt={C.hospitalName} />
        </Link>
        <nav className="header-nav">
          {activePage === "admin" ? (
            <>
              <span className="whoami">👤 {me?.name || ""}</span>
              <a className="nav-link" href="#" onClick={onLogout}>ออกจากระบบ</a>
            </>
          ) : (
            <>
              <span className="lang-switch" role="group" aria-label="Language">
                <button type="button" className={"lang-btn" + (lang === "th" ? " on" : "")} onClick={() => setLang("th")}>ไทย</button>
                <button type="button" className={"lang-btn" + (lang === "en" ? " on" : "")} onClick={() => setLang("en")}>EN</button>
                <button type="button" className={"lang-btn" + (lang === "my" ? " on" : "")} onClick={() => setLang("my")}>မြန်မာ</button>
              </span>
              <Link className="nav-link" href="/login">{lang === "th" ? "หน้าเจ้าหน้าที่" : C.staffPage}</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
