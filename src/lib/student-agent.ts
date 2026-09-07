import type { AgentEvent } from './agent-loop';
import type { SessionMemory } from './session-memory';
import { todayInPark } from './park-time';
import { parseAgentStep, validateToolCall, formatToolResponse } from '../../rl/agent/protocol';

export const usesStudent = () => process.env.PARK_AGENT_PROVIDER === 'student';
export const studentConfigured = () => Boolean(process.env.PARK_MODEL_BASE_URL && process.env.PARK_MODEL_NAME && process.env.PARK_TOOL_BASE_URL && process.env.PARK_MODEL_API_KEY && process.env.PARK_TOOL_API_KEY);

/** Same prompt, registry and response envelope as training; never substitute Claude. */
export async function* runStudentAgent(message: string, session: SessionMemory): AsyncGenerator<AgentEvent> {
  const configuredTimeout = Number(process.env.PARK_STUDENT_TIMEOUT_MS ?? 20000);
  const signal = AbortSignal.timeout(Number.isFinite(configuredTimeout) ? Math.min(60000, Math.max(1000, configuredTimeout)) : 20000);
  async function request(base: string, path: string, key: string, body?: unknown) {
    const res = await fetch(base.replace(/\/$/, '') + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal,
    });
    if (!res.ok) throw new Error(`Student service HTTP ${res.status}`);
    return res.json();
  }
  const env = (path: string, body?: unknown) => request(process.env.PARK_TOOL_BASE_URL!, path, process.env.PARK_TOOL_API_KEY!, body);
  try {
    const park = session.baseProfile.park;
    const [prompt, registry] = await Promise.all([
      env('/prompt', { parkId: park, query: message, profile: session.baseProfile, snapshotAt: todayInPark(park) }),
      env('/tools'),
    ]);
    if (!Array.isArray(prompt.messages) || !Array.isArray(registry.tools)) throw new Error('Invalid training service schema');
    const messages = [prompt.messages[0], ...session.conversationHistory.slice(-6).map(m => ({role: m.role, content: m.content})), prompt.messages[1]];
    const toolCalls: string[] = [];
    for (let iteration = 1; iteration <= 8; iteration++) {
      if (JSON.stringify(messages).length > 48000) throw new Error('Student context budget exceeded');
      const data = await request(process.env.PARK_MODEL_BASE_URL!, '/chat/completions', process.env.PARK_MODEL_API_KEY!, {
        model: process.env.PARK_MODEL_NAME, messages, temperature: 0, max_tokens: 2048,
      });
      const raw = data.choices?.[0]?.message?.content;
      if (typeof raw !== 'string' || data.choices[0].finish_reason === 'length') throw new Error('Incomplete student response');
      const parsed = parseAgentStep(raw);
      messages.push({role: 'assistant', content: raw});
      if (parsed.answer !== null && parsed.errors.length === 0) {
        yield {type: 'delta', text: parsed.answer};
        yield {type: 'done', response: parsed.answer, iterations: iteration, toolCalls};
        return;
      }
      let feedback: unknown = {ok: false, error: '输出格式错误，请严格使用 think 后跟唯一 tool_call 或 answer。'};
      if (parsed.toolCall && parsed.errors.length === 0) {
        const invalid = validateToolCall(parsed.toolCall, registry.tools);
        if (invalid) feedback = {ok: false, error: invalid};
        else {
          toolCalls.push(parsed.toolCall.name);
          yield {type: 'tool', name: parsed.toolCall.name, iteration};
          feedback = await env('/call', {tool: parsed.toolCall.name, args: parsed.toolCall.arguments, mode: 'live'});
        }
      }
      messages.push({role: 'user', content: formatToolResponse(feedback)});
    }
    throw new Error('Student turn limit reached');
  } catch {
    yield {type: 'error', message: '自训模型暂未完成回答，请稍后重试。'};
  }
}
