import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";

export const isAuthenticated = async (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return new ApiError(401, "Unauthorized", "No token provided");
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select("-password");
        next();
    } catch (error) {
        throw new ApiError(401, "Unauthorized", "Invalid or expired token");
    }
};