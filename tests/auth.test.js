import request from "supertest";
import { app } from "../src/app.js";
import { isAuthenticated } from "../src/middlewares/auth.middleware.js";
import { connect, clear, disconnect } from "./helpers/db.js";

// Requests that never get a response are cut off after this many ms
const HANG_TIMEOUT = 1500;

const user = { name: "Test User", email: "test@example.com", password: "secret123" };

const register = (body = user) => request(app).post("/api/auth/register").send(body);
const login = (body = { email: user.email, password: user.password }) =>
    request(app).post("/api/auth/login").send(body);

beforeAll(connect);
afterEach(clear);
afterAll(disconnect);

describe("POST /api/auth/register", () => {
    test("creates a user and returns a JWT", async () => {
        const res = await register();

        expect(res.status).toBe(201);
        expect(res.body.data.user.email).toBe(user.email);
        expect(typeof res.body.data.token).toBe("string");
    });

    test("stores the password hashed", async () => {
        const res = await register();

        expect(res.body.data.user.password).not.toBe(user.password);
    });

    // Known bug: the ApiError thrown inside asyncHandler reaches the global error
    // handler in app.js, which ignores statusCode and always answers 500
    test.failing("rejects a duplicate email with 400", async () => {
        await register();
        const res = await register();

        expect(res.status).toBe(400);
    });

    // Known bug: the hashed password is returned to the client
    test.failing("does not expose the password hash", async () => {
        const res = await register();

        expect(res.body.data.user).not.toHaveProperty("password");
    });
});

describe("POST /api/auth/login", () => {
    beforeEach(() => register());

    test("returns a JWT and sets it as an HTTP-only cookie", async () => {
        const res = await login();

        expect(res.status).toBe(200);
        expect(typeof res.body.data.token).toBe("string");
        expect(res.headers["set-cookie"][0]).toMatch(/^token=.+HttpOnly/);
    });

    test("rejects a wrong password with 401", async () => {
        const res = await login({ email: user.email, password: "wrong-password" });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test("rejects an unknown email with 401", async () => {
        const res = await login({ email: "nobody@example.com", password: user.password });

        expect(res.status).toBe(401);
    });
});

describe("GET /api/auth/profile", () => {
    test("returns the logged-in user without the password", async () => {
        await register();
        const cookie = (await login()).headers["set-cookie"];

        const res = await request(app).get("/api/auth/profile").set("Cookie", cookie);

        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe(user.email);
        expect(res.body.data).not.toHaveProperty("password");
    });

    // Known bug: isAuthenticated returns an ApiError instead of sending it,
    // so the request never gets a response
    test.failing("rejects a request without a token with 401", async () => {
        const res = await request(app).get("/api/auth/profile").timeout(HANG_TIMEOUT);

        expect(res.status).toBe(401);
    });

    // Known bug: isAuthenticated throws inside an async middleware. Express 4 does
    // not catch the rejected promise, so it becomes an unhandled rejection, which
    // terminates the Node process: one bad cookie takes the whole server down.
    // Called directly because Jest would report the stray rejection against
    // whichever test happens to be running.
    test.failing("handles an invalid token without rejecting", async () => {
        const req = { cookies: { token: "not-a-jwt" } };
        const res = { status: () => res, json: () => res };

        await isAuthenticated(req, res, () => {});
    });
});

describe("POST /api/auth/logout", () => {
    test("clears the token cookie", async () => {
        await register();
        const cookie = (await login()).headers["set-cookie"];

        const res = await request(app).post("/api/auth/logout").set("Cookie", cookie);

        expect(res.status).toBe(200);
        expect(res.headers["set-cookie"][0]).toMatch(/^token=;/);
    });
});
