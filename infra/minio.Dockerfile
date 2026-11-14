FROM golang:1.24.8-bookworm AS build
ENV CGO_ENABLED=0 GOMAXPROCS=2
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go install github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go install github.com/minio/mc@d6541ea280b73a834b64d4097e21f2be77676104

FROM debian:bookworm-slim
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY --from=build /go/bin/mc /usr/local/bin/mc
