import { Router } from "express";
import { askHandler, healthHandler } from "./ai.controller.js";

const router = Router();

router.get("/health", healthHandler);
router.post("/ask", askHandler);

export default router;
