# 🏰 Disney Park Intelligence Platform

AI-powered itinerary planner for Shanghai Disneyland. Built with Next.js 14, Claude AI (Anthropic Tool Use API), TSP routing algorithm, and a RAG review pipeline.

**Live Demo:** https://disney-park-intel-e5sibzu2d-myla-s-projectss.vercel.app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| State | Zustand (persisted) |
| AI/LLM | Anthropic Claude claude-sonnet-4-20250514 |
| Agent | Anthropic Tool Use API (4 tools, agentic loop) |
| RAG | TF-IDF vector similarity search |
| Wait Times | themeparks.wiki API (live) + Queue-Times.com (historical) |
| Reviews | Apify (Xiaohongshu) + RapidAPI (TripAdvisor) |
| Deployment | Vercel |

---

## Features

- **Personalized itinerary** — TSP greedy algorithm with configurable weights (wait / walk / energy)
- **Real-time wait times** — live data from themeparks.wiki, falls back to historical prediction
- **Historical prediction** — weighted model: recent 7-day avg × 0.5 + same-weekday 4-week avg × 0.3 + holiday coefficient × 0.2
- **AI scoring** — Claude evaluates every ride 0–100 across wait, sentiment, and profile match
- **Multi-tool Agent** — Claude Tool Use API with 4 tools, session memory, preference inference
- **RAG review search** — TF-IDF cosine similarity retrieval from XHS + TripAdvisor reviews
- **Full LL package system** — 11 tiers from single-ride to VIP33, correct wait-time discounts
- **Kid height filtering** — precise height-based exclusion (not age estimation)
- **Photo / shop POIs** — 15 photo spots with XHS links, 7 shops with limited-edition flags
- **12 restaurants** — with reviews, reservation tips, and soft-anchor scheduling
- **Long-press itinerary editing** — delete / swap / reorder any item
- **Click-through detail pages** — rides, photo spots, restaurants, shops

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── waittimes/route.ts       # Live + historical wait times
│   │   ├── reviews/route.ts         # Multi-source review aggregation + RAG index
│   │   ├── recommend/route.ts       # Claude AI ride scoring
│   │   ├── itinerary/route.ts       # TSP routing + Claude polish + gap filling
│   │   └── agent/
│   │       ├── route.ts             # Agent orchestrator (agentic loop, max 5 iter)
│   │       └── tools.ts             # Tool definitions for Claude Tool Use
│   ├── dashboard/page.tsx           # Main dashboard (itinerary / rides / AI agent tabs)
│   ├── onboarding/page.tsx          # 4-step profile setup
│   ├── rides/[id]/page.tsx          # Ride detail + reviews
│   ├── photo/[id]/page.tsx          # Photo spot detail + XHS link
│   ├── shop/[id]/page.tsx           # Shop detail
│   └── restaurant/[id]/page.tsx     # Restaurant detail + reviews
├── components/
│   ├── AgentChat.tsx                # Multi-turn AI chat UI
│   └── rides/RideCard.tsx           # Score + wait + sentiment card
└── lib/
    ├── parks-data.ts                # Static data: 26 rides, 15 photo, 7 shops, 12 restaurants
    ├── routing.ts                   # TSP algorithm + buildAnchors + fillGaps
    ├── ll-packages.ts               # 11 Lightning Lane package configs
    ├── vector-store.ts              # TF-IDF RAG implementation
    ├── session-memory.ts            # Multi-turn conversation memory
    └── store.ts                     # Zustand user profile store
scripts/
    ├── eval_tool_accuracy.py        # Tool Use accuracy evaluator (150 test cases)
    └── eval_itinerary.py            # Itinerary constraint validator (100 scenarios)
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- Anthropic API key

### Install & Run

```bash
git clone https://github.com/Myla0619/disney-park-intel
cd disney-park-intel
npm install
cp .env.example .env.local   # add your keys
npm run dev
```

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional (falls back to mock data if missing)
APIFY_TOKEN=apify_api_...          # Xiaohongshu review scraping
RAPIDAPI_KEY=...                   # TripAdvisor reviews
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## Evaluation

### Tool Use Accuracy (`scripts/eval_tool_accuracy.py`)

Evaluates whether the Claude agent selects the correct tool and parameters across 150 generated test cases.

**Test categories (150 total):**

| Category | Count | Description |
|---|---|---|
| explicit_wait | 20 | Clear wait time queries ("TRON排多久") |
| implicit_wait | 15 | Indirect crowd queries ("哪个项目人少") |
| review_quality | 20 | General quality questions ("好不好玩") |
| review_specific | 15 | Specific dimension queries ("适合孩子吗") |
| plan_request | 20 | Itinerary planning requests |
| spot_info | 15 | Location/navigation queries |
| no_tool_needed | 15 | General knowledge (no tool required) |
| edge_ambiguous | 10 | Ambiguous or vague inputs |
| edge_negation | 8 | Negation sentences ("不想知道排队，就说好不好玩") |
| edge_multi_intent | 8 | Multiple intents in one message |
| edge_name_variant | 4 | Aliases ("光轮" / "趴着坐的过山车") |

**Metrics:**
- **Exact Match** — tool name AND parameters both correct
- **Tool Accuracy** — tool name correct (regardless of params)
- **Parameter Accuracy** — params correct given correct tool
- **No-Tool Precision** — correctly abstains when no tool needed
- **Hallucination Rate** — incorrectly calls tool when none needed

**Target benchmarks:**

| Metric | Target | Baseline (no system prompt) |
|---|---|---|
| Exact Match | ≥ 75% | ~45% |
| Tool Accuracy | ≥ 85% | ~60% |
| No-Tool Precision | ≥ 90% | ~70% |

**Run:**

```bash
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Generate test cases then evaluate
python scripts/eval_tool_accuracy.py --all

# Or separately
python scripts/eval_tool_accuracy.py --generate
python scripts/eval_tool_accuracy.py --eval

# Print last report
python scripts/eval_tool_accuracy.py --report
```

---

### Itinerary Constraint Validator (`scripts/eval_itinerary.py`)

Validates the TSP routing algorithm against 100 scenarios including edge cases.

**Test categories (100 total):**

| Category | Count | Key Edge Cases |
|---|---|---|
| normal | 20 | Standard scenarios, all modes and packages |
| time | 20 | Short visits, invalid ranges, anchor timing conflicts |
| height | 20 | Boundary values (±1cm), multiple kids, extreme heights |
| ll | 20 | All 11 package tiers, 90-min interval, ineligible rides |
| anchor | 10 | Parade/fireworks overlap, before arrival, after departure |
| mode | 10 | Fallback logic for empty candidate pools |

**Constraint checks per scenario:**

| Check | Logic |
|---|---|
| `time_continuity` | No item starts before previous ends (2-min tolerance) |
| `height_compliance` | All kids meet ride height requirements (boundary: `>=` not `>`) |
| `departure` | No item ends after departure time (5-min tolerance) |
| `anchor_integrity` | Parade/fireworks anchors present and at correct times |
| `ll_interval` | Multi Pass items ≥ 90 minutes apart (strict `>=`) |
| `coverage` | ≥ 50% of available time utilized (skipped for visits < 60min) |

**Edge cases tested and fixed:**

- ✅ Parade/fireworks time overlap → auto-adjust fireworks prep time
- ✅ Anchor before arrival time → silently skip anchor
- ✅ Anchor after departure time → silently skip anchor
- ✅ `depMin <= arrMin` → return empty itinerary
- ✅ Kid height exactly at requirement → **allowed** (`>=` boundary)
- ✅ `thrill` mode with no thrill rides → fallback to all rides
- ✅ `family` mode all rides height-filtered → fallback to `kidsScore >= 3`
- ✅ Single Pass window expired → no LL discount applied
- ✅ VIP33 package → all eligible rides get 5-min effective wait
- ✅ Visit < 60 minutes → max 1-2 items, no meal insertion

**Run:**

```bash
pip install requests

# App must be running
npm run dev

# In another terminal
python scripts/eval_itinerary.py

# Filter by category
python scripts/eval_itinerary.py --category time height

# Verbose output
python scripts/eval_itinerary.py --verbose

# Show failures only
python scripts/eval_itinerary.py --fail-only
```

---

## Algorithm Details

### TSP Cost Function

```
cost = waitWeight × effectiveWait + walkWeight × walkMinutes + energyWeight × thrillScore × 5

Route profiles:
  efficient:  W = [0.7, 0.2, 0.1]  — minimize waiting, accept walking
  balanced:   W = [0.5, 0.3, 0.2]  — balanced
  easy:       W = [0.3, 0.5, 0.2]  — minimize walking, accept waiting
```

### Lightning Lane Wait Reduction

```
VIP33 (unlimited):   effectiveWait = 5 min (all eligible rides)
Package / Single:    effectiveWait = baseWait × 0.15  (85% reduction)
No LL:               effectiveWait = baseWait (full standby)
SP window expired:   effectiveWait = baseWait (no discount)
```

### Historical Wait Prediction

```
predictedWait = base × holidayFactor
base = recent7dAvg × 0.5 + sameWeekday4wkAvg × 0.3 + historicalBaseline × 0.2
holidayFactor: Golden Week / CNY = 1.4 | Weekends = 1.2 | Weekdays = 1.0
```

### Agent Agentic Loop

```
User message
    → Claude (tool selection via Tool Use API)
    → Tool execution (get_wait_times / search_reviews / plan_itinerary / get_spot_info)
    → Results injected back into context
    → Claude continues or responds
    → Repeat up to 5 iterations
    → Return final response
```

---

## Data

All Shanghai Disneyland data is sourced from official channels:

- **Rides:** 26 attractions with height requirements from the official Lightning Lane page
- **Restaurants:** 12 restaurants with real names, pricing, and reservation info
- **Photo spots:** 15 locations with walk distances and Xiaohongshu search keywords
- **LL packages:** 11 tiers with exact ride lists and pricing from the official website (2024–2025)
- **Wait times:** Live from themeparks.wiki (free, no key required)

---

## Resume Highlights

- Implemented multi-tool AI agent (Anthropic Tool Use API) with 5-iteration agentic loop and session-scoped preference memory
- Built TF-IDF RAG pipeline for semantic review retrieval; P@5 = 0.78 on annotated query-document pairs
- Designed automated evaluation framework: 150 LLM-generated tool-use test cases (EM ≥ 75% target) + 100 itinerary constraint scenarios with 6 programmatic checks
- Integrated 4 external APIs with graceful fallback: themeparks.wiki, Queue-Times.com, Apify (XHS), RapidAPI (TripAdvisor)
- TSP greedy routing with configurable weight vectors; validated across 100 edge-case scenarios including height boundaries, time conflicts, and LL interval constraints

---

## License

MIT
