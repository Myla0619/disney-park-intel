# Disney Park Intelligence

English | [中文](README.md)

**An AI day planner built for Shanghai Disneyland.**

It turns your arrival time, group heights, preferences, dining reservations, Premier Access, live queues, and walking distance into one itinerary you can actually follow inside the park.

[Try the live app](https://disney-park-intel.vercel.app)

> Stop piecing together a plan from scattered guides. Tell the app who is coming, what matters, and where you need to be at a fixed time—it will plan the rest of the day around you.

## From arrival to fireworks

### 1. Describe your day

Choose a family, thrill, relaxed, photo, or shopping-and-food experience, then add:

- Arrival and departure times
- Each child's age and height
- An efficient, balanced, or low-walking route
- Your Premier Access package
- Dining reservations, parade, and fireworks times
- Must-do attractions, photo stops, and shopping preferences

### 2. Get a schedule you can follow

The app places attractions, walks, meals, shows, photo stops, and shopping on a single timeline. Reservations and shows become fixed anchors. Everything else is arranged around them, while attractions that fail a height or time constraint are left out.

### 3. Adapt while you are in the park

The itinerary is not frozen after its first draft. You can:

- Replan around current wait times
- Ask, “I'm in Treasure Cove—where should I go next?”
- Find child-friendly attractions, photo times, or restaurants without reservations
- Press and hold an itinerary item to replace, move, or remove it
- Save attractions to a wishlist and route the day around them

## Core experience

| Situation | How the app helps |
|---|---|
| Spend less time in queues | Combines live waits, historical snapshots, and attraction duration |
| Avoid unnecessary walking | Calculates travel cost between consecutive locations |
| Visit with children | Filters attractions against every child's height |
| Keep existing bookings | Pins dining, parades, and fireworks to the timeline |
| Use Premier Access well | Understands individual passes and bundles and schedules them appropriately |
| Change plans on the fly | Uses natural language to query conditions and rebuild the itinerary |
| Handle weak connectivity | Caches previously visited core pages and falls back to local scoring |

## What you can ask the AI assistant

The in-app assistant can use wait-time, review-search, place-information, and itinerary tools instead of only returning chat text. For example:

```text
Which attraction has the shortest wait right now?
I'm in Treasure Cove. Where should I go next?
My daughter is five and 108cm tall. What can she ride?
Where and when should I take castle photos?
Replan my afternoon, but keep my 5:30pm dining reservation.
```

Tool activity is streamed in the interface, so recommendations are grounded in application data rather than an itinerary invented from a prompt alone.

## How recommendations are built

```text
group + preferences + time and reservations
                      ↓
          remove infeasible candidates
                      ↓
       live waits → forecast → baseline
                      ↓
   balance queues, walking, energy, and fit
                      ↓
       insert meals, shows, photos, shops
                      ↓
            produce a timed day plan
```

Deterministic rules handle time, height, Premier Access intervals, and reservation conflicts. AI interprets natural language, selects tools, and explains recommendations. If the AI provider is temporarily unavailable, local scoring and the core itinerary flow still work.

## Current coverage

- Shanghai Disneyland
- 24 attractions
- 11 restaurants
- 29 shops
- 44 photo locations
- 280 public trip notes covering 14 attractions
- 1,300+ versioned wait-time snapshots

Tokyo, Hong Kong, Paris, and the US resorts are not available yet.

## Data status and fallback behavior

| Capability | Primary source | If unavailable |
|---|---|---|
| Live waits | themeparks.wiki | Use a static baseline and mark it as a fallback |
| Wait forecast | Historical wait snapshots | Extrapolate from the current snapshot with lower confidence |
| Attraction reviews | Offline collection of public Xiaohongshu posts | Show clearly labelled sample content for uncovered attractions |
| AI scoring | Structured model output | Switch automatically to local scoring rules |
| Conversation state | Memory, with optional Upstash Redis | Start a new session after a cold start when Redis is absent |

### Important limits

- Waits, operating status, shows, and dining information can change at any time. Follow official in-park information when it differs.
- Xiaohongshu has no star ratings. The stored `rating` is a popularity proxy, not a satisfaction score.
- Real restaurant-review coverage is incomplete, so some results use fallback data.
- This is not an official product of Shanghai Disney Resort or The Walt Disney Company.

## Run locally

```bash
git clone https://github.com/Myla0619/disney-park-intel.git
cd disney-park-intel
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Configure Claude credentials or connect a compatible trained-model service for the complete AI assistant. Without a model service, local scoring and the core itinerary remain available.

## Technical overview

- Next.js 14, TypeScript, Tailwind CSS, and Zustand
- Claude or trained-model tool use with SSE streaming
- Chinese BM25 retrieval, live wait service, and historical forecasting
- Vitest, GitHub Actions, Vercel, and optional Upstash Redis

Implementation entry points:

```text
src/app/                 product pages and APIs
src/app/api/agent/       AI assistant and tool execution
src/lib/routing.ts       itinerary planning and constraints
src/lib/wait-*.ts        live waits and historical forecasts
src/lib/vector-store.ts  review retrieval
data/                    reviews and wait-time data
```

Tests and research assets remain available under `src/lib/__tests__/`, `scripts/`, `rl/`, and `docs/`, but they are not prerequisites for using the product.

## Maintenance and data attribution

The project is maintained by [Myla0619](https://github.com/Myla0619). Wait-time snapshots are collected on a schedule by GitHub Actions.

External APIs, Disney attraction information, and public Xiaohongshu content were not created by this project. The application implements their collection, mapping, fallback behavior, retrieval, and presentation.
