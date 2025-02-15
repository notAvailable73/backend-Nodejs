import { Router } from "express"; 
import { createQuestion,getQuestionsbyTags } from "../controllers/question.controller.js";
 


const router = Router();
 

router.route("/add").post(createQuestion);
router.route("/").get(getQuestionsbyTags);


export default router;