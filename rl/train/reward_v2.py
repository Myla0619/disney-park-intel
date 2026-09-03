"""First-step reward only; no fabricated execution/constraint/answer-success scores."""
import json
from pathlib import Path
from eval_common import parse_output

CONTRACT = json.loads(Path(__file__).with_name('tool-contract.json').read_text())
SCHEMAS = {t['name']: t['input_schema'] for t in CONTRACT['tools']}

def valid(value, schema):
    kind = schema.get('type')
    if kind == 'object':
        if not isinstance(value, dict): return False
        if any(k not in value for k in schema.get('required', [])): return False
        props = schema.get('properties', {})
        for key, item in value.items():
            if key not in props and schema.get('additionalProperties') is False: return False
            if key in props and not valid(item, props[key]): return False
    elif kind == 'array':
        if not isinstance(value, list) or len(value) < schema.get('minItems', 0): return False
        if 'items' in schema and not all(valid(x, schema['items']) for x in value): return False
    elif kind == 'string':
        if not isinstance(value, str) or not value.strip(): return False
        if 'pattern' in schema:
            import re
            if not re.search(schema['pattern'], value): return False
    elif kind == 'boolean':
        if type(value) is not bool: return False
    elif kind in ('number', 'integer'):
        import math
        if type(value) not in (int, float) or not math.isfinite(value): return False
        if kind == 'integer' and value != int(value): return False
        if value < schema.get('minimum', float('-inf')) or value > schema.get('maximum', float('inf')): return False
    return 'enum' not in schema or value in schema['enum']

def score_first_step(text, category, ref_answer, ref_tool_name, ref_tool_args):
    p = parse_output(text)
    if not p['format_ok']: return 0.0
    if category == 'no_tool':
        if not p['has_answer']: return 0.0
        # Nonempty answer gets format credit, not a claim of semantic correctness.
        return 0.2
    name, args = p['tool_name'], p['arguments']
    if name not in SCHEMAS or not valid(args, SCHEMAS[name]): return 0.0
    if not ref_tool_name or not isinstance(ref_tool_args, dict):
        raise ValueError('Tool tasks require audited reference tool and argument labels')
    if name != ref_tool_name: return 0.1
    if not ref_tool_args: return 0.5  # no argument evidence, never claim full correctness
    matched = sum(k in args and args[k] == v for k, v in ref_tool_args.items())
    return 0.5 + 0.5 * matched / len(ref_tool_args)
