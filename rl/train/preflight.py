"""CPU-only training-data audit; no mutations, no model downloads."""
import argparse
import hashlib
import json
from pathlib import Path
from eval_common import parse_output
from reward_v2 import SCHEMAS, valid

def audit(rows):
    errors, seen = [], set()
    for i, row in enumerate(rows):
        prompt = row.get('prompt')
        if not isinstance(prompt, list) or len(prompt) != 2 or [m.get('role') for m in prompt] != ['system','user']:
            errors.append(f'{i}: expected system/user prompt only'); continue
        system, query = (m.get('content') for m in prompt)
        if not isinstance(system,str) or '<tool_call>' not in system or 'search_reviews' not in system:
            errors.append(f'{i}: incomplete system prompt')
        if not isinstance(query,str) or not query.strip(): errors.append(f'{i}: empty query')
        elif query.strip() in seen: errors.append(f'{i}: duplicate query')
        else: seen.add(query.strip())
        if row.get('category') == 'no_tool':
            if row.get('ref_tool_name'): errors.append(f'{i}: no_tool has a tool reference')
        else:
            name, args = row.get('ref_tool_name'), row.get('ref_tool_args')
            if name not in SCHEMAS or not valid(args,SCHEMAS[name]): errors.append(f'{i}: invalid reference tool/arguments')
    return errors

if __name__ == '__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('dataset')
    ap.add_argument('--eval-set',action='append',default=[])
    args=ap.parse_args()
    raw=Path(args.dataset).read_bytes()
    rows=[json.loads(x) for x in raw.decode().splitlines() if x.strip()]
    errors=audit(rows)
    if not rows: errors.append('empty dataset')
    queries={r['prompt'][-1]['content'].strip() for r in rows if isinstance(r.get('prompt'),list) and r['prompt'] and isinstance(r['prompt'][-1].get('content'),str)}
    for file in args.eval_set:
        for row in map(json.loads,filter(str.strip,Path(file).read_text().splitlines())):
            if row.get('query','').strip() in queries: errors.append(f'evaluation overlap: {file}, {row.get("id", "unknown")}')
    print(json.dumps(dict(rows=len(rows),sha256=hashlib.sha256(raw).hexdigest(),errors=errors),ensure_ascii=False,indent=2))
    raise SystemExit(bool(errors))
