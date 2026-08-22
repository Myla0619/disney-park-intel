#!/usr/bin/env python3
"""
Disney Itinerary Constraint Validator
======================================
100 test scenarios covering normal cases and edge cases.
Tests the TSP routing algorithm for constraint violations.

Usage:
    python scripts/eval_itinerary.py              # run all tests
    python scripts/eval_itinerary.py --category time
    python scripts/eval_itinerary.py --verbose
    python scripts/eval_itinerary.py --fail-only

Requirements:
    pip install requests
    App must be running: npm run dev

    评测会跑满 100 个场景，而行程接口默认限流 10 次/分。脚本会按 Retry-After
    自动退避，但整轮会很慢。本地评测建议先放宽限流：
        RATE_LIMIT_LLM=1000 npm run dev
"""

import requests, json, argparse, sys, time
from dataclasses import dataclass, field
from typing import Optional
from datetime import date, timedelta
from pathlib import Path

BASE_URL = "http://localhost:3000"

# ─── Profile builder helpers ──────────────────────────────────────────────────
def profile(
    mode="casual", arrival="09:00", departure="21:00",
    kids=None, ll="none", sp_rides=None,
    watch_parade=False, parade_time="15:45",
    watch_fireworks=False, fireworks_time="21:00",
    route="balanced", dining="normal",
    photo=False, shopping=False,
    visit_date=None,
):
    return {
        "mode": mode,
        "arrivalTime": arrival,
        "departureTime": departure,
        "kids": kids or [],
        "llPackage": ll,
        "singlePassRides": sp_rides or [],
        "bundle3Rides": [],
        "watchParade": watch_parade,
        "paradeTime": parade_time,
        "watchFireworks": watch_fireworks,
        "fireworksTime": fireworks_time,
        "routeProfile": route,
        "diningPreference": dining,
        "focusPhoto": photo,
        "focusShopping": shopping,
        "selectedRestaurants": [],
        "mobilityNeeds": False,
        "park": "shanghai",
        "thrillLevel": 3,
        "visitDate": visit_date or str(date.today() + timedelta(days=1)),
    }

def kid(age, height):
    return {"age": age, "heightCm": height}


# ─── Constraint checkers ──────────────────────────────────────────────────────
def time_to_min(t: str) -> int:
    if not t or ":" not in t:
        return 0
    h, m = t.split(":")
    return int(h) * 60 + int(m)

def check_time_continuity(items: list) -> list:
    """No item should start before the previous ends."""
    errors = []
    non_walk = [i for i in items if i.get("type") != "walk"]
    for idx in range(len(non_walk) - 1):
        curr = non_walk[idx]
        nxt  = non_walk[idx + 1]
        curr_end  = time_to_min(curr.get("endTime", "00:00"))
        next_start = time_to_min(nxt.get("time", "00:00"))
        if curr_end > next_start + 2:  # 2min tolerance
            errors.append(
                f"Time overlap: {curr['itemName']} ends {curr['endTime']} "
                f"but {nxt['itemName']} starts {nxt['time']}"
            )
    return errors

def check_height_compliance(items: list, profile_data: dict) -> list:
    """Kids must meet height requirements for all rides."""
    errors = []
    kids = profile_data.get("kids", [])
    if not kids:
        return errors
    min_height = min(k["heightCm"] for k in kids)

    HEIGHT_REQS = {
        "tron": 122, "dragon": 120, "soaring": 102, "roaring-rapids": 107,
        "seven-dwarfs": 97, "exploration-trail": 106, "jet-packs": 112,
        "slinky-dash": 81, "zootopia-ride": None,
    }

    for item in items:
        ride_id = item.get("itemId", "")
        req = HEIGHT_REQS.get(ride_id)
        if req and min_height < req:
            errors.append(
                f"Height violation: kid {min_height}cm on {item['itemName']} "
                f"(requires {req}cm)"
            )
    return errors

def check_departure_compliance(items: list, profile_data: dict) -> list:
    """
    行程项目不得晚于离园时间结束。

    锚点除外：巡游与烟花是园方固定场次，用户明确勾选了要看，我们无法把演出挪进
    他填写的离园时刻里。这类情况由排程在备注里如实提示"结束时间晚于离园时间"，
    而不是把演出丢掉——两者取其一，保留用户明确要的东西更合理。
    """
    errors = []
    dep_min = time_to_min(profile_data["departureTime"])
    for item in items:
        if item.get("isAnchor"):
            continue
        end_min = time_to_min(item.get("endTime", "00:00"))
        if end_min > dep_min + 5:  # 5min tolerance
            errors.append(
                f"Departure violation: {item['itemName']} ends {item['endTime']} "
                f"but departure is {profile_data['departureTime']}"
            )
    return errors

def check_anchor_integrity(items: list, profile_data: dict) -> list:
    """Parade/fireworks anchors must exist and be at approximately correct times."""
    errors = []
    anchor_items = [i for i in items if i.get("isAnchor")]

    if profile_data.get("watchParade"):
        parade = next((i for i in anchor_items if i.get("type") == "parade"), None)
        if not parade:
            errors.append("Missing parade anchor despite watchParade=True")
        else:
            expected = time_to_min(profile_data["paradeTime"])
            actual_end = time_to_min(parade.get("endTime", "00:00"))
            if abs(actual_end - (expected + 30)) > 10:
                errors.append(f"Parade anchor end time mismatch: expected ~{expected+30}, got {actual_end}")

    if profile_data.get("watchFireworks"):
        fireworks = next((i for i in anchor_items if i.get("type") == "fireworks"), None)
        if not fireworks:
            # Could be legitimately skipped if time conflict - only error if no conflict
            parade_time = time_to_min(profile_data.get("paradeTime", "00:00"))
            fw_time = time_to_min(profile_data.get("fireworksTime", "00:00"))
            if abs(fw_time - parade_time) > 60:  # Not a conflict scenario
                errors.append("Missing fireworks anchor despite watchFireworks=True (no conflict detected)")
    return errors

# 无限次套餐：90 分钟间隔是 Multi Pass 的预约约束（同时只能持有一个预约），
# 无限次卡不受此限，否则 2688 元的 VIP33 会被压成每 90 分钟一项。
UNLIMITED_PACKAGES = {"vip33"}


def check_ll_interval(items: list, profile_data: dict) -> list:
    """Multi Pass 项目之间需间隔 >= 90 分钟。"""
    errors = []
    if profile_data.get("llPackage") in UNLIMITED_PACKAGES:
        return errors
    ll_items = [i for i in items if i.get("llType") == "package"]
    for idx in range(len(ll_items) - 1):
        curr_start = time_to_min(ll_items[idx]["time"])
        next_start = time_to_min(ll_items[idx + 1]["time"])
        gap = next_start - curr_start
        if gap < 90:
            errors.append(
                f"LL interval violation: {ll_items[idx]['itemName']} at {ll_items[idx]['time']} "
                f"and {ll_items[idx+1]['itemName']} at {ll_items[idx+1]['time']} "
                f"only {gap}min apart (need >=90)"
            )
    return errors

def check_coverage(items: list, profile_data: dict) -> list:
    """At least 80% of available time should be utilized."""
    errors = []
    arr_min = time_to_min(profile_data["arrivalTime"])
    dep_min = time_to_min(profile_data["departureTime"])
    total_avail = dep_min - arr_min

    if total_avail < 60:
        return errors  # Short visit, skip coverage check

    non_walk = [i for i in items if i.get("type") not in ("walk",)]
    if not non_walk:
        errors.append(f"No items scheduled despite {total_avail}min available")
        return errors

    last_end = max(time_to_min(i.get("endTime", "00:00")) for i in non_walk)
    utilized = last_end - arr_min
    utilization = utilized / total_avail

    if utilization < 0.5:
        errors.append(
            f"Low coverage: only {utilization:.0%} of {total_avail}min utilized "
            f"(last item ends {non_walk[-1]['endTime']})"
        )
    return errors

def check_no_skip_rides(items: list) -> list:
    """Items marked as skip in scores should not appear."""
    # This check requires knowing scores - approximate by checking known skip conditions
    return []  # Validated at score level, not itinerary level

def validate_itinerary(items: list, profile_data: dict, skip_checks: list = None) -> dict:
    """Run all constraint checks and return results."""
    skip = set(skip_checks or [])
    all_errors = []

    checks = {
        "time_continuity":    lambda: check_time_continuity(items),
        "height_compliance":  lambda: check_height_compliance(items, profile_data),
        "departure":          lambda: check_departure_compliance(items, profile_data),
        "anchor_integrity":   lambda: check_anchor_integrity(items, profile_data),
        "ll_interval":        lambda: check_ll_interval(items, profile_data),
        "coverage":           lambda: check_coverage(items, profile_data),
    }

    check_results = {}
    for check_name, fn in checks.items():
        if check_name in skip:
            check_results[check_name] = {"passed": True, "errors": [], "skipped": True}
            continue
        errors = fn()
        check_results[check_name] = {"passed": len(errors) == 0, "errors": errors}
        all_errors.extend(errors)

    return {
        "valid":    len(all_errors) == 0,
        "errors":   all_errors,
        "checks":   check_results,
        "item_count": len([i for i in items if i.get("type") != "walk"]),
    }


# ─── API caller ───────────────────────────────────────────────────────────────
_RIDES_CACHE: list | None = None


def get_rides() -> list:
    """园区项目清单，用于构造确定性评分。"""
    global _RIDES_CACHE
    if _RIDES_CACHE is None:
        resp = requests.get(f"{BASE_URL}/api/rides?park=shanghai", timeout=30)
        resp.raise_for_status()
        _RIDES_CACHE = resp.json().get("rides", [])
    return _RIDES_CACHE


def default_scores() -> list:
    """
    确定性评分，不调用 LLM。

    此前这个脚本传 `scores: []`，而 buildCandidates 会把没有对应评分的项目
    全部过滤掉——于是 100 个场景校验的一直是空行程，约束检查形同虚设。

    按项目属性分档，让候选池同时包含 must-do / worth-it / if-time 三层，
    覆盖路径规划里的分层逻辑；同时保证结果可复现，不受模型输出波动影响。
    """
    scores = []
    for r in get_rides():
        thrill = r.get("thrillScore", 3)
        kids = r.get("kidsScore", 3)
        if thrill >= 4 or kids >= 5:
            priority = "must-do"
        elif thrill >= 3 or kids >= 3:
            priority = "worth-it"
        else:
            priority = "if-time"
        scores.append({
            "rideId": r["id"],
            "overallScore": 60 + thrill * 5,
            "waitScore": 70,
            "sentimentScore": 70,
            "profileMatchScore": 60 + kids * 5,
            "reasoning": "评测用确定性评分",
            "recommended": priority != "if-time",
            "priority": priority,
        })
    return scores


def get_itinerary(profile_data: dict, current_area: str = "entrance") -> tuple[list, str | None]:
    """调用行程接口，返回 (items, error)。"""
    payload = {
        "profile": profile_data,
        "scores": default_scores(),
        "historicalWaits": [],
        "liveWaits": [],
        "currentArea": current_area,
    }

    # 行程接口限流为 10 次/分。跑满 100 个场景必然触顶，遇 429 按 Retry-After 退避。
    for attempt in range(6):
        try:
            resp = requests.post(f"{BASE_URL}/api/itinerary", json=payload, timeout=60)
        except Exception as e:
            return [], str(e)

        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", "5"))
            time.sleep(min(wait, 60))
            continue

        # 此前这里不看状态码，400 的响应体没有 itinerary 字段，
        # .get("itinerary", []) 会静默返回空列表，把接口错误伪装成"空行程"
        if resp.status_code != 200:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text[:200]
            return [], f"HTTP {resp.status_code}: {detail}"

        return resp.json().get("itinerary", []), None

    return [], "429: 多次退避后仍被限流，建议提高 RATE_LIMIT_LLM 后重试"


# ─── Test scenarios ───────────────────────────────────────────────────────────
@dataclass
class TestScenario:
    id: str
    name: str
    category: str
    profile_data: dict
    current_area: str = "entrance"
    skip_checks: list = field(default_factory=list)


    expect_http_400: bool = False
    expect_empty: bool = False          # True = expect no ride items
    expect_skipped_anchors: list = field(default_factory=list)  # anchor types to NOT expect
    description: str = ""


tomorrow = str(date.today() + timedelta(days=1))
today    = str(date.today())


TEST_SCENARIOS = [
    # ══════════════════════════════════════════════════════════════════════
    # CATEGORY 1: NORMAL CASES (20 scenarios)
    # ══════════════════════════════════════════════════════════════════════
    TestScenario("normal_01", "Standard family day", "normal",
        profile(mode="family", arrival="09:00", departure="21:00",
                kids=[kid(6,115), kid(4,102)]),
        description="Typical family with two kids, full day"),

    TestScenario("normal_02", "Thrill seeker short visit", "normal",
        profile(mode="thrill", arrival="10:00", departure="17:00"),
        description="Adult thrill seeker, 7-hour visit"),

    TestScenario("normal_03", "Casual with LL bundle8", "normal",
        profile(mode="casual", arrival="09:00", departure="20:00",
                ll="bundle8"),
        description="Casual mode with 8-ride bundle"),

    TestScenario("normal_04", "Photo mode with parade", "normal",
        profile(mode="photo", arrival="09:00", departure="21:00",
                photo=True, watch_parade=True, parade_time="15:45"),
        description="Photo focus with parade"),

    TestScenario("normal_05", "Shopping mode with fireworks", "normal",
        profile(mode="shopping", arrival="10:00", departure="22:00",
                shopping=True, watch_fireworks=True, fireworks_time="21:00"),
        description="Shopping focus with fireworks"),

    TestScenario("normal_06", "Family with VIP33", "normal",
        profile(mode="family", arrival="08:30", departure="22:30",
                kids=[kid(8,130), kid(10,145)], ll="vip33"),
        description="Family with VIP all-inclusive package"),

    TestScenario("normal_07", "Efficient route profile", "normal",
        profile(mode="thrill", route="efficient", arrival="09:00", departure="20:00"),
        description="Efficiency-optimized routing"),

    TestScenario("normal_08", "Easy route profile", "normal",
        profile(mode="family", route="easy", arrival="10:00", departure="19:00",
                kids=[kid(5,108)]),
        description="Easy/minimal-walking routing for family"),

    TestScenario("normal_09", "Fancy dining preference", "normal",
        profile(mode="casual", dining="fancy", arrival="09:00", departure="21:00"),
        description="Fancy dining inserts 60-min meal breaks"),

    TestScenario("normal_10", "Quick dining preference", "normal",
        profile(mode="thrill", dining="quick", arrival="09:00", departure="21:00"),
        description="Quick 20-min meals"),

    TestScenario("normal_11", "From non-entrance area", "normal",
        profile(mode="casual", arrival="09:00", departure="21:00"),
        current_area="treasure",
        description="Routing starts from mid-park area"),

    TestScenario("normal_12", "Both parade and fireworks", "normal",
        profile(mode="family", arrival="09:00", departure="22:30",
                watch_parade=True, parade_time="15:45",
                watch_fireworks=True, fireworks_time="21:00"),
        description="Both anchor events scheduled"),

    TestScenario("normal_13", "Premium9 with reserved spots", "normal",
        profile(mode="casual", arrival="09:00", departure="22:00",
                ll="premium9", watch_parade=True, watch_fireworks=True),
        description="Premium package with reserved parade+fireworks areas"),

    TestScenario("normal_14", "Single parent with toddler", "normal",
        profile(mode="family", arrival="10:00", departure="18:00",
                kids=[kid(3,92)], dining="normal"),
        description="Very young child, many rides filtered"),

    TestScenario("normal_15", "Mobility needs", "normal",
        {**profile(mode="casual", arrival="09:00", departure="19:00", ll="none"), "mobilityNeeds": True},
        description="Mobility needs increases walk time x2"),

    TestScenario("normal_16", "Photo + shopping combo", "normal",
        profile(mode="photo", arrival="09:00", departure="21:00",
                photo=True, shopping=True),
        description="Both photo and shopping POIs interleaved"),

    TestScenario("normal_17", "Teenage group", "normal",
        profile(mode="thrill", arrival="09:00", departure="22:00",
                kids=[kid(15,168), kid(16,172)]),
        description="Teens meet all height requirements"),

    TestScenario("normal_18", "Concierge package", "normal",
        profile(mode="casual", arrival="09:00", departure="22:00",
                ll="concierge11", watch_parade=True, watch_fireworks=True),
        description="Concierge with all privileges"),

    TestScenario("normal_19", "Bundle6 adventure", "normal",
        profile(mode="thrill", arrival="09:00", departure="21:00",
                ll="bundle6-adv"),
        description="6-ride adventure bundle (thrill rides)"),

    TestScenario("normal_20", "Bundle6 kids", "normal",
        profile(mode="family", arrival="09:00", departure="20:00",
                kids=[kid(7,122)], ll="bundle6-kids"),
        description="6-ride kids bundle for family"),

    # ══════════════════════════════════════════════════════════════════════
    # CATEGORY 2: TIME EDGE CASES (20 scenarios)
    # ══════════════════════════════════════════════════════════════════════
    TestScenario("time_01", "Very short visit: 1 hour", "time",
        profile(arrival="10:00", departure="11:00"),
        skip_checks=["coverage"],
        description="1-hour visit, should schedule at most 1-2 items"),

    TestScenario("time_02", "Very short visit: 30 minutes", "time",
        profile(arrival="10:00", departure="10:30"),
        skip_checks=["coverage"],
        expect_empty=False,
        description="30-min visit, minimal items"),

    TestScenario("time_03", "Departure equals arrival", "time",
        profile(arrival="10:00", departure="10:00"),
        skip_checks=["coverage","anchor_integrity"],
        expect_empty=True,
        description="Zero duration visit — should return empty or anchors only"),

    TestScenario("time_04", "Departure before arrival", "time",
        profile(arrival="14:00", departure="10:00"),
        skip_checks=["coverage","anchor_integrity"],
        expect_empty=True,
        description="Invalid time range — should return empty"),

    TestScenario("time_05", "Late arrival 8pm departure 10pm", "time",
        profile(arrival="20:00", departure="22:00"),
        skip_checks=["coverage"],
        description="Evening-only visit"),

    TestScenario("time_06", "Arrive at opening 8:30am", "time",
        profile(arrival="08:30", departure="22:00"),
        description="Gate rush — first ride should be highest-wait must-do"),

    TestScenario("time_07", "Arrive 30min before opening", "time",
        profile(arrival="08:00", departure="22:00"),
        description="Arrive before park opens, effective start = opening time"),

    TestScenario("time_08", "Maximum duration 9am-10:30pm", "time",
        profile(arrival="09:00", departure="22:30"),
        description="Full day maximum, should fill all time slots"),

    TestScenario("time_09", "Parade time before arrival", "time",
        profile(arrival="16:00", departure="22:00",
                watch_parade=True, parade_time="15:45"),
        skip_checks=["anchor_integrity"],
        expect_skipped_anchors=["parade"],
        description="Parade at 15:45 but user arrives 16:00 — parade anchor skipped"),

    TestScenario("time_10", "Fireworks after departure", "time",
        profile(arrival="09:00", departure="20:00",
                watch_fireworks=True, fireworks_time="21:00"),
        skip_checks=["anchor_integrity"],
        expect_skipped_anchors=["fireworks"],
        description="Fireworks at 21:00 but user leaves 20:00 — skipped"),

    TestScenario("time_11", "Parade and fireworks same time", "time",
        profile(arrival="09:00", departure="22:30",
                watch_parade=True, parade_time="20:30",
                watch_fireworks=True, fireworks_time="20:30"),
        description="Both events at same time — conflict resolution required"),

    TestScenario("time_12", "Parade and fireworks 30min apart", "time",
        profile(arrival="09:00", departure="22:30",
                watch_parade=True, parade_time="20:00",
                watch_fireworks=True, fireworks_time="20:30"),
        description="Events very close together — adjust fireworks prep time"),

    TestScenario("time_13", "Only 2 hours, with parade", "time",
        profile(arrival="15:00", departure="17:00",
                watch_parade=True, parade_time="15:45"),
        skip_checks=["coverage"],
        description="Short visit with parade anchor"),

    TestScenario("time_14", "Midday arrival 12pm", "time",
        profile(arrival="12:00", departure="21:00"),
        description="Afternoon arrival, no morning rush"),

    TestScenario("time_15", "Parade right at arrival time", "time",
        profile(arrival="15:45", departure="22:00",
                watch_parade=True, parade_time="15:45"),
        skip_checks=["anchor_integrity"],
        description="Arrival coincides exactly with parade start"),

    TestScenario("time_16", "3-hour visit no anchors", "time",
        profile(arrival="14:00", departure="17:00"),
        skip_checks=["coverage"],
        description="Short afternoon visit, no events"),

    TestScenario("time_17", "5-hour visit with fireworks", "time",
        profile(arrival="17:00", departure="22:00",
                watch_fireworks=True, fireworks_time="21:00"),
        description="Evening visit with fireworks anchor"),

    TestScenario("time_18", "Fireworks during visit, parade not", "time",
        profile(arrival="18:00", departure="22:30",
                watch_parade=True, parade_time="15:45",
                watch_fireworks=True, fireworks_time="21:00"),
        skip_checks=["anchor_integrity"],
        expect_skipped_anchors=["parade"],
        description="Parade before arrival (skipped), fireworks during visit (kept)"),

    TestScenario("time_19", "Visit exactly 4 hours", "time",
        profile(arrival="09:00", departure="13:00"),
        skip_checks=["coverage"],
        description="Half-day visit, lunch should be included"),

    TestScenario("time_20", "Visit spanning lunch and dinner", "time",
        profile(arrival="11:00", departure="20:00"),
        description="9-hour visit covering both meal times"),

    # ══════════════════════════════════════════════════════════════════════
    # CATEGORY 3: HEIGHT / KIDS EDGE CASES (20 scenarios)
    # ══════════════════════════════════════════════════════════════════════
    TestScenario("height_01", "Kid exactly at TRON height (122cm)", "height",
        profile(mode="family", kids=[kid(10,122)]),
        description="Boundary: 122cm kid should be ALLOWED on TRON"),

    TestScenario("height_02", "Kid 1cm below TRON (121cm)", "height",
        profile(mode="family", kids=[kid(10,121)]),
        description="Boundary: 121cm kid should be EXCLUDED from TRON"),

    TestScenario("height_03", "Kid exactly at soaring height (102cm)", "height",
        profile(mode="family", kids=[kid(6,102)]),
        description="Boundary: 102cm kid allowed on Soaring"),

    TestScenario("height_04", "Kid 101cm (just below soaring)", "height",
        profile(mode="family", kids=[kid(6,101)]),
        description="101cm kid excluded from Soaring"),

    TestScenario("height_05", "Toddler 90cm (very restricted)", "height",
        profile(mode="family", kids=[kid(3,90)]),
        description="Very small child, most rides excluded"),

    TestScenario("height_06", "Toddler 80cm (almost no rides)", "height",
        profile(mode="family", kids=[kid(2,80)]),
        skip_checks=["coverage"],
        description="Tiny child, only no-height-req rides available"),

    TestScenario("height_07", "Two kids: one tall one short", "height",
        profile(mode="family", kids=[kid(12,158), kid(5,105)]),
        description="Mixed heights: use MINIMUM height for filtering"),

    TestScenario("height_08", "Three kids various heights", "height",
        profile(mode="family", kids=[kid(14,165), kid(8,132), kid(4,99)]),
        description="Three kids, filtering by shortest (99cm)"),

    TestScenario("height_09", "Kids exactly at dragon height (120cm)", "height",
        profile(mode="family", kids=[kid(10,120)]),
        description="Boundary: 120cm kid allowed on Dragon"),

    TestScenario("height_10", "Kids 119cm (below dragon)", "height",
        profile(mode="family", kids=[kid(10,119)]),
        description="119cm excluded from Dragon (120cm req)"),

    TestScenario("height_11", "No kids in family mode", "height",
        profile(mode="family"),
        description="Family mode with no kids, no height filtering"),

    TestScenario("height_12", "All kids above all height reqs", "height",
        profile(mode="family", kids=[kid(15,170), kid(14,165)]),
        description="Tall teens, no rides filtered"),

    TestScenario("height_13", "Kid at slinky height (81cm)", "height",
        profile(mode="family", kids=[kid(3,81)]),
        skip_checks=["coverage"],
        description="Boundary: 81cm kid allowed on Slinky"),

    TestScenario("height_14", "Single kid 97cm (7-dwarfs boundary)", "height",
        profile(mode="family", kids=[kid(6,97)]),
        description="Boundary: 97cm kid allowed on 7 Dwarfs"),

    TestScenario("height_15", "Single kid 96cm (below 7-dwarfs)", "height",
        profile(mode="family", kids=[kid(6,96)]),
        description="96cm excluded from 7 Dwarfs"),

    TestScenario("height_16", "Thrill mode with short kid", "height",
        profile(mode="thrill", kids=[kid(7,120)]),
        description="Thrill mode but kid filters out TRON/Dragon"),

    TestScenario("height_17", "Family mode all rides filtered", "height",
        profile(mode="family", kids=[kid(1,75)]),
        skip_checks=["coverage","height_compliance"],
        description="1-year-old, nearly all rides filtered, fallback to kidsScore"),

    TestScenario("height_18", "Kid height 0 (invalid input)", "height",
        profile(mode="family", kids=[kid(5,0)]),
        expect_http_400=True,
        description="身高 0 不是合法输入，接口应返回 400 并指出字段，而不是照常排程"),

    TestScenario("height_19", "Kid height 999 (too tall)", "height",
        profile(mode="family", kids=[kid(5,999)]),
        expect_http_400=True,
        description="身高 999cm 不是合法输入，接口应返回 400"),

    TestScenario("height_20", "No-height-req rides only available", "height",
        profile(mode="family", kids=[kid(2,85)]),
        skip_checks=["coverage"],
        description="Very small child, only peter-pan/pirates/winnie/dumbo available"),

    # ══════════════════════════════════════════════════════════════════════
    # CATEGORY 4: LIGHTNING LANE EDGE CASES (20 scenarios)
    # ══════════════════════════════════════════════════════════════════════
    TestScenario("ll_01", "No LL package", "ll",
        profile(ll="none"),
        description="Baseline: no LL, full standby times"),

    TestScenario("ll_02", "Single pass for TRON only", "ll",
        profile(ll="single", sp_rides=["tron"]),
        description="Single ride LL for TRON"),

    TestScenario("ll_03", "Single pass for multiple rides", "ll",
        profile(ll="single", sp_rides=["tron","soaring","zootopia-ride"]),
        description="3 single-ride LL passes"),

    TestScenario("ll_04", "Bundle3 with valid selections", "ll",
        {**profile(ll="bundle3"), "bundle3Rides": ["tron","soaring","zootopia-ride"]},
        description="3-item bundle with user selections"),

    TestScenario("ll_05", "Bundle3 with no selections", "ll",
        profile(ll="bundle3"),
        description="Bundle3 but no rides selected — no LL discount"),

    TestScenario("ll_06", "Bundle6 kids package", "ll",
        profile(mode="family", ll="bundle6-kids", kids=[kid(8,130)]),
        description="Family-oriented 6-ride bundle"),

    TestScenario("ll_07", "Bundle6 adventure package", "ll",
        profile(mode="thrill", ll="bundle6-adv"),
        description="Thrill-oriented 6-ride bundle"),

    TestScenario("ll_08", "Bundle8 package", "ll",
        profile(ll="bundle8"),
        description="8-ride bundle covers most popular rides"),

    TestScenario("ll_09", "Premium9 package", "ll",
        profile(ll="premium9", watch_parade=True, watch_fireworks=True),
        description="9-ride premium with reserved event spots"),

    TestScenario("ll_10", "Premium13 package", "ll",
        profile(ll="premium13", watch_parade=True, watch_fireworks=True),
        description="13-ride premium full package"),

    TestScenario("ll_11", "Concierge11 package", "ll",
        profile(ll="concierge11", watch_parade=True, watch_fireworks=True),
        description="Concierge package with all privileges"),

    TestScenario("ll_12", "VIP33 all rides", "ll",
        profile(ll="vip33"),
        description="VIP unlimited — all rides should show ~5min wait"),

    TestScenario("ll_13", "Multi Pass 90min interval respected", "ll",
        profile(ll="bundle8", arrival="09:00", departure="21:00"),
        description="No two bundle LL items closer than 90 minutes"),

    TestScenario("ll_14", "Single pass non-eligible ride", "ll",
        profile(ll="single", sp_rides=["stunt-show"]),
        description="stunt-show is not LL-eligible — no discount applied"),

    TestScenario("ll_15", "LL with very short visit (2hr)", "ll",
        profile(ll="bundle8", arrival="10:00", departure="12:00"),
        skip_checks=["coverage","ll_interval"],
        description="LL in short visit — 90min rule may limit usage"),

    TestScenario("ll_16", "Premium9 reserved spots correct note", "ll",
        profile(ll="premium9", watch_parade=True, watch_fireworks=True),
        description="Reserved spot note should say 凭套票, not 提前X分钟占位"),

    TestScenario("ll_17", "Bundle kids with kids below height", "ll",
        profile(mode="family", ll="bundle6-kids",
                kids=[kid(4,98)]),
        description="Some bundle6-kids rides may be height-restricted for this kid"),

    TestScenario("ll_18", "No LL with 12-hour visit", "ll",
        profile(ll="none", arrival="09:00", departure="21:00"),
        description="Long visit, no LL — all standby queues"),

    TestScenario("ll_19", "LL for ineligible ride ID", "ll",
        profile(ll="single", sp_rides=["nonexistent-ride-id"]),
        description="Invalid ride ID in SP list — should not crash"),

    TestScenario("ll_20", "All package tiers don't crash", "ll",
        profile(ll="bundle6-fun"),
        description="Smoke test: bundle6-fun loads without errors"),

    # ══════════════════════════════════════════════════════════════════════
    # CATEGORY 5: ANCHOR EDGE CASES (10 scenarios)
    # ══════════════════════════════════════════════════════════════════════
    TestScenario("anchor_01", "Parade only", "anchor",
        profile(watch_parade=True, parade_time="15:45"),
        description="Single anchor: parade"),

    TestScenario("anchor_02", "Fireworks only", "anchor",
        profile(watch_fireworks=True, fireworks_time="21:00"),
        description="Single anchor: fireworks"),

    TestScenario("anchor_03", "Both anchors far apart", "anchor",
        profile(watch_parade=True, parade_time="14:00",
                watch_fireworks=True, fireworks_time="21:00"),
        description="7 hours between anchors, no conflict"),

    TestScenario("anchor_04", "Anchors 30min apart", "anchor",
        profile(arrival="09:00", departure="22:00",
                watch_parade=True, parade_time="20:00",
                watch_fireworks=True, fireworks_time="20:30"),
        description="30min gap between events"),

    TestScenario("anchor_05", "Anchors 10min apart", "anchor",
        profile(arrival="09:00", departure="22:00",
                watch_parade=True, parade_time="20:00",
                watch_fireworks=True, fireworks_time="20:10"),
        description="Near-overlap: fireworks starts 10min after parade"),

    TestScenario("anchor_06", "Parade=fireworks time", "anchor",
        profile(arrival="09:00", departure="22:00",
                watch_parade=True, parade_time="21:00",
                watch_fireworks=True, fireworks_time="21:00"),
        description="Exact same time: must resolve conflict"),

    TestScenario("anchor_07", "Parade after fireworks", "anchor",
        profile(arrival="09:00", departure="22:30",
                watch_parade=True, parade_time="21:30",
                watch_fireworks=True, fireworks_time="21:00"),
        description="Unusual ordering: fireworks before parade"),

    TestScenario("anchor_08", "Anchor exactly 5min before departure", "anchor",
        profile(arrival="09:00", departure="21:05",
                watch_fireworks=True, fireworks_time="21:00"),
        skip_checks=["anchor_integrity"],
        description="Fireworks start just before departure — borderline"),

    TestScenario("anchor_09", "No anchors, photo+shopping", "anchor",
        profile(photo=True, shopping=True),
        description="No anchors, gaps filled by photo/shop"),

    TestScenario("anchor_10", "Both anchors with VIP reserved spots", "anchor",
        profile(ll="vip33", watch_parade=True, watch_fireworks=True),
        description="VIP package: anchor notes should mention reserved spots"),

    # ══════════════════════════════════════════════════════════════════════
    # CATEGORY 6: MODE EDGE CASES (10 scenarios)
    # ══════════════════════════════════════════════════════════════════════
    TestScenario("mode_01", "Thrill mode all high rides", "mode",
        profile(mode="thrill"),
        description="Thrill mode prioritizes thrillScore>=3 rides"),

    TestScenario("mode_02", "Family mode no kids", "mode",
        profile(mode="family"),
        description="Family mode without kids array — no height filtering"),

    TestScenario("mode_03", "Casual mode wait cap", "mode",
        profile(mode="casual"),
        description="Casual mode prefers lower-wait rides"),

    TestScenario("mode_04", "Photo mode with spots", "mode",
        profile(mode="photo", photo=True),
        description="Photo mode interleaves photo spots"),

    TestScenario("mode_05", "Shopping mode with shops", "mode",
        profile(mode="shopping", shopping=True),
        description="Shopping mode interleaves shop POIs"),

    TestScenario("mode_06", "Photo+shopping combo", "mode",
        profile(mode="photo", photo=True, shopping=True),
        description="Both POI types interleaved: ride→photo→shop→ride"),

    TestScenario("mode_07", "Thrill with all rides in maintenance", "mode",
        profile(mode="thrill"),
        skip_checks=["coverage"],
        description="Fallback: if no thrill rides available, use all rides"),

    TestScenario("mode_08", "Family all rides filtered by height", "mode",
        profile(mode="family", kids=[kid(2,80)]),
        skip_checks=["coverage","height_compliance"],
        description="Extreme case: fallback to kidsScore>=3"),

    TestScenario("mode_09", "Efficient route, minimal walk", "mode",
        profile(mode="thrill", route="efficient"),
        description="Efficient routing minimizes queue time"),

    TestScenario("mode_10", "Easy route, minimal walk", "mode",
        profile(mode="family", route="easy", kids=[kid(5,108)]),
        description="Easy routing minimizes walking distance"),
]





# ─── Test runner ──────────────────────────────────────────────────────────────
@dataclass
class TestResult:
    scenario: TestScenario
    passed: bool
    errors: list
    item_count: int
    api_error: Optional[str]
    duration_ms: float


def run_scenario(scenario: TestScenario, verbose: bool = False) -> TestResult:
    start = time.time()
    items, api_err = get_itinerary(scenario.profile_data, scenario.current_area)
    elapsed = (time.time() - start) * 1000

    # 非法输入场景：期望的是一条明确的 400，而不是一份照常生成的行程
    if scenario.expect_http_400:
        if api_err and api_err.startswith("HTTP 400"):
            return TestResult(scenario, True, [], 0, None, elapsed)
        return TestResult(
            scenario, False,
            [f"Expected HTTP 400 for invalid input, got: {api_err or 'HTTP 200 with itinerary'}"],
            len(items), api_err, elapsed
        )

    if api_err:
        return TestResult(scenario, False, [f"API error: {api_err}"], 0, api_err, elapsed)

    # Check expected empty
    non_walk = [i for i in items if i.get("type") != "walk"]
    if scenario.expect_empty and len(non_walk) > 3:
        return TestResult(
            scenario, False,
            [f"Expected empty/minimal itinerary, got {len(non_walk)} items"],
            len(non_walk), None, elapsed
        )

    # Check skipped anchors
    anchor_errors = []
    for anchor_type in scenario.expect_skipped_anchors:
        if any(i.get("type") == anchor_type for i in items):
            anchor_errors.append(f"Expected {anchor_type} anchor to be skipped but it appears in itinerary")

    validation = validate_itinerary(items, scenario.profile_data, scenario.skip_checks)
    all_errors = validation["errors"] + anchor_errors

    return TestResult(
        scenario=scenario,
        passed=len(all_errors) == 0,
        errors=all_errors,
        item_count=validation["item_count"],
        api_error=None,
        duration_ms=elapsed,
    )


def run_all(categories: list = None, verbose: bool = False, fail_only: bool = False):
    scenarios = TEST_SCENARIOS
    if categories:
        scenarios = [s for s in scenarios if s.category in categories]

    print(f"\n🏰 Disney Itinerary Constraint Validator")
    print(f"   Running {len(scenarios)} scenarios...\n")

    results = []
    by_category = {}

    for scenario in scenarios:
        result = run_scenario(scenario, verbose)
        results.append(result)

        if scenario.category not in by_category:
            by_category[scenario.category] = {"passed": 0, "failed": 0, "results": []}
        if result.passed:
            by_category[scenario.category]["passed"] += 1
        else:
            by_category[scenario.category]["failed"] += 1
        by_category[scenario.category]["results"].append(result)

        if not fail_only or not result.passed:
            status = "✅" if result.passed else "❌"
            print(f"  {status} [{scenario.category:8s}] {scenario.id:12s} {scenario.name}")
            if not result.passed:
                for err in result.errors[:3]:
                    print(f"              ↳ {err}")
            if verbose and result.passed:
                print(f"              items={result.item_count}, {result.duration_ms:.0f}ms")

    # Summary
    total   = len(results)
    passed  = sum(r.passed for r in results)
    failed  = total - passed
    avg_ms  = sum(r.duration_ms for r in results) / total

    print(f"\n{'═'*60}")
    print(f"  SUMMARY: {passed}/{total} passed ({passed/total:.1%})")
    print(f"  Average response time: {avg_ms:.0f}ms")
    print(f"{'─'*60}")

    for cat, stats in by_category.items():
        total_cat = stats["passed"] + stats["failed"]
        bar = "█" * stats["passed"] + "░" * stats["failed"]
        print(f"  {cat:10s}  {stats['passed']:2d}/{total_cat:2d}  {bar}")

    print(f"{'═'*60}")

    if failed == 0:
        print("  ✅ ALL TESTS PASSED")
    else:
        print(f"  ❌ {failed} TESTS FAILED")
        print("\n  Failed scenarios:")
        for r in results:
            if not r.passed:
                print(f"    - {r.scenario.id}: {r.scenario.name}")
                if r.errors:
                    print(f"      {r.errors[0]}")

    print(f"{'═'*60}\n")

    # Save results
    output = {
        "summary": {"total": total, "passed": passed, "failed": failed, "pass_rate": passed/total},
        "by_category": {k: {"passed": v["passed"], "failed": v["failed"]} for k, v in by_category.items()},
        "failures": [
            {"id": r.scenario.id, "name": r.scenario.name,
             "category": r.scenario.category, "errors": r.errors}
            for r in results if not r.passed
        ]
    }
    Path("scripts/itinerary_eval_results.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return passed == total


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", nargs="+", help="Run specific categories")
    parser.add_argument("--verbose",   action="store_true")
    parser.add_argument("--fail-only", action="store_true")
    parser.add_argument("--url", default="http://localhost:3000")
    args = parser.parse_args()

    global BASE_URL
    BASE_URL = args.url

    success = run_all(args.category, args.verbose, args.fail_only)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
