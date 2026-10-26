#!/usr/bin/env node
// Builds the report from report/template/report.html and the captured evidence.
//
//   npm run report:build
//
// Output: report/dist/report.html and report/dist/report.pdf (printed by
// headless Chromium/Chrome). The template is plain HTML plus these tags:
//
//   <x-val k="coverage.final.lines"></x-val>          a number from evidence/values.json
//   <x-term id="cor/demo-before" lines="1-20">Caption</x-term>
//                                                      captured terminal output (evidence/<id>.txt)
//   <x-code ref="cm-cor-01" file="src/app.js" lines="5-19" mark="9,17" title="After"></x-code>
//                                                      source of a file at a tagged version
//   <x-svg id="part2/profile-icicle">Caption</x-svg>  an SVG from the evidence folder
//   <x-index></x-index>                                table of all evidence items
//   <x-toc></x-toc>                                    table of contents (h1/h2 with an id)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ansiToHtml, escapeHtml } from "./lib/ansi.mjs";

const REPORT = import.meta.dirname;
const REPO = path.resolve(REPORT, "..");
const EVIDENCE = path.join(REPORT, "evidence");
const DIST = path.join(REPORT, "dist");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const config = readJson(path.join(REPORT, "report.config.json"));
const values = readJson(path.join(EVIDENCE, "values.json"));
const index = readJson(path.join(EVIDENCE, "index.json"));

// <name attr="…" …>content</name>; attribute values may contain ">"
const tag = (name) => new RegExp(`<${name}((?:\\s+[\\w-]+="[^"]*")*)\\s*>([\\s\\S]*?)</${name}>`, "g");
const attrs = (text) => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const lookup = (key) => key.split(".").reduce((obj, part) => obj?.[part], { ...values, config });

// "3-10" -> [3, 10]; lines are 1-based and inclusive
const range = (spec, total) => {
    if (!spec) return [1, total];
    const [from, to] = spec.split("-").map(Number);
    return [from, to || from];
};

const formatValue = (value, format) => {
    if (value === undefined || value === null) throw new Error("missing value");
    if (format === "pct") return `${Number(value).toFixed(2)}%`;
    if (format === "fixed1") return Number(value).toFixed(1);
    return String(value);
};

const renderVal = (a) => {
    try {
        return escapeHtml(formatValue(lookup(a.k), a.format));
    } catch {
        throw new Error(`<x-val k="${a.k}"> has no value in evidence/values.json`);
    }
};

const sourceNote = (id) => {
    const meta = index[id];
    const parts = [`evidence/${id}.txt`];
    if (meta.ref) parts.push(`tag ${meta.ref} (${meta.commit})`);
    if (meta.node) parts.push(`Node ${meta.node}`);
    if (meta.note) parts.push(meta.note);
    return parts.join(" · ");
};

const renderTerm = (a, caption) => {
    const meta = index[a.id];
    if (!meta) throw new Error(`<x-term id="${a.id}">: no such evidence (run npm run report:capture)`);
    let lines = fs.readFileSync(path.join(EVIDENCE, `${a.id}.txt`), "utf8").replace(/\n$/, "").split("\n");
    if (a.grep) lines = lines.filter((l) => new RegExp(a.grep).test(l.replace(/\x1b\[[0-9;]*m/g, "")));
    if (a.omit) lines = lines.filter((l) => !new RegExp(a.omit).test(l.replace(/\x1b\[[0-9;]*m/g, "")));
    const [from, to] = range(a.lines, lines.length);
    const cut = lines.slice(from - 1, to);
    const before = from > 1 ? `<span class="dim">… ${from - 1} line(s) above omitted</span>\n` : "";
    const after = to < lines.length ? `\n<span class="dim">… ${lines.length - to} line(s) below omitted</span>` : "";
    const command = (a.command ?? meta.command)
        .split("\n")
        .map((c) => `<span class="prompt">$</span> ${escapeHtml(c)}`)
        .join("\n");
    const transcript = meta.command.includes("\n") && !a.command;
    const where = meta.ref ? `${meta.ref}` : "backend-Nodejs";
    const small = a.size === "small" ? " small" : "";
    return `<figure class="term${small}">
<div class="term-bar"><span class="dots"><i></i><i></i><i></i></span><span class="term-title">${escapeHtml(where)}${meta.ref && meta.node ? ` — node v${escapeHtml(meta.node)}` : ""}</span></div>
<pre class="term-body">${transcript ? "" : `${command}\n`}${before}${ansiToHtml(cut.join("\n"))}${after}</pre>
<figcaption>${caption ? `${caption.trim()}<br>` : ""}<span class="source">${escapeHtml(sourceNote(a.id))}</span></figcaption>
</figure>`;
};

const renderCode = (a) => {
    const show = spawnSync("git", ["show", `${a.ref}:${a.file}`], { cwd: REPO, encoding: "utf8" });
    if (show.status !== 0) throw new Error(`<x-code>: git show ${a.ref}:${a.file} failed: ${show.stderr}`);
    const lines = show.stdout.replace(/\n$/, "").split("\n");
    const [from, to] = range(a.lines, lines.length);
    const marked = new Set((a.mark ?? "").split(",").filter(Boolean).flatMap((m) => {
        const [x, y] = range(m);
        return Array.from({ length: y - x + 1 }, (_, i) => x + i);
    }));
    const body = lines
        .slice(from - 1, to)
        .map((text, i) => {
            const n = from + i;
            return `<span class="ln${marked.has(n) ? " mark" : ""}"><span class="no">${n}</span>${escapeHtml(text) || " "}</span>`;
        })
        .join("");
    const sha = spawnSync("git", ["rev-parse", "--short", `${a.ref}^{commit}`], { cwd: REPO, encoding: "utf8" }).stdout.trim();
    return `<figure class="code">
<div class="code-title">${a.title ? `<b>${escapeHtml(a.title)}</b> · ` : ""}${escapeHtml(a.file)} <span class="dim">@ ${escapeHtml(a.ref)} (${sha})</span></div>
<pre>${body}</pre>
</figure>`;
};

const renderSvg = (a, caption) => {
    const svg = fs.readFileSync(path.join(EVIDENCE, `${a.id}.svg`), "utf8");
    return `<figure class="svg">${svg}<figcaption>${caption ? `${caption.trim()}<br>` : ""}<span class="source">evidence/${escapeHtml(a.id)}.svg</span></figcaption></figure>`;
};

const renderIndex = () => {
    const rows = Object.entries(index)
        .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
        .map(([id, m]) => `<tr><td><code>${escapeHtml(id)}</code></td><td>${escapeHtml(m.ref ?? "—")}</td><td>${escapeHtml(m.node ?? "—")}</td><td><code>${escapeHtml(m.command.split("\n")[0])}</code>${m.command.includes("\n") ? " …" : ""}</td><td>${m.exitCode}</td></tr>`)
        .join("\n");
    return `<table class="index"><thead><tr><th>Evidence id</th><th>Tag</th><th>Node</th><th>Command</th><th>Exit</th></tr></thead><tbody>${rows}</tbody></table>`;
};

const renderToc = (html, pages) => {
    const entries = [...html.matchAll(/<(h1|h2) id="([^"]+)"[^>]*>(.*?)<\/\1>/g)];
    const items = entries.map(([, level, id, inner]) => {
        const text = inner.replace(/<[^>]+>/g, "");
        const page = pages?.[id] ?? "";
        return `<li class="toc-${level}"><a href="#${id}"><span class="toc-text">${text}</span><span class="toc-page">${page}</span></a></li>`;
    });
    return `<ol class="toc">${items.join("\n")}</ol>`;
};

const render = (pages) => {
    let html = fs.readFileSync(path.join(REPORT, "template/report.html"), "utf8");
    const css = fs.readFileSync(path.join(REPORT, "template/style.css"), "utf8");
    html = html.replace("/* style.css */", css);
    html = html.replace(tag("x-val"), (_, a) => renderVal(attrs(a)));
    html = html.replace(tag("x-term"), (_, a, caption) => renderTerm(attrs(a), caption));
    html = html.replace(tag("x-code"), (_, a) => renderCode(attrs(a)));
    html = html.replace(tag("x-svg"), (_, a, caption) => renderSvg(attrs(a), caption));
    html = html.replace("<x-index></x-index>", renderIndex);
    html = html.replace("<x-toc></x-toc>", () => renderToc(html, pages));
    return html;
};

const findChrome = () => {
    const candidates = [process.env.CHROME, "chromium", "chromium-browser", "google-chrome", "google-chrome-stable"].filter(Boolean);
    for (const bin of candidates) {
        if (spawnSync("which", [bin]).status === 0) return bin;
    }
    throw new Error("No Chromium/Chrome found; set CHROME=/path/to/chrome");
};

const printPdf = (htmlFile, pdfFile) => {
    const result = spawnSync(findChrome(), [
        "--headless",
        "--no-pdf-header-footer",
        "--disable-gpu",
        `--print-to-pdf=${pdfFile}`,
        `file://${htmlFile}`,
    ], { encoding: "utf8" });
    if (!fs.existsSync(pdfFile)) throw new Error(`PDF printing failed:\n${result.stderr}`);
};

// Page on which each h1/h2 starts, read back from the printed PDF
const headingPages = (html, pdfFile) => {
    if (spawnSync("which", ["pdftotext"]).status !== 0) return null;
    const pageCount = Number(spawnSync("pdfinfo", [pdfFile], { encoding: "utf8" }).stdout.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
    const texts = [];
    for (let p = 1; p <= pageCount; p++) {
        const text = spawnSync("pdftotext", ["-f", String(p), "-l", String(p), "-raw", pdfFile, "-"], { encoding: "utf8" }).stdout;
        texts.push(text.replace(/\s+/g, " "));
    }
    const normal = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
    const pages = {};
    // Headings appear in document order, and step headings repeat in every
    // chapter, so each search starts at the page of the previous heading
    let from = texts.findIndex((t) => t.includes("Contents")) + 1;
    for (const [, , id, inner] of html.matchAll(/<(h1|h2) id="([^"]+)"[^>]*>(.*?)<\/\1>/g)) {
        const needle = normal(inner);
        const found = texts.findIndex((t, i) => i >= from && t.includes(needle));
        if (found !== -1) {
            pages[id] = found + 1;
            from = found;
        }
    }
    return pages;
};

fs.mkdirSync(DIST, { recursive: true });
const htmlFile = path.join(DIST, "report.html");
const pdfFile = path.join(DIST, "report.pdf");

// Pass 1 finds the page numbers, pass 2 prints them in the table of contents
let html = render(null);
fs.writeFileSync(htmlFile, html);
printPdf(htmlFile, pdfFile);
const pages = headingPages(html, pdfFile);
if (pages) {
    html = render(pages);
    fs.writeFileSync(htmlFile, html);
    printPdf(htmlFile, pdfFile);
}
const pageCount = spawnSync("pdfinfo", [pdfFile], { encoding: "utf8" }).stdout.match(/Pages:\s+(\d+)/)?.[1];
console.log(`report/dist/report.html\nreport/dist/report.pdf${pageCount ? ` (${pageCount} pages)` : ""}`);
