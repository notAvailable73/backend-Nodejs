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


const getQuestionsbyTags = asyncHandler(async (req, res) => {
  try {
    const { tags } = req.query;  
    
    let query = {};
     
    if (tags) { 
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      query.tags = { $in: tagArray };
    }
 
    const questions = await Question.find(query)
      .select('-__v') // Exclude version key
      .sort({ createdAt: -1 }); // Sort by newest first
    
    // If no questions found
    if (!questions || questions.length === 0) {
      throw new ApiError(
        404,
        tags ? 'No questions found with the specified tags' : 'No questions found',
        null 
      ) 
    }

    // Return success response 
    return new ApiResponse(
      200,
      {
        count: questions.length,
        questions
      },
      "Question Added Successfully"
    ).send(res);

  } catch (error) {
    console.log(error);
    const errorResponse = new ApiError(
      error.statusCode || 500,
      error.errors || error,
      error.message || "Error occured while fetching questions"
    );
    errorResponse.send(res);
  }
});


export { createQuestion,getQuestionsbyTags };
