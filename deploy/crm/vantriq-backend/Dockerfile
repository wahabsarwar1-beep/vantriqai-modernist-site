# Vantriq Ops CRM backend — production image.
# Build context is the vantriq-backend/ folder (this file sits inside it).
FROM node:20-alpine

WORKDIR /app

# Install deps first so this layer caches across code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# /api/health is unauthenticated by design (src/index.js) — ideal for this.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "src/index.js"]
