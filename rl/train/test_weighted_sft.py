import copy
import unittest
import torch
from convert_sft import convert_samples
from sft_data import split_families, encode_sample, seed_family
from weighted_sft import weighted_causal_loss, WeightedCollator, curriculum_weights


class TinyTokenizer:
    def apply_chat_template(self, messages, tokenize=True, add_generation_prompt=False):
        text = "".join(f"[{m['role']}]" + m['content'] + "[end]" for m in messages)
        if add_generation_prompt:
            text += "[assistant]"
        return list(text.encode())


def row(task="a", weight=0.6):
    return dict(taskId=task, weight=weight, category="explicit_wait", difficulty="easy", messages=[
        dict(role="system", content="protocol"), dict(role="user", content="question " + seed_family(task)),
        dict(role="assistant", content='<think>查</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>'),
        dict(role="user", content='<tool_response>{"ok":true,"result":{"waitMinutes":75}}</tool_response>'),
        dict(role="assistant", content='<think>答</think><answer>等待约75分钟。</answer>'),
    ])


class WeightedSftTests(unittest.TestCase):
    def test_export_keeps_weight_and_family(self):
        out = convert_samples([row()])[0]
        self.assertEqual(out["weight"], 0.6)
        self.assertEqual(out["taskId"], "a")
        self.assertEqual(out["difficulty"], "easy")

    def test_group_split_keeps_augments_together(self):
        rows = convert_samples([row("a"), row("a-v1"), row("a-v2"), row("b"), row("c")])
        a, b = split_families(rows, fraction=0.5)
        self.assertFalse({seed_family(r["taskId"]) for r in a} & {seed_family(r["taskId"]) for r in b})
        self.assertEqual(len(a) + len(b), 5)

    def test_exact_query_leakage_rejected(self):
        rows = convert_samples([row("a"), row("b")])
        rows[1]["conversations"][1]["value"] = rows[0]["conversations"][1]["value"]
        with self.assertRaisesRegex(ValueError, "crosses"):
            split_families(rows)

    def test_assistant_only_and_no_truncation(self):
        original = row()
        sample = encode_sample(convert_samples([original])[0], TinyTokenizer(), 4000)
        learned = bytes(i for i in sample["labels"] if i != -100).decode()
        self.assertIn("<tool_call>", learned)
        self.assertIn("<answer>", learned)
        self.assertNotIn("<tool_response>", learned)
        self.assertNotIn("protocol", learned)
        self.assertNotIn("question", learned)
        with self.assertRaisesRegex(ValueError, "truncation"):
            encode_sample(convert_samples([original])[0], TinyTokenizer(), 2)

    def test_fake_tool_response_not_learned(self):
        r = row()
        r["messages"][2]["content"] = '<think>x</think><tool_response>{}</tool_response>'
        with self.assertRaisesRegex(ValueError, "protocol"):
            encode_sample(convert_samples([r])[0], TinyTokenizer(), 4000)

    def test_batch_one_weight_changes_gradient(self):
        logits = torch.zeros(1, 3, 4, requires_grad=True)
        labels = torch.tensor([[-100, 1, 2]])
        first = weighted_causal_loss(logits, labels, torch.tensor([1.0]), 0.8)
        g1 = torch.autograd.grad(first, logits, retain_graph=True)[0]
        second = weighted_causal_loss(logits, labels, torch.tensor([0.6]), 0.8)
        g2 = torch.autograd.grad(second, logits)[0]
        torch.testing.assert_close(g2, 0.6 * g1)

    def test_accumulation_matches_full_batch(self):
        logits = torch.randn(2, 4, 5, requires_grad=True)
        labels = torch.tensor([[-100, 1, -100, 2], [-100, 2, 3, 4]])
        weights = torch.tensor([1.0, 0.6])
        together = weighted_causal_loss(logits, labels, weights, 0.8)
        accumulated = sum(weighted_causal_loss(logits[i:i+1], labels[i:i+1], weights[i:i+1], 0.8) for i in range(2)) / 2
        torch.testing.assert_close(together, accumulated)
        gradient = torch.autograd.grad(together, logits)[0]
        self.assertEqual(float(gradient[0, 1].abs().sum()), 0)  # next target is masked

    def test_collator_keeps_padding_masked(self):
        a = encode_sample(convert_samples([row()])[0], TinyTokenizer(), 4000)
        b = copy.deepcopy(a)
        for k in ("input_ids", "attention_mask", "labels"):
            b[k] = b[k][:-2]
        batch = WeightedCollator(0)([a, b])
        self.assertEqual(batch["labels"][1, -1].item(), -100)
        self.assertEqual(batch["attention_mask"][1, -1].item(), 0)

    def test_curriculum_is_effective_and_monotonic(self):
        w = torch.tensor([1.0, 0.6, 0.6])
        difficulty = torch.tensor([0, 0, 2])
        early, p1 = curriculum_weights(w, difficulty, 0.0)
        mid, p2 = curriculum_weights(w, difficulty, 0.2)
        late, p3 = curriculum_weights(w, difficulty, 0.6)
        self.assertEqual((p1, p2, p3), ("early", "mid", "late"))
        torch.testing.assert_close(early, torch.tensor([1.0, 0.3, 0.075]))
        self.assertTrue(torch.all(early <= mid) and torch.all(mid <= late))
        torch.testing.assert_close(late, w)

if __name__ == "__main__":
    unittest.main()
