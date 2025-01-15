import { Router } from "express"; 
import { createQuestion } from "../controllers/question.controller.js";
 


const router = Router();
 

router.route("/add").post(createQuestion);


export default router;