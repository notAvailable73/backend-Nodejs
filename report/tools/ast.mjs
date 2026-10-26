#!/usr/bin/env node
// Static analysis A: Abstract Syntax Tree generation.
//
//   node report/tools/ast.mjs dump    <file> <line>      ast.dump-style view of one statement
//   node report/tools/ast.mjs outline <file> <function>  indented tree of one function
//   node report/tools/ast.mjs stats   <dir>              node-type histogram over all .js files
//
// The `dump` format mirrors Python's ast.dump() used in the lab slides.
import fs from "node:fs";
import path from "node:path";
import { parseFile, walk, childNodes, findFunction } from "./js-ast.mjs";

const SKIP_KEYS = new Set(["type", "parent", "loc", "range", "start", "end", "raw", "comments"]);

const dump = (value) => {
    if (Array.isArray(value)) return `[${value.map(dump).join(", ")}]`;
    if (value && typeof value === "object" && value.type) {
        const fields = Object.entries(value)
            .filter(([key, v]) => !SKIP_KEYS.has(key) && v !== null && v !== false)
            .map(([key, v]) => `${key}=${dump(v)}`);
        return `${value.type}(${fields.join(", ")})`;
    }
    return JSON.stringify(value).replaceAll('"', "'");
};

// Short label for the interesting attribute of a node
const label = (node) => {
    switch (node.type) {
        case "Identifier":
            return `Identifier ${node.name}`;
        case "Literal":
            return `Literal ${node.raw}`;
        case "TemplateElement":
            return `TemplateElement ${JSON.stringify(node.value.cooked)}`;
        case "BinaryExpression":
        case "LogicalExpression":
        case "AssignmentExpression":
        case "UnaryExpression":
            return `${node.type} ${node.operator}`;
        case "VariableDeclaration":
            return `VariableDeclaration ${node.kind}`;
        case "ArrowFunctionExpression":
        case "FunctionExpression":
        case "FunctionDeclaration":
            return `${node.type}${node.async ? " async" : ""}`;
        default:
            return node.type;
    }
};

const outline = (node, depth = 0, lines = []) => {
    const where = `L${node.loc.start.line}`;
    lines.push(`${"  ".repeat(depth)}${label(node)}  ${where}`);
    for (const child of childNodes(node)) outline(child, depth + 1, lines);
    return lines;
};

const jsFiles = (dir) =>
    fs
        .readdirSync(dir, { recursive: true })
        .filter((file) => file.endsWith(".js"))
        .sort()
        .map((file) => path.join(dir, file));

const [mode, target, arg] = process.argv.slice(2);

if (mode === "dump") {
    const { ast } = parseFile(target);
    const line = Number(arg);
    let statement = null;
    walk(ast, (node) => {
        if (!statement && /Statement|Declaration$/.test(node.type) && node.loc.start.line === line) {
            statement = node;
        }
    });
    if (!statement) throw new Error(`no statement starts on line ${line}`);
    const { source } = parseFile(target);
    console.log(`source  ${source.slice(statement.range[0], statement.range[1])}\n`);
    console.log(dump(statement));
} else if (mode === "outline") {
    const { ast } = parseFile(target);
    console.log(outline(findFunction(ast, arg)).join("\n"));
} else if (mode === "stats") {
    const counts = new Map();
    let total = 0;
    const files = jsFiles(target);
    for (const file of files) {
        walk(parseFile(file).ast, (node) => {
            counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
            total += 1;
        });
    }
    console.log(`${files.length} files, ${total} AST nodes, ${counts.size} node types\n`);
    const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [type, count] of rows.slice(0, 15)) {
        console.log(`${type.padEnd(26)} ${String(count).padStart(5)}  ${"█".repeat(Math.ceil((count / rows[0][1]) * 30))}`);
    }
    if (rows.length > 15) console.log(`… ${rows.length - 15} more node types`);
} else {
    console.error("usage: ast.mjs dump <file> <line> | outline <file> <function> | stats <dir>");
    process.exit(2);
}
