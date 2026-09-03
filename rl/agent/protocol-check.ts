import assert from 'node:assert/strict';
import {parseAgentStep as parse, validateToolCall} from './protocol';
import {readFileSync} from 'node:fs';
const registry = JSON.parse(readFileSync(new URL('../train/tool-contract.json', import.meta.url), 'utf8')).tools;
const call = '<think>x</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>';
let checks = 0;
function check(condition: boolean) { assert.ok(condition); checks++; }
check(parse(call).errors.length === 0);
for (const raw of [call+call, call+'extra', 'extra'+call, call+'<answer>x</answer>', call.replace('<think>x</think>',''), call.replace('"arguments":{"park_id":"shanghai"}','"arguments":null'), call.replace('"arguments":{"park_id":"shanghai"}','"arguments":[]'), call.replace('tool_call','tool_response'), call.replace('</tool_call>','')]) {
  const p=parse(raw); check(p.toolCall === null && p.errors.length > 0);
}
check(parse('<think>x</think><answer></answer>').answer === null);
check(parse('<think>x</think><answer>unfinished').answer === null);
for (const args of [null, [], {}, {park_id: 1}, {park_id:null}, {park_id:''}, {park_id:'shanghai',typo:true}]) {
  check(validateToolCall({name:'get_wait_times',arguments:args as any},registry) !== null);
}
for (const top_k of [0,-1,21,1.5,true,'3']) {
  check(validateToolCall({name:'search_reviews',arguments:{park_id:'shanghai',target_id:'tron',target_type:'ride',query:'好玩吗',top_k}},registry) !== null);
}
check(validateToolCall({name:'get_wait_times',arguments:{park_id:'shanghai'}},registry) === null);
check(validateToolCall({name:'unknown',arguments:{}},registry) !== null);
console.log(`${checks} strict protocol/schema assertions passed`);
