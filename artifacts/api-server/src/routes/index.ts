import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai";
import ugcRouter from "./ugc";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai", openaiRouter);
router.use("/ugc", ugcRouter);

export default router;
