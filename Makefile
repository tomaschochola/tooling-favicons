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

.DEFAULT_GOAL := never

.PHONY: never
.SILENT: never
never:
	printf '%s\n' 'No default target. Run an explicit target' >&2
	exit 1

# Options

COMPOSE_PROJECT_NAME ?= tooling-favicons-$(shell pwd -P | sha256sum | cut -c1-16)
LC_ALL := C.UTF-8

DEVCONTAINER_COMPOSE := ./.devcontainer/docker-compose.yml
DEVCONTAINER_TMPDIR := $(CURDIR)/.devcontainer/.tmp

export LC_ALL
export COMPOSE_PROJECT_NAME

# Public goals

.PHONY: fix
fix: eslint_fix prettier_fix trimmer_fix

.PHONY: check
check: devcontainer_gate doctor lint analyze test audit

.PHONY: doctor
doctor: git_check npm_config_check npm_doctor npm_check

.PHONY: lint
lint: eslint_check prettier_check trimmer_check

.PHONY: analyze
analyze: npm_check

.PHONY: test
test: devcontainer_gate node_test

.PHONY: audit
audit: npm_audit

.PHONY: update
update: npm_config_check npm_update

.PHONY: clean
clean:
	rm --force --recursive --one-file-system -- "$(DEVCONTAINER_TMPDIR)"

.PHONY: distclean
distclean: clean deps_clean

.PHONY: postcreate
postcreate: deps_install

.PHONY: up
up: host_gate devcontainer_check
	mkdir --parents -- "$(DEVCONTAINER_TMPDIR)"
	env TMPDIR="$(DEVCONTAINER_TMPDIR)" devcontainer up --workspace-folder .

.PHONY: shell
shell: interactive_gate host_gate up
	devcontainer exec --workspace-folder . /bin/bash

.PHONY: stop
stop: host_gate
	docker compose -f "$(DEVCONTAINER_COMPOSE)" stop

.PHONY: down
down: host_gate
	docker compose -f "$(DEVCONTAINER_COMPOSE)" down --remove-orphans

.PHONY: rebuild
rebuild: host_gate devcontainer_check down
	mkdir --parents -- "$(DEVCONTAINER_TMPDIR)"
	env TMPDIR="$(DEVCONTAINER_TMPDIR)" devcontainer up --workspace-folder . --build-no-cache

.PHONY: nuke
nuke: distclean prune

.PHONY: prune
prune: host_gate
	docker compose -f "$(DEVCONTAINER_COMPOSE)" down --volumes --rmi local --remove-orphans

# Protected goals

.PHONY: host_gate
.SILENT: host_gate
host_gate:
	if test -e /.dockerenv; then printf '%s\n' 'host_gate: host only' >&2; exit 1; fi

.PHONY: devcontainer_gate
.SILENT: devcontainer_gate
devcontainer_gate:
	if test ! -e /.dockerenv; then printf '%s\n' 'devcontainer_gate: devcontainer only' >&2; exit 1; fi

.PHONY: interactive_gate
.SILENT: interactive_gate
interactive_gate:
	if test ! -t 0 || test ! -t 1; then printf '%s\n' 'interactive_gate: interactive only' >&2; exit 1; fi

.PHONY: deps_install
deps_install: npm_install

.PHONY: deps_clean
deps_clean: npm_clean

.PHONY: trimmer_fix
trimmer_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm exec --no --ignore-scripts -- tooling-trimmer fix .

.PHONY: trimmer_check
trimmer_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm exec --no --ignore-scripts -- tooling-trimmer check .

.PHONY: eslint_fix
eslint_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./eslint.config.js
	npm exec --no --ignore-scripts -- eslint --concurrency=auto --fix .

.PHONY: eslint_check
eslint_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./eslint.config.js
	npm exec --no --ignore-scripts -- eslint --concurrency=auto .

.PHONY: prettier_fix
prettier_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./prettier.config.js
	npm exec --no --ignore-scripts -- prettier -w .

.PHONY: prettier_check
prettier_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./prettier.config.js
	npm exec --no --ignore-scripts -- prettier -c .

.PHONY: node_test
node_test: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	node --test --experimental-test-coverage --test-coverage-include='src/**/*.js' --test-coverage-lines=100 --test-coverage-branches=100 --test-coverage-functions=100

.PHONY: npm_config_check
npm_config_check: ./.npmrc
	test "$$(npm config get ignore-scripts)" = "true"
	test "$$(npm config get allow-directory)" = "root"
	test "$$(npm config get allow-file)" = "root"
	test "$$(npm config get allow-git)" = "root"
	test "$$(npm config get allow-remote)" = "root"
	test "$$(npm config get audit)" = "false"
	test "$$(npm config get strict-ssl)" = "true"
	test "$$(npm config get registry)" = "https://registry.npmjs.org/"

.PHONY: npm_doctor
npm_doctor:
	npm doctor connection registry environment permissions cache

.PHONY: npm_check
npm_check: npm_config_check ./node_modules/.package-lock.json
	npm ci --dry-run --ignore-scripts --audit=false --install-links --include=prod --include=dev --include=peer --include=optional
	npm ls --all --install-links --include=prod --include=dev --include=peer --include=optional >/dev/null

.PHONY: npm_audit
npm_audit: npm_config_check ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm audit --ignore-scripts --audit-level=critical --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_install
npm_install: npm_config_check ./package.json ./package-lock.json
	npm ci --ignore-scripts --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_update
npm_update: npm_config_check ./package.json ./package-lock.json npm_clean
	npm update --ignore-scripts --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_clean
npm_clean:
	rm --force --recursive --one-file-system -- ./node_modules

.PHONY: git_check
git_check:
	test -z "$$(git ls-files --unmerged)"
	test -z "$$(git ls-files --cached --ignored --exclude-standard)"
	git diff --check
	git diff --cached --check
	git fsck --full --strict --no-dangling --no-progress

.PHONY: devcontainer_check
devcontainer_check: host_gate
	devcontainer read-configuration --workspace-folder . >/dev/null
	docker compose -f "$(DEVCONTAINER_COMPOSE)" config --quiet
	docker build --check --file ./.devcontainer/Dockerfile ./.devcontainer

# Private targets

./node_modules/.package-lock.json: ./.npmrc ./package.json ./package-lock.json
	$(MAKE) npm_install
