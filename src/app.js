import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser";
const app = express();

// Middleware
app.use(cors()); 
app.use(express.json()); 
// app.use(cookieParser)
app.use(express.static("public"))


// Routes import 
import QuestionRoute from "./routes/question.route.js";

// Routes declaration 
app.use("/api/v1/questions", QuestionRoute);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

export {app}