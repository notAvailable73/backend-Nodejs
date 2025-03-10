import dotenv from 'dotenv';
import connectDB from "./config/database.js";
import { app } from './app.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Function to start the server (only for local testing)
const startServer = async () => {
    try {
        await connectDB();
        console.log("🚀 MongoDB Connected!");

        // ✅ Only start the server locally
        if (process.env.NODE_ENV !== 'vercel') {
            app.listen(PORT, () => {
                console.log(`🚀 Server is running at port: ${PORT}\n
                Link: http://localhost:${PORT}`);
            });
        }
    } catch (error) {
        console.error("MONGODB connection failed!!!", error);
    }
};

// Start database connection
startServer();

// ✅ Export the app for Vercel 
export default app;
