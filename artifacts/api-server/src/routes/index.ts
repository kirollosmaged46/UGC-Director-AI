import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai";
import ugcRouter from "./ugc";
import adgenRouter from "./adgen/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai", openaiRouter);
router.use("/ugc", ugcRouter);
router.use("/adgen", adgenRouter);

export default router;
