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
# DNS ที่ Z.com: เพิ่ม A record → ชื่อ "queue" ชี้มา IP เครื่องนี้ (150.95.85.87)
# แล้วออกใบ SSL (ฟรี):
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d queue.rajavejchiangmai.com
```

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

## ถอนการติดตั้ง (ถ้าวันหนึ่งไม่ใช้แล้ว)

```bash
sudo systemctl disable --now queue && sudo rm /etc/systemd/system/queue.service
sudo rm /etc/nginx/sites-enabled/queue.conf /etc/nginx/sites-available/queue.conf && sudo systemctl reload nginx
sudo rm -rf /opt/hospital-queue-app        # ข้อมูลอยู่ในนี้ทั้งหมด — สำรองก่อนถ้าต้องการเก็บ
```
WordPress และเว็บหลักไม่ได้ถูกแตะตั้งแต่ต้น จึงไม่ต้องทำอะไรเพิ่ม
