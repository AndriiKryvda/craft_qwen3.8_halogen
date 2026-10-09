/**
 * First-person punch timing: how often the player's hand connects with the block
 * he is breaking. Pure logic (no THREE) so it can be unit tested and driven from
 * either the simulation or the render pass.
 */

import type { ToolInfo } from '../world/blocks';

/** Where inside one swing cycle the fist connects (0 = start, 1 = end). */
export const IMPACT_PHASE = 0.68;
/** Seconds per swing with a bare hand (~3 punches / s). */
export const SWING_BASE_PERIOD = 0.34;
/** Creative mode punches snappier because blocks pop instantly. */
export const SWING_CREATIVE_PERIOD = 0.16;
/** Fastest possible swing, whatever the tool. */
export const SWING_MIN_PERIOD = 0.15;
/** Same ladder as TOOL_SPEED in world/blocks.ts (hand .. diamond). */
const TOOL_SPEED = [1, 2, 4, 6, 8];

/** Seconds between two punches for the given tool. Better tool = faster punching. */
export function swingPeriod(tool: ToolInfo | null, creative = false): number {
  if (creative) return SWING_CREATIVE_PERIOD;
  const tier = tool ? Math.max(0, Math.min(TOOL_SPEED.length - 1, tool.tier)) : 0;
  const speed = TOOL_SPEED[tier];
  const period = SWING_BASE_PERIOD / (1 + 0.2 * (speed - 1));
  return Math.max(SWING_MIN_PERIOD, Math.min(SWING_BASE_PERIOD, period));
}

/**
 * Reach of the punch for a swing phase: 0 at rest, 1 exactly at the impact,
 * back to 0 at the end of the cycle. Smooth on both sides so there is no snap.
 */
export function swingExtension(phase: number): number {
  const p = phase <= 0 ? 0 : phase >= 1 ? 0 : phase;
  return p <= IMPACT_PHASE
    ? Math.sin((p / IMPACT_PHASE) * Math.PI * 0.5)
    : Math.cos(((p - IMPACT_PHASE) / (1 - IMPACT_PHASE)) * Math.PI * 0.5);
}

/**
 * Repeating swing timer. Feed it the frame delta and whether the player is
 * currently punching; it reports `true` on the frame the fist lands.
 * `trigger()` adds a single swing (used for right-click place / eat).
 */
export class SwingClock {
  /** Seconds elapsed inside the current cycle. */
  private t = 0;
  private period = SWING_BASE_PERIOD;
  private pending = false;
  /** Has the current cycle already reported its punch? */
  private struck = false;
  /** True while a swing cycle is running. */
  active = false;
  /** Position inside the current cycle, 0..1. */
  phase = 0;

  /** Start one extra swing (right click, eating, ...). */
  trigger(): void {
    this.pending = true;
  }

  /** Stop immediately and drop any queued swing. */
  reset(): void {
    this.t = 0;
    this.phase = 0;
    this.pending = false;
    this.struck = false;
    this.active = false;
  }

  /** 0..1 reach of the arm for the current phase. */
  get extension(): number {
    return swingExtension(this.phase);
  }

  /**
   * Advance the clock. Returns true when a punch landed during this frame.
   * At most one impact is reported per call.
   */
  update(dt: number, punching: boolean, period = this.period): boolean {
    if (!(dt > 0)) dt = 0;
    if (!punching && !this.pending) {
      this.reset();
      return false;
    }
    this.active = true;
    this.period = period > 0 ? period : SWING_BASE_PERIOD;
    // Never advance more than one cycle, so a long frame cannot skip an impact.
    let t = this.t + (dt > this.period ? this.period : dt);
    let wrapped = false;
    if (t >= this.period) {
      t -= this.period;
      wrapped = true;
      this.pending = false;
    }
    this.t = t;
    this.phase = t / this.period;
    if (wrapped) {
      // The cycle ended inside this frame. Report the punch only if it was
      // skipped on the way (a frame longer than the rest of the cycle).
      const missed = !this.struck;
      this.struck = false;
      return missed;
    }
    if (!this.struck && this.phase >= IMPACT_PHASE) {
      this.struck = true;
      return true;
    }
    return false;
  }
}
