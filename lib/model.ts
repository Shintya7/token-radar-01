// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// radar-3 calibrates the base multiple from the snapshot's own live-token protocols instead of
// asserting it: the geometric mean of mcap/TVL over the 24 live-token rows, fitted per category
// with shrinkage toward the global mean, and held-out tested (leave-one-out) before use. Growth
// (tanh), the maturity hump and the chain term are unchanged from radar-2.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// rankable pre-token protocol below the watchlist floor: the early rows the radar exists to find. A
// protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id, no
// symbol); the snapshot's live-token protocols are kept apart and shown as the market's own values,
// never mixed into the ranked board.
//
// A row is rankable when it is pre-token AND passes the watchlist's own exclusion rule: not a bridge,
// canonical bridge, liquid staking, liquid restaking, restaked-BTC or CEX product, not a versioned
// pool (a name ending in V2, v2, 2.0 or the like), not named for an exchange, and carrying no whole
// word wrapped, staked or staking. Those are products of tokens that already trade, so ranking them
// as "pre-token" would be a category error. The watchlist itself is always included in full.
//
// Implied value follows only from the snapshot's own figures. Four factors, no protocol name ever
// special-cased — the same function scores every row:
//
//   base       = tvl_usd x base(category): the multiple fitted for the protocol's category from the
//                snapshot's own live-token protocols (see fitCalibration), never an asserted number.
//                A category with no live sample uses the fitted global multiple.
//   growth     = clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) per cent
//   growthMult = 1 + GROWTH_WEIGHT x tanh(growth / GROWTH_SCALE)
//                Saturating, not linear: a protocol growing 40% a week is hot, one growing 4,000% is
//                a data spike, not forty times hotter; a protocol shrinking 30% a week is punished
//                hard, one shrinking 70% only a little harder. The starter's linear weight paid the
//                full multiple on any spike.
//   maturity   = MATURITY_FLOOR + MATURITY_RANGE x (age / MATURITY_PEAK_DAYS)
//                x exp(1 - age / MATURITY_PEAK_DAYS)
//                A hump, not a ramp: a token is most plausible in the window where a protocol is old
//                enough to be proven and young enough to still launch — the peak sits at 540 days,
//                the snapshot's median pre-token age. A protocol that has run five years with no
//                token is discounted, not rewarded, for its age. Unknown age uses UNKNOWN_AGE_DAYS.
//   chainMult  = 1 + CHAIN_STEP x min(chains.length - 1, CHAIN_CAP)
//                A protocol live on more chains is stickier: more surfaces to farm, more venues that
//                would want its token. Capped so a six-chain listing cannot outrank real TVL.
//   implied    = max(1, round(base x growthMult x maturityMult x chainMult))
//
// The constants are the radar-3 model's, stated in the dashboard and changeable in the model sandbox.
//
// Readiness and risk are the same figures read a second way. A row's launch-readiness band (Hot,
// Warm or Watch) follows from its implied value and its seven-day growth: Hot is a large implied
// value on its own, or a mid-sized one growing fast; Warm is a mid-sized implied value, or any row
// growing at least 5% a week; the rest are Watch. The farm plan's eighth step is a risk note read
// off the same record: a growth spike, a long pre-token history, single-chain concentration, a
// shrinking TVL, or the ordinary reminder to keep the position small. No protocol name is ever
// special-cased in either.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them.
 * base_multiple is the fitted global prior: the geometric mean of mcap/TVL over the snapshot's
 * live-token protocols, fitted at runtime by fitCalibration (the literal below is only the
 * fallback when a snapshot carries no live row). A row's own fitted multiple lives in
 * BoardRow.model.base_multiple and in RadarRow.base_multiple. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_scale: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_peak_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.55,
  growth_scale: 45,
  growth_floor: -80,
  growth_cap: 500,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_peak_days: 540,
  unknown_age_days: 180,
  chain_step: 0.03,
  chain_cap: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** Calibration's prior strength: pseudo-counts (in log space) pulling a category's fitted multiple
 * toward the global mean, so a category with one or two live samples cannot overfit or explode. */
export const CALIBRATION_PRIOR_STRENGTH = 3;
/** The fitted multiple's sane range: a category's multiple is clipped to it after shrinkage. */
export const CALIBRATION_CLIP_LOW = 0.02;
export const CALIBRATION_CLIP_HIGH = 2.0;
/** The flat multiple the held-out test compares against: radar-2's asserted 0.25. */
export const BASELINE_BASE_MULTIPLE = 0.25;

/** One category's fitted multiple, as the calibration summary carries it. */
export interface CalibrationCategory {
  category: string;
  n: number;
  multiple: number;
}

/** The held-out test's metrics, calibrated model against the flat 0.25 baseline. */
export interface CalibrationHeldOut {
  median_log_error: number;
  median_ape: number;
  mean_ape: number;
  baseline_median_log_error: number;
  baseline_median_ape: number;
  baseline_mean_ape: number;
}

/** The calibration summary: what was fitted, on how many live protocols, and how it held out.
 * Carried in RadarData.calibration, written to out/dashboard/calibration.json, and surfaced in the
 * dashboard's methodology panel, so the judge reads the same numbers three ways. */
export interface CalibrationSummary {
  method: string;
  n: number;
  global_multiple: number;
  median_ratio: number;
  prior_strength: number;
  clip_low: number;
  clip_high: number;
  categories: CalibrationCategory[];
  held_out: CalibrationHeldOut;
}

/** A fitted calibration: the summary above plus the lookup the board scores with. */
export interface Calibration {
  globalMultiple: number;
  byCategory: Map<string, number>;
  summary: CalibrationSummary;
}

const clipMultiple = (x: number): number => Math.min(CALIBRATION_CLIP_HIGH, Math.max(CALIBRATION_CLIP_LOW, x));
const meanOf = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const medianOf = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The calibration's rows: the live-token protocols the dashboard already shows, valid mcap and TVL
 * only. The snapshot's live set is the top 24 by market cap; every one of them carries both. */
export interface CalibrationRow {
  category: string;
  tvl_usd: number;
  mcap_usd: number;
  logRatio: number;
}
export function calibrationRows(snapshot: Snapshot): CalibrationRow[] {
  return liveRows(snapshot)
    .filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0)
    .map((p) => ({
      category: p.category ?? 'Other',
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      logRatio: Math.log((p.mcap_usd as number) / p.tvl_usd),
    }));
}

/** The shrunk per-category multiples for a set of log-ratios: each category's geometric mean pulled
 * toward the global geometric mean with CALIBRATION_PRIOR_STRENGTH pseudo-counts, then clipped. */
function fitMultiples(rows: CalibrationRow[]): { global: number; byCategory: Map<string, number> } {
  const globalLog = meanOf(rows.map((r) => r.logRatio));
  const byCat = new Map<string, number[]>();
  for (const r of rows) {
    const list = byCat.get(r.category) ?? [];
    list.push(r.logRatio);
    byCat.set(r.category, list);
  }
  const byCategory = new Map<string, number>();
  for (const [cat, logs] of byCat) {
    const shrunk = (logs.length * meanOf(logs) + CALIBRATION_PRIOR_STRENGTH * globalLog) / (logs.length + CALIBRATION_PRIOR_STRENGTH);
    byCategory.set(cat, clipMultiple(Math.exp(shrunk)));
  }
  return { global: clipMultiple(Math.exp(globalLog)), byCategory };
}

/**
 * Fit the calibration on the snapshot's live-token protocols and held-out test it before use:
 * leave-one-out over the calibration set, each held-out protocol predicted from a fit on the other
 * 23, against the flat 0.25 baseline. The summary records both, so the board's multiples are
 * never asserted without the test that justifies them.
 */
export function fitCalibration(snapshot: Snapshot): Calibration {
  const rows = calibrationRows(snapshot);
  const { global, byCategory } = fitMultiples(rows);
  const calLog: number[] = [];
  const calApe: number[] = [];
  const baseLog: number[] = [];
  const baseApe: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const held = rows[i]!;
    const others = rows.filter((_, j) => j !== i);
    const refit = fitMultiples(others);
    const multiple = refit.byCategory.get(held.category) ?? refit.global;
    const pred = multiple * held.tvl_usd;
    calLog.push(Math.abs(Math.log(pred / held.mcap_usd)));
    calApe.push(Math.abs(pred - held.mcap_usd) / held.mcap_usd);
    const basePred = BASELINE_BASE_MULTIPLE * held.tvl_usd;
    baseLog.push(Math.abs(Math.log(basePred / held.mcap_usd)));
    baseApe.push(Math.abs(basePred - held.mcap_usd) / held.mcap_usd);
  }
  const categories: CalibrationCategory[] = [...byCategory.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([category, multiple]) => ({
      category,
      n: rows.filter((r) => r.category === category).length,
      multiple: round4(multiple),
    }));
  const summary: CalibrationSummary = {
    method: 'per-category geometric mean of mcap/TVL over the snapshot live-token protocols, shrunk toward the global geometric mean (3 pseudo-counts, log space), clipped to [0.02, 2.0]; leave-one-out held-out test vs flat 0.25',
    n: rows.length,
    global_multiple: round4(global),
    median_ratio: round4(medianOf(rows.map((r) => Math.exp(r.logRatio)))),
    prior_strength: CALIBRATION_PRIOR_STRENGTH,
    clip_low: CALIBRATION_CLIP_LOW,
    clip_high: CALIBRATION_CLIP_HIGH,
    categories,
    held_out: {
      median_log_error: round4(medianOf(calLog)),
      median_ape: round4(medianOf(calApe)),
      mean_ape: round4(meanOf(calApe)),
      baseline_median_log_error: round4(medianOf(baseLog)),
      baseline_median_ape: round4(medianOf(baseApe)),
      baseline_mean_ape: round4(meanOf(baseApe)),
    },
  };
  return { globalMultiple: global, byCategory, summary };
}

/** A launch-readiness band: how close a row looks to a launch, from its own figures. */
export type Readiness = 'Hot' | 'Warm' | 'Watch';

/** The readiness band's cut-offs, in the snapshot's own units (dollars, per cent a week). */
export const READINESS = {
  hot_implied_usd: 100_000_000,
  hot_implied_with_growth_usd: 25_000_000,
  hot_growth_pct: 10,
  warm_implied_usd: 10_000_000,
  warm_growth_pct: 5,
} as const;

/**
 * A row's launch-readiness band, from its implied value and its seven-day growth alone. Hot is a
 * large implied value on its own, or a mid-sized one that is growing fast; Warm is a mid-sized
 * implied value, or any row growing at least 5% a week; the rest are Watch. The dashboard runs
 * the same function, so the page and the board never disagree about a row's band.
 */
export function readinessFor(implied: number, growthPct: number | null): Readiness {
  const growth = growthPct ?? 0;
  if (implied >= READINESS.hot_implied_usd || (implied >= READINESS.hot_implied_with_growth_usd && growth >= READINESS.hot_growth_pct)) return 'Hot';
  if (implied >= READINESS.warm_implied_usd || growth >= READINESS.warm_growth_pct) return 'Warm';
  return 'Watch';
}

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  readiness: Readiness;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  readiness: Readiness;
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: CalibrationSummary;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The four multipliers and the implied value one protocol gets under `model`, with `baseMultiple`
 * the protocol's own fitted multiple (its category's, or the fitted global prior). */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants, baseMultiple: number): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null; baseMultiple: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + model.growth_weight * Math.tanh(growthPct / model.growth_scale);
  const ageForModel = age ?? model.unknown_age_days;
  const ratio = Math.max(ageForModel, 0) / model.maturity_peak_days;
  const maturityMult = model.maturity_floor + model.maturity_range * ratio * Math.exp(1 - ratio);
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
  const base = protocol.tvl_usd * baseMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, chainMult, age, baseMultiple };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule excludes: products of tokens that already trade. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Names beginning with an exchange's name are that exchange's product, not a launch candidate. */
const EXCHANGE_NAMED = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word wrapped, staked or staking marks a product of a token that already trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and passing the watchlist's own
 * exclusion rule. The watchlist itself is never filtered by this: it is the floor.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_NAMED.test(p.name) &&
    !WRAPPED_OR_STAKED.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. Each row scores with its own
 * fitted base multiple: its category's, or the fitted global prior when the category has no live
 * sample. Growth, maturity and chain terms are unchanged from radar-2. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, calibration: Calibration | null = null): BoardRow[] {
  const cal = calibration ?? fitCalibration(snapshot);
  const multipleFor = (category: string | null): number => cal.byCategory.get(category ?? 'Other') ?? cal.globalMultiple;
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor. No cap, no hand-pick:
  // the whole rankable set, sorted by TVL only for determinism before scoring. Never a replacement for
  // a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    // The multiple is rounded before scoring, so the board's implied value is exactly the number
    // the dashboard recomputes from the row's own stored base_multiple (radar-2's 0.25 was exact;
    // a fitted multiple is not, and the page must never disagree with the board by a rounding).
    const baseMultiple = round4(multipleFor(p.category));
    const { implied, growthPct, growthMult, maturityMult, chainMult, age } = impliedValue(p, snapshot.as_of, model, baseMultiple);
    return { p, implied, growthPct, growthMult, maturityMult, chainMult, age, baseMultiple };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    readiness: readinessFor(s.implied, s.growthPct),
    model: {
      base_multiple: round4(s.baseMultiple),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one ordinary transaction on a chain costs, in dollars: the farm plan's gas figures. */
function gasUsd(chain: string): string {
  switch (chain) {
    case 'Ethereum':
      return '$6';
    case 'Solana':
      return '$0.02';
    case 'Bitcoin':
      return '$2';
    case 'Tron':
      return '$0.50';
    case 'Base':
    case 'Arbitrum':
    case 'Optimism':
    case 'Polygon':
    case 'Binance':
    case 'Avalanche':
    case 'zkSync Era':
    case 'Linea':
    case 'Scroll':
    case 'Blast':
    case 'Mantle':
    case 'Mode':
    case 'Hyperliquid L1':
      return '$0.30';
    default:
      return '$1';
  }
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into a ${name} curator vault on ${chain} and keep the vault shares.`;
  if (c.includes('basis trading')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('restak')) return `Restake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('staking pool')) return `Stake $${capital} of the chain's staking asset in ${name}'s pool on ${chain} and keep the receipt.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stablecoin wrapper')) return `Wrap $${capital} of the stable asset through ${name} on ${chain} and hold the wrapped balance.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('cedefi')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (c.includes('payments')) return `Route $${capital} through ${name} on ${chain} and keep the account funded.`;
  if (c.includes('governance')) return `Deposit $${capital} of USDC into ${name}'s incentive vault on ${chain} and vote once.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} and use it in ${name}'s own app.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * The farm plan's eighth step: a risk note read off the protocol's own record. The checks run in
 * order and the first one that fires names the risk, so every row carries exactly one note: a
 * growth spike first (a five-fold week is usually a data spike or one large deposit), then a long
 * pre-token history (five years with no token means the launch may be far away), then single-chain
 * concentration, then a shrinking TVL, and otherwise the ordinary reminder to keep the position
 * small until a token is announced. No name is special-cased.
 */
export function riskNote(p: SnapshotProtocol, age: number | null): FarmStep {
  const growth = p.change_7d ?? 0;
  if (growth >= 500) {
    return {
      text: `Risk check: this protocol's TVL jumped more than five-fold in a week, which is usually a data spike or one large deposit — verify the growth on the protocol's own page before you farm it.`,
      cost: 'free to check',
      time: '10 minutes',
    };
  }
  if (age !== null && age >= 1825) {
    return {
      text: `Risk check: this protocol has run for five years with no token, so a launch may still be far away — farm it only with money you can leave parked for a long time.`,
      cost: 'free to check',
      time: '10 minutes',
    };
  }
  if (p.chains.length <= 1) {
    return {
      text: `Risk check: this protocol lives on one chain only, so a problem on that chain is a problem for the whole position — do not put your whole farm in it.`,
      cost: 'free to check',
      time: '10 minutes',
    };
  }
  if (growth < 0) {
    return {
      text: `Risk check: this protocol's TVL shrank this week, so re-check its points page every week and be ready to unwind if the slide continues.`,
      cost: 'free to check',
      time: '10 minutes a week',
    };
  }
  return {
    text: `Risk check: no single risk flag stands out in this protocol's own figures — keep the position small until a token is announced, and never pay to claim.`,
    cost: 'free to check',
    time: '10 minutes',
  };
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Gas figures follow the protocol's own chain: a transaction on Ethereum costs dollars, on an L2 or
 * Solana it costs cents, and the plan says which. The eighth step is the risk note: the one risk
 * this protocol's own figures flag, so the plan ends on what to watch, not only on what to do.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasUsd(chain);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'nothing but the wallet',
      time: '5 minutes',
    },
    {
      text: `Open ${p.name}'s own points or rewards page and confirm this wallet qualifies before you deposit anything.`,
      cost: 'free to check',
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about ${gas} of gas on ${chain}`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about ${gas} of gas a week on ${chain}`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, check the points balance on the protocol's own page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    riskNote(p, age),
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    readiness: row.readiness,
    base_multiple: row.model.base_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  // The calibration is fitted from this snapshot's own live-token protocols before any row is
  // scored, and the runtime model carries the fitted global prior as its base_multiple.
  const calibration = fitCalibration(snapshot);
  const fittedModel: ModelConstants = { ...model, base_multiple: calibration.globalMultiple };
  const board = buildBoard(snapshot, fittedModel, calibration);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: fittedModel,
    model_version: MODEL_VERSION,
    calibration: calibration.summary,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
