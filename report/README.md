# Lab report: how it is generated

`report/dist/report.pdf` is built entirely from this repository. Nothing in it
is typed in by hand except the prose: every terminal pane is real command
output, every number comes from a measurement, and both can be regenerated.

```
git tags (baseline … cm-per-01)
      │  report/capture.mjs   runs every command against a checkout of each tag
      ▼
report/evidence/*.txt        raw output, one file per pane
report/evidence/values.json  numbers quoted in the text (tests, coverage, CC, clones, …)
report/evidence/index.json   command, tag, commit, Node version, exit code per pane
      │  report/build.mjs     fills report/template/report.html, prints with Chromium
      ▼
report/dist/report.html, report/dist/report.pdf
```

## Regenerate

Requirements: git, Docker, [nvm](https://github.com/nvm-sh/nvm) with Node.js
24.21.0 and 26.10.0, Chromium or Chrome, and `pdftotext`/`pdfinfo`
(poppler-utils) for the page numbers in the contents.

```sh
nvm install 24.21.0 && nvm install 26.10.0 && nvm use
npm ci
npm run report                           # capture + build, about 2 minutes
```

Partial runs:

```sh
npm run report:capture -- --only cor/    # re-capture one section (ids starting with cor/)
npm run report:build                     # rebuild after editing the template or config
```

Put your name and ID in `report/report.config.json`, then run `npm run report:build`.

## What capture does

For each tag it needs, `capture.mjs`:

1. creates a git worktree under `~/.cache/jamiya-report/worktrees/<tag>`
   (override with `REPORT_WORK_DIR`) and runs `npm ci` there;
2. starts MongoDB with `docker compose up -d --wait`;
3. runs the command with the right Node.js version (versions before
   `cm-ada-01` cannot start on Node.js 26, so they run on 24);
4. saves the output with colours, paths shortened to `~/backend-Nodejs`.

Two environment details are deliberate: `NODE_OPTIONS=--disable-warning=ExperimentalWarning`
hides the warning Jest's ESM mode prints on every run, and the `AI_AGENT` /
`CLAUDECODE` variables are removed because Jest 30 shortens its output when it
detects a coding agent.

"Before" evidence for changes that add tests runs the new tests against the
previous version's `src/` (see `testsAgainst` in `capture.mjs`); the note
under that pane says so.

## Template tags

`report/template/report.html` is plain HTML plus:

| Tag | Renders |
| --- | --- |
| `<x-val k="coverage.final.lines" format="pct"></x-val>` | a value from `values.json` (or `config.*` from `report.config.json`) |
| `<x-term id="cor/demo-before" lines="1-40" grep="…" omit="…">caption</x-term>` | a terminal pane from `evidence/<id>.txt` |
| `<x-code ref="cm-cor-01" file="src/app.js" lines="5-19" mark="9,17" title="After"></x-code>` | a file at a tag, with line numbers |
| `<x-svg id="part2/profile-icicle">caption</x-svg>` | an SVG from the evidence folder |
| `<x-toc></x-toc>`, `<x-index></x-index>` | contents (with page numbers) and evidence index |

## Analysis tools

Each can be run by hand from the repository root:

| Script | Purpose |
| --- | --- |
| `tools/ast.mjs dump <file> <line>` / `outline <file> <fn>` / `stats <dir>` | AST views (espree) |
| `tools/metrics.mjs <dir> [--json]` | lines, SLOC, functions, cyclomatic complexity |
| `tools/slice.mjs <file> <fn> <line> [--var v] [--coverage coverage-final.json]` | static / dynamic backward slice |
| `tools/workload.mjs <checkout> --trace` | request + MongoDB query trace |
| `node --cpu-prof tools/workload.mjs <checkout>` then `tools/profile.mjs <file.cpuprofile> --svg out.svg` | CPU profile summary and icicle chart |
| `demos/*.sh` | live-server demonstrations (run inside a checkout with `PORT`, `MONGODB_URI`, `JWT_SECRET` set) |

`VIVA.md` explains the whole report in plain words: why each change is in its category, how it was solved, unsolved problems, and likely viva questions.
