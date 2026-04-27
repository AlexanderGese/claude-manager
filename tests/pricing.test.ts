import { test, expect } from "bun:test";
import { estimateCost, fmtUsd, modelOf, RATES } from "../src/tui/pricing.ts";
import type { SessionRow } from "../src/registry/search.ts";

// Minimal SessionRow stub for testing.
function makeRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    session_id: "test",
    cwd: "/tmp",
    launch_argv_json: '["claude"]',
    env_json: null,
    git_branch: null,
    git_sha: null,
    first_prompt: null,
    custom_name: null,
    is_favorite: 0,
    is_archived: 0,
    is_backfilled: 0,
    message_count: 0,
    token_count: 0,
    status: null,
    created_at: 1,
    last_activity_at: 1,
    origin_host: null,
    schema_version: 1,
    ...overrides,
  };
}

// ── estimateCost ──────────────────────────────────────────────────────────────

test("estimateCost with known model uses correct rates", () => {
  // claude-sonnet-4-6: input=$3, output=$15 per million.
  // 1M tokens: 250k input @ $3 + 750k output @ $15 = $0.75 + $11.25 = $12.00
  const cost = estimateCost(1_000_000, "claude-sonnet-4-6");
  expect(cost).toBeCloseTo(12.0, 4);
});

test("estimateCost with opus model uses higher rates", () => {
  // claude-opus-4: input=$15, output=$75 per million.
  // 1M tokens: 250k input @ $15 + 750k output @ $75 = $3.75 + $56.25 = $60.00
  const cost = estimateCost(1_000_000, "claude-opus-4");
  expect(cost).toBeCloseTo(60.0, 4);
});

test("estimateCost with unknown model uses fallback (sonnet rates)", () => {
  const costUnknown = estimateCost(1_000_000, "some-future-model");
  const costFallback = estimateCost(1_000_000, "claude-sonnet-4-6");
  expect(costUnknown).toBeCloseTo(costFallback, 4);
});

test("estimateCost with null model uses fallback", () => {
  const cost = estimateCost(1_000_000, null);
  expect(cost).toBeCloseTo(12.0, 4);
});

test("estimateCost returns 0 for 0 tokens", () => {
  expect(estimateCost(0, "claude-opus-4")).toBe(0);
});

test("estimateCost is linear in token count", () => {
  const c1 = estimateCost(100_000, "claude-sonnet-4-6");
  const c2 = estimateCost(200_000, "claude-sonnet-4-6");
  expect(c2).toBeCloseTo(c1 * 2, 6);
});

// ── fmtUsd ────────────────────────────────────────────────────────────────────

test("fmtUsd: amounts under $0.01 show '<$0.01'", () => {
  expect(fmtUsd(0)).toBe("<$0.01");
  expect(fmtUsd(0.005)).toBe("<$0.01");
  expect(fmtUsd(0.009)).toBe("<$0.01");
});

test("fmtUsd: amounts between $0.01 and $100 show two decimals", () => {
  expect(fmtUsd(0.01)).toBe("$0.01");
  expect(fmtUsd(1.5)).toBe("$1.50");
  expect(fmtUsd(99.99)).toBe("$99.99");
});

test("fmtUsd: amounts $100+ are rounded integers", () => {
  expect(fmtUsd(100)).toBe("$100");
  expect(fmtUsd(1234.56)).toBe("$1,235");
});

// ── modelOf ───────────────────────────────────────────────────────────────────

test("modelOf extracts model from env_json ANTHROPIC_MODEL", () => {
  const row = makeRow({ env_json: JSON.stringify({ ANTHROPIC_MODEL: "claude-opus-4" }) });
  expect(modelOf(row)).toBe("claude-opus-4");
});

test("modelOf lowercases the model name from env", () => {
  const row = makeRow({ env_json: JSON.stringify({ ANTHROPIC_MODEL: "Claude-Sonnet-4-6" }) });
  expect(modelOf(row)).toBe("claude-sonnet-4-6");
});

test("modelOf extracts model from launch_argv_json --model flag", () => {
  const row = makeRow({ launch_argv_json: JSON.stringify(["claude", "--model", "claude-haiku-4-5"]) });
  expect(modelOf(row)).toBe("claude-haiku-4-5");
});

test("modelOf prefers env_json over launch_argv_json", () => {
  const row = makeRow({
    env_json: JSON.stringify({ ANTHROPIC_MODEL: "claude-opus-4" }),
    launch_argv_json: JSON.stringify(["claude", "--model", "claude-haiku-4-5"]),
  });
  expect(modelOf(row)).toBe("claude-opus-4");
});

test("modelOf returns null when no model hint present", () => {
  const row = makeRow({ env_json: null, launch_argv_json: '["claude"]' });
  expect(modelOf(row)).toBeNull();
});

test("modelOf handles malformed JSON gracefully", () => {
  const row = makeRow({ env_json: "not-json", launch_argv_json: "not-json-either" });
  expect(modelOf(row)).toBeNull();
});

test("modelOf handles --model flag with no value gracefully", () => {
  const row = makeRow({ launch_argv_json: JSON.stringify(["claude", "--model"]) });
  expect(modelOf(row)).toBeNull();
});

// ── RATES sanity ─────────────────────────────────────────────────────────────

test("all RATES entries have positive input and output values", () => {
  for (const [name, { input, output }] of Object.entries(RATES)) {
    expect(input).toBeGreaterThan(0);
    expect(output).toBeGreaterThan(0);
    // Output should cost more than input for all known Claude models.
    expect(output).toBeGreaterThan(input);
  }
});
