FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --filter @dailyledger/backend
COPY backend backend
RUN pnpm --filter @dailyledger/backend build
ENV NODE_ENV=production
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 5010
CMD ["node", "backend/dist/index.js"]
