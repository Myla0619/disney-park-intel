import assert from 'node:assert/strict';
import { parseAgentStep, formatToolResponse } from './protocol';
const raw = '<think>查排队</think><tool_response>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_response>';
assert.equal(parseAgentStep(raw).toolCall, null);
const compatible = parseAgentStep(raw, { allowLegacyAssistantCall: true });
assert.equal(compatible.toolCall?.name, 'get_wait_times');
assert.ok(compatible.errors.length > 0);
for (const bad of [raw + raw, raw + '<answer>x</answer>', raw.replace('{"park_id":"shanghai"}', 'null'), formatToolResponse({ok:true})]) {
  assert.equal(parseAgentStep(bad, {allowLegacyAssistantCall:true}).toolCall, null);
}
assert.equal(formatToolResponse({ok:true}), '<tool_response>{"ok":true}</tool_response>');
console.log('Legacy compatibility: 8 assertions passed');
