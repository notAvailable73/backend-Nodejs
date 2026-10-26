import dotenv from "dotenv";

dotenv.config({ quiet: true });

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/jamiya_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only-secret";
