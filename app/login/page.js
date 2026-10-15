"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, authSave } from "@/lib/client.js";
import { CONFIG } from "@/lib/config.js";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "เข้าสู่ระบบเจ้าหน้าที่ — " + CONFIG.hospitalName;
    document.body.classList.add("login-body");
    return () => document.body.classList.remove("login-body");
  }, []);

  async function submit(e) {
    e.preventDefault();
    setInvalid(false);
    setBusy(true);
    try {
      const { token } = await api("/api/login", { method: "POST", body: JSON.stringify({ username: username.trim(), password }) });
      authSave(token); // JWT เก็บใน localStorage — ทุกคำขอถัดไปแนบผ่าน header อัตโนมัติ (ดู lib/client.js)
      router.push("/admin");
    } catch {
      setInvalid(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><img src="/rajavej-logo.png" alt={CONFIG.hospitalName} /></div>
        <h1>ระบบคิวกลาง</h1>
        <p className="hint">{CONFIG.hospitalName}</p>
        <div className="form-field">
          <label htmlFor="lUser">ชื่อผู้ใช้</label>
          <input className="form-input" id="lUser" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className={"form-field" + (invalid ? " invalid" : "")}>
          <label htmlFor="lPass">รหัสผ่าน</label>
          <input className="form-input" id="lPass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="err">ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</span>
        </div>
        <button className="btn btn-primary" type="submit" style={{ width: "100%" }} disabled={busy}>
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
        <p className="hint" style={{ marginTop: 14 }}><Link href="/">← กลับหน้าจองคิวผู้ป่วย</Link></p>
      </form>
    </div>
  );
}
