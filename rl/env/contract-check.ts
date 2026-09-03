import assert from 'node:assert/strict';
import {callTool, TOOL_REGISTRY} from './tools';
import {readFileSync} from 'node:fs';
import {runEpisode, ScriptedLLM} from '../agent/loop';
const ctx = {mode:'sandbox' as const, snapshotAt:'2026-09-01T10:00:00Z'};
const artifact = JSON.parse(readFileSync(new URL('../train/tool-contract.json', import.meta.url),'utf8'));
assert.deepEqual(artifact.tools, TOOL_REGISTRY);
async function main() {
  for (const [name,args] of [
    ['get_wait_times',null],['get_wait_times',{park_id:123}],
    ['search_reviews',{park_id:'shanghai',target_id:'tron',target_type:'hotel',query:'x'}],
    ['get_wait_times',{park_id:'shanghai',typo:true}],
    ['check_constraints',{park_id:'shanghai',itinerary:[{}]}],
    ['get_weather',{park_id:'shanghai',date:'2026-02-30'}],
  ] as [string,any][]) assert.equal((await callTool(name,args,ctx)).ok,false);
  const plan=await callTool('plan_itinerary',{park_id:'shanghai'},ctx);
  assert.equal(plan.ok,true);
  if(plan.ok) {
    const checked=await callTool('check_constraints',{park_id:'shanghai',itinerary:(plan.result as any).items},ctx);
    assert.equal(checked.ok,true);
  }
  const task={parkId:'shanghai',query:'排队多久'};
  const raw='<think>x</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>';
  const recovered=await runEpisode(new ScriptedLLM([raw,'<think>x</think><answer>暂时无法查询</answer>']),task,async()=>{throw new Error('private error');});
  assert.equal(recovered.steps[0].toolResult?.ok,false);
  assert.equal(recovered.stoppedReason,'answer');
  const timeout=await runEpisode({chat:()=>new Promise(()=>{})},task,async()=>({ok:true,result:{}}),{timeoutMs:20});
  assert.equal(timeout.stoppedReason,'timeout');
  console.log('Runtime contract, invalid dispatch, plan chaining, tool failure and in-flight timeout checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
