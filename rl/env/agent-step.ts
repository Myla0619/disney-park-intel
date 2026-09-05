/** Shared parser and tool execution for distributed veRL rollouts. */
import { parseAgentStep, validateToolCall, formatToolResponse } from "../agent/protocol";
import { callTool, TOOL_REGISTRY, type ToolContext } from "./tools";
export async function executeAgentStep(raw:string, ctx:ToolContext, remainingCalls:number) {
  const parsed=parseAgentStep(raw);
  if(parsed.answer!==null) return {parsed, done:true, response:null, toolResult:null};
  let result;
  if(!parsed.toolCall) result={ok:false as const,error:`协议错误：${parsed.errors.join("；")}，请使用 tool_call 或 answer 标签`};
  else {
    const invalid=validateToolCall(parsed.toolCall,TOOL_REGISTRY);
    result=invalid?{ok:false as const,error:invalid}:remainingCalls<=0?
      {ok:false as const,error:"工具调用预算已耗尽，请立即给出最终答案"}:
      await callTool(parsed.toolCall.name,parsed.toolCall.arguments,ctx);
  }
  return {parsed,done:false,response:formatToolResponse(result),toolResult:result};
}
