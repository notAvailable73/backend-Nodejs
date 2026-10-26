#!/usr/bin/env node
// Runs the application in-process against a scripted workload, without
// modifying its source.
//
//   node report/tools/workload.mjs <checkout> --trace
//       Loguru/PySnooper-style trace: one log line per HTTP request and, under
//       it, every MongoDB operation the request caused (via Mongoose debug).
//   node --cpu-prof report/tools/workload.mjs <checkout> --iterations 30
//       Repeats a login/profile/question workload for CPU profiling.
//
// Needs MONGODB_URI (a scratch database: it is dropped first).
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const checkout = path.resolve(args[0]);
const trace = args.includes("--trace");
const iterations = Number(args[args.indexOf("--iterations") + 1]) || 30;

process.env.JWT_SECRET ??= "workload-secret";
const requireFromApp = createRequire(path.join(checkout, "package.json"));
const mongoose = requireFromApp("mongoose");
const express = requireFromApp("express");
const { app } = await import(pathToFileURL(path.join(checkout, "src/app.js")));

const mask = (text) =>
    text.replace(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/g, "<bcrypt hash>").replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>");

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 23);
const write = (line) => process.stdout.write(`${line}\n`);

// Silence the application's own console output so the tool output stays readable
for (const level of ["log", "error"]) console[level] = () => {};

let server = app;
if (trace) {
    const logLine = (level, message) => write(`${stamp()} | ${level.padEnd(7)} | ${mask(message)}`);
    mongoose.set("debug", (collection, method, ...methodArgs) => {
        const shown = methodArgs.filter((a) => a !== undefined).map((a) => JSON.stringify(a)).join(", ");
        logLine("DEBUG", `    db.${collection}.${method}(${shown})`);
    });
    server = express();
    server.use((req, res, next) => {
        const started = performance.now();
        res.on("finish", () => {
            const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARNING" : "INFO";
            const ms = (performance.now() - started).toFixed(1);
            logLine(level, `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms} ms)`);
        });
        next();
    });
    server.use(app);
    globalThis.traceLog = logLine;
}

await mongoose.connect(process.env.MONGODB_URI);
await mongoose.connection.dropDatabase();
const listener = server.listen(0);
const base = `http://127.0.0.1:${listener.address().port}`;

const call = async (method, url, { body, cookie } = {}) => {
    const res = await fetch(base + url, {
        method,
        headers: { "content-type": "application/json", ...(cookie && { cookie }) },
        body: body && JSON.stringify(body),
    });
    await res.text();
    return res;
};

const user = { name: "Trace User", email: "trace@example.com", password: "secret123" };
const question = { title: "How to perform wudu?", description: "Steps of ablution", tags: "fiqh", language: "en" };

if (trace) {
    const step = (text) => globalThis.traceLog("SUCCESS", `── ${text}`);
    step("register a new user");
    await call("POST", "/api/auth/register", { body: user });
    step("log in with a wrong password");
    await call("POST", "/api/auth/login", { body: { ...user, password: "wrong" } });
    step("log in");
    const login = await call("POST", "/api/auth/login", { body: user });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    step("read the profile with the session cookie");
    await call("GET", "/api/auth/profile", { cookie });
    step("read the profile with a forged token");
    await call("GET", "/api/auth/profile", { cookie: "token=not-a-jwt" });
    step("add a question tagged 'fiqh'");
    await call("POST", "/api/questions/add", { body: question });
    step("list questions tagged 'fiqh'");
    await call("GET", "/api/questions?tags=fiqh");
    step("search question titles for 'wudu'");
    await call("GET", "/api/questions?search=wudu");
} else {
    await call("POST", "/api/auth/register", { body: user });
    for (let i = 0; i < iterations; i++) {
        const login = await call("POST", "/api/auth/login", { body: user });
        const cookie = login.headers.get("set-cookie").split(";")[0];
        await call("GET", "/api/auth/profile", { cookie });
        await call("POST", "/api/questions/add", { body: { ...question, title: `Question ${i}` } });
        await call("GET", "/api/questions?search=Question");
    }
    write(`workload finished: ${iterations} iterations of login, profile, add question, search`);
}

listener.close();
await mongoose.disconnect();
