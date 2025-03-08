import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser";
const app = express(); 
app.use(cors()); 
app.use(express.json());  
app.use(express.static("public"))
app.use(cookieParser());

// Routes import 
import QuestionRoute from "./routes/question.route.js";
import authRoute from "./routes/auth.routes.js";
import protectedRoute from "./routes/protected.routes.js";
// Routes declaration 
// app.use("/", (req, res) => {
//     res.send({ message: "Welcome to the Jamia API" });
// });
app.use("/api/questions", QuestionRoute);
app.use("/api/auth", authRoute);
app.use("/api/protected-route", protectedRoute);
// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

export {app}