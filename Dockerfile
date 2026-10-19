# ระบบจองคิว — รันด้วย Docker (Next.js)
# สร้าง:  docker build -t hospital-queue .
# รัน:    docker compose up -d   (ดู docker-compose.yml)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# tzdata ให้ env TZ (Asia/Bangkok) ทำงานจริง — ไม่งั้น Alpine จะกลับไป UTC
# และ logic คิว "วันนี้/ช่วงเวลาที่ผ่านไปแล้ว" จะคลาด 7 ชม.
#
# ช่วง run ใช้โหมด standalone ของ Next.js (.next/standalone) — มีแค่ไฟล์ +
# dependency ที่แอปใช้จริงตอนรัน (trace ให้อัตโนมัติ) ไม่ต้องก๊อป node_modules
# ทั้งก้อน 591 MB → image เล็กลงเหลือ ~250 MB จาก ~1.2 GB
FROM node:20-alpine AS run
RUN apk add --no-cache tzdata
WORKDIR /app
ENV NODE_ENV=production PORT=8124 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# public/ ต้องติดไปด้วย — โลโก้/ไฟล์ static ถูกอ่านจากดิสก์ตอนรัน ไม่ได้ฝังใน .next
COPY --from=build /app/public ./public

# ข้อมูลการจองทั้งหมดอยู่ใน /app/data — mount volume นี้เพื่อเก็บถาวร/สำรอง
# (chown เป็น node ก่อนสลับ user ไม่งั้นตอน mount volume แอปเขียนไฟล์ไม่ได้)
RUN mkdir -p /app/data && chown -R node:node /app/data
EXPOSE 8124

# รันด้วย user ธรรมดา ไม่ใช้ root
USER node
VOLUME ["/app/data"]
CMD ["node", "server.js"]
