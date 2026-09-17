# syntax=docker/dockerfile:1

# API de Centro Club Mirage (Express + Prisma + MySQL).

FROM node:22-alpine AS base
# El motor de consultas de Prisma se enlaza contra OpenSSL y alpine no lo
# trae por defecto.
RUN apk add --no-cache openssl
WORKDIR /app

# --- Dependencias -----------------------------------------------------------
FROM base AS deps
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json ./
COPY prisma ./prisma
RUN npm install

# --- Compilacion ------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx tsc

# --- Imagen final -----------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
