# Aisty Community: one image with the API, the worker and the browser app.

FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
COPY web/scripts ./scripts
RUN npm ci --no-audit --no-fund && node scripts/patch-react-scripts.js
COPY web/ ./
# Production builds always sign in through the Aisty Identity Service.
RUN REACT_APP_DEV_AUTH=false REACT_APP_BACKEND_URL=/api GENERATE_SOURCEMAP=false npx react-scripts build

FROM node:24-alpine AS api
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/AistyAI/AISTY-Community" \
      org.opencontainers.image.licenses="LicenseRef-Aisty-Community-1.0"
ENV NODE_ENV=production PORT=8080 WEB_ROOT=/app/web/build
WORKDIR /app
COPY --from=api /app/api/node_modules ./api/node_modules
COPY api/ ./api/
COPY --from=web /web/build ./web/build
COPY LICENSE NOTICE ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "api/src/server.js"]
