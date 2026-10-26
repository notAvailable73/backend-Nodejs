#!/usr/bin/env node
// Static analysis B: size and complexity metrics.
//
//   node report/tools/metrics.mjs <dir> [--json]
//
// Per file: physical lines, source lines (SLOC: not blank, not only comment),
// comment lines and functions. Per function: McCabe cyclomatic complexity,
// counted as 1 + the number of decision points:
//   if, ?:, for/for-in/for-of, while, do-while, case (not default), catch,
//   &&, ||, ??
import fs from "node:fs";
import path from "node:path";
import { parseFile, walk, FUNCTION_TYPES, functionName } from "./js-ast.mjs";

const DECISIONS = new Set([
    "IfStatement",
    "ConditionalExpression",
    "ForStatement",
    "ForInStatement",
    "ForOfStatement",
    "WhileStatement",
    "DoWhileStatement",
    "CatchClause",
]);

const isDecision = (node) =>
    DECISIONS.has(node.type) ||
    (node.type === "SwitchCase" && node.test !== null) ||
    (node.type === "LogicalExpression" && ["&&", "||", "??"].includes(node.operator));

const enclosingFunction = (node) => {
    for (let current = node.parent; current; current = current.parent) {
        if (FUNCTION_TYPES.has(current.type)) return current;
    }
    return null;
};

const fileMetrics = (file, root) => {
    const { source, ast } = parseFile(file);
    const lines = source.split("\n");
    if (lines.at(-1) === "") lines.pop();

    const commentLines = new Set();
    for (const comment of ast.comments) {
        for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) commentLines.add(line);
    }
    const codeLines = new Set();
    walk(ast, (node) => {
        if (node.type !== "Program") {
            codeLines.add(node.loc.start.line);
            codeLines.add(node.loc.end.line);
        }
    });

    const functions = new Map();
    walk(ast, (node) => {
        if (FUNCTION_TYPES.has(node.type)) {
            functions.set(node, { name: functionName(node), line: node.loc.start.line, complexity: 1 });
        }
    });
    walk(ast, (node) => {
        if (isDecision(node)) {
            const fn = enclosingFunction(node);
            if (fn) functions.get(fn).complexity += 1;
        }
    });

    return {
        file: path.relative(root, file),
        lines: lines.length,
        sloc: lines.filter((text, i) => text.trim() !== "" && codeLines.has(i + 1)).length,
        comments: [...commentLines].filter((line) => line <= lines.length).length,
        functions: [...functions.values()],
    };
};

const [dir, flag] = process.argv.slice(2);
const files = fs
    .readdirSync(dir, { recursive: true })
    .filter((file) => file.endsWith(".js"))
    .sort()
    .map((file) => fileMetrics(path.join(dir, file), dir));

const allFunctions = files.flatMap((f) => f.functions.map((fn) => ({ ...fn, file: f.file })));
const sum = (values) => values.reduce((a, b) => a + b, 0);
const totals = {
    files: files.length,
    lines: sum(files.map((f) => f.lines)),
    sloc: sum(files.map((f) => f.sloc)),
    comments: sum(files.map((f) => f.comments)),
    functions: allFunctions.length,
    totalComplexity: sum(allFunctions.map((fn) => fn.complexity)),
    maxComplexity: Math.max(...allFunctions.map((fn) => fn.complexity)),
    meanComplexity: Number((sum(allFunctions.map((fn) => fn.complexity)) / allFunctions.length).toFixed(2)),
};

if (flag === "--json") {
    console.log(JSON.stringify({ totals, files }, null, 2));
} else {
    const pad = (value, width) => String(value).padStart(width);
    console.log(`${"file".padEnd(38)} ${pad("lines", 5)} ${pad("sloc", 5)} ${pad("cmt", 4)} ${pad("fns", 4)} ${pad("maxCC", 5)}`);
    for (const f of files) {
        const maxCC = f.functions.length ? Math.max(...f.functions.map((fn) => fn.complexity)) : "-";
        console.log(`${f.file.padEnd(38)} ${pad(f.lines, 5)} ${pad(f.sloc, 5)} ${pad(f.comments, 4)} ${pad(f.functions.length, 4)} ${pad(maxCC, 5)}`);
    }
    console.log(`${"TOTAL".padEnd(38)} ${pad(totals.lines, 5)} ${pad(totals.sloc, 5)} ${pad(totals.comments, 4)} ${pad(totals.functions, 4)} ${pad(totals.maxComplexity, 5)}`);
    console.log(`\nMost complex functions (cyclomatic complexity):`);
    for (const fn of [...allFunctions].sort((a, b) => b.complexity - a.complexity).slice(0, 6)) {
        console.log(`  CC ${pad(fn.complexity, 2)}  ${fn.name}  (${fn.file}:${fn.line})`);
    }
    console.log(`\nmean CC ${totals.meanComplexity} over ${totals.functions} functions`);
}
