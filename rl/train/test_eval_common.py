"""Run with python3 -m unittest discover -s rl/train -p 'test_*.py'. No GPU required."""
import ast
import json
import re
import time
import unittest
import copy
from collections import defaultdict
from pathlib import Path
from eval_common import parse_output, score, compare

CALL = '<think>查排队</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>'


class ProtocolTests(unittest.TestCase):
    def test_valid_call(self):
        self.assertTrue(parse_output(CALL)["arguments_present"])
        self.assertTrue(score({"category": "explicit_wait"}, CALL)["tool_correct"])

    def test_response_is_not_model_call(self):
        self.assertFalse(parse_output(CALL.replace("tool_call", "tool_response"))["format_ok"])

    def test_answer_only_for_no_tool(self):
        answer = "<think>问候</think><answer>你好</answer>"
        self.assertTrue(score({"category": "no_tool"}, answer)["tool_correct"])
        self.assertFalse(score({"category": "explicit_wait"}, answer)["tool_correct"])

    def test_bad_shapes(self):
        for value in [CALL + CALL, CALL + "<answer>ok</answer>", CALL.replace("</tool_call>", ""),
                      CALL.replace('"arguments":{"park_id":"shanghai"}', '"arguments":[]'),
                      CALL.replace('"name"', 'name'), CALL.replace("<think>查排队</think>", "")]:
            with self.subTest(value=value):
                self.assertFalse(parse_output(value)["format_ok"])

    def test_missing_arguments(self):
        self.assertFalse(parse_output(CALL.replace('{"park_id":"shanghai"}', '{}'))["arguments_present"])

    def test_unknown_category_unscored(self):
        self.assertIsNone(score({"category": "unlabelled"}, CALL)["tool_correct"])

    def test_explicit_label_overrides_category(self):
        self.assertFalse(score({"category": "explicit_wait", "expected_tools": ["search_reviews"]}, CALL)["tool_correct"])

    def test_old_results_not_comparable(self):
        with self.assertRaises(ValueError):
            compare({"summary": {}}, {"summary": {}})

    def test_comparison_requires_matching_settings(self):
        result = {"metadata": {k: "fixed" for k in (
            "version", "backend", "base_id", "prompt_sha256", "eval_sha256", "decoding", "evaluator_sha256")},
            "summary": {}, "per_sample": [{"index": 0, "seed": {"query": "test"}, "tool_correct": False}]}
        improved = copy.deepcopy(result)
        improved["per_sample"][0]["tool_correct"] = True
        self.assertEqual(compare(result, improved)["improved"], [0])
        for key in result["metadata"]:
            changed = copy.deepcopy(improved)
            changed["metadata"][key] = "different"
            with self.assertRaises(ValueError):
                compare(result, changed)
        improved["per_sample"][0]["request_error"] = "TimeoutError"
        with self.assertRaises(ValueError):
            compare(result, improved)

    def test_actual_training_reward_parser(self):
        # Extract the actual parser and regex assignments, without importing torch/TRL.
        source = ast.parse(Path(__file__).with_name("grpo_trl.py").read_text())
        names = {"THINK_RE", "TOOL_RE", "ANSWER_RE"}
        nodes = [n for n in source.body if (isinstance(n, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id in names for t in n.targets)) or
            (isinstance(n, ast.FunctionDef) and n.name == "parse_completion")]
        namespace = {"re": re, "json": json}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "reward-parser", "exec"), namespace)
        self.assertTrue(namespace["parse_completion"](CALL)["call_ok"])
        self.assertFalse(namespace["parse_completion"](CALL.replace("tool_call", "tool_response"))["call_ok"])

    def test_python_sources_parse(self):
        for name in ["eval_model.py", "eval_adapter.py", "eval_common.py", "grpo_trl.py"]:
            ast.parse(Path(__file__).with_name(name).read_text())


if __name__ == "__main__":
    unittest.main()
