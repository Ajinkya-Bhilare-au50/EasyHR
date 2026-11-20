# EasyHR web (Next.js). Used by Railway (root directory: web) and any Docker host.
# Multi-stage: install -> build (standalone) -> small runtime image.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
# The /api proxy target is baked into the build (next.config.ts rewrites), so it must be known now.
# Railway passes service variables to the build when they are declared with ARG.
ARG API_URL
ARG NEXT_PUBLIC_SHOW_DEMO_LOGINS
ARG NEXT_PUBLIC_BASE_DOMAIN
ARG NEXT_PUBLIC_DEMO_MASTER_LOGIN
ENV API_URL=$API_URL \
    NEXT_PUBLIC_SHOW_DEMO_LOGINS=$NEXT_PUBLIC_SHOW_DEMO_LOGINS \
    NEXT_PUBLIC_BASE_DOMAIN=$NEXT_PUBLIC_BASE_DOMAIN \
    NEXT_PUBLIC_DEMO_MASTER_LOGIN=$NEXT_PUBLIC_DEMO_MASTER_LOGIN \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -n "$API_URL" || (echo "API_URL must be set at build time, e.g. http://api.railway.internal:8000" && exit 1)
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup -S -g 10001 easyhr && adduser -S -u 10001 -G easyhr easyhr
COPY --from=build --chown=easyhr:easyhr /app/.next/standalone ./
COPY --from=build --chown=easyhr:easyhr /app/.next/static ./.next/static
COPY --from=build --chown=easyhr:easyhr /app/public ./public
USER easyhr
EXPOSE 3000
CMD ["node", "server.js"]
