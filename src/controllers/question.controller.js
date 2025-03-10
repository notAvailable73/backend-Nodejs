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
      error.message || "Error occured while adding question"
    ); 
    errorResponse.send(res);
  }
});

const getQuestions = asyncHandler(async (req, res) => {
  console.log("Fetching questions");
  
  try {
    const { tags, search } = req.query;
    
    let query = {};

    // Handle tag filtering
    if (tags) { 
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      query.tags = { $in: tagArray };
    }

    // Handle search filtering
    if (search) {
      query['translations.title'] = { $regex: search, $options: 'i' }; // Case-insensitive search in title
    }

    // Fetch questions
    const questions = await Question.find(query)
      .select('-__v') // Exclude version key
      .sort({ createdAt: -1 }); // Sort by latest

    // If no questions found
    if (!questions || questions.length === 0) {
      throw new ApiError(
        404,
        search ? `No questions found matching "${search}"` : 'No questions found',
        null 
      ); 
    }

    // Return response
    return new ApiResponse(
      200,
      {
        count: questions.length,
        questions
      },
      "Questions fetched successfully"
    ).send(res);

  } catch (error) {
    console.log(error);
    const errorResponse = new ApiError(
      error.statusCode || 500,
      error.errors || error,
      error.message || "Error occurred while fetching questions"
    );
    errorResponse.send(res); 
  }
});


export { createQuestion,getQuestions };
