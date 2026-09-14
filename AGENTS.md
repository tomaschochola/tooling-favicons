# tooling-favicons

Command-line favicon and application icon generation for validated SVG and raster sources.

## Stack

- Language: JavaScript ESM on Node 24
- Runtime: GNU/Linux
- Libraries: sharp 0.x, svgo 4.x
- Package manager: npm

## Toolchain

- Format: prettier 3.x, trimmer
- Lint: eslint 10.x
- Test: `node --test`
- Audit: npm audit

## Devcontainer

- Base: official Node
- User: node
- Sidecars: none
- Up: `make up`
- Execute: `devcontainer exec --workspace-folder . <command>`
- Down: `make down`

## Makefile

- `update` — refresh locks, only tool that may touch them
- `fix` — auto-fix, may dirty tree
- `check` — full gate: doctor + lint + analyze + test + audit
- `doctor` — tree and toolchain ok
- `lint` — eslint + prettier + trimmer checks
- `analyze` — npm checks
- `test` — unit tests
- `audit` — dependency audit
- `postcreate` — first-time setup, runs automatically on create
- `stop` — stop container, keep it
- `down` — stop and remove container
- `clean` — drop generated files
- `distclean` — drop everything rebuildable
- `rebuild` — full rebuild, only when broken

## Layout

├── Makefile
├── .editorconfig
├── .devcontainer/
├── package.json
├── eslint.config.js
├── prettier.config.js
├── LICENSE
├── AUTHORS.md
├── src/
│   └── cli.js
└── tests/
