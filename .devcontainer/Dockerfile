# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

FROM mcr.microsoft.com/devcontainers/javascript-node:24-trixie@sha256:757b22963a35e3673da4bece29c4948c815637085947259b80910e951e3ba64a

USER root

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade --yes --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

USER node
