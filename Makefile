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

DEVCONTAINER_FILTER := label=devcontainer.local_folder=$(CURDIR)

# Goals

.PHONY: fix
fix: eslint_fix prettier_fix trimmer_fix

.PHONY: check
check: trimmer_check lint static test audit

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

.PHONY: deps_clean
deps_clean:
	rm -rf ./node_modules

.PHONY: distclean
distclean: clean deps_clean

.PHONY: nuke
nuke: down distclean

.PHONY: trimmer_fix
trimmer_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm exec --ignore-scripts -- trimmer fix .

.PHONY: trimmer_check
trimmer_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm exec --ignore-scripts -- trimmer check .

.PHONY: eslint_fix
eslint_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./eslint.config.js
	npm exec --ignore-scripts -- eslint --concurrency=auto --fix .

.PHONY: prettier_fix
prettier_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./prettier.config.js
	npm exec --ignore-scripts -- prettier -w .

.PHONY: eslint_check
eslint_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./eslint.config.js
	npm exec --ignore-scripts -- eslint --concurrency=auto .

.PHONY: prettier_check
prettier_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./prettier.config.js
	npm exec --ignore-scripts -- prettier -c .

.PHONY: typescript_check
typescript_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./tsconfig.json
	npm exec --ignore-scripts -- tsc --noEmit --project ./tsconfig.json

.PHONY: node_test
node_test: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	node --test

.PHONY: npm_audit
npm_audit: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm audit --ignore-scripts --audit-level=high --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_install
npm_install: ./package.json ./package-lock.json
	npm ci --ignore-scripts --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_update
npm_update: deps_clean ./package.json
	npm update --ignore-scripts --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: postcreate
postcreate: deps_install

.PHONY: devcontainer_check
devcontainer_check:
	devcontainer read-configuration --workspace-folder . >/dev/null
	docker build --check --file ./.devcontainer/Dockerfile ./.devcontainer

.PHONY: up
up: devcontainer_check
	devcontainer up --workspace-folder .

.PHONY: devcontainer
devcontainer: up
	devcontainer exec --workspace-folder . /bin/bash

.PHONY: status
status:
	docker container ls --all --filter "$(DEVCONTAINER_FILTER)"

.PHONY: stop
stop:
	docker container ls --quiet --filter "$(DEVCONTAINER_FILTER)" | while IFS= read -r container; do docker container stop "$$container"; done

.PHONY: restart
restart:
	docker container ls --all --quiet --filter "$(DEVCONTAINER_FILTER)" | while IFS= read -r container; do docker container restart "$$container"; done

.PHONY: down
down: stop
	docker container ls --all --quiet --filter "$(DEVCONTAINER_FILTER)" | while IFS= read -r container; do docker container rm --volumes "$$container"; done

.PHONY: rebuild
rebuild: devcontainer_check down
	devcontainer up --workspace-folder .

.PHONY: rebuild_no_cache
rebuild_no_cache: devcontainer_check down
	devcontainer up --workspace-folder . --build-no-cache

./node_modules/.package-lock.json: ./package.json ./package-lock.json
	$(MAKE) npm_install
