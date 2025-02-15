import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser";
const app = express(); 
app.use(cors()); 
app.use(express.json());  
app.use(express.static("public"))


// Routes import 
import QuestionRoute from "./routes/question.route.js";
import authRoute from "./routes/auth.routes.js";
import protectedRoute from "./routes/protected.routes.js";
// Routes declaration 
app.use("/", (req, res) => {
    res.json({ message: "Welcome to the Jamia API" });
});
app.use("/api/v1/questions", QuestionRoute);
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/protected-route", protectedRoute);
// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

export {app}