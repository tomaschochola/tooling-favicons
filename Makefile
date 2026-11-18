# Makefile
SHELL := bash

GNUMAKEFLAGS ?=

MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules
MAKEFLAGS += --no-builtin-variables

.SHELLFLAGS := -Eeuo pipefail -c

.DELETE_ON_ERROR:
.SUFFIXES:
.NOTPARALLEL:

# Default
.DEFAULT_GOAL := never

.PHONY: never
.SILENT: never
never:
	printf '%s\n' 'No default target. Specify a target explicitly.' >&2
	exit 1

# Variables
LC_ALL := C.UTF-8

export LC_ALL

# Phony
.PHONY: analyze
analyze: npm_check

.PHONY: audit
audit: npm_audit

.PHONY: check
check: doctor lint analyze test audit

.PHONY: clean
clean:
	rm --force --recursive --one-file-system -- ./temp ./temporary ./tmp ./.temp ./.temporary ./.tmp

.PHONY: command_check
command_check:
	command -v basename >/dev/null
	command -v bash >/dev/null
	command -v cut >/dev/null
	command -v env >/dev/null
	command -v fd >/dev/null
	command -v git >/dev/null
	command -v make >/dev/null
	command -v mkdir >/dev/null
	command -v node >/dev/null
	command -v npm >/dev/null
	command -v rm >/dev/null
	command -v rmdir >/dev/null
	command -v sed >/dev/null
	command -v sha256sum >/dev/null
	command -v shellcheck >/dev/null
	command -v sort >/dev/null
	command -v tr >/dev/null
	command -v xargs >/dev/null

.PHONY: deps_clean
deps_clean: npm_clean

.PHONY: deps_install
deps_install: npm_install

.PHONY: dirclean
dirclean:
	fd --hidden --exclude .git --type directory --print0 | sort --zero-terminated --reverse | xargs --null --no-run-if-empty rmdir --ignore-fail-on-non-empty --

.PHONY: distclean
distclean: clean deps_clean

.PHONY: doctor
doctor: command_check git_check npm_config_check npm_doctor npm_check

.PHONY: eslint_check
eslint_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./eslint.config.js
	npm exec --no --ignore-scripts -- eslint --concurrency=auto .

.PHONY: eslint_fix
eslint_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./eslint.config.js
	npm exec --no --ignore-scripts -- eslint --concurrency=auto --fix .

.PHONY: fix
fix: eslint_fix prettier_fix trimmer_fix

.PHONY: git_check
git_check:
	test -z "$$(git ls-files --unmerged)"
	test -z "$$(git ls-files --cached --ignored --exclude-standard)"
	git diff --check
	git diff --cached --check
	git fsck --full --strict --no-dangling --no-progress

.PHONY: lint
lint: eslint_check prettier_check shellcheck trimmer_check

.PHONY: node_test
node_test: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	node --test --experimental-test-coverage --test-coverage-include='src/**/*.js' --test-coverage-lines=100 --test-coverage-branches=100 --test-coverage-functions=100

.PHONY: npm_audit
npm_audit: npm_config_check ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm audit --ignore-scripts --audit-level=critical --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_check
npm_check: npm_config_check ./node_modules/.package-lock.json
	npm ci --dry-run --ignore-scripts --audit=false --install-links --include=prod --include=dev --include=peer --include=optional
	npm ls --all --install-links --include=prod --include=dev --include=peer --include=optional >/dev/null

.PHONY: npm_clean
npm_clean:
	rm --force --recursive --one-file-system -- ./node_modules

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

.PHONY: npm_install
npm_install: npm_config_check ./package.json ./package-lock.json
	npm ci --ignore-scripts --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: npm_update
npm_update: npm_config_check ./package.json ./package-lock.json npm_clean
	npm update --ignore-scripts --install-links --include=prod --include=dev --include=peer --include=optional

.PHONY: nuke
nuke: distclean xfd dirclean

.PHONY: postcreate
postcreate: deps_install

.PHONY: prettier_check
prettier_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./prettier.config.js
	npm exec --no --ignore-scripts -- prettier -c .

.PHONY: prettier_fix
prettier_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json ./prettier.config.js
	npm exec --no --ignore-scripts -- prettier -w .

.PHONY: shellcheck
shellcheck:
	fd --case-sensitive --hidden --exclude .git --type file --glob '*.sh' --exec-batch env -u SHELLCHECK_OPTS shellcheck --shell=sh --norc --severity=style --enable=all --external-sources --check-sourced --source-path=SCRIPTDIR --
	fd --case-sensitive --hidden --exclude .git --type file --glob '*.bash' --exec-batch env -u SHELLCHECK_OPTS shellcheck --shell=bash --norc --severity=style --enable=all --external-sources --check-sourced --source-path=SCRIPTDIR --

.PHONY: test
test: node_test

.PHONY: trimmer_check
trimmer_check: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm exec --no --ignore-scripts -- tooling-trimmer check .

.PHONY: trimmer_fix
trimmer_fix: ./node_modules/.package-lock.json ./package.json ./package-lock.json
	npm exec --no --ignore-scripts -- tooling-trimmer fix .

.PHONY: update
update: npm_config_check npm_update

.PHONY: xfd
xfd:
	git clean -Xfd

# Non-phony
./node_modules/.package-lock.json: ./.npmrc ./package.json ./package-lock.json
	$(MAKE) npm_install
