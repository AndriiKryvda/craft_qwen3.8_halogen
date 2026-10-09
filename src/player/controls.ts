/** Keyboard/mouse state → Player command each simulation step. */

import type { Input } from '../engine/input';
import type { Command, Player } from './player';

const DOUBLE_TAP = 0.28;

export class PlayerControls {
  private readonly cmd: Command = {
    fwd: 0,
    strafe: 0,
    jump: false,
    sneak: false,
    sprint: false,
    up: false,
    down: false
  };
  private time = 0;
  private lastForwardTap = -1;
  private tapSprint = false;

  constructor(private readonly input: Input) {}

  reset(): void {
    this.time = 0;
    this.lastForwardTap = -1;
    this.tapSprint = false;
  }

  /** Double tap of F toggles flight (creative only, like the real game). */
  flyToggle(): boolean {
    return this.input.wasPressed('fly');
  }

  read(dt: number, player: Player): Command {
    this.time += dt;
    const i = this.input;
    const cmd = this.cmd;

    const fwd = (i.isDown('forward') ? 1 : 0) - (i.isDown('back') ? 1 : 0);
    if (i.wasPressed('forward')) {
      this.tapSprint = this.time - this.lastForwardTap < DOUBLE_TAP;
      this.lastForwardTap = this.time;
    }
    if (fwd <= 0) this.tapSprint = false;

    cmd.fwd = fwd;
    cmd.strafe = (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0);
    cmd.jump = i.isDown('jump');
    cmd.sneak = i.isDown('sneak');
    cmd.sprint = i.isDown('sprint') || this.tapSprint;
    cmd.up = player.flying ? cmd.jump : false;
    cmd.down = player.flying ? cmd.sneak : false;
    return cmd;
  }
}
