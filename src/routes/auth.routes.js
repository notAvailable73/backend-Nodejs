import express from "express";
import { registerUser, loginUser, logoutUser, getProfile } from "../controllers/auth.controller.js";
import { isAuthenticated } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", isAuthenticated, logoutUser);
router.get("/profile", isAuthenticated, getProfile);

export default router;
