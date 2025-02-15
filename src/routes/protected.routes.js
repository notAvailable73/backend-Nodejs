import express from "express";
import { isAuthenticated } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", isAuthenticated, (req, res) => {
    console.log(req.user);
    return res.status(200).json({
        status: 200,
        data: {
            user: req.user,
        },
        message: "You are authenticated",
    });
});

export default router;
