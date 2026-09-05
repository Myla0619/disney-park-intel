"""Multi-turn full-parameter veRL agent loop; tools are executed, observations are masked.

Interface pinned to veRL 23af6a7a2e8d6efeeb2adbe5d1689c7a24f503a3.
"""
import asyncio
import copy
import json
import math
import os
import time
import urllib.request
from uuid import uuid4


def post_json(base_url, path, payload):
    request = urllib.request.Request(base_url.rstrip("/") + path,
        data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


async def run_multiturn(adapter, task, messages, sampling_params, response_length,
                        base_url, max_turns=30, max_calls=25, timeout_s=600, phase="mid"):
    """Adapter separates real framework token merging from independently testable control flow."""
    messages = copy.deepcopy(messages)
    runtime = await adapter.initial(messages)
    mask, logprobs = [], None
    deadline = time.monotonic() + timeout_s
    calls = 0
    stopped = "max_turns"
    for turn in range(max_turns):
        if time.monotonic() >= deadline:
            stopped = "timeout"
            break
        remaining = response_length - len(mask)
        if remaining <= 0:
            stopped = "context_budget"
            break
        params = {**sampling_params, "max_tokens": min(remaining, 2048)}
        output = await asyncio.wait_for(adapter.generate(runtime, params), max(0.01, deadline-time.monotonic()))
        # Exact generated token IDs are retained. Re-tokenizing decoded text would change log probabilities.
        runtime, mask, logprobs = await adapter.assistant(runtime, output, mask, logprobs)
        raw = adapter.decode(output)
        messages.append({"role": "assistant", "content": raw})
        step = await asyncio.to_thread(post_json, base_url, "/agent-step",
            {"raw": raw, "remainingCalls": max_calls-calls, "snapshot_at": task.get("snapshotAt")})
        if step["done"]:
            stopped = "answer"
            break
        if step["parsed"].get("toolCall") and calls < max_calls:
            calls += 1
        observation = {"role": "user", "content": step["response"]}
        previous = copy.deepcopy(messages)
        updated = messages + [observation]
        merged, next_mask, next_probs = await adapter.observation(previous, updated, runtime, mask, logprobs)
        # Never score a complete transcript while training on a truncated one.
        if len(next_mask) >= response_length:
            stopped = "context_budget"
            break
        runtime, mask, logprobs = merged, next_mask, next_probs
        messages = updated
    if len(mask) > response_length:
        raise ValueError("Generation exceeded token budget")
    if not mask or not any(mask):
        raise ValueError("Rollout contains no policy tokens")
    score, breakdown = 0.0, {}
    if stopped == "answer":
        result = await asyncio.to_thread(post_json, base_url, "/reward", {
            "task": task, "phase": phase,
            "trajectory": {"messages": messages, "_rebuild_from_messages": True}})
        if result.get("ok") is not True:
            raise RuntimeError("Reward service failure: abort rather than score infrastructure as policy failure")
        breakdown = result["result"]
        score = float(breakdown["total"])
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("Invalid reward")
    return {"runtime": runtime, "mask": mask, "logprobs": logprobs,
            "messages": messages, "score": score, "breakdown": breakdown,
            "stopped": stopped, "calls": calls}


# Import veRL lazily so CPU control-flow tests do not require CUDA/Ray.
def create_agent_class():
    from verl.experimental.agent_loop.agent_loop import AgentLoopBase, AgentLoopOutput

    class ParkAgentLoop(AgentLoopBase):
        async def run(self, sampling_params, priority=0, **kwargs):
            task = kwargs["extra_info"]["task"]
            config = self.rollout_config.custom or {}
            endpoint = config.get("environment_url", "http://127.0.0.1:8100")
            owner = self
            request_id = uuid4().hex

            class Adapter:
                async def initial(self, messages):
                    ids = owner.tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True)
                    if len(ids) > owner.rollout_config.prompt_length:
                        raise ValueError("Prompt exceeds budget; refusing silent constraint truncation")
                    return await owner.ct_build_initial_tokens(messages)

                async def generate(self, ids, params):
                    return await owner.server_manager.generate(request_id=request_id, prompt_ids=ids,
                                                               sampling_params=params, priority=int(priority))

                def decode(self, output):
                    return owner.tokenizer.decode(output.token_ids, skip_special_tokens=True)

                async def assistant(self, ids, output, mask, probs):
                    merged, mask, probs = await owner.ct_merge_assistant_token(ids, output.token_ids, mask,
                        probs if probs is not None else ([] if output.log_probs else None),
                        assistant_logprobs=output.log_probs if output.log_probs else None)
                    return merged.token_ids, mask, probs

                async def observation(self, previous, updated, ids, mask, probs):
                    merged, mask, probs = await owner.ct_merge_non_assistant_msg(previous, updated, ids, mask, probs)
                    return merged.token_ids, mask, probs

            result = await run_multiturn(Adapter(), task, kwargs["raw_prompt"], sampling_params,
                self.rollout_config.response_length, endpoint,
                max_turns=int(config.get("max_turns",30)), max_calls=int(config.get("max_calls",25)),
                phase=kwargs["extra_info"].get("rewardPhase", "mid"))
            count = len(result["mask"])
            return AgentLoopOutput(prompt_ids=result["runtime"][:-count],
                response_ids=result["runtime"][-count:], response_mask=result["mask"],
                response_logprobs=result["logprobs"], reward_score=result["score"],
                num_turns=len(result["messages"])-1, metrics={},
                extra_fields={"messages":result["messages"], "task_id":task["id"],
                    "stopped_reason":result["stopped"], "tool_calls":result["calls"],
                    "reward_extra_info":result["breakdown"], "turn_scores":[], "tool_rewards":[]})
    return ParkAgentLoop


def ParkAgentLoop(**kwargs):
    return create_agent_class()(**kwargs)
