# Makefile

SHELL := /usr/bin/env bash

GNUMAKEFLAGS ?=

MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules
MAKEFLAGS += --no-builtin-variables

.SHELLFLAGS := -Eeuo pipefail -c

.DELETE_ON_ERROR:
.SUFFIXES:
.NOTPARALLEL:

# Default goal

.DEFAULT_GOAL := help

# Goals

.PHONY: help
.SILENT: help
help:
	printf '\033[1m%s\033[0m\n' "$${PWD##*/} targets"
	printf '%s\n' '--------------------------------------------------------------------------------'
	printf '\033[1m%-14s\033[0m  %s\n' 'help' 'Show this help.'
	printf '\033[1m%-14s\033[0m  %s\n' 'fix' 'Run all automatic fixers.'
	printf '\033[1m%-14s\033[0m  %s\n' 'check' 'Run lint, static analysis, tests, and audits.'
	printf '\033[1m%-14s\033[0m  %s\n' 'lint' 'Run code style checks.'
	printf '\033[1m%-14s\033[0m  %s\n' 'static' 'Run static analysis.'
	printf '\033[1m%-14s\033[0m  %s\n' 'test' 'Run tests.'
	printf '\033[1m%-14s\033[0m  %s\n' 'audit' 'Run dependency/security audits.'
	printf '\033[1m%-14s\033[0m  %s\n' 'deps_install' 'Install dependencies from current lock files.'
	printf '\033[1m%-14s\033[0m  %s\n' 'deps_update' 'Refresh dependencies and generated lock files.'
	printf '\033[1m%-14s\033[0m  %s\n' 'clean' 'Remove generated build, dependency, and test artifacts.'
	printf '\033[1m%-14s\033[0m  %s\n' 'distclean' 'Run clean and remove generated lock files.'
	printf '\033[1m%-14s\033[0m  %s\n' 'eslint_fix' 'Fix JavaScript/TypeScript lint issues with ESLint.'
	printf '\033[1m%-14s\033[0m  %s\n' 'prettier_fix' 'Format files with Prettier.'
	printf '\033[1m%-14s\033[0m  %s\n' 'eslint_check' 'Check JavaScript/TypeScript with ESLint.'
	printf '\033[1m%-14s\033[0m  %s\n' 'prettier_check' 'Check formatting with Prettier.'
	printf '\033[1m%-14s\033[0m  %s\n' 'typescript_check' 'Type-check TypeScript.'
	printf '\033[1m%-14s\033[0m  %s\n' 'node_test' 'Run Node.js tests.'
	printf '\033[1m%-14s\033[0m  %s\n' 'npm_audit' 'Run npm audit at the configured severity level.'
	printf '\033[1m%-14s\033[0m  %s\n' 'npm_install' 'Install npm dependencies from package-lock.json.'
	printf '\033[1m%-14s\033[0m  %s\n' 'npm_update' 'Refresh npm dependencies and package-lock.json.'
	printf '\033[1m%-14s\033[0m  %s\n' 'precreate' 'Run pre-devcontainer setup hooks.'
	printf '\033[1m%-14s\033[0m  %s\n' 'postcreate' 'Run post-devcontainer setup hooks.'
	printf '\033[1m%-14s\033[0m  %s\n' 'devcontainer' 'Open a devcontainer shell, then stop the container.'

.PHONY: fix
fix: eslint_fix prettier_fix

.PHONY: check
check: lint static test audit

.PHONY: lint
lint: eslint_check prettier_check

.PHONY: static
static: typescript_check

.PHONY: test
test: node_test

.PHONY: audit
audit: npm_audit

.PHONY: deps_install
deps_install: npm_install

.PHONY: deps_update
deps_update: npm_update

.PHONY: clean
clean:
	rm -rf ./node_modules

.PHONY: distclean
distclean: clean
	rm -rf ./package-lock.json

.PHONY: eslint_fix
eslint_fix: ./node_modules ./package.json ./package-lock.json ./eslint.config.js
	npm exec --ignore-scripts -- eslint --concurrency=auto --fix .

.PHONY: prettier_fix
prettier_fix: ./node_modules ./package.json ./package-lock.json ./prettier.config.js
	npm exec --ignore-scripts -- prettier -w .

.PHONY: eslint_check
eslint_check: ./node_modules ./package.json ./package-lock.json ./eslint.config.js
	npm exec --ignore-scripts -- eslint --concurrency=auto .

.PHONY: prettier_check
prettier_check: ./node_modules ./package.json ./package-lock.json ./prettier.config.js
	npm exec --ignore-scripts -- prettier -c .

.PHONY: typescript_check
typescript_check: ./node_modules ./package.json ./package-lock.json ./tsconfig.json
	npm exec --ignore-scripts -- tsc --noEmit --project ./tsconfig.json

.PHONY: node_test
node_test: ./node_modules ./package.json ./package-lock.json
	node --test

.PHONY: npm_audit
npm_audit: ./node_modules ./package.json ./package-lock.json
	npm audit --ignore-scripts --audit-level=critical --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_install
npm_install: ./package.json ./package-lock.json
	npm install --ignore-scripts --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_update
npm_update: ./package.json
	rm -rf ./node_modules
	rm -rf ./package-lock.json
	npm update --ignore-scripts --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: precreate
precreate:

.PHONY: postcreate
postcreate: deps_install

.PHONY: devcontainer
devcontainer: precreate
	devcontainer up --workspace-folder .
	devcontainer exec --workspace-folder . /bin/bash || true
	docker ps -q --filter "label=devcontainer.local_folder=$${PWD}" | xargs -r docker stop

# Dependencies

./package-lock.json ./node_modules &: ./package.json
	${MAKE} npm_update
