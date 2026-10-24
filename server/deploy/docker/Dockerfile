# Questline sync server: PocketBase with the Questline schema baked in.
# Data lives in /pb/pb_data, which must be a mounted volume.
FROM alpine:3.20

ARG PB_VERSION=0.40.5
# Set automatically by BuildKit (amd64 / arm64); falls back to the build machine's CPU.
ARG TARGETARCH

RUN set -eux; \
    apk add --no-cache ca-certificates; \
    apk add --no-cache --virtual .fetch curl unzip; \
    ARCH="${TARGETARCH:-$(uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')}"; \
    ZIP="pocketbase_${PB_VERSION}_linux_${ARCH}.zip"; \
    BASE="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"; \
    cd /tmp; \
    curl -fsSL -o "$ZIP" "$BASE/$ZIP"; \
    curl -fsSL -o checksums.txt "$BASE/checksums.txt"; \
    grep " ${ZIP}\$" checksums.txt | sha256sum -c -; \
    mkdir -p /pb/pb_data; \
    unzip -q "$ZIP" pocketbase -d /pb; \
    rm -rf /tmp/*; \
    apk del .fetch; \
    adduser -D -H -u 10001 questline; \
    chown -R questline:questline /pb

COPY --chown=questline:questline pb_migrations /pb/pb_migrations
COPY --chown=questline:questline pb_hooks /pb/pb_hooks

USER questline
WORKDIR /pb
# Internal only: not published on the host. Caddy reaches it over the Docker network.
EXPOSE 9090
ENV GOMEMLIMIT=96MiB
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:9090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--hooksPool=2"]
