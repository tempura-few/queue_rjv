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

## 3. เปิดให้ผู้ป่วยเข้าจากภายนอก (แนะนำ nginx + HTTPS)

ฟอร์มจองเก็บชื่อ-เบอร์ผู้ป่วย จึงควรใช้ HTTPS เสมอ (PDPA) — ขอโดเมนจากไอที รพ.
เช่น `queue.rajavejchiangmai.com` แล้วชี้มาที่เครื่องนี้:

```nginx
server {
    server_name queue.rajavejchiangmai.com;
    location / {
        proxy_pass http://127.0.0.1:8124;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

```bash
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

ตารางใน DB: `users`, `services`, `slot_times`, `bookings`, `counters`, `calls`, `audit` (charset utf8mb4 รองรับภาษาไทย)

## 5. สำรองข้อมูล (cron ทุกคืน)

**โหมด MySQL (ของจริง):**
```bash
# crontab -e
30 2 * * * mysqldump -uqueueapp -pรหัส hospital_queue | gzip > /backup/queue-db-$(date +\%F).sql.gz
```
**โหมด json (dev/สำรอง):** ก๊อปไฟล์ `data/app-data.json`

## 6. การอัปเดตเวอร์ชัน

1. `sudo systemctl stop queue`
2. สำรอง `data/app-data.json`
3. ทับโฟลเดอร์ยกเว้นโฟลเดอร์ `data/`
4. `sudo systemctl start queue`

## หมายเหตุทางเทคนิค

- การจองจากภายนอกถูกจำกัด 10 ครั้ง / 15 นาที / IP กันสแปม (ปรับได้ที่ RATE_LIMIT ใน server.js)
- ความจุเริ่มต้น 4 ที่/ช่วงเวลา — ปรับได้รายบริการในหน้า "จัดการบริการ"
- ประวัติการใช้งาน (audit) เก็บล่าสุด 500 รายการ ดูได้ที่แท็บรายงาน (เฉพาะ admin)
- เลขคิวเป็นแบบวิ่งรายวันต่อบริการ ตัวเลขไม่ถูกใช้ซ้ำในวันเดียวกันแม้มีการยกเลิก
- หากคิวโตขึ้นมากในอนาคต (พันรายการ/วันขึ้นไป) แจ้งผู้พัฒนาเพื่อย้ายไปเก็บ SQLite
