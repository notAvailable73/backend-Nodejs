import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../src/app.js";
import { User } from "../src/models/user.model.js";
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
        await register();

        const stored = await User.findOne({ email: user.email });
        expect(stored.password).not.toBe(user.password);
        expect(stored.password).toMatch(/^\$2[aby]\$10\$/);
    });

    // CM-PER-01: before the change the global error handler ignored
    // ApiError.statusCode and answered 500
    test("rejects a duplicate email with 400", async () => {
        await register();
        const res = await register();

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            success: false,
            message: "A user with this email already exists",
            errors: "User already exists",
        });
    });
});

// CM-PRE-01: credentials must not leave the server through responses or logs
describe("credential exposure", () => {
    let logged;

    beforeEach(() => {
        logged = [];
        for (const level of ["log", "info", "warn", "error"]) {
            jest.spyOn(console, level).mockImplementation((...args) => {
                logged.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
            });
        }
    });

    afterEach(() => jest.restoreAllMocks());

    test("registration does not return the password hash", async () => {
        const res = await register();

        expect(res.body.data.user).not.toHaveProperty("password");
    });

    test("login does not return the password hash", async () => {
        await register();
        const res = await login();

        expect(res.body.data.user).not.toHaveProperty("password");
    });

    test("registration does not log the plaintext password", async () => {
        await register();

        expect(logged.join("\n")).not.toContain(user.password);
    });

    test("login does not log the token or the password hash", async () => {
        await register();
        const res = await login();

        const output = logged.join("\n");
        expect(output).not.toContain(res.body.data.token);
        expect(output).not.toMatch(/\$2[aby]\$10\$/);
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
        expect(res.body).toEqual({
            success: false,
            message: "Incorrect email or password",
            errors: "Invalid credentials",
        });
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

    // CM-COR-01: before the fix this request never got a response
    test("rejects a request without a token with 401", async () => {
        const res = await request(app).get("/api/auth/profile").timeout(HANG_TIMEOUT);

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("No token provided");
    });

    // CM-COR-01: before the fix these requests terminated the Node process
    test.each([
        ["malformed", () => "not-a-jwt"],
        ["signed with another secret", () => jwt.sign({ id: "x" }, "another-secret")],
        [
            "expired",
            () => jwt.sign({ id: "x", exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET),
        ],
    ])("rejects a %s token with 401", async (_, makeToken) => {
        const res = await request(app)
            .get("/api/auth/profile")
            .set("Cookie", `token=${makeToken()}`)
            .timeout(HANG_TIMEOUT);

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Invalid or expired token");
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
