import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";

const registerUser = asyncHandler(async (req, res) => {
    console.log(req.body);
    const { name, email, password } = req.body;

    if ([name, email, password].some(field => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required", "Could not get all fields while registering user");
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new ApiError(400, "User already exists", "A user with this email already exists");
    }

    const user = new User({ name, email, password });
    await user.save();

    const token = user.getJwtToken();

    return new ApiResponse(201, { user, token }, "User registered successfully").send(res);
});

const loginUser = asyncHandler(async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(email);
        if ([email, password].some(field => field?.trim() === "")) {
            throw new ApiError(400, "All fields are required", "Email and password are required for login");
        }
    
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            throw new ApiError(401, "Invalid credentials", "Incorrect email or password");
        }
    
        const token = user.getJwtToken();
    
        
        // Set token in HTTP-only cookie
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
            secure: true,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        console.log("Sending response:", JSON.stringify({ user, token }, null, 2));
        return new ApiResponse(200, { user, token }, "Login successful").send(res);
        
    } catch (error) {
        console.log(error);
        const errorResponse = new ApiError(
          error.statusCode || 500,
          error.errors || error,
          error.message || "Error occured while logging in"
        );
        errorResponse.send(res);
      }
});

const logoutUser = asyncHandler(async (req, res) => {
    res.clearCookie("token", 
        { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === "production" 
    });
    return new ApiResponse(200, null, "Logout successful").send(res);
});


const getProfile = asyncHandler(async (req, res) => {
    const user = req.user;
    return new ApiResponse(200, user, "User profile retrieved successfully").send(res);
});


export { registerUser, loginUser, logoutUser,getProfile };
