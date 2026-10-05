# ระบบจองคิว — รันด้วย Docker (สำหรับเครื่องที่ใช้ Docker อยู่แล้ว)
# สร้าง:  docker build -t hospital-queue .
# รัน:    docker compose up -d   (ดู docker-compose.yml)
FROM node:20-alpine

WORKDIR /app
COPY server.js .
COPY public ./public
COPY scripts ./scripts

# ข้อมูลการจองทั้งหมดอยู่ใน /app/data — mount volume นี้เพื่อเก็บถาวร/สำรอง
# (chown เป็น node ก่อนสลับ user ไม่งั้นตอน mount volume แอปเขียนไฟล์ไม่ได้)
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV PORT=8124
EXPOSE 8124

# รันด้วย user ธรรมดา ไม่ใช้ root
USER node
VOLUME ["/app/data"]
CMD ["node", "server.js"]
