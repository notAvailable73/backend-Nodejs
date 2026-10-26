#!/usr/bin/env node
// Program slicing: backward slice of one function, statement granularity.
//
//   node report/tools/slice.mjs <file> <function> <line> [--var name,...] [--coverage coverage-final.json]
//
// Static slice: every statement that may affect the variables used on <line>
// (all of them, or only --var), on any execution.
// Dynamic slice (--coverage): the same, restricted to statements that actually
// ran in the execution recorded in an Istanbul/V8 coverage file (e.g. one test).
//
// Dependencies followed:
//   data     a statement that uses v depends on earlier statements that define v
//   control  a statement depends on the `if`/loop test that decides whether it runs,
//            including an earlier `if (…) { return/throw }` that can skip it
// Simplifications (documented in the report): intraprocedural, no kill analysis
// (every earlier definition counts), and a method call obj.m(…) is treated as
// possibly modifying obj.
import fs from "node:fs";
import path from "node:path";
import { parseFile, walk, findFunction, FUNCTION_TYPES } from "./js-ast.mjs";

const args = process.argv.slice(2);
const option = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? null : args.splice(i, 2)[1];
};
const onlyVars = option("--var")?.split(",");
const coverageFile = option("--coverage");
const [file, fnName, lineArg] = args;
const criterionLine = Number(lineArg);

const { source, ast } = parseFile(file);
const fn = findFunction(ast, fnName);

// --- identifiers read / written by an expression or pattern ---------------

const readsOf = (node, out = new Set()) => {
    if (!node) return out;
    walk(node, (n) => {
        if (n.type !== "Identifier") return;
        const p = n.parent;
        if (p?.type === "MemberExpression" && p.property === n && !p.computed) return;
        if (p?.type === "Property" && p.key === n && !p.computed && p.parent?.type === "ObjectExpression") return;
        out.add(n.name);
    }, node.parent);
    return out;
};

const patternNames = (pattern, out = new Set()) => {
    walk(pattern, (n) => {
        if (n.type !== "Identifier") return;
        const p = n.parent;
        if (p?.type === "Property" && p.key === n && p.value !== n) return;
        out.add(n.name);
    }, pattern.parent);
    return out;
};

const baseName = (node) => {
    while (node.type === "MemberExpression") node = node.object;
    return node.type === "Identifier" ? node.name : null;
};

const effects = (statement) => {
    const defs = new Set();
    const uses = new Set();
    const expression = (expr) => {
        while (expr?.type === "AwaitExpression") expr = expr.argument;
        if (!expr) return;
        if (expr.type === "AssignmentExpression") {
            if (expr.left.type === "MemberExpression") {
                const base = baseName(expr.left);
                if (base) defs.add(base), uses.add(base);
                if (expr.left.computed) readsOf(expr.left.property, uses);
            } else {
                patternNames(expr.left, defs);
                if (expr.operator !== "=") readsOf(expr.left, uses);
            }
            readsOf(expr.right, uses);
        } else if (expr.type === "UpdateExpression") {
            const name = baseName(expr.argument);
            if (name) defs.add(name), uses.add(name);
        } else {
            if (expr.type === "CallExpression" && expr.callee.type === "MemberExpression") {
                const base = baseName(expr.callee);
                if (base) defs.add(base);
            }
            readsOf(expr, uses);
        }
    };
    switch (statement.type) {
        case "VariableDeclaration":
            for (const d of statement.declarations) {
                patternNames(d.id, defs);
                readsOf(d.init, uses);
            }
            break;
        case "ExpressionStatement":
            expression(statement.expression);
            break;
        default:
            readsOf(statement.argument ?? statement, uses);
    }
    return { defs, uses };
};

// --- flatten the function body into units with control parents -------------

const units = [];
const exits = (block) => {
    const last = block.type === "BlockStatement" ? block.body.at(-1) : block;
    return last && ["ReturnStatement", "ThrowStatement"].includes(last.type);
};

const visitBlock = (statements, controls) => {
    let guards = [...controls];
    for (const statement of statements) visitStatement(statement, guards), (guards = nextGuards(statement, guards));
};
const nextGuards = (statement, guards) => {
    const unit = units.findLast((u) => u.node === statement);
    if (statement.type === "IfStatement" && !statement.alternate && exits(statement.consequent)) {
        return [...guards, unit];
    }
    return guards;
};

const visitStatement = (statement, controls) => {
    const line = statement.loc.start.line;
    const add = (node, defs, uses, kind) => {
        const unit = { node, line, endLine: node.loc.end.line, defs, uses, controls, kind };
        units.push(unit);
        return unit;
    };
    const body = (node) => (node.type === "BlockStatement" ? node.body : [node]);

    if (statement.type === "IfStatement") {
        const unit = add(statement, new Set(), readsOf(statement.test), "predicate");
        unit.endLine = line;
        visitBlock(body(statement.consequent), [...controls, unit]);
        if (statement.alternate) visitBlock(body(statement.alternate), [...controls, unit]);
    } else if (["ForStatement", "WhileStatement", "DoWhileStatement", "ForOfStatement", "ForInStatement"].includes(statement.type)) {
        const unit = add(statement, new Set(), readsOf(statement.test ?? statement.right), "predicate");
        unit.endLine = line;
        if (statement.left) patternNames(statement.left, unit.defs);
        visitBlock(body(statement.body), [...controls, unit]);
    } else if (statement.type === "TryStatement") {
        visitBlock(statement.block.body, controls);
        if (statement.handler) visitBlock(statement.handler.body.body, controls);
        if (statement.finalizer) visitBlock(statement.finalizer.body, controls);
    } else if (statement.type === "BlockStatement") {
        visitBlock(statement.body, controls);
    } else {
        const { defs, uses } = effects(statement);
        add(statement, defs, uses, "statement");
    }
};

const params = new Set(fn.params.flatMap((p) => [...patternNames(p)]));
visitBlock(fn.body.type === "BlockStatement" ? fn.body.body : [fn.body], []);

// --- executed lines from a coverage file --------------------------------------

let executed = null;
if (coverageFile) {
    const coverage = JSON.parse(fs.readFileSync(coverageFile, "utf8"));
    const entry = Object.values(coverage).find((e) => path.resolve(e.path) === path.resolve(file));
    if (!entry) throw new Error(`${file} not found in ${coverageFile}`);
    executed = new Set();
    for (const [id, location] of Object.entries(entry.statementMap)) {
        if (entry.s[id] > 0) {
            for (let l = location.start.line; l <= location.end.line; l++) executed.add(l);
        }
    }
}
const ran = (unit) => !executed || executed.has(unit.line);

// --- backward slice ----------------------------------------------------------

const criterion = units.find((u) => u.line === criterionLine && u.kind === "statement")
    ?? units.find((u) => u.line === criterionLine);
if (!criterion) throw new Error(`no statement of ${fnName} starts on line ${criterionLine}`);
if (!ran(criterion)) throw new Error(`line ${criterionLine} did not execute in this coverage run`);

const slice = new Set([criterion]);
const usedParams = new Set();
const work = [[criterion, onlyVars ? new Set(onlyVars) : criterion.uses]];
while (work.length) {
    const [unit, vars] = work.pop();
    const index = units.indexOf(unit);
    for (const v of vars) {
        if (params.has(v)) usedParams.add(v);
        for (const def of units.slice(0, index)) {
            if (def.defs.has(v) && ran(def) && !slice.has(def)) {
                slice.add(def);
                work.push([def, def.uses]);
            }
        }
    }
    for (const control of unit.controls) {
        if (ran(control) && !slice.has(control)) {
            slice.add(control);
            work.push([control, control.uses]);
        }
    }
}

// --- report ------------------------------------------------------------------

const lines = source.split("\n");
const sliceLines = new Set();
for (const unit of slice) for (let l = unit.line; l <= unit.endLine; l++) sliceLines.add(l);
const first = fn.loc.start.line;
const last = fn.loc.end.line;

const kind = executed ? "Dynamic" : "Static";
const vars = onlyVars ?? [...criterion.uses];
console.log(`${kind} backward slice of ${fnName} (${path.basename(file)})`);
console.log(`criterion: line ${criterionLine}, variables {${vars.join(", ")}}`);
console.log(`legend: ▶ criterion  ● in slice${executed ? "  · did not execute" : ""}\n`);
for (let l = first; l <= last; l++) {
    const inCriterion = l >= criterion.line && l <= criterion.endLine;
    const mark = inCriterion ? "▶" : sliceLines.has(l) ? "●" : executed && !executed.has(l) && lines[l - 1].trim() ? "·" : " ";
    console.log(`${mark} ${String(l).padStart(3)}  ${lines[l - 1]}`);
}
const statementCount = units.filter((u) => u.kind === "statement" || u.kind === "predicate").length;
console.log(`\n${slice.size} of ${statementCount} statements/predicates in the slice`
    + (usedParams.size ? `; depends on parameter(s) ${[...usedParams].join(", ")}` : ""));
