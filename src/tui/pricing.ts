import type { SessionRow } from "../registry/search.ts";

// Last-known public per-million-token prices (input + output).
// Fallback rate applies when the session's model is unknown.
export const RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-4":         { input: 15, output: 75 },
  "claude-opus-4-1":       { input: 15, output: 75 },
  "claude-opus-4-5":       { input: 15, output: 75 },
  "claude-opus-4-7":       { input: 15, output: 75 },
  "claude-sonnet-4":       { input: 3,  output: 15 },
  "claude-sonnet-4-5":     { input: 3,  output: 15 },
  "claude-sonnet-4-6":     { input: 3,  output: 15 },
  "claude-haiku-4-5":      { input: 1,  output: 5 },
  "claude-3-5-sonnet":     { input: 3,  output: 15 },
  "claude-3-5-haiku":      { input: 0.8, output: 4 },
};
const FALLBACK = { input: 3, output: 15 };

// We only have total token_count, not the input/output split.
// Estimate using a 1:3 input:output ratio (typical for chat workloads).
export function estimateCost(tokenCount: number, modelHint: string | null): number {
  const rate = (modelHint && RATES[modelHint]) || FALLBACK;
  const input = tokenCount * 0.25;
  const output = tokenCount * 0.75;
  return (input * rate.input + output * rate.output) / 1_000_000;
}

export function fmtUsd(amount: number): string {
  if (amount < 0.01) return "<$0.01";
  if (amount < 100)  return `$${amount.toFixed(2)}`;
  return `$${Math.round(amount).toLocaleString()}`;
}

export function modelOf(row: SessionRow): string | null {
  if (row.env_json) {
    try {
      const env = JSON.parse(row.env_json);
      if (env.ANTHROPIC_MODEL) return String(env.ANTHROPIC_MODEL).toLowerCase();
    } catch { /* ignore */ }
  }
  try {
    const argv = JSON.parse(row.launch_argv_json) as string[];
    const i = argv.indexOf("--model");
    if (i >= 0 && argv[i + 1]) return argv[i + 1].toLowerCase();
  } catch { /* ignore */ }
  return null;
}
