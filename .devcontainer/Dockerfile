# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

FROM mcr.microsoft.com/devcontainers/javascript-node:24-trixie@sha256:1f13af93fc9b845a4ee55c84d6e6c6ad2c6419b0fdeef4a6c13ad5a3f561d034

USER root

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade --yes --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

USER node
