#!/usr/bin/env node
// Collects every piece of evidence shown in the report by running real
// commands against real checkouts of the tagged project versions.
//
//   npm run report:capture                 everything
//   npm run report:capture -- --only cor/  only evidence ids starting with cor/
//
// Output: report/evidence/<id>.txt (raw terminal output), report/evidence/index.json
// (command, version, exit code per id) and report/evidence/values.json (numbers
// the report quotes). See report/README.md.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const EVIDENCE = path.join(REPO, "report/evidence");
const WORK = process.env.REPORT_WORK_DIR ?? path.join(os.homedir(), ".cache/jamiya-report/worktrees");
const SCRATCH = path.join(WORK, "_scratch");
const TOOLS = path.join(REPO, "report/tools");
const DEMOS = path.join(REPO, "report/demos");
const BIN = path.join(REPO, "node_modules/.bin");

// Node.js releases used (installed with nvm)
const NODE_OLD = "24.21.0";
const NODE_NEW = "26.10.0";

// Project versions, in order (git tags)
const REFS = ["baseline", "lab-setup", "cm-cor-01", "cm-ada-01", "cm-pre-01", "cm-per-01"];
const FINAL = "cm-per-01";
// Versions before the adaptive change only run on Node.js 24
const nodeFor = (ref) => (REFS.indexOf(ref) < REFS.indexOf("cm-ada-01") ? NODE_OLD : NODE_NEW);

const DEMO_ENV = {
    PORT: "5055",
    MONGODB_URI: "mongodb://127.0.0.1:27017/jamiya_report",
    JWT_SECRET: "report-demo-secret",
    NODE_ENV: "development",
};

const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];
const wanted = (id) => !only || id.startsWith(only);

fs.mkdirSync(EVIDENCE, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
const index = readJson(path.join(EVIDENCE, "index.json"), {});
const values = readJson(path.join(EVIDENCE, "values.json"), {});

// --- running commands -------------------------------------------------------

const nodeBin = (version) => {
    const dir = path.join(process.env.NVM_DIR ?? path.join(os.homedir(), ".nvm"), "versions/node", `v${version}`, "bin");
    if (!fs.existsSync(dir)) throw new Error(`Node.js ${version} is not installed; run: nvm install ${version}`);
    return dir;
};

// Jest shortens its output when it detects an AI coding agent; drop those
// markers so the evidence shows what a person running the command sees
const { AI_AGENT, CLAUDECODE, ...baseEnv } = process.env;

const run = (command, { cwd = REPO, node = NODE_NEW, env = {}, timeout = 600_000 } = {}) => {
    const result = spawnSync("bash", ["-c", `(${command}) 2>&1`], {
        cwd,
        encoding: "utf8",
        timeout,
        maxBuffer: 256 * 1024 * 1024,
        env: {
            ...baseEnv,
            // node from nvm first; eslint and jscpd from this checkout are usable in every checkout
            PATH: `${nodeBin(node)}:${BIN}:${process.env.PATH}`,
            FORCE_COLOR: "1",
            // Jest needs --experimental-vm-modules for ESM; hide the warning it prints every run
            NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
            ...env,
        },
    });
    return { output: result.stdout ?? "", code: result.status };
};

const sha = (ref) => run(`git rev-parse --short ${ref}^{commit}`).output.trim();
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

// Show paths the way a reader would see them in their own checkout
const normalise = (text) =>
    text
        .replaceAll(`${WORK}/_scratch`, "/tmp")
        .replace(new RegExp(`${WORK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[\\w-]+`, "g"), "~/backend-Nodejs")
        .replaceAll(REPO, "~/backend-Nodejs")
        .replaceAll(os.homedir(), "~");

const save = (id, { output, code, command, ref, node, note }) => {
    const file = path.join(EVIDENCE, `${id}.txt`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, normalise(output).replace(/\s+$/, "") + "\n");
    index[id] = {
        command,
        ref: ref ?? null,
        commit: ref ? sha(ref) : null,
        node: node ?? null,
        exitCode: code,
        note: note ?? null,
        capturedAt: new Date().toISOString(),
    };
    console.log(`  ${id.padEnd(30)} exit ${code}  (${command.split("\n")[0].slice(0, 70)})`);
};

// record(id, ref, command): run `command` in a checkout of `ref` and save its output
const record = (id, ref, command, { node = NODE_NEW, shown = command, env = {}, timeout, note } = {}) => {
    if (!wanted(id)) return null;
    const cwd = ref ? checkout(ref) : REPO;
    const result = run(command, { cwd, node, env, timeout });
    save(id, { ...result, command: shown, ref, node, note });
    return result;
};

// transcript(id, ref, commands): several commands, each echoed with "$ "
const transcript = (id, ref, commands, options = {}) => {
    const script = commands.map((c) => `echo ${quote(`$ ${c}`)}; ${c}; echo`).join("; ");
    return record(id, ref, script, { ...options, shown: commands.join("\n") });
};

// --- checkouts of tagged versions --------------------------------------------

const prepared = new Set();
const checkout = (ref, { install = ref !== "baseline" } = {}) => {
    const dir = path.join(WORK, ref);
    if (prepared.has(ref)) return dir;
    run("git worktree prune");
    if (!fs.existsSync(dir)) {
        const add = run(`git worktree add --force --detach ${quote(dir)} ${ref}`);
        if (add.code !== 0) throw new Error(add.output);
    }
    run(`git checkout -q --force --detach ${ref} && git clean -qfdx -e node_modules`, { cwd: dir });
    if (install) {
        const lock = run("git hash-object package-lock.json", { cwd: dir }).output.trim();
        const marker = path.join(dir, "node_modules/.installed-lock");
        if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8") !== lock) {
            console.log(`  (npm ci in ${ref})`);
            const ci = run("npm ci --no-fund --no-audit", { cwd: dir });
            if (ci.code !== 0) throw new Error(ci.output);
            fs.writeFileSync(marker, lock);
        }
    }
    prepared.add(ref);
    return dir;
};

const dropDemoDb = () =>
    run(`docker exec jamiya-mongo mongosh --quiet jamiya_report --eval "db.dropDatabase()"`);

const testSummary = (output) => {
    const line = stripAnsi(output).match(/^Tests:\s+(.*)$/m)?.[1] ?? "";
    const count = (word) => Number(line.match(new RegExp(`(\\d+) ${word}`))?.[1] ?? 0);
    return { passed: count("passed"), failed: count("failed"), skipped: count("skipped"), total: count("total") };
};

const knownBugTests = (ref) =>
    Number(run(`git grep -c "test.failing(" ${ref} -- tests | awk -F: '{ s += $NF } END { print s + 0 }'`).output.trim());

const lineOf = (ref, file, text) => {
    const lines = run(`git show ${ref}:${file}`).output.split("\n");
    return lines.findIndex((l) => l.includes(text)) + 1;
};

// Run the test files of `ref` against the application source of `srcRef`
const testsAgainst = (id, ref, srcRef, args, options) => {
    if (!wanted(id)) return null;
    const dir = checkout(ref);
    run(`git checkout -q ${srcRef} -- src`, { cwd: dir });
    try {
        return record(id, ref, `npm test -- ${args}`, {
            ...options,
            note: `tests from ${ref}, application source (src/) from ${srcRef}`,
        });
    } finally {
        run(`git checkout -q ${ref} -- src && git clean -qfd src`, { cwd: dir });
    }
};

const set = (key, value) => {
    const parts = key.split(".");
    let target = values;
    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
    target[parts.at(-1)] = value;
};

// =============================================================================

console.log("Preparing database");
const up = run("docker compose up -d --wait", { cwd: REPO });
if (up.code !== 0) throw new Error(`docker compose up failed:\n${up.output}`);

set("refs", Object.fromEntries(REFS.map((ref) => [ref, sha(ref)])));
set("generatedAt", new Date().toISOString().slice(0, 10));

// --- 3. Tooling and environment ---------------------------------------------
console.log("Environment and baseline");

transcript("setup/env", null, [
    "uname -sr",
    "node --version && npm --version",
    "docker --version",
    "docker exec jamiya-mongo mongod --version | head -1",
]);

if (wanted("setup/npm-ci")) {
    const dir = checkout("lab-setup", { install: false });
    fs.rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
    record("setup/npm-ci", "lab-setup", "npm ci --no-fund", { shown: "npm ci" });
    fs.writeFileSync(path.join(dir, "node_modules/.installed-lock"), run("git hash-object package-lock.json", { cwd: dir }).output.trim());
    prepared.delete("lab-setup");
}

record("setup/history", "baseline", "git log --format='%h %ad %s' --date=short", {
    shown: "git log --format='%h %ad %s' --date=short   # at tag baseline",
});

if (wanted("setup/structure")) {
    const files = run("git ls-tree -r --name-only baseline").output.trim().split("\n").filter((f) => !f.startsWith(".vscode"));
    const tree = {};
    for (const file of files) {
        let node = tree;
        for (const part of file.split("/")) node = node[part] ??= {};
    }
    const lines = ["backend-Nodejs/"];
    const draw = (node, prefix) => {
        const entries = Object.entries(node).sort(([a, x], [b, y]) => (Object.keys(y).length > 0) - (Object.keys(x).length > 0) || a.localeCompare(b));
        entries.forEach(([name, child], i) => {
            const last = i === entries.length - 1;
            const isDir = Object.keys(child).length > 0;
            lines.push(`${prefix}${last ? "└── " : "├── "}${name}${isDir ? "/" : ""}`);
            if (isDir) draw(child, prefix + (last ? "    " : "│   "));
        });
    };
    draw(tree, "");
    save("setup/structure", { output: lines.join("\n"), code: 0, command: "git ls-tree -r --name-only baseline   # drawn as a tree", ref: "baseline" });
}

record("setup/mongo8-kernel", null, "timeout 60 docker run --rm mongo:8.0.34 | grep -m1 'cannot start'", {
    shown: "docker run --rm mongo:8.0.34",
    note: "only the fatal log line is kept",
});

record("setup/src-unchanged", null, "git diff --stat baseline lab-setup -- src; echo \"$(git diff --name-only baseline lab-setup -- src | wc -l) files under src/ differ\"", {
    shown: "git diff --stat baseline lab-setup -- src",
});

const baselineTests = record("setup/tests", "lab-setup", "npm test -- --silent --verbose", { shown: "npm test -- --verbose", node: NODE_OLD });
if (baselineTests) set("tests.lab-setup", { ...testSummary(baselineTests.output), knownBugs: knownBugTests("lab-setup") });

// --- 4. Corrective: CM-COR-01 ----------------------------------------------
console.log("Corrective");

for (const [id, ref] of [["cor/demo-before", "lab-setup"], ["cor/demo-after", "cm-cor-01"]]) {
    if (!wanted(id)) continue;
    dropDemoDb();
    record(id, ref, `bash ${DEMOS}/auth-requests.sh`, { node: NODE_OLD, env: DEMO_ENV, shown: "report/demos/auth-requests.sh" });
}
record("cor/diff", null, "git diff --color=always lab-setup cm-cor-01 -- src", { shown: "git diff lab-setup cm-cor-01 -- src" });
record("cor/tests", "cm-cor-01", "npm test -- --silent --verbose tests/auth.test.js -t 'GET /api/auth/profile'", {
    node: NODE_OLD,
    shown: "npm test -- --verbose tests/auth.test.js -t 'GET /api/auth/profile'",
});

// --- 5. Adaptive: CM-ADA-01 --------------------------------------------------
console.log("Adaptive");

for (const [id, ref] of [["ada/boot-before", "cm-cor-01"], ["ada/boot-after", "cm-ada-01"]]) {
    if (!wanted(id)) continue;
    dropDemoDb();
    record(id, ref, `bash ${DEMOS}/boot.sh`, { node: NODE_NEW, env: DEMO_ENV, shown: "report/demos/boot.sh" });
}
for (const [id, ref] of [["ada/deps-before", "cm-cor-01"], ["ada/deps-after", "cm-ada-01"]]) {
    record(id, ref, "npm ls buffer-equal-constant-time", { shown: "npm ls buffer-equal-constant-time" });
}
record("ada/slowbuffer", "cm-cor-01", "grep -n 'SlowBuffer' node_modules/buffer-equal-constant-time/index.js", {
    shown: "grep -n SlowBuffer node_modules/buffer-equal-constant-time/index.js",
});
record("ada/jwa", "cm-ada-01", "grep -n -A9 '^var timingSafeEqual' node_modules/jwa/index.js", {
    shown: "grep -n -A9 '^var timingSafeEqual' node_modules/jwa/index.js",
});
record("ada/diff", null, "git diff --color=always cm-cor-01 cm-ada-01 -- package.json .nvmrc; git diff --stat cm-cor-01 cm-ada-01", {
    shown: "git diff cm-cor-01 cm-ada-01 -- package.json .nvmrc\ngit diff --stat cm-cor-01 cm-ada-01",
});
for (const [id, node] of [["ada/tests-node26", NODE_NEW], ["ada/tests-node24", NODE_OLD]]) {
    record(id, "cm-ada-01", "node --version && npm test -- --silent", { node, shown: "node --version && npm test" });
}

// --- 6. Preventive: CM-PRE-01 ------------------------------------------------
console.log("Preventive");

for (const [id, ref] of [["pre/demo-before", "cm-ada-01"], ["pre/demo-after", "cm-pre-01"]]) {
    if (!wanted(id)) continue;
    dropDemoDb();
    record(id, ref, `bash ${DEMOS}/credentials.sh`, { env: DEMO_ENV, shown: "report/demos/credentials.sh" });
}
testsAgainst("pre/tests-before", "cm-pre-01", "cm-ada-01", "--silent --verbose tests/auth.test.js -t 'credential exposure'");
record("pre/tests-after", "cm-pre-01", "npm test -- --silent --verbose tests/auth.test.js -t 'credential exposure'", {
    shown: "npm test -- --verbose tests/auth.test.js -t 'credential exposure'",
});
record("pre/diff", null, "git diff --color=always cm-ada-01 cm-pre-01 -- src", { shown: "git diff cm-ada-01 cm-pre-01 -- src" });

// --- 7. Perfective: CM-PER-01 ------------------------------------------------
console.log("Perfective");

const JSCPD = "jscpd --min-lines 5 --min-tokens 30";
for (const [id, ref] of [["per/jscpd-before", "cm-pre-01"], ["per/jscpd-after", FINAL]]) {
    const result = record(id, ref, `${JSCPD} --reporters console --silent src; ${JSCPD} --reporters console src | grep -E '^Clone|^ - |^   [a-z]'`, {
        shown: `${JSCPD} src`,
    });
    if (result) {
        const out = path.join(SCRATCH, `jscpd-${ref}`);
        run(`${JSCPD} --silent --reporters json --output ${out} src`, { cwd: checkout(ref) });
        const stats = readJson(path.join(out, "jscpd-report.json"), {}).statistics?.total ?? {};
        set(`clones.${ref}`, { clones: stats.clones, duplicatedLines: stats.duplicatedLines, percentage: stats.percentage });
    }
}
testsAgainst("per/tests-before", FINAL, "cm-pre-01", "--silent");
record("per/tests-after", FINAL, "npm test -- --silent", { shown: "npm test" });
// -w: removing the try blocks re-indents whole functions; hide whitespace-only changes
record("per/diff", null, "git diff -w --color=always cm-pre-01 cm-per-01 -- src", { shown: "git diff -w cm-pre-01 cm-per-01 -- src" });
record("per/diff-stat", null, "git diff --stat cm-pre-01 cm-per-01 -- src", { shown: "git diff --stat cm-pre-01 cm-per-01 -- src" });

// --- Test progression across all versions ------------------------------------
console.log("Test progression");
for (const ref of REFS.slice(1)) {
    const result = record(`tests/${ref}`, ref, "node --version && npm test -- --silent", { node: nodeFor(ref), shown: "node --version && npm test" });
    if (result) set(`tests.${ref}`, { ...testSummary(result.output), knownBugs: knownBugTests(ref) });
}

// --- Part 2: static analysis -------------------------------------------------
console.log("Part 2: static analysis");

const finalMiddleware = "src/middlewares/auth.middleware.js";
record("part2/ast-dump", FINAL, `node ${TOOLS}/ast.mjs dump ${finalMiddleware} 6`, {
    shown: `node report/tools/ast.mjs dump ${finalMiddleware} 6`,
});
record("part2/ast-outline", FINAL, `node ${TOOLS}/ast.mjs outline ${finalMiddleware} isAuthenticated`, {
    shown: `node report/tools/ast.mjs outline ${finalMiddleware} isAuthenticated`,
});
for (const [id, ref] of [["part2/ast-stats-baseline", "baseline"], ["part2/ast-stats-final", FINAL]]) {
    record(id, ref, `node ${TOOLS}/ast.mjs stats src`, { shown: "node report/tools/ast.mjs stats src" });
}
for (const [key, ref] of [["baseline", "baseline"], ["final", FINAL]]) {
    const result = record(`part2/metrics-${key}`, ref, `node ${TOOLS}/metrics.mjs src`, { shown: "node report/tools/metrics.mjs src" });
    if (result) {
        const json = JSON.parse(run(`node ${TOOLS}/metrics.mjs src --json`, { cwd: checkout(ref) }).output);
        const fn = (name) => json.files.flatMap((f) => f.functions).find((f) => f.name === name)?.complexity;
        set(`metrics.${key}`, { ...json.totals, getQuestions: fn("getQuestions"), loginUser: fn("loginUser"), createQuestion: fn("createQuestion") });
    }
    const eslint = record(`part2/eslint-${key}`, ref, `eslint --config ${REPO}/report/eslint.config.js src`, {
        shown: "eslint --config report/eslint.config.js src",
    });
    if (eslint) {
        const json = JSON.parse(run(`eslint --config ${REPO}/report/eslint.config.js --format json src || true`, { cwd: checkout(ref) }).output);
        set(`eslint.${key}`, json.reduce((n, f) => n + f.errorCount + f.warningCount, 0));
    }
}

// --- Part 2: dynamic analysis --------------------------------------------------
console.log("Part 2: coverage");

for (const [key, ref] of [["baseline", "lab-setup"], ["final", FINAL]]) {
    const out = path.join(SCRATCH, `coverage-${ref}`);
    const result = record(
        `part2/coverage-${key}`,
        ref,
        `npm test -- --silent --coverage --coverageProvider=v8 --collectCoverageFrom='src/**/*.js' --coverageReporters=text --coverageReporters=json-summary --coverageDirectory=${out}`,
        { node: nodeFor(ref), shown: "npm test -- --coverage --coverageProvider=v8 --collectCoverageFrom='src/**/*.js'" },
    );
    if (result) {
        const total = readJson(path.join(out, "coverage-summary.json"), {}).total ?? {};
        set(`coverage.${key}`, Object.fromEntries(["lines", "statements", "functions", "branches"].map((k) => [k, total[k]?.pct])));
    }
}

// --- Part 2: program slicing ---------------------------------------------------
console.log("Part 2: slicing");

const controller = "src/controllers/question.controller.js";
const criterion = lineOf(FINAL, controller, "Question.find(query)");
set("slice", { criterion, function: "getQuestions", file: controller });
record("part2/slice-static", FINAL, `node ${TOOLS}/slice.mjs ${controller} getQuestions ${criterion} --var query`, {
    shown: `node report/tools/slice.mjs ${controller} getQuestions ${criterion} --var query`,
});
if (wanted("part2/slice-dynamic")) {
    const out = path.join(SCRATCH, "coverage-one-test");
    const testRun = record(
        "part2/slice-run",
        FINAL,
        `npm test -- --silent tests/questions.test.js -t 'searches titles' --coverage --coverageProvider=v8 --coverageReporters=json --collectCoverageFrom=${controller} --coverageDirectory=${out} 2>&1 | grep -v '^$'`,
        { shown: `npm test -- tests/questions.test.js -t 'searches titles' --coverage --coverageReporters=json --collectCoverageFrom=${controller}` },
    );
    record("part2/slice-dynamic", FINAL, `node ${TOOLS}/slice.mjs ${controller} getQuestions ${criterion} --var query --coverage ${out}/coverage-final.json`, {
        shown: `node report/tools/slice.mjs ${controller} getQuestions ${criterion} --var query --coverage coverage/coverage-final.json`,
    });
}

// --- Part 2: runtime tracing and profiling -------------------------------------
console.log("Part 2: runtime");

if (wanted("part2/trace")) {
    record("part2/trace", null, `node ${TOOLS}/workload.mjs ${quote(checkout(FINAL))} --trace`, {
        env: DEMO_ENV,
        shown: "node report/tools/workload.mjs . --trace",
        ref: FINAL,
    });
    index["part2/trace"].ref = FINAL;
    index["part2/trace"].commit = sha(FINAL);
}
if (wanted("part2/profile")) {
    const dir = path.join(SCRATCH, "profile");
    fs.rmSync(dir, { recursive: true, force: true });
    const profileRun = run(`node --cpu-prof --cpu-prof-dir=${dir} --cpu-prof-name=workload.cpuprofile ${TOOLS}/workload.mjs ${quote(checkout(FINAL))} --iterations 30`, { env: DEMO_ENV });
    if (profileRun.code !== 0) throw new Error(profileRun.output);
    const svg = path.join(EVIDENCE, "part2/profile-icicle.svg");
    record("part2/profile", null, `echo '$ node --cpu-prof report/tools/workload.mjs . --iterations 30'; echo ${quote(profileRun.output.trim())}; echo; echo '$ node report/tools/profile.mjs workload.cpuprofile --svg icicle.svg'; node ${TOOLS}/profile.mjs ${dir}/workload.cpuprofile --svg ${svg} | grep -v '^icicle'`, {
        shown: "node --cpu-prof report/tools/workload.mjs . --iterations 30\nnode report/tools/profile.mjs workload.cpuprofile --svg icicle.svg",
    });
    index["part2/profile"].ref = FINAL;
    index["part2/profile"].commit = sha(FINAL);
    const summary = stripAnsi(fs.readFileSync(path.join(EVIDENCE, "part2/profile.txt"), "utf8"));
    set("profile", {
        bcryptShare: summary.match(/bcryptjs\s+[\d.]+ ms\s+([\d.]+)%/)?.[1],
        comparePasswordShare: summary.match(/([\d.]+)%\s+userSchema\.methods\.comparePassword/)?.[1],
        busyMs: summary.match(/busy \(CPU\) ([\d.]+) ms/)?.[1],
    });
}

// --- Part 2: clone detection and dependency audit -------------------------------
console.log("Part 2: clones and audit");

for (const [key, ref] of [["baseline", "baseline"], ["final", FINAL]]) {
    record(`part2/jscpd-${key}`, ref, `${JSCPD} --reporters console src`, { shown: `${JSCPD} src` });
    if (wanted(`part2/jscpd-${key}`)) {
        const out = path.join(SCRATCH, `jscpd-${key}`);
        run(`${JSCPD} --silent --reporters json --output ${out} src`, { cwd: checkout(ref) });
        const stats = readJson(path.join(out, "jscpd-report.json"), {}).statistics?.total ?? {};
        set(`clones.${key}`, { clones: stats.clones, duplicatedLines: stats.duplicatedLines, percentage: stats.percentage });
    }
}
for (const [key, ref] of [["baseline", "lab-setup"], ["final", FINAL]]) {
    const result = record(`part2/audit-${key}`, ref, "npm audit --omit=dev | tail -4", { shown: "npm audit --omit=dev" });
    if (result) {
        const json = JSON.parse(run("npm audit --omit=dev --json || true", { cwd: checkout(ref) }).output || "{}");
        set(`audit.${key}`, json.metadata?.vulnerabilities ?? null);
    }
}

fs.writeFileSync(path.join(EVIDENCE, "index.json"), JSON.stringify(index, null, 2) + "\n");
fs.writeFileSync(path.join(EVIDENCE, "values.json"), JSON.stringify(values, null, 2) + "\n");
console.log(`\nEvidence written to report/evidence (${Object.keys(index).length} items)`);
