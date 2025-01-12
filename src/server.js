// require('dotenv').config({ path: './env' })
import dotenv from 'dotenv';
dotenv.config();
import connectDB from "./config/database.js";
import { app } from './app.js' 

const PORT = process.env.PORT || 5000;


connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server is running at port : ${PORT}\n
            Link: http://localhost:${PORT}`);
        })
    })
    .catch((err) => {
        console.error("MONGODB connection failed !!! ", err);
    })