import type { AgentEvent } from './agent-loop';

/** 只返回完整的自训模型回答，失败后切换一次备用服务。 */
export async function* withAgentFallback(
  primary: (() => AsyncGenerator<AgentEvent>) | null,
  fallback: (() => AsyncGenerator<AgentEvent>) | null,
): AsyncGenerator<AgentEvent> {
  if (primary) {
    yield { type: 'provider', name: 'student', fallback: false };
    try {
      for await (const event of primary()) {
        if (event.type === 'error') break;
        if (event.type === 'delta') continue;
        yield event;
        if (event.type === 'done') return;
      }
    } catch { /* Switch once; never leak provider errors or partial reasoning. */ }
  }
  if (!fallback) {
    yield { type: 'error', message: '自训模型暂不可用，备用服务也未配置，请稍后重试。' };
    return;
  }
  yield { type: 'provider', name: 'claude', fallback: true };
  yield* fallback();
}
