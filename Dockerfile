# syntax=docker/dockerfile:1

# --- Build stage: compile TypeScript ---------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
# The desktop toolchain is a devDependency; no Electron binary is needed here.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: production dependencies + backend-served UI -----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    PUBLIC_URL=http://localhost:4000 \
    DATA_STORE=file \
    DATA_FILE=/app/.data/nexora.json \
    QUEUE_DRIVER=memory \
    FILE_STORAGE=local \
    STORAGE_DIR=/app/.data/files \
    AI_PROVIDER=mock
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# app.ts serves interface/ from process.cwd(); /openapi.json and the migration
# command also read docs/ and db/, so all three directories belong in the image.
COPY --from=build /app/dist ./dist
COPY interface ./interface
COPY docs ./docs
COPY db ./db

RUN addgroup -S nexora && adduser -S nexora -G nexora \
    && mkdir -p /app/.data /app/.data/files \
    && chown -R nexora:nexora /app
USER nexora

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
