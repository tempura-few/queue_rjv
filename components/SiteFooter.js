"use client";

import { CONFIG } from "@/lib/config.js";
import { useLang } from "@/lib/i18n.js";

export default function SiteFooter({ withPhone }) {
  const [lang] = useLang();
  const C = lang === "th" ? CONFIG : CONFIG[lang] || CONFIG;
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-name">{C.hospitalName}</div>
        <div>{C.company}</div>
        <div>{C.address}</div>
        {withPhone ? <div className="footer-meta"><span>{lang === "th" ? "โทร. " + CONFIG.phone : C.tel + " " + CONFIG.phone}</span></div> : null}
        <div className="footer-links">
          {/* ลิงก์เดิมจากเว็บหลักของโรงพยาบาล */}
          <a href="https://rajavejchiangmai.com/%e0%b8%99%e0%b9%82%e0%b8%a2%e0%b8%9a%e0%b8%b2%e0%b8%a2-%e0%b8%84%e0%b8%a7%e0%b8%b2%e0%b8%a1%e0%b9%80%e0%b8%9b%e0%b9%87%e0%b8%99%e0%b8%aa%e0%b9%88%e0%b8%a7%e0%b8%99%e0%b8%95%e0%b8%b1%e0%b8%a7/" target="_blank" rel="noopener">{lang === "th" ? "ความเป็นส่วนตัว" : C.privacy}</a>
          <span className="footer-sep">|</span>
          <a href="https://rajavejchiangmai.com/cookie-policy/" target="_blank" rel="noopener">{lang === "th" ? "นโยบายคุ้กกี้" : C.cookies}</a>
        </div>
      </div>
    </footer>
  );
}
