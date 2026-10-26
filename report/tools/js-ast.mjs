// Shared helpers for the analysis tools: parse a file with espree (ESLint's
// parser) and walk the resulting ESTree AST.
import fs from "node:fs";
import * as espree from "espree";

export const parseFile = (file) => {
    const source = fs.readFileSync(file, "utf8");
    const ast = espree.parse(source, {
        ecmaVersion: "latest",
        sourceType: "module",
        loc: true,
        range: true,
        comment: true,
    });
    return { source, ast };
};

const isNode = (value) => value && typeof value.type === "string";

export const childNodes = (node) => {
    const children = [];
    for (const [key, value] of Object.entries(node)) {
        if (["parent", "loc", "range", "comments", "tokens"].includes(key)) continue;
        if (Array.isArray(value)) children.push(...value.filter(isNode));
        else if (isNode(value)) children.push(value);
    }
    return children;
};

// Depth-first walk; sets node.parent so callers can look upwards
export const walk = (node, visit, parent = null) => {
    node.parent = parent;
    visit(node);
    for (const child of childNodes(node)) walk(child, visit, node);
};

export const FUNCTION_TYPES = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
]);

// Best-effort readable name for a function node:
//   function foo() {}                 -> foo
//   const foo = async () => {}         -> foo
//   const foo = asyncHandler(async ...) -> foo
//   schema.methods.bar = function ...  -> schema.methods.bar
export const functionName = (fn) => {
    if (fn.id) return fn.id.name;
    let node = fn.parent;
    while (node && node.type === "CallExpression") node = node.parent;
    if (node?.type === "VariableDeclarator" && node.id.type === "Identifier") return node.id.name;
    if (node?.type === "AssignmentExpression") return memberPath(node.left);
    if (node?.type === "Property" && node.key.type === "Identifier") return node.key.name;
    return `<anonymous:${fn.loc.start.line}>`;
};

export const memberPath = (node) => {
    if (node.type === "Identifier") return node.name;
    if (node.type === "ThisExpression") return "this";
    if (node.type === "MemberExpression") {
        const property = node.computed ? "[…]" : node.property.name;
        return `${memberPath(node.object)}.${property}`;
    }
    return node.type;
};

export const findFunction = (ast, name) => {
    let found = null;
    walk(ast, (node) => {
        if (!found && FUNCTION_TYPES.has(node.type) && functionName(node) === name) found = node;
    });
    if (!found) throw new Error(`function "${name}" not found`);
    return found;
};
