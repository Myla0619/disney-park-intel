#!/usr/bin/env python3
"""First-step evaluation of an OpenAI-compatible endpoint, not end-to-end success."""
import json
import os
import urllib.request
from eval_common import parser, load_inputs, run


def main():
    ap = parser(__doc__)
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--model", required=True)
    args = ap.parse_args()
    inputs = load_inputs(args)
    def generate(messages):
        payload = dict(model=args.model, messages=messages, temperature=0, max_tokens=args.max_tokens)
        headers = {"Content-Type": "application/json"}
        if os.environ.get("LLM_API_KEY"):
            headers["Authorization"] = "Bearer " + os.environ["LLM_API_KEY"]
        request = urllib.request.Request(args.base_url.rstrip("/") + "/chat/completions",
                                         data=json.dumps(payload).encode(), headers=headers)
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)["choices"][0]["message"]["content"]
    run(args, generate, "openai-compatible", inputs)


if __name__ == "__main__":
    main()
