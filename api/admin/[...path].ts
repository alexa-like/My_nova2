import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../../artifacts/api-server/src/app.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
