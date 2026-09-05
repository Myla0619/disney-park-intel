import { writeFileSync } from "node:fs";
import { buildSystemPrompt } from "../agent/prompt";

const [park, date, output] = process.argv.slice(2);
if (!park || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !output) {
  throw new Error("Usage: npx tsx rl/eval/export_prompt.ts shanghai YYYY-MM-DD prompt.txt");
}
writeFileSync(output, buildSystemPrompt(park, date), "utf8");
