/** World clock: day fraction, daylight factor and sky palette. */

import { CONFIG } from '../config';

export interface SkyPalette {
  zenith: [number, number, number];
  horizon: [number, number, number];
  sun: [number, number, number];
  fog: [number, number, number];
  daylight: number;
  sunDir: [number, number, number];
  moonDir: [number, number, number];
}

function mix(a: number[], b: number[], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const NIGHT_ZENITH = [0.015, 0.02, 0.06];
const NIGHT_HORIZON = [0.05, 0.06, 0.12];
const DAY_ZENITH = [0.36, 0.6, 0.95];
const DAY_HORIZON = [0.72, 0.85, 1.0];
const DUSK_ZENITH = [0.28, 0.2, 0.42];
const DUSK_HORIZON = [0.98, 0.55, 0.28];

export class WorldClock {
  /** 0..1 where 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. */
  fraction: number;

  constructor(fraction = 0.08) {
    this.fraction = fraction;
  }

  advance(dtSeconds: number): void {
    this.fraction = (this.fraction + dtSeconds / CONFIG.dayLength) % 1;
  }

  get dayNumber(): number {
    return Math.floor(this.fraction * 1000) + 1;
  }

  /** -1 (midnight) .. 1 (noon). */
  get elevation(): number {
    return Math.sin(this.fraction * Math.PI * 2);
  }

  get daylight(): number {
    const e = this.elevation;
    return Math.max(0.08, Math.min(1, e * 2.4 + 0.18));
  }

  get isNight(): boolean {
    return this.elevation < -0.05;
  }

  get clockLabel(): string {
    const hours = (this.fraction * 24 + 6) % 24;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  palette(): SkyPalette {
    const e = this.elevation;
    // 1 at noon, 0 at night, with a strong dusk band near the horizon.
    const day = Math.max(0, Math.min(1, e * 2.2 + 0.25));
    const dusk = Math.max(0, 1 - Math.abs(e) * 4.5);
    let zenith = mix(NIGHT_ZENITH, DAY_ZENITH, day);
    let horizon = mix(NIGHT_HORIZON, DAY_HORIZON, day);
    zenith = mix(zenith, DUSK_ZENITH, dusk * 0.75);
    horizon = mix(horizon, DUSK_HORIZON, dusk * 0.85);
    const daylight = this.daylight;
    const ang = this.fraction * Math.PI * 2;
    const sunDir: [number, number, number] = [Math.cos(ang) * 0.6, Math.sin(ang), Math.cos(ang) * 0.35];
    const moonDir: [number, number, number] = [-sunDir[0], -sunDir[1], -sunDir[2]];
    return {
      zenith,
      horizon,
      sun: mix([0.15, 0.16, 0.3], [1, 0.96, 0.86], day),
      fog: mix(horizon, zenith, 0.35),
      daylight,
      sunDir,
      moonDir
    };
  }
}
