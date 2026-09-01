#!/usr/bin/env python3
"""
自建排队数据录制器（git-scraping 模式）

每次运行抓一次快照，双源互备：
  1. themeparks.wiki  — 上海迪士尼实体 ddc4357c-c148-4b36-9888-07894fe75e83
  2. queue-times.com  — park id 30（要求产品内标注 "Powered by Queue-Times.com"）

输出：data/waittimes/YYYY-MM-DD.jsonl，每行一条快照记录（source + 时间戳 + 原始响应）。
由 .github/workflows/record-waittimes.yml 定时调用并 commit 回仓库，
积累的 JSONL 同时用作：
  - 历史排队预测的训练数据
  - RL 沙箱 record & replay 的回放缓存

用法：
  python scripts/record_waittimes.py            # 抓一次快照并写文件
  python scripts/record_waittimes.py --dry-run  # 只打印不写文件
"""

import argparse
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SHDR_ENTITY = "ddc4357c-c148-4b36-9888-07894fe75e83"
SOURCES = {
    "themeparks_wiki": f"https://api.themeparks.wiki/v1/entity/{SHDR_ENTITY}/live",
    "queue_times": "https://queue-times.com/parks/30/queue_times.json",
}
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "waittimes"
RETRIES = 3
TIMEOUT_S = 20


def fetch(url: str) -> dict:
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "disney-park-intel-recorder/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - 网络异常统一重试
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch failed after {RETRIES} retries: {url}: {last_err}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    records = []
    errors = []

    for source, url in SOURCES.items():
        try:
            payload = fetch(url)
            records.append({
                "ts": now.isoformat(),
                "source": source,
                "ok": True,
                "data": payload,
            })
            print(f"[ok] {source}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            # 单源失败不阻塞另一源——双源互备的意义所在
            errors.append(source)
            records.append({
                "ts": now.isoformat(),
                "source": source,
                "ok": False,
                "error": str(e),
            })
            print(f"[fail] {source}: {e}", file=sys.stderr)

    if args.dry_run:
        print(json.dumps(records, ensure_ascii=False, indent=2)[:2000])
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUT_DIR / f"{now.date().isoformat()}.jsonl"
    with out_file.open("a", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote {len(records)} records -> {out_file}", file=sys.stderr)

    # 两个源都挂才算失败
    return 1 if len(errors) == len(SOURCES) else 0


if __name__ == "__main__":
    sys.exit(main())
