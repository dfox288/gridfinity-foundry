# Gridfinity Foundry: GridFlock baseplates + bin layouts. Multi-arch (amd64 for Linux, arm64 for Apple Silicon).
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM --platform=$BUILDPLATFORM debian:trixie-slim AS gridflock
ARG GRIDFLOCK_REF=033e8f9dab860ce7ef46ca3f1dd656a1d13c5310
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/yawkat/gridflock /gridflock && cd /gridflock && git checkout "$GRIDFLOCK_REF" \
    && git submodule update --init --recursive && rm -rf .git docs

FROM --platform=$BUILDPLATFORM debian:trixie-slim AS bbl
# Bambu Studio's system profiles (printers, processes, filaments) for the Bambu project export; data only
ARG BAMBU_STUDIO_REF=v02.08.02.61
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$BAMBU_STUDIO_REF" --filter=blob:none --sparse https://github.com/bambulab/BambuStudio /bbs \
    && cd /bbs && git sparse-checkout set --no-cone '/resources/profiles/BBL/machine/' '/resources/profiles/BBL/process/' '/resources/profiles/BBL/filament/' \
    && mv /bbs/resources/profiles/BBL /bbl-profiles

FROM --platform=$BUILDPLATFORM debian:trixie-slim AS gfx
# Gridfinity Extended (ostat, GPL-3.0): the generator our bins are made from (only for FULL_LIBRARY=1)
ARG GFX_REF=94d5a3e
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/ostat/gridfinity_extended_openscad /gfx && cd /gfx && git checkout "$GFX_REF" && rm -rf .git

FROM --platform=$BUILDPLATFORM openscad/openscad:trixie.2026-10-26 AS library
# the bin library: the starter set from library/, or with FULL_LIBRARY=1 every size rendered by generator/gen_library.py
ARG FULL_LIBRARY=0
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY library/ /library/
COPY generator/ /gen/
COPY --from=gfx /gfx /opt/gfx
RUN if [ "$FULL_LIBRARY" = "1" ]; then python3 /gen/gen_library.py /library && rm -rf /library/.base; fi

FROM openscad/openscad:trixie.2026-10-26
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY server/ /app/server/
COPY templates/ /app/templates/
COPY --from=gridflock /gridflock /opt/gridflock
# GridFlock's build turns puzzle.svg into paths/puzzle.scad with svgelements; server/svg_paths.py does the same without it
RUN mkdir -p /opt/gridflock/paths && python3 /app/server/svg_paths.py /opt/gridflock/puzzle.svg /opt/gridflock/paths/puzzle.scad
COPY --from=web /web/dist /app/web
COPY --from=bbl /bbl-profiles /opt/bbl-profiles
COPY --from=library /library /app/library
# the build context may carry owner-only file modes (umask 077); the server runs as the host user
RUN chmod -R a+rX /app /opt/gridflock /opt/bbl-profiles
ENV BAMBU_TEMPLATES=/app/templates BBL_PROFILES=/opt/bbl-profiles GRIDFLOCK_DIR=/opt/gridflock BINS_DIR=/app/library/bins LABELS_DIR=/app/library/labels DATA_DIR=/data CACHE_DIR=/tmp/plate-cache WEB_DIR=/app/web PORT=8080 \
    HOME=/tmp
EXPOSE 8080
ENTRYPOINT []
CMD ["python3", "-u", "/app/server/app.py"]
