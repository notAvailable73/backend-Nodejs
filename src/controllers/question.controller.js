import { ApiError } from "../utils/ApiError.js";
import { Question } from "../models/question.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createQuestion = asyncHandler(async (req, res) => {
  try {
    const { title, description, tags, language } = req.body;
    if (
      [title, description, tags, language].some((field) => field?.trim() === "")
    ) {
      throw new ApiError(
        400,
        "All fields are required",
        "Could not  get all fields while creating question"
      );
    }

    const translations = { language, title, description, tags };
    const question = new Question({ translations });
    const savedQuestion = await question.save();
    return new ApiResponse(
      201,
      savedQuestion,
      "Question Added Successfully"
    ).send(res);
  } catch (error) {
    console.log(error);
    const errorResponse = new ApiError(
      error.statusCode || 500,
      error.errors || error,
      error.message || "Error occured while adding product to cart"
    );
    errorResponse.send(res);
  }
});

export { createQuestion };
