/** requestAnimationFrame driver with a fixed simulation step. */

export interface LoopOptions {
  /** Seconds per simulation step. */
  simStep: number;
  /** Longest frame accepted before the world "jumps" (tab switch, breakpoint). */
  maxFrame: number;
  /** Maximum simulation steps per frame (prevents the spiral of death). */
  maxSteps?: number;
  sim(dt: number): void;
  render(alpha: number): void;
}

export class GameLoop {
  private readonly opts: LoopOptions;
  private readonly maxSteps: number;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private frames = 0;
  private fpsAcc = 0;
  private frameMs = 0;
  running = false;
  fps = 60;
  ms = 16;

  constructor(opts: LoopOptions) {
    this.opts = opts;
    this.maxSteps = opts.maxSteps ?? 6;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.acc = 0;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > this.opts.maxFrame) dt = this.opts.maxFrame;

    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.opts.simStep && steps < this.maxSteps) {
      this.opts.sim(this.opts.simStep);
      this.acc -= this.opts.simStep;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = 0;

    this.opts.render(this.acc / this.opts.simStep);

    this.frames++;
    this.fpsAcc += dt;
    this.frameMs = this.frameMs * 0.9 + (performance.now() - now) * 0.1;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.frames / this.fpsAcc;
      this.ms = this.frameMs;
      this.frames = 0;
      this.fpsAcc = 0;
    }
  };
}