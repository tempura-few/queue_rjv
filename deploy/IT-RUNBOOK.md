# รันบุ๊กติดตั้งระบบจองคิว — สำหรับทีมไอที รพ.ราชเวช เชียงใหม่

**แนวคิด:** วางระบบจองคิว "คู่กับ" เว็บ WordPress เดิมบนเครื่อง VPS เดียวกัน
โดยไม่แตะไฟล์/ฐานข้อมูลของ WordPress แม้แต่ไฟล์เดียว — nginx แยกด้วยชื่อโดเมน:
`rajavejchiangmai.com` = เว็บเดิม · `queue.rajavejchiangmai.com` = ระบบจองคิว

เลือกทางเดียว: **ทาง A ติดตั้งตรง ๆ** หรือ **ทาง B ใช้ Docker** (ถ้าทีมใช้ Docker อยู่แล้ว)
ข้อ 4–6 (DNS / nginx / SSL / ตรวจรับ) ทำเหมือนกันทุกทาง

---

## ทาง A — ติดตั้งตรง ๆ (แนะนำ ถ้าไม่ได้ใช้ Docker)

### 1) ติดตั้ง Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
node -v   # ต้องได้ v20.x
```

### 2) วางไฟล์ระบบ + สร้างผู้ใช้รันโปรแกรม
```bash
sudo useradd -r -s /usr/sbin/nologin queueuser
sudo mkdir -p /opt/hospital-queue-app
sudo cp -r hospital-queue-app/. /opt/hospital-queue-app/
sudo chown -R queueuser:queueuser /opt/hospital-queue-app
```

### 3) สร้างฐานข้อมูล MySQL (โหมดหลัก — ใช้ MariaDB ที่รัน WordPress อยู่แล้วก็ได้)

ระบบจะสร้างตารางทั้งหมดเองอัตโนมัติครั้งแรกที่รัน — ต้องเตรียมแค่ฐานข้อมูล + ผู้ใช้:

```bash
sudo mariadb   # หรือ mysql -u root -p
```
```sql
CREATE DATABASE IF NOT EXISTS hospital_queue CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'queueapp'@'localhost' IDENTIFIED BY 'รหัสยากที่ตั้งเอง';
GRANT ALL PRIVILEGES ON hospital_queue.* TO 'queueapp'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
(แยกเป็นฐานข้อมูล `hospital_queue` ของตัวเอง — **ไม่แตะฐานข้อมูลของ WordPress** เลย สิทธิ์ผู้ใช้ queueapp ก็จำกัดอยู่ใน DB นี้เท่านั้น)

### 4) รันครั้งแรก + ตั้งรหัสผ่าน + สร้างผู้ใช้เคาน์เตอร์ (ทุกคำสั่งต้องแนบ env ของ DB ตามข้อ 3)

```bash
cd /opt/hospital-queue-app
export QENV="STORAGE=mysql MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_USER=queueapp MYSQL_PASSWORD=รหัสจากข้อ3 MYSQL_DATABASE=hospital_queue"
sudo -u queueuser env $QENV node server.js
#   → เห็น "[store] โหมดเก็บข้อมูล: mysql ... (คิว 0 รายการ)" = สร้างตารางเสร็จ → กด Ctrl+C
sudo -u queueuser env $QENV node scripts/setpass.js admin 'รหัสผู้ดูแลที่ยาก'
sudo -u queueuser env $QENV node scripts/useradd.js counter1 'ชื่อเจ้าหน้าที่เคาน์เตอร์' 'รหัสเคาน์เตอร์' counter
```

### 5) ให้รันถาวรด้วย systemd
แก้รหัสผ่านในไฟล์ก่อน: `sudo nano /opt/hospital-queue-app/deploy/queue.service`
(บรรทัด `MYSQL_PASSWORD=` → รหัสที่ตั้งในข้อ 3) แล้ว:
```bash
sudo cp deploy/queue.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now queue
systemctl status queue --no-pager        # ต้องเห็น active (running) และบรรทัด "[store] โหมดเก็บข้อมูล: mysql"
curl -s http://127.0.0.1:8124/api/services | head -c 100   # ต้องตอบ JSON
```

### 6) nginx — เพิ่มชื่อ queue. ให้ชี้เข้าแอป (ไม่กระทบคอนฟิกเว็บเดิม)
```bash
sudo cp deploy/nginx-queue.conf /etc/nginx/sites-available/queue.conf
sudo ln -s /etc/nginx/sites-available/queue.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# เครื่อง AlmaLinux/CentOS: วางที่ /etc/nginx/conf.d/queue.conf แทน
```

### 7) ทำต่อ (ทุกทางทำเหมือนกัน)
```bash
# DNS ที่ Z.com: เพิ่ม A record → ชื่อ "queue" ชี้มา IP เครื่องนี้
# แล้วออกใบ SSL (ฟรี) — ⚠️ PDPA: "บังคับ" ต้องทำให้เสร็จก่อนเปิดให้ผู้ป่วยเข้า
# (certbot จะตั้ง redirect HTTP→HTTPS ให้เอง ถ้ายังไม่ทำ ห้ามประกาศ URL ให้ใครใช้)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d queue.rajavejchiangmai.com
```

### 8) ⚠️ PDPA — ต้องทำก่อนถือว่ายอมรับงาน
- [ ] `AUTH_SECRET` ถูกตั้งเป็นค่าสุ่มจริงใน `/etc/systemd/system/queue.service` (หรือ `/opt/queue_rjv/.env` ของทาง Docker) — สร้างด้วย `openssl rand -hex 32` ห้ามใช้ค่าตัวอย่าง/ค่าที่เคยอยู่ใน repo
- [ ] เข้าเว็บได้เฉพาะทาง `https://` (ลอง `http://` แล้วต้องเด้งไป HTTPS)
- [ ] ล็อกอิน admin แล้วกด export CSV ได้ ส่วนบัญชี sale/cs กดไม่ได้ (ปุ่มหาย + API ตอบ 403)
- [ ] ตารางคิวแสดงเบอร์แบบปิดบัง (08x-xxx-234) และปุ่ม 👁 เปิดดูได้ (มีรายการ `pii_reveal` ในแท็บประวัติการใช้งาน)
- [ ] โฟลเดอร์ backup จำกัดสิทธิ์ (chmod 700) และไฟล์ backup ที่ออกนอกเครื่องต้องเข้ารหัส
- [ ] ตั้ง `DATA_KEY` ใน env ของแอปแล้ว (ทั้ง json/mysql — โหมด json ไฟล์ขึ้นต้น `QENC1:` · โหมด mysql ข้อมูล PII ในตารางขึ้นต้น `enc:v1:`) และคีย์ถูกสำรองนอกเซิร์ฟเวอร์แล้ว (ดู README ในคลังคีย์)
- [ ] (ชั้นเสริม แนะนำ) เปิด MariaDB data-at-rest encryption ตามข้อ "เข้ารหัสข้อมูล at rest"

---

## ทาง B — ใช้ Docker

```bash
# วางโฟลเดอร์ hospital-queue-app ไว้ที่ใดก็ได้ เช่น /opt/ แล้ว:
cd hospital-queue-app
docker compose up -d --build
docker compose exec queue node scripts/setpass.js admin 'รหัสผู้ดูแล'
docker compose exec queue node scripts/useradd.js counter1 'ชื่อเจ้าหน้าที่' 'รหัส' counter
curl -s http://127.0.0.1:8124/api/services | head -c 100   # ต้องตอบ JSON
```
แล้วทำข้อ 5–6 เหมือนทาง A (docker-compose เปิดพอร์ตไว้ที่ 127.0.0.1:8124 แล้ว)

---

## ตรวจรับ (ทำครบแล้วต้องผ่านทั้งหมด)

1. `https://queue.rajavejchiangmai.com` เปิดได้ กล้องคู่มัดจำขึ้น (HTTPS)
2. `/login.html` ล็อกอิน admin ได้ เห็นหน้าเจ้าหน้าที่
3. ทดสอบจอง 1 คิวจากมือถือ → เห็นเข้าตารางในหลังบ้าน
4. **เว็บหลัก rajavejchiangmai.com ยังเปิดปกติทุกหน้า** (สิ่งเดียวที่เปลี่ยนคือมีชื่อใหม่ 1 ชื่อ)

## สำรองข้อมูล (cron ทุกคืน 02:30)

ข้อมูลการจองทั้งหมด = ไฟล์เดียว สำรองไฟล์นี้คือครบ:
```bash
30 2 * * * cp /opt/hospital-queue-app/data/app-data.json /backup/queue-$(date +\%F).json
```
(ทาง Docker: ไฟล์อยู่ที่ `hospital-queue-app/data/app-data.json` ของโฮสต์)

> ⚠️ **PDPA**: ไฟล์ backup มีชื่อ/เบอร์โทร/อีเมลผู้ป่วยครบชุด — โฟลเดอร์ /backup ต้อง
> `chmod 700` และถ้าคัดลอกออกนอกเครื่อง (cloud/external drive) ต้องเข้ารหัสก่อนเสมอ
> เช่น `openssl enc -aes-256-cbc -pbkdf2 -in queue.json -out queue.json.enc` (ดูตัวอย่าง
> แบบ MySQL ใน DEPLOY.md ข้อ 5) · โหมด json: ถ้าตั้ง `DATA_KEY` ไฟล์ข้อมูล+สำเนาก๊อปเป็น
> ciphertext ตั้งแต่ต้นทางแล้ว

## เข้ารหัสข้อมูล at rest (ตามโหมดที่ใช้อยู่)

**ชั้นหลักทั้งสองโหมด — ตั้ง `DATA_KEY` (แนะนำเสมอ):** สร้างด้วย `openssl rand -hex 32`
แล้วจดเก็บในที่ปลอดภัย (ทำหายคือกู้ข้อมูลไม่ได้)

- โหมด json: แอปเข้ารหัส `data/app-data.json` ทั้งไฟล์ด้วย AES-256-GCM ตอน start ครั้งแรก
  คีย์ผิด/ไฟล์ถูกแก้ = แอปหยุดพร้อม error ชัดเจน (ไม่เริ่มระบบว่างทับข้อมูลเดิม)
- โหมด MySQL/MariaDB: แอปเข้ารหัส **รายฟิลด์ PII** ก่อนเขียนลง DB เสมอ —
  `bookings(name, phone, email, note)`, `users(name)`, `agencies(contact)`, `audit(detail)`
  เป็น ciphertext `enc:v1:…` (คอลัมน์ถูกแปลงเป็น VARBINARY อัตโนมัติตอน start)
  ข้อมูลเดิมที่เป็น plaintext จะถูก migrate เข้ารหัสทั้งก้อนในครั้งแรกที่ตั้งคีย์
  → คนที่ขโมย DB ไฟล์หรือ `mysqldump` ไป **อ่านชื่อ/เบอร์ผู้ป่วยไม่ออก**
  (ฟิลด์ที่ไม่เข้ารหัสโดยเจตนา: code/date/time/status/qno/username — ต้องใช้ค้นหา/index และไม่ระบุตัวบุคคลโดยตรง)

**ชั้นเสริมสำหรับ production (โหมด MariaDB ที่ Z.com):** เปิด data-at-rest encryption ในตัว MariaDB
(10.1 ขึ้นไป — aaPanel ใช้ MariaDB อยู่แล้ว) เข้ารหัสไฟล์ตาราง/redo log/tmp table บนดิสก์อีกชั้น:

```bash
# 1) สร้างไฟล์คีย์ (2 คีย์ รองรับ rotation) แล้วเข้ารหัสไฟล์คีย์ด้วย key อีกชั้น
sudo mkdir -p /etc/mysql/encryption
sudo sh -c 'printf "1;$(openssl rand -hex 32)\n2;$(openssl rand -hex 32)\n" > /etc/mysql/encryption/keyfile.enc'
sudo sh -c 'openssl rand -hex 32 > /etc/mysql/encryption/keyfile.key'
sudo openssl enc -aes-256-cbc -md sha256 -pass file:/etc/mysql/encryption/keyfile.key \
  -in /etc/mysql/encryption/keyfile.enc -out /etc/mysql/encryption/keyfile.enc.new
sudo mv /etc/mysql/encryption/keyfile.enc.new /etc/mysql/encryption/keyfile.enc
sudo chown -R mysql:mysql /etc/mysql/encryption && sudo chmod 600 /etc/mysql/encryption/*
# ⚠️ จด/สำรอง keyfile.key ไว้ที่ปลอดภัยนอกเครื่อง — หายคือกู้ฐานข้อมูลไม่ได้
```

```ini
# 2) เพิ่มใน [mariadb] (หรือ [mysqld]) ของ my.cnf — บน aaPanel แก้ผ่านหน้า panel ได้
plugin_load_add = file_key_management
file_key_management
file_key_management_filename = /etc/mysql/encryption/keyfile.enc
file_key_management_filekey = FILE:/etc/mysql/encryption/keyfile.key
file_key_management_encryption_algorithm = aes_cbc
innodb_encrypt_tables = ON
innodb_encrypt_log = ON
encrypt_tmp_disk_tables = ON
```

```bash
# 3) restart แล้วเข้ารหัสตาราง "ที่มีอยู่แล้ว" (ตารางใหม่ที่สร้างหลังเปิด innodb_encrypt_tables จะได้เอง)
sudo systemctl restart mariadb   # หรือ restart ผ่าน aaPanel
mysql -uroot -p hospital_queue -e "
  ALTER TABLE bookings ENCRYPTED=YES;
  ALTER TABLE users ENCRYPTED=YES;
  ALTER TABLE agencies ENCRYPTED=YES;
  ALTER TABLE audit ENCRYPTED=YES;
  ALTER TABLE calls ENCRYPTED=YES;"
```

หมายเหตุ: การเข้ารหัสชั้นนี้กัน "ขโมยดิสก์/ไฟล์ DB" — ส่วน `mysqldump` จะได้ plaintext เสมอ
จึงต้อง pipe ผ่าน openssl ตามข้อสำรองข้อมูลด้านบน

## ถอนการติดตั้ง (ถ้าวันหนึ่งไม่ใช้แล้ว)

```bash
sudo systemctl disable --now queue && sudo rm /etc/systemd/system/queue.service
sudo rm /etc/nginx/sites-enabled/queue.conf /etc/nginx/sites-available/queue.conf && sudo systemctl reload nginx
sudo rm -rf /opt/hospital-queue-app        # ข้อมูลอยู่ในนี้ทั้งหมด — สำรองก่อนถ้าต้องการเก็บ
```
WordPress และเว็บหลักไม่ได้ถูกแตะตั้งแต่ต้น จึงไม่ต้องทำอะไรเพิ่ม
