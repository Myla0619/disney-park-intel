# Disney Park Intelligence

English | [中文](README.md)

An itinerary planner for Shanghai Disneyland. It combines queue times, walking distances, height restrictions, dining reservations, and personal preferences into a suggested day plan.

[Try the app](https://disney-park-intel.vercel.app)

## Features

- Plan routes around your group, arrival and departure times, and Premier Access choices.
- Look up queues and estimate waits using historical snapshots.
- Match posts by attraction names and aliases, then extract relevant passages. Video posts carry a `[视频]` label.
- Record personal attraction and restaurant ratings, currently saved on the device.
- Mark an activity complete and replan the remaining day. Progress is stored by park and date.
- Ask about attractions, restaurants, shops, and photo spots in chat.

## Implementation

Deterministic code builds the route. The model interprets questions, calls tools, and explains results. Scheduling weighs waiting, walking, and physical effort while handling fixed time slots. It is a heuristic, not a guarantee of a globally optimal route.

The website supports Claude and a trained model. The trained model uses the training environment's prompt, tool registry, and text protocol. It can fall back to Claude when unavailable or timed out; the page does not display switching notices. In student mode, attraction scoring and itinerary notes use local logic.

The integration code is committed, but deployment of the trained weights has not been verified online. See [student deployment](docs/student-deployment.md).

## Data and limitations

Live waits come from external services; historical waits and posts come from the repository corpus. Missing data may produce labelled fallback results or examples, which should not be treated as on-site measurements.

The `rating` field for Xiaohongshu posts is an engagement-based popularity indicator, not a star rating given by the author. Personal ratings are stored separately. Post matching uses keywords and aliases; it cannot reliably resolve every abbreviation, sarcastic statement, or opinion about multiple attractions in one post. Restaurant examples are not real user feedback.

There are no verified active-user or retention statistics. Corpus sizes and evaluation question counts are not user counts.

## Run locally

```bash
git clone https://github.com/Myla0619/disney-park-intel.git
cd disney-park-intel
npm install
cp .env.local.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). Routes can use local logic without a model service; chat needs valid model credentials. Keep keys in environment variables. Remove unused credential variables rather than leaving empty values that override other settings.

## Validation and training

```bash
npm test
npm run eval:retrieval
```

Tests cover scheduling, data mapping, retrieval, and tool protocols. See the [evaluation directory](data/rl/eval/README.md) for historical results. They are not current scores for the code or deployed model; relevant evaluations must be rerun after changes.

`rl/` contains task generation, distillation, SFT, GRPO, and full tool-loop evaluation. Existing older weights are Qwen 32B QLoRA/SFT and GRPO adapters. The full-parameter training configurations describe subsequent work, not a completed full-parameter run. See [training instructions](rl/train/README.md).

## Repository and maintenance

- `src/app/`: pages and API routes.
- `src/lib/`: scheduling, retrieval, sessions, and model integration.
- `rl/`: training tools, data pipelines, and evaluation.
- `data/`: posts, wait snapshots, and experiment records.
- `scripts/`: collection and validation scripts.

Maintained by [Myla0619](https://github.com/Myla0619). AI coding assistance was used during development; scheduled jobs collect wait snapshots. External APIs, Disney information, and public posts belong to their respective sources. This project integrates, organizes, and uses them.
