# Historical results — not a fresh benchmark

The JSON files in this directory predate the unified `first-step-tool-call-v1`
evaluator. They lack per-sample raw outputs, frozen prompt/test hashes and exact
checkpoint provenance. Keep them as historical artifacts, not comparable new runs.

The old adapter evaluator and GRPO reward parsed `tool_response` as a model call;
the runtime Agent expects `tool_call`. The old endpoint evaluator also contained
a Python syntax error. Fixing source code does not repair already-trained weights
or retroactively validate these metrics.

Use `rl/train/EVALUATION.md` for new paired evaluations. These measure only the
first step; end-to-end tool execution and final task success require separate tests.
