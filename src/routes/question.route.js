import { Router } from "express"; 
import { createQuestion,getQuestions } from "../controllers/question.controller.js";
 


const router = Router();
 

router.route("/add").post(createQuestion);
router.route("/").get(getQuestions);


export default router;