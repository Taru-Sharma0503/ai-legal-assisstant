import { askSchema } from "./ai.schema.js";
import { askService } from "./ai.service.js";

export async function askHandler(req, res, next) {
  try {
    const validated = askSchema.parse(req.body);
    const result = await askService(validated);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          details: err.errors
        }
      });
    }
    next(err);
  }
}

export async function healthHandler(req, res) {
  return res.status(200).json({ status: "ok" });
}
