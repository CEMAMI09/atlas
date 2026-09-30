FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
ARG APP=api
ENV APP=$APP
RUN pnpm --filter @atlas/web build && pnpm --filter @atlas/${APP} build
ENV NODE_ENV=production
CMD ["sh", "-c", "node apps/$APP/dist/main.js"]
