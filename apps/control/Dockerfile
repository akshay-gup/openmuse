# The control plane and the web app it serves: one image, one address for people to go to.
# Build from the repository root, naming the address people will reach Hive at (the app is built for it):
#   docker build -f apps/control/Dockerfile --build-arg CONTROL_URL=https://hive.example.com -t hive-control .

ARG NODE_IMAGE=node:22-bookworm-slim

# Only the packages the control plane runs on.
FROM ${NODE_IMAGE} AS deps
RUN npm install --global pnpm@11.19.0
ENV CI=true
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter . --prod

# The server compiled, and the web app exported for CONTROL_URL.
FROM ${NODE_IMAGE} AS build
ARG CONTROL_URL
RUN test -n "${CONTROL_URL}" || { echo "Pass --build-arg CONTROL_URL=https://..., the address people reach Hive at" >&2; exit 1; }
RUN npm install --global pnpm@11.19.0
ENV CI=true
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY apps/server apps/server
COPY apps/control apps/control
COPY apps/workspace apps/workspace
COPY packages packages
COPY apps/mobile apps/mobile
RUN pnpm build:server
RUN EXPO_PUBLIC_CONTROL_URL="${CONTROL_URL}" pnpm --dir apps/mobile exec expo export --platform web --output-dir /web

FROM ${NODE_IMAGE} AS control
WORKDIR /app
COPY --from=deps /src/package.json ./
COPY --from=deps /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
COPY --from=build /web ./web
COPY apps/control/entrypoint.sh /entrypoint.sh
RUN mkdir /data && chown node:node /data && chmod +x /entrypoint.sh
ENV NODE_ENV=production \
    CONTROL_HOST=0.0.0.0 \
    CONTROL_PORT=8800 \
    CONTROL_DATA_DIR=/data \
    CONTROL_WEB_DIR=/app/web
VOLUME /data
EXPOSE 8800
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/apps/control/src/index.js"]
