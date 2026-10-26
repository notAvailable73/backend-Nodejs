# Explaining the report

A plain-language walkthrough of what was done and why, with the questions an
examiner is likely to ask. Section numbers refer to the PDF.

## The project in one breath

The backend of a Q&A website for Jamia as-Suffah: Express 4 + MongoDB, JWT login
in a cookie, questions stored in English/Bengali/Arabic with tags. Small (17
files, ~430 lines), no tests, no docs, real bugs: a good maintenance subject.

## How the work was organised

- **One change per category**, each a single commit with a git tag
  (`cm-cor-01`, `cm-ada-01`, `cm-pre-01`, `cm-per-01`). `baseline` is the
  original code; `lab-setup` adds tests and Docker without touching `src/`.
- **Tests first.** Each bug found was written as a `test.failing`: the test
  states the correct behaviour, so it *fails* while the bug exists, and Jest
  counts that as a pass. When the fix lands, the test would start failing, so it
  is switched to a normal `test`. Before/after is therefore a test changing state.
- **Five steps per change**: comprehension → change request → impact →
  reverse engineering → implementation.

## 4. Corrective: CM-COR-01

- **Problem:** the login-check middleware had two broken error paths. No cookie →
  it *returned* an error object instead of sending it, so the request hung. Bad
  cookie → it *threw* inside an `async` function; Express 4 ignores the
  resulting promise, Node treats the unhandled rejection as fatal, and **the
  whole server exits**. One request with `token=garbage` takes the site down.
- **Fix:** send both 401 responses (`.send(res)`), move `next()` out of `try`.
- **Proof:** demo before (no response, then server exits with code 1) vs after
  (two 401s, server alive); two known-bug tests become normal tests.
- *Why corrective?* It is an existing fault that causes failures now.
- *Why not upgrade to Express 5, which handles async errors?* A major-version
  migration is far bigger than a 3-line fault; it is a reasonable future
  adaptive change.
- *Why move `next()`?* Inside `try`, an error from a later handler would be
  caught and wrongly reported as "invalid token".

## 5. Adaptive: CM-ADA-01

- **Problem:** Node.js 25 removed the old `SlowBuffer` API. `jsonwebtoken`
  9.0.2 → `jws` 3 → `jwa` 1.4.1 → `buffer-equal-constant-time` touches
  `SlowBuffer` when loaded, so the server crashes **before starting** on
  Node 26.
- **Fix:** `jsonwebtoken` 9.0.3 (patch release) → `jws` 4 → `jwa` 2, which uses
  Node's built-in `crypto.timingSafeEqual`. Pin `.nvmrc` to Node 26.
- **Puzzle worth explaining:** `npm ls` still shows the old package after the
  fix. `jwa` 2 only loads it as a fallback when `timingSafeEqual` is missing,
  which never happens on supported Node versions (§5 step 4).
- *Why adaptive?* The code was not wrong when written; the environment changed.
- *Alternatives?* Stay on Node 24 (postpones the problem) or switch to `jose`
  (async API, touches 4 files). The patch upgrade is the smallest fix.
- *Do existing logins survive?* Yes: same HS256 tokens, same secret.

## 6. Preventive: CM-PRE-01

- **Problem:** registration logged the request body (plaintext password); login
  logged the user and the token; both responses included the bcrypt hash.
- **Fix:** a `toJSON` transform on the User schema deletes `password` whenever a
  user is turned into JSON; the two logging lines are removed.
- *Why preventive and not corrective?* Nothing has visibly failed; these are
  latent risks (anyone reading logs, offline hash cracking).
- *Why in the schema and not the controllers?* It protects every route that
  returns a user, including future ones. That is what makes it preventive.
- *Does login still work?* Yes: `comparePassword` reads the document, not JSON.

## 7. Perfective: CM-PER-01

- **Problem:** three controllers contained the same copied `try/catch` (jscpd
  finds it), while the global error handler ignored `ApiError` and always sent
  500. Where the copy was missing (`registerUser`), "email already exists"
  came back as 500 instead of 400.
- **Fix:** the global handler sends `ApiError`s with their own status; the copied
  blocks are deleted (`asyncHandler` already forwards errors).
- **Measured:** clones 3 → 1, CC of `getQuestions` 11 → 7, `loginUser` 8 → 4.
- *Why perfective if it fixed a status code?* The purpose was structure (one
  place for error handling); the 400 is a consequence. Section 7's impact table
  lists every error path before and after.
- *Risk?* Medium: it touches every error path, hence the table and the tests.

## Part 2 in one line each

- **AST (§11):** code as a tree; `id` = what is defined, `init` = what is used.
- **Metrics (§12):** cyclomatic complexity = 1 + decision points; the deleted
  `||` fallbacks were most of it. ESLint found a real bug: a duplicate `secure`
  key makes the production-only cookie rule dead code.
- **Coverage (§13):** line % fell slightly while branch % rose, because the deleted
  code was covered lines but uncovered branches. Different denominators.
  The real finding is the 0% files: code no test or route uses.
- **Slicing (§14):** static slice of `query` = 8 statements; dynamic slice for a
  title search = 5. `if (tags)` ran but is not in the slice: coverage says what
  ran, slicing says what mattered.
- **Tracing/profiling (§15):** the trace shows the residual tags bug at runtime
  (`tags: []` stored). The profile shows ~77% of CPU in bcrypt, which is by design.
- **Clones (§16):** catch block = harmful (encodes a rule people must copy);
  model field = low risk.

## Residual findings (§8)

Four known bugs are deliberately left, each still a `test.failing`: tags not
stored, missing-field validation, unescaped `$regex` search, and (consequence of
the first) tag search. Also: unauthenticated question creation, 8 npm audit
vulnerabilities, ESLint's 3 findings. Saying "found, recorded, out of scope" is
part of change management, not a gap.

## Regenerating

See `report/README.md`. In short: `npm run report`. To change your name, edit
`report/report.config.json` and run `npm run report:build`.
