# Viva guide: everything in the maintenance lab report

This file explains the whole project in plain words: what each problem was, **why it
belongs to its maintenance category**, **how it was solved** (or why it was not), and
the questions you are likely to be asked. Section numbers (§) refer to
`report/dist/report.pdf`.

Contents

1. [The 30-second summary](#1-the-30-second-summary)
2. [The project we maintained](#2-the-project-we-maintained)
3. [The theory you must know](#3-the-theory-you-must-know)
4. [How the work was organised](#4-how-the-work-was-organised)
5. [Setup work before the four changes](#5-setup-work-before-the-four-changes)
6. [Corrective: CM-COR-01](#6-corrective-cm-cor-01)
7. [Adaptive: CM-ADA-01](#7-adaptive-cm-ada-01)
8. [Preventive: CM-PRE-01](#8-preventive-cm-pre-01)
9. [Perfective: CM-PER-01](#9-perfective-cm-per-01)
10. [Problems found but not solved](#10-problems-found-but-not-solved)
11. [Part 2: analysis techniques](#11-part-2-analysis-techniques)
12. [Numbers to remember](#12-numbers-to-remember)
13. [General viva questions](#13-general-viva-questions)
14. [Demonstrating live and regenerating](#14-demonstrating-live-and-regenerating)

---

## 1. The 30-second summary

> I took a real, undocumented Node.js/Express/MongoDB backend with no tests. I added a
> Docker database and a Jest test suite that records every bug I found as a test.
> Then I made one small change per maintenance category: I fixed a cookie that could
> crash the whole server (corrective), made the app start on new Node.js versions
> (adaptive), stopped passwords and tokens leaking into logs and responses
> (preventive), and replaced copy-pasted error handling with one central handler
> (perfective). Every change is a tagged git commit, and every screenshot in the report
> is real command output that one command regenerates. Part 2 applies AST, metrics,
> coverage, slicing, profiling and clone detection to the same code.

---

## 2. The project we maintained

**What it is.** The backend of a website for *Jamia as-Suffah*, an Islamic educational
institution. It is a REST API built with:

- **Node.js + Express 4** for the HTTP server
- **MongoDB + Mongoose 8** for the database
- **JWT (JSON Web Token)** for login, stored in an HTTP-only cookie
- **bcryptjs** for password hashing
- deployed on **Vercel**

**What it does.**

| Endpoint | What it does |
| --- | --- |
| `POST /api/auth/register` | create an account, returns user + token |
| `POST /api/auth/login` | log in, sets the `token` cookie |
| `POST /api/auth/logout` | clears the cookie (needs login) |
| `GET /api/auth/profile` | the logged-in user (needs login) |
| `GET /api/protected-route` | test route (needs login) |
| `POST /api/questions/add` | add a question (title, description, tags, language) |
| `GET /api/questions?tags=…&search=…` | list / filter / search questions |

Questions are multilingual: each has translations in English, Bengali and Arabic
(`en`/`bn`/`ar`). There is also a `Seminar` model and a Cloudinary upload helper, but
no route uses them yet.

**Size.** 17 JavaScript files, 432 source lines, 18 commits (Jan–Mar 2025), no
tests, no README, no design documents.

**Why this project is a good subject.**

- Small enough to understand completely.
- Real bugs, not planted ones; every problem was found by reading and running it.
- No documentation, so reverse engineering is genuinely needed.
- Its own git history shows developers struggling in the same areas ("fix: add try
  catch block in login function", "refactor: comment out cookie setting").

**Request flow (memorise this picture).**

```
client → app.js middlewares (cors, json, static, cookieParser)
       → route file → [isAuthenticated?] → controller → Mongoose model → MongoDB
       errors → asyncHandler → app.js error handler → response
```

---

## 3. The theory you must know

### The four categories (ISO/IEC/IEEE 14764)

| Category | Definition | Trigger | Key question |
| --- | --- | --- | --- |
| **Corrective** | fix a fault that has caused, or is causing, failures | a bug report / observed failure | "Is it broken *now*?" |
| **Adaptive** | keep the software usable in a **changed environment** (OS, runtime, libraries, hardware, laws, platforms) | the world around the code changed | "Did the *environment* change, not the code?" |
| **Perfective** | improve maintainability, performance or other qualities, or add enhancements, **without** fixing a failure | wish to make it better | "Does it work, but could it be built better?" |
| **Preventive** | find and fix **latent** faults before they become failures | risk analysis / review | "Could this hurt us *later*, though nothing failed yet?" |

**The golden rule: classify by the *purpose* of the change, not by what the code looks
like.** The same edit (say, adding a check) can be corrective if users already hit the
bug, or preventive if nobody has yet. Categories can overlap; you pick the **primary
intent** and say so. Examiners like hearing that you know this.

A second useful distinction: **corrective and preventive deal with faults**
(something is wrong); **adaptive and perfective deal with change** (nothing is
wrong in the code itself).

### The five activities done for each change

1. **Program Comprehension**: understanding existing code before changing it (reading,
   running, debugging). Most maintenance time goes here.
2. **Change Management**: controlling changes: a change request with an id, type, risk,
   files, and the decision taken (including rejected alternatives).
3. **Impact Analysis**: finding everything the change can affect: callers, data,
   clients, deployment. It decides how much testing is needed.
4. **Reverse Engineering**: recovering design information (architecture, flows,
   contracts) from the code itself when no documentation exists. It **does not change**
   the code; it creates understanding.
5. **Refactoring / Implementation**: making the change. Strictly, *refactoring* means
   restructuring **without changing external behaviour**. Only the perfective change
   is pure refactoring; the others change behaviour on purpose. The report keeps the
   course's heading "Refactoring (Implementation)" for all four.

---

## 4. How the work was organised

**One change per category, as small as possible.** This keeps each cause and effect
traceable, as in the reference report.

**Git tags make every before/after real.**

| Tag | Commit | What it contains |
| --- | --- | --- |
| `baseline` | dfe8310 | the original code, untouched |
| `lab-setup` | 48c5b89 | + Docker MongoDB, `.env.example`, Jest tests, README; **`src/` unchanged** |
| `cm-cor-01` | fa4b34b | + corrective change |
| `cm-ada-01` | 93ffde1 | + adaptive change |
| `cm-pre-01` | b9a02ac | + preventive change |
| `cm-per-01` | b11cba5 | + perfective change (final version) |

All work is on branch `lab/maintenance`; `main` still equals the original.

**Test-first with `test.failing`.** Every bug found was written as a Jest
`test.failing`:

- the test states the **correct** behaviour (e.g. "missing token → 401");
- while the bug exists, the test fails, and `test.failing` reports that as a **pass**;
- once the bug is fixed, the test would pass, which `test.failing` reports as a
  **failure**. So we switch it to a normal `test`.

So **a fix is proven by a test changing state**. At `lab-setup` there were 20 tests,
8 of them `test.failing`. At the end: 26 tests, 4 `test.failing` left (the unsolved bugs).

For changes that add new tests (preventive, perfective), the new tests were also run
against the **previous version's code** to show they fail there. That proves the
tests really detect the problem.

**Evidence is generated, not screenshotted.** `report/capture.mjs` checks out each tag,
runs real commands, and saves the output; `report/build.mjs` puts that output into the
report and prints the PDF. Each pane's caption names its evidence file.

---

## 5. Setup work before the four changes

These were needed to run the project at all. They are not the four graded changes, but
you may be asked about them.

| Work | Why | Category if asked |
| --- | --- | --- |
| `docker-compose.yml` with MongoDB | project needs MongoDB but gave no way to run one | adaptive (supporting a development environment) |
| MongoDB pinned to **7.0.45**, not 8.x | MongoDB 8.x **refuses to start on Linux kernel 6.19+** (bug SERVER-121912); this machine runs Linux 7.0 | adaptive (environment change: newer kernel) |
| `.env.example`, generated `JWT_SECRET` | the code needs env vars nobody documented | perfective (documentation) |
| Jest + supertest suite on a separate `jamiya_test` DB | no tests existed; needed to prove changes | preventive (regression safety net) |
| README | nobody could set the project up | perfective (documentation) |

`git diff baseline lab-setup -- src` is empty: the setup did not change application
code, so the baseline tests measure the original behaviour.

---

## 6. Corrective: CM-COR-01

**File:** `src/middlewares/auth.middleware.js` · **Risk:** low · **1 file, 3 lines**

### The problem

`isAuthenticated` protects three routes (logout, profile, protected-route). Its two
failure paths were broken:

```js
if (!token) {
    return new ApiError(401, "Unauthorized", "No token provided");   // ❶ never sent
}
try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    next();
} catch (error) {
    throw new ApiError(401, "Unauthorized", "Invalid or expired token"); // ❷ crashes
}
```

- **❶ No cookie:** the function *returns* an error object but never *sends* it. Express
  ignores a middleware's return value, so no response is ever written and the client
  **hangs until timeout**.
- **❷ Bad or expired cookie:** `jwt.verify` throws, the `catch` throws again. The
  function is `async`, so this becomes a **rejected promise**. **Express 4 does not
  handle promises returned by middleware** (Express 5 does). The rejection is
  *unhandled*, and since **Node.js 15 an unhandled rejection terminates the process**.

**Result: one request with `Cookie: token=garbage` shuts down the server for every
user.** That is effectively a denial-of-service. It was proven by starting the real
server and sending the request: the server exits with code 1.

### Why it is CORRECTIVE

- It is a **fault in existing code that causes failures now**: hanging requests and
  a crashing server. Any user with an expired cookie triggers it.
- Not adaptive: nothing in the environment changed; the code was wrong from the start.
- Not preventive: the failure is not hypothetical; it happens on every bad cookie.
- Not perfective: we are not improving working code; it does not work.

### How we solved it

```js
if (!token) {
    return new ApiError(401, "Unauthorized", "No token provided").send(res);
}
try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
} catch (error) {
    return new ApiError(401, "Unauthorized", "Invalid or expired token").send(res);
}
next();
```

1. Both errors are now **sent** with `.send(res)` (an existing helper in `ApiError`).
2. `next()` moved **out of the `try`**. Inside it, an error thrown by a *later*
   handler would be caught and wrongly reported as "Invalid or expired token".

### The five steps in short

| Step | What was done |
| --- | --- |
| Comprehension | read the middleware against Express 4's rules; reproduced both faults with a live server |
| Change management | CM-COR-01, corrective, low risk, 1 file; Express 5 upgrade **rejected** as far too big |
| Impact analysis | 3 protected routes; valid-token path unchanged; clients now get 401 JSON instead of a timeout/reset; residual: token of a deleted user passes with `req.user = null` |
| Reverse engineering | reconstructed the whole auth flow: login → `jwt.sign` → cookie → middleware → route (§4 diagram) |
| Implementation | 3-line change; 2 known-bug tests turned into normal tests, the invalid-token test now covers malformed, wrong-secret and expired tokens |

**Evidence:** `cor/demo-before` (no response, then server exits with code 1) vs
`cor/demo-after` (two 401s, server still running). Tests: 20 → 22.

### Viva questions

- **Why did the server die instead of just returning 500?** Express 4 only catches
  errors thrown *synchronously* or passed to `next(err)`. An `async` function that
  throws returns a rejected promise, which Express 4 ignores. Node then sees an
  unhandled rejection and, since v15, exits.
- **Why not wrap it in `asyncHandler` like the controllers?** That forwards the error to
  the global handler, which at that time answered 500 for everything (fixed later in
  CM-PER-01). Sending the 401 directly is correct and self-contained.
- **Why not upgrade to Express 5?** It fixes the class of bug, but a major-version
  migration (routing syntax, removed APIs) is far larger than a 3-line fault. It is a
  good *future adaptive* change.
- **How did you find it?** By reading the middleware against Express's contract, then
  writing a test that hung, then running the real server and watching it exit.
- **Why does the test call the middleware directly in the old version?** The unhandled
  rejection escaped the test and Jest blamed whichever test was running. Calling the
  function directly let us catch the rejection. After the fix the test goes through
  HTTP again.

---

## 7. Adaptive: CM-ADA-01

**Files:** `package.json`, `package-lock.json`, `.nvmrc`, `README.md` · **Risk:** low

### The problem

Under **Node.js 26** (the current release), the server **crashes before it starts**:

```
node_modules/buffer-equal-constant-time/index.js:37
var origSlowBufEqual = SlowBuffer.prototype.equal;
TypeError: Cannot read properties of undefined (reading 'prototype')
```

**Node.js 25 removed `SlowBuffer`**, an API deprecated for years (DEP0030). Our code
never uses it, but a **transitive dependency** does, as soon as it is loaded:

```
jsonwebtoken 9.0.2 → jws 3.2.2 → jwa 1.4.1 → buffer-equal-constant-time 1.0.1 → SlowBuffer 💥
```

### Why it is ADAPTIVE

- **The code did not change and was not wrong when written.** It worked on Node 24.
  The **environment** (the Node.js runtime) changed underneath it.
- That is the definition of adaptive: modify the software so it keeps working in a
  changed environment.
- Not corrective: there is no logic error in our code; on its original platform it
  works perfectly.
- Not preventive: it is not a latent risk; the app does not start at all on the new
  runtime.
- Not perfective: we are not improving quality; we are restoring compatibility.

### How we solved it

Three options were compared (this is the change-management decision):

| Option | Effect | Decision |
| --- | --- | --- |
| Stay on Node 24 forever | works now; breaks again when Node 24 reaches end of life | ❌ only postpones |
| Switch to the `jose` library | modern, no legacy deps, **but async API**: changes the model, middleware and controllers | ❌ too big |
| Upgrade `jsonwebtoken` 9.0.2 → **9.0.3** | patch release, same API, newer `jws` 4 / `jwa` 2 | ✅ **chosen** |

Plus `.nvmrc` → `26.10.0` and `"engines": { "node": ">=20" }`.

**The interesting part (reverse engineering):** after the fix, `npm ls` *still shows*
`buffer-equal-constant-time` installed. Why does it not crash? Reading `jwa` 2.0.1:

```js
var timingSafeEqual = 'timingSafeEqual' in crypto ? function timingSafeEqual(a, b) {
  ...
  return crypto.timingSafeEqual(a, b)       // used on every modern Node
} : function timingSafeEqual(a, b) {
  if (!bufferEqual) {
    bufferEqual = require('buffer-equal-constant-time');   // only a fallback
  }
```

The old package is now only `require`d **lazily, as a fallback** for runtimes without
`crypto.timingSafeEqual`, which every supported Node.js version has. So it is installed
but never loaded.

### The five steps in short

| Step | What was done |
| --- | --- |
| Comprehension | ran the server on Node 26, followed the stack trace into `node_modules`, used `npm ls` to find the chain |
| Change management | CM-ADA-01, adaptive, low risk, 4 files; 3 options compared |
| Impact analysis | only `jwt.sign` (User model) and `jwt.verify` (middleware) use the library; API unchanged; **tokens still HS256 with the same secret, so existing logins stay valid**; deployment (Vercel) Node version should be raised; `npm audit` 9 → 8 |
| Reverse engineering | dependency chain before/after, and the lazy fallback in `jwa` 2 |
| Implementation | version bump; server starts on Node 26; full suite passes on **both Node 26 and Node 24** |

### Viva questions

- **Is changing a dependency version really "maintenance"?** Yes. Most adaptive
  maintenance in practice is exactly this: dependency and platform upgrades.
- **Why not just use Node 24?** Every Node version reaches end of life; pinning only
  delays the same work, and the newer release gets security fixes.
- **How do you know old sessions still work?** The token format (HS256 JWT) and the
  secret did not change; `jwt.verify` in 9.0.3 verifies the same tokens.
- **Why is the old package still installed?** It is still a declared dependency of
  `jwa` 2, used only as a fallback; installed ≠ loaded.
- **What would make this impossible to fix by upgrading?** If no maintained version
  existed. Then you would replace the library (`jose`), which is the bigger option we
  rejected.

---

## 8. Preventive: CM-PRE-01

**Files:** `src/models/user.model.js`, `src/controllers/auth.controller.js` · **Risk:** low

### The problem

Following the password through the code revealed three **credential leaks**:

1. `registerUser` started with `console.log(req.body)`, writing every new user's
   **plaintext password** into the server log (on Vercel, visible to anyone with log
   access).
2. `loginUser` logged `JSON.stringify({ user, token })`: the **bcrypt hash** and a
   valid **session token** (anyone reading logs could log in as that user).
3. Register and login **returned the bcrypt hash** in the response body. A stolen hash
   can be cracked offline with no rate limit.

### Why it is PREVENTIVE

- **Nothing has failed yet.** The app works correctly for users; no breach has happened.
  These are **latent faults**: problems waiting to cause damage (a log leak, a hash
  dump).
- Preventive maintenance = **find and fix latent faults before they become failures.**
- Not corrective: there is no observed failure or bug report; the features behave as
  designed.
- Not adaptive: no environment change.
- Not perfective: the goal is reducing risk, not improving structure or performance.

> If asked "isn't a leaked password a bug, so corrective?": it would be **corrective
> if a leak had happened** (incident → fix). Fixing it **before** any incident, after
> reviewing the code, is preventive. Classification is by purpose and timing.

### How we solved it

```js
// Never serialize the password hash, whichever route returns a user
userSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.password;
        return ret;
    },
});
```

and deleted `console.log(req.body)` and `console.log("Sending response:", …)`.

**Why in the schema, not in the controllers?** Deleting the field in the two
controllers would fix today's two routes, but **the next developer who writes a route
that returns a user would leak it again**. A schema rule protects every route,
including ones that do not exist yet. That forward-looking protection is exactly what
makes it preventive.

**How `toJSON` works:** `res.json(obj)` calls `JSON.stringify`, which calls each
object's `toJSON()`. Mongoose documents use the schema's `toJSON` options, so the
transform runs automatically every time a user is sent.

### The five steps in short

| Step | What was done |
| --- | --- |
| Comprehension | traced the password from request to every place it goes (sources → sinks) |
| Change management | CM-PRE-01, preventive, low risk, 2 files; per-controller deletion **rejected** (doesn't protect future routes) |
| Impact analysis | all user responses (register, login, profile, protected-route); **login still works** (`comparePassword` reads the document, not JSON); token still returned; the email is still logged (residual) |
| Reverse engineering | data-flow map of the password: 2 log sinks + 1 response sink (§6 diagram) |
| Implementation | 4 new tests (no hash in register/login responses, no password in logs, no token/hash in logs); **all 4 fail on the old code**, pass on the new |

### Viva questions

- **How do the tests check logs?** They replace `console.log/info/warn/error` with Jest
  spies that record every message, then assert the password, the token and any bcrypt
  hash never appear.
- **Why is a bcrypt hash dangerous if it is hashed?** An attacker can try millions of
  guesses offline against it; weak passwords fall quickly. Hashes must stay secret too.
- **Does the profile route already exclude the password?** Yes, via
  `.select("-password")`, but that is per-query; the schema rule is the general one.
- **Why keep returning the token?** The frontend may need it (e.g. for non-cookie
  clients); it is the intended output of login. Logging it was the problem.

---

## 9. Perfective: CM-PER-01

**Files:** `src/app.js`, `src/controllers/auth.controller.js`,
`src/controllers/question.controller.js` · **Risk:** medium (touches every error path)

### The problem

Two competing error-handling mechanisms:

- `asyncHandler` forwards errors to the **global error handler** in `app.js`…
- …but that handler **ignored `ApiError`** and always answered `500 "Something went wrong!"`.

To get correct status codes anyway, three controllers (`loginUser`, `createQuestion`,
`getQuestions`) wrapped their **whole body** in the **same copied try/catch**:

```js
} catch (error) {
    console.log(error);
    const errorResponse = new ApiError(
      error.statusCode || 500,
      error.errors || error,
      error.message || "Error occured while …"
    );
    errorResponse.send(res);
}
```

The clone detector **jscpd** found the copies (3 clones, 23 duplicated lines).

**Why it matters (the hidden bug):** correct behaviour depended on *remembering to copy
the block*. `registerUser` did not have the copy, so its "user already exists" error
(`ApiError(400)`) went to the global handler and came back as **500**.

### Why it is PERFECTIVE

- The **purpose** is improving **maintainability**: remove duplication, put error
  handling in one place, reduce complexity. That is perfective.
- The software mostly worked; most error paths returned the right status.
- It *also* fixed the duplicate-email 400/500 bug, but that is a **consequence** of the
  restructuring, not its purpose. Categories overlap; we classify by primary intent.
- Not adaptive (no environment change), not preventive (the aim is structure, not
  removing a specific latent risk).

> If asked "but you fixed a wrong status code, so isn't it corrective?": "Partly, yes.
> The overlap is real, but the change was designed and measured as a structural
> improvement (clones, complexity). A corrective-only fix would have been adding one
> more try/catch to `registerUser`, which would have made the duplication **worse**."
> That answer shows you understand the difference.

### How we solved it

The global handler became the **single place where errors become responses**:

```js
app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
        return err.send(res);                     // keep the error's own status/body
    }
    console.error(err.stack);                     // log details on the server only
    new ApiError(500, [], 'Something went wrong!').send(res);
});
```

Then the three copied try/catch blocks were **deleted** (`asyncHandler` already forwards
errors), and the one 404 in `getQuestions` that had its message in the wrong argument
was fixed.

### Impact (every error path checked)

| Error path | Before | After |
| --- | --- | --- |
| login missing fields / wrong password | 400 / 401 (local catch) | same (global handler) |
| register duplicate email | **500** | **400** "A user with this email already exists" |
| questions not found | 404 "Error occurred while fetching questions" | 404 "No questions found" |
| unexpected error (e.g. DB validation) | 500 with **internal error details** | 500 generic message; stack logged on server |

The last row is deliberate and also a security improvement: internal details no longer
reach clients.

### Measured result

| Measure | Before | After |
| --- | --- | --- |
| clones (jscpd) | 3 (23 lines, 4.3%) | 1 (7 lines, 1.4%) |
| CC of `getQuestions` | 11 | 7 |
| CC of `loginUser` | 8 | 4 |
| CC of `createQuestion` | 6 | 2 |
| tests | 25 | 26, all passing; 3 new expectations fail on the old code |

The one remaining clone is the `language` field shared by the Question and Seminar
schemas: low risk (see §10).

### Viva questions

- **Why medium risk?** It changes every error path; that's why the impact table lists
  each one and the tests check status *and* body.
- **What is `asyncHandler`?** A wrapper that calls the handler and passes any rejected
  promise to `next(err)`, so async errors reach the error middleware.
- **Why does Express know it is an error handler?** It has **four** parameters
  `(err, req, res, next)`. That is also why ESLint's "unused `next`" warning must stay.
- **Is this refactoring in the strict sense?** Nearly. Success behaviour is unchanged,
  but some error responses changed on purpose (listed in the table).

---

## 10. Problems found but not solved

Found during comprehension and analysis, recorded as **residual findings** (§8 of the
report). They were left so that each graded change stays small and traceable. Saying
"found, recorded, out of scope" is part of change management, not a gap. Four are
still `test.failing` tests in the suite.

| # | Problem | Category it would be | Why that category | How we would fix it |
| --- | --- | --- | --- | --- |
| 1 | **Tags never stored**: `createQuestion` puts `tags` inside the translation, not on the question, so tag search never finds API-created questions (seen at runtime: `"tags": []`) | **Corrective** | an existing feature fails now | `new Question({ translations: [{ language, title, description }], tags: tags.split(",") })` |
| 2 | **Missing fields pass validation**: `field?.trim() === ""` is `false` for `undefined`, so missing fields cause a 500 from MongoDB instead of 400 | **Corrective** | wrong response today | `fields.some((f) => typeof f !== "string" \|\| f.trim() === "")` |
| 3 | **Unescaped search**: `?search=` goes straight into `$regex`; `(` causes a 500, crafted patterns risk ReDoS | **Preventive** | security risk, no attack yet | escape: `search.replace(/[.*+?^${}()\|[\]\\]/g, "\\$&")` |
| 4 | **Anyone can add questions**: `/api/questions/add` has no login check | **Preventive** (or corrective if the requirement says only users may ask) | abuse risk | add `isAuthenticated` to the route and record `req.user` |
| 5 | **Duplicate `secure` key** in the login cookie (ESLint `no-dupe-keys`): `secure: NODE_ENV === "production"` is overridden by `secure: true` | **Corrective** | the author's intended rule never applies | keep one key; note `sameSite: "None"` requires `secure: true`, so use `sameSite: isProd ? "None" : "Lax", secure: isProd` |
| 6 | **8 vulnerable dependencies** (`npm audit`: 2 critical in mongoose, proxy-addr) | **Preventive** (dependency hygiene; some call it adaptive) | known vulnerabilities, not yet exploited | `npm audit fix` (all have fixes within the same major versions), then run the suite |
| 7 | Login still logs the **email** | **Preventive** | personal data in logs | remove the `console.log(email)` |
| 8 | Token of a **deleted user** passes with `req.user = null` | **Corrective** | wrong auth decision | `if (!req.user) return new ApiError(401, …).send(res)` |
| 9 | `cors()` with defaults can't serve **credentialed** cross-origin requests | **Adaptive** | needed when the frontend runs on another domain | `cors({ origin: process.env.CLIENT_ORIGIN, credentials: true })` |
| 10 | **Unused code**: Seminar model, multer, Cloudinary helper (0% coverage, no routes) | **Perfective** | maintainability | remove, or build the seminar feature |
| 11 | `language` field duplicated in two schemas (the last jscpd clone) | **Perfective** | duplication | shared `languageField` in `models/fields.js` |
| 12 | Login is CPU-heavy (bcrypt ≈ 77% of CPU) | **Perfective** (performance), only if needed | not a defect: slow hashing is the security feature | native `bcrypt` or a worker thread, if login load grows |

---

## 11. Part 2: analysis techniques

The lab used Python tools; this project is JavaScript, so each was mapped to a Node.js
equivalent. Where no tool fitted, a short script in `report/tools/` was written so each
definition is explicit.

| Lab technique (Python tool) | Used here |
| --- | --- |
| AST (`ast.dump`, AST Explorer) | espree (ESLint's parser) + `tools/ast.mjs` |
| Metrics (radon, SonarQube) | `tools/metrics.mjs` + ESLint |
| Dynamic analysis: coverage (`sys.settrace`, coverage.py) | Jest with V8 coverage |
| Slicing (IntelliJ Find Usages / Analyze Data Flow) | `tools/slice.mjs` (+ one-test coverage for dynamic) |
| Loguru / PySnooper | `tools/workload.mjs --trace` (request log + every DB query) |
| cProfile / SnakeViz / VizTracer | `node --cpu-prof` + `tools/profile.mjs` (table + icicle chart) |
| Clone detection (Lab 6) | jscpd |
| GLMTest (Lab 2 paper) | not reproduced (no model trained); its idea, tests targeting risky branches, was applied by hand with `test.failing` |

### 11.1 AST (§11)

- **What:** an Abstract Syntax Tree is code as a tree; nodes are constructs
  (declaration, call, identifier), edges are "contains".
- **Example:** `const token = req.cookies.token;` →
  `VariableDeclaration(kind='const')` → `VariableDeclarator` with `id = Identifier(token)`
  (what is **defined**) and `init = MemberExpression(MemberExpression(req, cookies), token)`
  (what is **used**). Property access nests inside-out.
- **Why it matters:** every static tool (ESLint, metrics, the slicer) works on the AST,
  not on text. The slicer uses exactly the `id` = definition / `init` = use split.
- **Result:** the tree shrank from 2000 to 1903 nodes; fewer `Identifier` /
  `NewExpression` nodes = the removed catch blocks; one more `ImportDeclaration` = the
  error handler's new import.

### 11.2 Metrics (§12)

- **SLOC:** lines containing code (not blank, not only comments). 432 → 410.
- **Cyclomatic complexity (McCabe):** `1 + number of decision points` (`if`, `?:`,
  loops, `case`, `catch`, `&&`, `||`, `??`). It equals the number of independent paths
  through a function, so it is a **lower bound on the tests needed** to cover it.
- **Result:** max CC 11 → 7, mean 2.18 → 1.76. Most complexity was the `||` fallbacks in
  the copied catch blocks.
- **ESLint** (recommended rules) found 3 issues, the same before and after: the
  duplicate `secure` key (a real bug, §10 #5) and two unused variables (harmless).
- *Q: Why does the function count go up (28 → 29)?* The new `toJSON` transform.

### 11.3 Code coverage (§13)

- **What:** which lines/branches/functions actually **ran** during the tests. This is
  dynamic analysis.
- **Result:** lines 72.74% → 71.51%, branches 77.14% → 84.37%, functions 61.53% → 64.28%.
- **Why did line coverage go *down*?** The deleted catch blocks were mostly **covered
  lines** but **uncovered branches** (the `||` fallbacks rarely ran). Deleting them
  shrinks the denominator differently for lines and branches. **Percentages of two
  versions have different denominators**; they are not progress on a fixed scale.
- **Real finding:** 0% files: `server.js`, `config/database.js` (never loaded by tests),
  and `multer.middleware.js`, `cloudinary.js`, `seminar.model.js` (not used by any
  route: dead code). `protected.routes.js` lines 7–14: no test reaches its success path.
- *Q: Does 100% coverage mean no bugs?* No. Coverage shows code ran, not that its
  result was checked.

### 11.4 Program slicing (§14)

- **Slice:** all statements that can affect a variable's value at a chosen point (the
  **slicing criterion**).
- **Static slice:** considers **all** possible executions → larger.
  **Dynamic slice:** only what affected the value in **one** execution → smaller.
- **Dependencies followed:** **data** (uses `v` → depends on earlier definitions of `v`)
  and **control** (depends on the `if` that decides whether it runs, including an
  earlier `if (…) return/throw`).
- **Criterion:** variable `query` at line 47 of `getQuestions`
  (`Question.find(query)`), which answers "which code decides what is searched for?"
- **Static slice:** 8 of 12 statements: the `req.query` destructuring, `let query = {}`,
  both `if (tags)` and `if (search)` branches.
- **Dynamic slice** for the test "searches titles" (`?search=PRAYER`): **5** statements.
  The tag branch did not run, so it is gone.
- **Key insight:** `if (tags)` **did run** (it evaluated to false) but is **not** in the
  dynamic slice, because nothing it controls affected `query`. **Coverage says what
  ran; slicing says what mattered.**
- **How the dynamic slice was made:** run one test alone with coverage → the set of
  executed lines → the slicer ignores statements that did not execute.
- **Limitations (say these if asked):** one function only (intraprocedural); no kill
  analysis (every earlier definition counts); `obj.method()` treated as possibly
  changing `obj`. All of these make slices **bigger, never smaller**, so nothing
  relevant is missed.

### 11.5 Tracing and profiling: transformation tools (§15)

A *transformation tool* turns a program into another representation (text → log,
trace, chart) to help understanding.

**Trace** (Loguru/PySnooper equivalent): `workload.mjs --trace` loads the **unmodified**
app, wraps it in a request logger, turns on Mongoose's query log, and replays a session.
It found:

- register = 3 DB operations, including a lazily created unique email index;
- login ≈ 70 ms vs 2–5 ms for other requests (bcrypt);
- the forged token is rejected in < 1 ms **with no DB query** (the CM-COR-01 path);
- adding a question stores `"tags": []`, and the next tag query returns 404: **the
  residual tags bug observed at runtime**.

**Profile** (cProfile/SnakeViz equivalent): `node --cpu-prof` samples the call stack
every millisecond during 30 rounds of login/profile/add/search. `profile.mjs` sums the
samples by package and function and draws an **icicle chart** (width = time, children
under callers).

- **76.7% of CPU in `bcryptjs`**; `comparePassword` alone ≈ 74%; app code negligible.
- **Not a defect:** bcrypt is slow *on purpose* so stolen hashes are expensive to crack.
  It is a capacity limit: roughly a dozen logins per second per core, and `bcryptjs`
  (pure JS) blocks the event loop while hashing.

### 11.6 Clone detection (§16, Lab 6)

- **Tool:** jscpd. It splits code into tokens, hashes a sliding window of tokens
  (Rabin–Karp), and reports equal windows in different places. Token-based, so
  formatting differences don't hide clones. Thresholds: ≥ 5 lines and ≥ 30 tokens.
- **Clone types:** Type 1 = exact copy; Type 2 = same structure, renamed
  identifiers/literals; Type 3 = copy with added/removed statements; Type 4 = same
  behaviour, different code (token tools can't find these).
- **Found at baseline:** 3 clones, 23 lines (4.3%):
  - the catch-and-resend block (2 pairs): **harmful**, because behaviour depended on
    copying it, and the missing copy already caused wrong status codes;
  - the `language` field in two schemas: **low risk**.
- **Solution:** central error handler (done: CM-PER-01); shared schema field
  (recommended).
- **After:** 1 clone, 7 lines (1.4%).
- **Lesson:** clone *count* understates risk. An 8-line clone that encodes a rule
  everyone must follow by hand is more dangerous than a large harmless one.

---

## 12. Numbers to remember

| | Before | After |
| --- | --- | --- |
| Tests (all passing) | 20 | 26 |
| Known-bug (`test.failing`) tests | 8 | 4 |
| SLOC | 432 | 410 |
| Max / mean cyclomatic complexity | 11 / 2.18 | 7 / 1.76 |
| Line coverage | 72.74% | 71.51% |
| Branch coverage | 77.14% | 84.37% |
| Clones (duplicated lines) | 3 (23) | 1 (7) |
| ESLint findings | 3 | 3 |
| npm audit vulnerabilities | 9 | 8 |
| bcrypt share of CPU | n/a | 76.7% |

Test progression by tag: `lab-setup` 20 (8 known bugs) → `cm-cor-01` 22 (6) →
`cm-ada-01` 22 (6) → `cm-pre-01` 25 (5) → `cm-per-01` 26 (4).

---

## 13. General viva questions

- **Why only one change per category?** To keep cause and effect traceable: each tag
  differs from the previous one by exactly one purpose. The other problems are recorded
  in §10.
- **How do I know your "before" screenshots are real?** They are captured command
  output, not screenshots. Each caption names the evidence file, tag, commit and Node
  version; `npm run report` re-runs everything from the tags.
- **Why `test.failing` instead of just writing tests after fixing?** It proves the test
  detects the bug *before* the fix. A test written after the fix might pass for the
  wrong reason.
- **Why does the baseline run on Node 24?** Versions before the adaptive change cannot
  start on Node 26; that is the adaptive bug itself.
- **Why not MongoDB 8?** It refuses to start on Linux kernel 6.19+ (SERVER-121912); 7.0.45
  is supported by Mongoose 8.9.
- **Difference between reverse engineering and refactoring?** Reverse engineering
  recovers design knowledge **without changing** code. Refactoring **changes** the
  structure without changing behaviour.
- **Difference between impact analysis and slicing?** Impact analysis asks "what can my
  change affect?" (forward, whole system). Backward slicing asks "what can affect this
  value?" Slicing is one tool you can use *for* impact analysis.
- **Static vs dynamic analysis?** Static examines code without running it (AST,
  metrics, lint, static slice). Dynamic observes it running (tests, coverage, trace,
  profile, dynamic slice).
- **What would you do next?** Fix §10 #1–3 (each already has a `test.failing` waiting to
  flip), run `npm audit fix`, and consider Express 5 as the next adaptive change.
- **What was the hardest part?** Reasonable answers: realising the server crash came
  from Express 4's promise handling, or explaining why the old package is still
  installed after the adaptive fix.

---

## 14. Demonstrating live and regenerating

**Run the tests on any version:**

```sh
cd backend-Nodejs
npm run db:up                     # start MongoDB (Docker)
git checkout cm-per-01 && nvm use 26 && npm ci && npm test
git checkout lab-setup && nvm use 24 && npm ci && npm test
git checkout lab/maintenance       # back to the branch
```

**Show the server crash live** (needs a separate checkout of the old version):

```sh
git worktree add /tmp/before lab-setup && cd /tmp/before && nvm use 24 && npm ci
PORT=5055 MONGODB_URI=mongodb://127.0.0.1:27017/jamiya_report JWT_SECRET=demo \
  bash ~/prj/maintainance/backend-Nodejs/report/demos/auth-requests.sh
```

Do the same with `cm-cor-01` to show the fix. `report/demos/credentials.sh` (with
`cm-ada-01` vs `cm-pre-01`) shows the password leak; `report/demos/boot.sh` with Node 26
(`cm-cor-01` vs `cm-ada-01`) shows the adaptive crash.

**Show any diff:** `git diff lab-setup cm-cor-01 -- src` (and so on for each pair of tags).

**Regenerate the whole report:**

```sh
nvm use && npm ci
npm run report                 # capture all evidence + build the PDF (~1.5 min)
npm run report:build           # only rebuild, e.g. after editing your name in report/report.config.json
```

Details of the pipeline are in `report/README.md`.
