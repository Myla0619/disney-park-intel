"""Sequence-normalized weighted CE; no within-batch weight cancellation at batch=1."""
import torch
import torch.nn.functional as F


def curriculum_weights(weights, difficulty, progress):
    """Explicit heuristic schedule; validation always uses base weights, not this schedule."""
    if not 0 <= progress <= 1 or torch.any((difficulty < 0) | (difficulty > 2)):
        raise ValueError("Invalid curriculum progress/difficulty")
    if progress < 0.2:
        phase, exposure, borderline = "early", [1.0, 0.75, 0.25], 0.5
    elif progress < 0.6:
        phase, exposure, borderline = "mid", [1.0, 1.0, 0.6], 0.75
    else:
        phase, exposure, borderline = "late", [1.0, 1.0, 1.0], 1.0
    exposure = torch.tensor(exposure, dtype=weights.dtype, device=weights.device)[difficulty]
    quality = torch.where(weights < 1, borderline, 1.0)
    return weights * exposure * quality, phase


def weighted_causal_loss(logits, labels, weights, normalizer=1.0):
    target = labels[:, 1:].contiguous()
    pred = logits[:, :-1, :].contiguous()
    mask = target.ne(-100)
    counts = mask.sum(-1)
    if torch.any(counts == 0):
        raise ValueError("Every example must contain assistant targets")
    losses = F.cross_entropy(pred.reshape(-1, pred.shape[-1]), target.reshape(-1),
                             ignore_index=-100, reduction="none").view_as(target)
    weights = weights.to(device=logits.device, dtype=losses.dtype)
    if weights.shape != counts.shape or not torch.isfinite(weights).all() or torch.any(weights <= 0):
        raise ValueError("Invalid sample weights")
    if not 0 < normalizer <= 1:
        raise ValueError("Expected fixed training-dataset mean weight")
    per_sample = (losses * mask).sum(-1) / counts
    # A batch=1 normalization by sum(weights) would cancel the 0.6 weighting.
    # The fixed training mean also preserves relative contributions across accumulation.
    return (per_sample * weights / normalizer).mean()


class WeightedCollator:
    def __init__(self, pad_token_id):
        self.pad_token_id = pad_token_id

    def __call__(self, rows):
        width = max(len(r["input_ids"]) for r in rows)
        out = {}
        for key, pad in (("input_ids", self.pad_token_id), ("attention_mask", 0), ("labels", -100)):
            out[key] = torch.tensor([r[key] + [pad] * (width - len(r[key])) for r in rows], dtype=torch.long)
        out["sample_weight"] = torch.tensor([r["sample_weight"] for r in rows], dtype=torch.float32)
        out["difficulty_id"] = torch.tensor([r["difficulty_id"] for r in rows], dtype=torch.long)
        return out


def make_weighted_trainer_class():
    from transformers import Trainer

    class WeightedTrainer(Trainer):
        def __init__(self, *args, weight_normalizer=1.0, use_curriculum=False, **kwargs):
            super().__init__(*args, **kwargs)
            self.weight_normalizer = weight_normalizer
            self.model_accepts_loss_kwargs = False
            self.use_curriculum = use_curriculum

        def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
            batch = dict(inputs)
            weights = batch.pop("sample_weight")
            difficulty = batch.pop("difficulty_id")
            labels = batch.pop("labels")
            if model.training and self.use_curriculum:
                progress = min(1.0, self.state.global_step / max(1, self.state.max_steps))
                weights, _ = curriculum_weights(weights, difficulty, progress)
            outputs = model(**batch)
            loss = weighted_causal_loss(outputs.logits, labels, weights, self.weight_normalizer)
            return (loss, outputs) if return_outputs else loss
    return WeightedTrainer
