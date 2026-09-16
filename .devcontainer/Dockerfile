# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

ARG TARGETARCH

FROM scratch AS node-amd64

ADD --checksum=sha256:855d581f8a4eb1a8117e3426de25fe02770592febcfb31369aee1ffbfee9e8ec \
    https://nodejs.org/dist/v24.20.0/node-v24.20.0-linux-x64.tar.gz \
    /tmp/node.tgz

FROM scratch AS node-arm64

ADD --checksum=sha256:3515603e2487879a39bc75716f1a2affd027500c64ba50e845cf72cb33219013 \
    https://nodejs.org/dist/v24.20.0/node-v24.20.0-linux-arm64.tar.gz \
    /tmp/node.tgz

FROM node-${TARGETARCH} AS node

FROM docker.io/library/ubuntu:26.04@sha256:513c074113a871b51a8d16ab445c88779d6452d937a164fb5cc479f32668a41d

COPY --from=node /tmp/node.tgz /tmp/node.tgz

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade --yes --no-install-recommends \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends ca-certificates git make openssh-client sudo \
    && tar --extract --gzip --file /tmp/node.tgz --directory /usr/local --strip-components=1 --no-same-owner --exclude='*/README.md' --exclude='*/CHANGELOG.md' --exclude='*/LICENSE' \
    && ln --symbolic /usr/local/bin/node /usr/local/bin/nodejs \
    && rm --force -- /tmp/node.tgz \
    && usermod --shell /bin/bash ubuntu \
    && install --directory --owner ubuntu --group ubuntu \
        /home/ubuntu/.local \
        /home/ubuntu/.local/bin \
        /home/ubuntu/.local/lib \
        /home/ubuntu/.local/lib/node_modules \
    && printf '%s\n' 'ubuntu ALL=(root) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu \
    && rm -rf /var/lib/apt/lists/*

ENV NPM_CONFIG_PREFIX=/home/ubuntu/.local
ENV PATH=/home/ubuntu/.local/bin:${PATH}

USER ubuntu
