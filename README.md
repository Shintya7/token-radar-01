# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Shintya7/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Shintya7/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 178 pre-token DeFi protocols by implied token value, from a sealed DefiLlama snapshot of 758 protocols. The radar-2 model scores each protocol from its own figures — TVL, saturating seven-day growth, a token-window maturity hump and chain breadth — and every row carries an eight-step farm plan with concrete costs and times, ending on a risk note read off the protocol's own record (a growth spike, a long pre-token history, single-chain concentration, a shrinking TVL, or the all-clear). Each row also carries a launch-readiness band — Hot, Warm or Watch — from its implied value and seven-day growth. The static dashboard is sortable and filterable, with a detail view per protocol, a collapsible methodology panel that states the formula in plain words beside the board's own live figures (total TVL covered, median 7d growth, total implied value, median age and the Hot/Warm/Watch split), a category summary strip (protocol count, median implied value and top protocol per category, click a card to filter), a one-click Movers sort by seven-day TVL change, a CSV export of the rows on screen, and the live-token protocols set aside at their market caps.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

`snapshot.json` is the sealed DefiLlama snapshot (`input/snapshot.json` in the competition kit); the grader mounts it at `/input/snapshot.json`, which is also the program's default. The run writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Node 22.18 or later, standard library only, no install step.

---

<sub>Entered on [make.fun](https://make.fun/?ref=px0jp2xy&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
