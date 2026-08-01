# syntax=docker/dockerfile:1
# BridgeOnline production image (all-in-one: Next.js + Socket.io + worker via tsx).
# NEXT_PUBLIC_* values are inlined at BUILD time — pass them as build args so the
# client bundle points at the URL the browser will actually use.

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
# bullmq declares peerOptional redis>=5 while the project pins redis@4 — so plain
# install errors on peer resolution. --legacy-peer-deps (also set via .npmrc).
RUN npm install --legacy-peer-deps

COPY . .

# Public (build-time) config. For Docker Desktop the LoadBalancer is reachable at
# http://localhost:3000, so the socket URL must match that origin.
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
ARG NEXT_PUBLIC_FEATURE_NEW_UI=true
ARG NEXT_PUBLIC_FEATURE_VOICE_CHAT=false
ARG NEXT_PUBLIC_FEATURE_AI_HINTS=false
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_PUBLIC_FEATURE_NEW_UI=$NEXT_PUBLIC_FEATURE_NEW_UI \
    NEXT_PUBLIC_FEATURE_VOICE_CHAT=$NEXT_PUBLIC_FEATURE_VOICE_CHAT \
    NEXT_PUBLIC_FEATURE_AI_HINTS=$NEXT_PUBLIC_FEATURE_AI_HINTS

RUN npx prisma generate && npm run build

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Copy the whole app (includes tsx, .next, server/, lib/, generated Prisma client).
COPY --from=build /app ./

EXPOSE 3000
# All-in-one: Next.js + Socket.io + BullMQ worker in one process (server/index.js via tsx).
CMD ["npm", "run", "start:all"]
