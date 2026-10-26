import request from "supertest";
import { app } from "../src/app.js";
import { Question } from "../src/models/question.model.js";
import { connect, clear, disconnect } from "./helpers/db.js";

const question = {
    title: "How to perform wudu?",
    description: "Steps of ablution before prayer",
    tags: "fiqh",
    language: "en",
};

const addQuestion = (body = question) => request(app).post("/api/questions/add").send(body);

// Inserts a question directly, bypassing the controller
const seedQuestion = (title, tags) =>
    Question.create({
        translations: [{ language: "en", title, description: `About ${title}` }],
        tags,
    });

beforeAll(connect);
afterEach(clear);
afterAll(disconnect);

describe("POST /api/questions/add", () => {
    test("creates a question with one translation", async () => {
        const res = await addQuestion();

        expect(res.status).toBe(201);
        expect(res.body.data.translations).toHaveLength(1);
        expect(res.body.data.translations[0]).toMatchObject({
            language: "en",
            title: question.title,
        });
    });

    // Known bug: the controller nests `tags` inside the translation instead of
    // setting the top-level `tags` field from the schema
    test.failing("stores the tags on the question", async () => {
        const res = await addQuestion();

        expect(res.body.data.tags).toEqual(["fiqh"]);
    });

    // Known bug: `field?.trim() === ""` is false for undefined, so missing
    // fields pass validation and fail later in Mongoose with a 500
    test.failing("rejects a missing title with 400", async () => {
        const { title, ...withoutTitle } = question;
        const res = await addQuestion(withoutTitle);

        expect(res.status).toBe(400);
    });
});

describe("GET /api/questions", () => {
    test("lists questions, newest first", async () => {
        await seedQuestion("First", ["fiqh"]);
        await seedQuestion("Second", ["aqidah"]);

        const res = await request(app).get("/api/questions");

        expect(res.status).toBe(200);
        expect(res.body.data.count).toBe(2);
        expect(res.body.data.questions.map((q) => q.translations[0].title)).toEqual([
            "Second",
            "First",
        ]);
    });

    test("filters by tag", async () => {
        await seedQuestion("Prayer times", ["salah"]);
        await seedQuestion("Zakat rate", ["zakat"]);

        const res = await request(app).get("/api/questions?tags=zakat");

        expect(res.body.data.count).toBe(1);
        expect(res.body.data.questions[0].translations[0].title).toBe("Zakat rate");
    });

    test("searches titles case-insensitively", async () => {
        await seedQuestion("Prayer times", ["salah"]);
        await seedQuestion("Zakat rate", ["zakat"]);

        const res = await request(app).get("/api/questions?search=PRAYER");

        expect(res.body.data.count).toBe(1);
        expect(res.body.data.questions[0].translations[0].title).toBe("Prayer times");
    });

    test("answers 404 when nothing matches", async () => {
        const res = await request(app).get("/api/questions");

        expect(res.status).toBe(404);
    });

    // Known bug: a question created through the API is never found by its tag
    test.failing("finds a question created through the API by its tag", async () => {
        await addQuestion();

        const res = await request(app).get("/api/questions?tags=fiqh");

        expect(res.status).toBe(200);
    });

    // Known bug: `search` is passed to $regex unescaped, so special characters
    // produce an invalid regular expression and a 500
    test.failing("treats regex characters in the search term literally", async () => {
        await seedQuestion("What is (1+1)?", ["misc"]);

        const res = await request(app).get("/api/questions").query({ search: "(1+1" });

        expect(res.status).toBe(200);
    });
});
