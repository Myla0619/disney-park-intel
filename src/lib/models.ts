/**
 * Claude 模型与调用参数的单一配置点
 *
 * 三处调用（评分 / 行程润色 / Agent）此前各自硬编码模型 ID，换模型要改三个文件
 * 且容易漏。集中在这里，并允许用环境变量覆盖，方便在不改代码的情况下做 A/B 或降级。
 */

/** 项目评分：结构化 JSON 输出，一次调用覆盖全部项目。 */
export const SCORING_MODEL = process.env.CLAUDE_SCORING_MODEL ?? "claude-opus-5";

/** 行程备注润色：短文本生成，对质量要求低于评分。 */
export const ITINERARY_MODEL = process.env.CLAUDE_ITINERARY_MODEL ?? "claude-opus-5";

/** Agent 对话：多轮 Tool Use 循环。 */
export const AGENT_MODEL = process.env.CLAUDE_AGENT_MODEL ?? "claude-opus-5";

/** Agent 单轮工具循环的最大迭代次数，防止工具互相触发导致的无界循环。 */
export const AGENT_MAX_ITERATIONS = Number(process.env.AGENT_MAX_ITERATIONS ?? 5);
