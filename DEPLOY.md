# คู่มือติดตั้ง — ระบบจองคิว รพ.ราชเวช เชียงใหม่

ระบบนี้เป็น **Next.js (App Router)** — frontend React + API routes ในตัว
สิ่งที่ต้องมีบนเซิร์ฟเวอร์: Node.js เวอร์ชัน 20 ขึ้นไป (หรือใช้ Docker ตามข้อ 4)

## 1. ติดตั้ง (5 นาที)

```bash
# คัดลอกโฟลเดอร์ hospital-queue-app ทั้งโฟลเดอร์ขึ้นเซิร์ฟเวอร์ แล้ว:
cd hospital-queue-app
npm install               # ติดตั้ง next/react (ครั้งเดียว)
npm run build             # สร้าง production build
PORT=8124 npm start       # รันครั้งแรกจะสร้าง data/app-data.json ให้เอง
                          # ผู้ใช้เริ่มต้น: admin / admin (หรือตามตัวแปร ADMIN_PASSWORD)
```

**สำคัญ — ทำทันทีหลังรันครั้งแรก:**

```bash
npm run setpass -- admin <รหัสผ่านใหม่ที่ยาก>          # เปลี่ยนรหัส admin
npm run useradd -- somchai "สมชาย ใจดี" <รหัส> counter  # เพิ่มเจ้าหน้าที่เคาน์เตอร์
```

- role `admin` = แก้ไขบริการ/ดูประวัติการใช้งานได้
- role `counter` = รับคิว/ยืนยัน/เลื่อน/ยกเลิก/ค้นหา/ส่งออก CSV ได้ แต่แก้บริการไม่ได้

แล้วแก้เบอร์โทรโรงพยาบาลที่ `lib/config.js` (บรรทัด phone)

## 2. รันถาวรด้วย systemd (Linux)

สร้าง `/etc/systemd/system/queue.service`:

```ini
[Unit]
Description=Hospital Queue System
After=network.target

[Service]
WorkingDirectory=/opt/hospital-queue-app
ExecStart=/usr/bin/npm start
Environment=PORT=8124
Environment=NODE_ENV=production
Restart=always
User=queueuser

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now queue
```

ตั้งเวลาเครื่องเป็น Asia/Bangkok: `sudo timedatectl set-timezone Asia/Bangkok`
(ระบบใช้เวลาเครื่องคำนวณ "วันนี้" และช่วงเวลาที่ผ่านแล้ว)

## 3. เปิดให้ผู้ป่วยเข้าจากภายนอก (nginx + HTTPS **บังคับ** — PDPA)

ฟอร์มจองเก็บชื่อ-เบอร์โทร-อีเมลผู้ป่วย การส่งผ่าน HTTP ธรรมดาถือว่าไม่ memenuhi
มาตรการรักษาความมั่นคงปลอดภัยตาม PDPA — **ต้องเปิดใช้ HTTPS เสมอก่อนให้ผู้ป่วยเข้า**

ขอโดเมนจากไอที รพ. เช่น `queue.rajavejchiangmai.com` แล้วชี้มาที่เครื่องนี้
ใช้คอนฟิกสำเร็จรูปใน `deploy/nginx-queue.conf` (มีคอมเมนต์วิธีวางไฟล์ + บล็อก HTTPS ในตัว):

```bash
sudo cp deploy/nginx-queue.conf /etc/nginx/sites-available/queue.conf
sudo ln -s /etc/nginx/sites-available/queue.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# ขอใบรับรอง + ตั้ง redirect 80→443 อัตโนมัติ (ครั้งเดียว):
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d queue.rajavejchiangmai.com
```

ถ้ายังไม่มีโดเมน ใช้ภายในวง LAN ได้ก่อน (เปิด http://IP:8124) แต่**อย่าเปิดพอร์ต
ออกอินเทอร์เน็ตโดยไม่มี HTTPS**

## 4. เลือกที่เก็บข้อมูล — feature toggle จาก environment variable

| env | ค่า | ความหมาย |
|---|---|---|
| `STORAGE` | `mysql` **(ค่าที่ตั้งในไฟล์ deploy/queue.service ของงานนี้)** | เก็บใน MySQL/MariaDB (ใช้ MariaDB ที่รัน WordPress อยู่แล้วได้ — แยกเป็น DB ชื่อ hospital_queue) |
| `STORAGE` | `json` (ค่า default ของโค้ด) | เก็บไฟล์ data/app-data.json ไฟล์เดียว — ใช้ตอน dev/ทดสอบ |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | เช่น 127.0.0.1 / 3306 / queueapp / ... / hospital_queue | ต้องตั้งครบเมื่อ STORAGE=mysql — ระบบสร้าง database + ตารางทั้งหมดให้เองครั้งแรกที่รัน |
| `DATA_KEY` | `openssl rand -hex 32` | **PDPA (data at rest) — ควรตั้งเสมอทั้ง 2 โหมด:** json → เข้ารหัสทั้งไฟล์ `data/app-data.json` (AES-256-GCM) · mysql → เข้ารหัส "รายฟิลด์" PII ในตาราง (name/phone/email/note ของ bookings, users.name, agencies.contact, audit.detail) คนที่ได้ DB/dump ไปอ่านไม่ออก · ตั้งครั้งแรกกับข้อมูลเดิม ระบบ migrate เข้ารหัสให้อัตโนมัติตอน start · คีย์ผิด/หาย = อ่านข้อมูลไม่ได้ จดเก็บให้ดี (ชั้นเสริม: MariaDB at-rest encryption ดู IT-RUNBOOK) |

ตารางใน DB: `users`, `services`, `slot_times`, `bookings`, `counters`, `calls`, `audit` (charset utf8mb4 รองรับภาษาไทย)

## 5. สำรองข้อมูล (cron ทุกคืน)

> ⚠️ **PDPA: ไฟล์ backup มีข้อมูลส่วนบุคคลผู้ป่วย** — ถ้าตั้ง `DATA_KEY` ไว้ ฟิลด์ PII
> (ชื่อ/เบอร์/อีเมล/หมายเหตุ) ใน dump จะเป็น ciphertext ตั้งแต่ต้นทาง แต่ถ้า "ไม่ตั้ง"
> จะเป็น plaintext ครบชุด · ไม่ว่ากรณีไหน: เก็บในเครื่องที่จำกัดสิทธิ์ (chmod 700 โฟลเดอร์ backup),
> ห้ามวางในโฟลเดอร์เว็บสาธารณะ, และถ้าส่งออกไปเก็บที่อื่น (cloud/external drive)
> เข้ารหัสชั้นนอกซ้ำเสมอ เช่น `gpg -c` หรือ `openssl enc -aes-256-cbc` ก่อนเคลื่อนย้าย

**โหมด MySQL (ของจริง):**
```bash
# crontab -e (ตัวอย่าง: dump แล้วเข้ารหัสด้วย passphrase ที่เก็บในไฟล์ root-only)
30 2 * * * mysqldump -uqueueapp -pรหัส hospital_queue | gzip | openssl enc -aes-256-cbc -pbkdf2 -pass file:/root/backup.key > /backup/queue-db-$(date +\%F).sql.gz.enc
```
**โหมด json (dev/สำรอง):** ก๊อปไฟล์ `data/app-data.json` — ถ้าตั้ง `DATA_KEY` ไว้ ไฟล์นี้ (รวมถึงสำเนาก๊อป)
เป็น ciphertext อยู่แล้ว แต่ถ้าไม่ตั้ง หรือต้องพึ่งพาการเข้ารหัสชั้นเดียวไม่ได้ ให้เข้ารหัสซ้ำก่อนออกนอกเครื่องเหมือนโหมด MySQL

## 6. การอัปเดตเวอร์ชัน

1. `sudo systemctl stop queue`
2. สำรอง `data/app-data.json`
3. ทับโฟลเดอร์ยกเว้นโฟลเดอร์ `data/`
4. `sudo systemctl start queue`

## หมายเหตุทางเทคนิค

- การจองจากภายนอกถูกจำกัด 10 ครั้ง / 15 นาที / IP กันสแปม (ปรับได้ที่ RATE_LIMIT ใน lib/core.js)
- ความจุเริ่มต้น 4 ที่/ช่วงเวลา — ปรับได้รายบริการในหน้า "จัดการบริการ"
- ประวัติการใช้งาน (audit) เก็บล่าสุด 5,000 รายการ ดูได้ที่แท็บประวัติการใช้งาน (เฉพาะ admin) — รวมทั้งการเปิดดูเบอร์/อีเมลผู้ป่วยรายตัว (pii_reveal) และการลบข้อมูลตามคำขอ (booking_erase)
- PDPA: ข้อมูลการจองเก่ากว่า `RETENTION_DAYS` (ค่าเริ่มต้น 365 — แก้ได้ในแท็บตั้งค่าของ admin) ถูกลบอัตโนมัติวันละครั้ง และ admin ลบ/anonymize รายคิวได้ตามคำขอผู้ป่วย (ปุ่ม "🗑 ลบข้อมูล (PDPA)" ใน popup รายละเอียดผู้จอง)
- production ต้องตั้ง `AUTH_SECRET` (แอปปฏิเสธการ start ถ้าไม่ตั้ง) — สร้างด้วย `openssl rand -hex 32` และ JWT เก็บใน httpOnly cookie แล้ว (ไม่ใช้ localStorage)
- เลขคิวเป็นแบบวิ่งรายวันต่อบริการ ตัวเลขไม่ถูกใช้ซ้ำในวันเดียวกันแม้มีการยกเลิก
- หากคิวโตขึ้นมากในอนาคต (พันรายการ/วันขึ้นไป) แจ้งผู้พัฒนาเพื่อย้ายไปเก็บ SQLite
