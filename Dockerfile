FROM node:24-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Keep downloaded history cached independently from application changes.
FROM dependencies AS market-data
COPY scripts/download-data.mjs ./scripts/download-data.mjs
ARG DATA_FROM=2022-01
ARG DATA_TO=""
ARG DATA_REFRESH=0
RUN set -eu; \
    : "$DATA_REFRESH"; \
    set -- "--from=$DATA_FROM"; \
    if [ -n "$DATA_TO" ]; then set -- "$@" "--to=$DATA_TO"; fi; \
    pnpm data:download "$@"

FROM dependencies AS build
COPY . .
COPY --from=market-data /app/public/data/ ./public/data/
RUN pnpm build

FROM nginx:alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
