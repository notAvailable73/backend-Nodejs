#!/usr/bin/env node
// cProfile/SnakeViz equivalent for V8 CPU profiles (node --cpu-prof).
//
//   node report/tools/profile.mjs <file.cpuprofile> [--svg icicle.svg]
//
// Prints where sampled CPU time went: by package and by function (self time).
// With --svg, also writes an icicle chart of the call tree: each box is a
// function call path, its width is the time spent in it and everything it
// called, and children sit under their caller (SnakeViz's icicle view).
import fs from "node:fs";

const [file, flag, svgPath] = process.argv.slice(2);
const profile = JSON.parse(fs.readFileSync(file, "utf8"));

const nodes = new Map(profile.nodes.map((n) => [n.id, { ...n, self: 0, total: 0, kids: [] }]));
for (const n of nodes.values()) n.kids = (n.children ?? []).map((id) => nodes.get(id));
profile.samples.forEach((id, i) => (nodes.get(id).self += (profile.timeDeltas[i] ?? 0) / 1000));
const root = nodes.get(profile.nodes[0].id);
const sumTotal = (n) => (n.total = n.self + n.kids.reduce((acc, k) => acc + sumTotal(k), 0));
sumTotal(root);

const where = ({ url, lineNumber }) => {
    if (!url) return "";
    const mod = url.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\/(.*)$/);
    if (mod) return `${mod[1]}/${mod[2]}:${lineNumber + 1}`;
    const src = url.match(/\/(src\/.*)$/);
    if (src) return `${src[1]}:${lineNumber + 1}`;
    return url.replace(/^file:\/\/.*\//, "") + `:${lineNumber + 1}`;
};

const category = ({ functionName, url }) => {
    if (/^\((idle|program|garbage collector|root)\)$/.test(functionName)) return functionName;
    const mod = url.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
    if (mod) return mod[1];
    if (/\/src\//.test(url) && !/\/report\//.test(url)) return "application (src/)";
    if (/\/report\//.test(url)) return "workload driver";
    return "node internals";
};

const ms = (value) => `${value.toFixed(1)} ms`.padStart(10);
const pct = (value, of) => `${((value / of) * 100).toFixed(1)}%`.padStart(6);

const all = [...nodes.values()];
const idle = all.filter((n) => n.callFrame.functionName === "(idle)").reduce((a, n) => a + n.self, 0);
const busy = root.total - idle;

console.log(`sampled ${ms(root.total).trim()}; idle ${ms(idle).trim()}; busy (CPU) ${ms(busy).trim()}\n`);

const byCategory = new Map();
for (const n of all) {
    const c = category(n.callFrame);
    if (c === "(idle)") continue;
    byCategory.set(c, (byCategory.get(c) ?? 0) + n.self);
}
console.log("CPU time by package (self time)");
for (const [c, t] of [...byCategory].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${c.padEnd(26)}${ms(t)} ${pct(t, busy)}  ${"█".repeat(Math.round((t / busy) * 40))}`);
}

const byFunction = new Map();
for (const n of all) {
    const { functionName } = n.callFrame;
    if (functionName === "(idle)") continue;
    const key = `${functionName || "(anonymous)"}  ${where(n.callFrame)}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + n.self);
}
console.log("\nTop functions by self time");
console.log(`  ${"self".padStart(10)} ${"%".padStart(6)}  function  location`);
for (const [key, t] of [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${ms(t)} ${pct(t, busy)}  ${key}`);
}

const appFunctions = [...nodes.values()].filter((n) => category(n.callFrame) === "application (src/)");
const appTotals = new Map();
for (const n of appFunctions) {
    const key = `${n.callFrame.functionName || "(anonymous)"}  ${where(n.callFrame)}`;
    appTotals.set(key, (appTotals.get(key) ?? 0) + n.total);
}
console.log("\nApplication functions by total time (including callees)");
for (const [key, t] of [...appTotals].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`  ${ms(t)} ${pct(t, busy)}  ${key}`);
}

if (flag === "--svg") {
    const WIDTH = 1000;
    const ROW = 16;
    const MAX_DEPTH = 34;
    const colours = {
        "application (src/)": "#d9480f",
        "node internals": "#adb5bd",
        "(garbage collector)": "#f08c00",
        "(program)": "#ced4da",
        "workload driver": "#868e96",
    };
    const palette = ["#1c7ed6", "#0ca678", "#7048e8", "#1098ad", "#5c940d", "#ae3ec9", "#3b5bdb", "#099268"];
    const packageColour = new Map();
    const colourOf = (frame) => {
        const c = category(frame);
        if (colours[c]) return colours[c];
        if (!packageColour.has(c)) packageColour.set(c, palette[packageColour.size % palette.length]);
        return packageColour.get(c);
    };
    const escape = (s) => s.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const boxes = [];
    let depthUsed = 0;
    const layout = (n, x, depth) => {
        const width = (n.total / busy) * WIDTH;
        if (width < 0.6 || depth > MAX_DEPTH) return;
        depthUsed = Math.max(depthUsed, depth);
        const name = n.callFrame.functionName || "(anonymous)";
        const y = depth * ROW;
        const title = `${name} ${where(n.callFrame)} — ${n.total.toFixed(1)} ms`;
        let box = `<g><title>${escape(title)}</title><rect x="${x.toFixed(2)}" y="${y}" width="${Math.max(width - 0.4, 0.3).toFixed(2)}" height="${ROW - 1}" fill="${colourOf(n.callFrame)}"/>`;
        if (width > 46) {
            const chars = Math.floor((width - 6) / 6.2);
            const text = name.length > chars ? `${name.slice(0, chars - 1)}…` : name;
            box += `<text x="${(x + 3).toFixed(2)}" y="${y + 11.5}">${escape(text)}</text>`;
        }
        boxes.push(`${box}</g>`);
        let childX = x;
        for (const k of n.kids.filter((k) => k.callFrame.functionName !== "(idle)").sort((a, b) => b.total - a.total)) {
            layout(k, childX, depth + 1);
            childX += (k.total / busy) * WIDTH;
        }
    };
    // Root = all CPU time except idle
    let x = 0;
    for (const k of root.kids.filter((k) => k.callFrame.functionName !== "(idle)").sort((a, b) => b.total - a.total)) {
        layout(k, x, 0);
        x += (k.total / busy) * WIDTH;
    }
    const legend = [...Object.entries(colours), ...packageColour]
        .filter(([c]) => byCategory.has(c))
        .map(([c, colour], i) => `<g transform="translate(${(i % 4) * 250},${Math.floor(i / 4) * 16})"><rect width="10" height="10" fill="${colour}"/><text x="14" y="9">${escape(c)}</text></g>`);
    const chartHeight = (depthUsed + 1) * ROW;
    const legendRows = Math.ceil(legend.length / 4);
    const height = chartHeight + 12 + legendRows * 16;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" font-family="ui-monospace, Menlo, monospace" font-size="10" fill="#fff">
<style>text{fill:#fff}.legend text{fill:#333}</style>
${boxes.join("\n")}
<g class="legend" transform="translate(0,${chartHeight + 12})">${legend.join("")}</g>
</svg>
`;
    fs.writeFileSync(svgPath, svg);
    console.log(`\nicicle chart written to ${svgPath}`);
}
