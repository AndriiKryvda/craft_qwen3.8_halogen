/** Player state: body physics, look angles, mining progress. */

import type { World } from '../world/world';
import { type Body, move } from './collision';
import { CONFIG } from '../config';
import { LIQUID, CLIMB } from '../world/blocks';

export interface Command {
  fwd: number;
  strafe: number;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  up: boolean;
  down: boolean;
}

export interface MiningTarget {
  x: number;
  y: number;
  z: number;
  progress: number;
  total: number;
}

export class Player implements Body {
  x: number;
  y: number;
  z: number;
  vx = 0;
  vy = 0;
  vz = 0;
  hw = CONFIG.playerWidth / 2;
  h = CONFIG.playerHeight;
  onGround = false;

  yaw = 0;
  pitch = 0;
  creative = false;
  flying = false;
  inWater = false;
  headInWater = false;
  onLadder = false;
  bob = 0;

  mining: MiningTarget | null = null;
  exhaustion = 0;
  distanceWalked = 0;
  jumpCount = 0;

  private fallStartY: number | null = null;
  fallDamage = 0;

  spawn: { x: number; y: number; z: number } = { x: 0.5, y: 40, z: 0.5 };

  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.spawn = { x, y, z };
  }

  get eyeY(): number {
    return this.y + CONFIG.eyeHeight - (this.sneaking ? 0.2 : 0);
  }

  sneaking = false;

  look(dx: number, dy: number, sensitivity: number): void {
    const s = 0.0022 * sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    const limit = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  forwardVector(): { x: number; y: number; z: number } {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  /** Direction the camera is pointing on the XZ plane (normalised). */
  groundForward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  update(world: World, dt: number, cmd: Command): void {
    const feet = Math.floor(this.y);
    const eye = Math.floor(this.eyeY);
    const here = world.getBlock(Math.floor(this.x), feet, Math.floor(this.z));
    const eyeBlock = world.getBlock(Math.floor(this.x), eye, Math.floor(this.z));
    this.inWater = LIQUID[here] === 1 || LIQUID[world.getBlock(Math.floor(this.x), feet + 1, Math.floor(this.z))] === 1;
    this.headInWater = LIQUID[eyeBlock] === 1;
    this.onLadder = CLIMB[world.getBlock(Math.floor(this.x), feet, Math.floor(this.z))] === 1;
    this.sneaking = cmd.sneak && this.onGround && !this.flying;

    const fwd = cmd.fwd;
    const strafe = cmd.strafe;
    const f = this.groundForward();
    const rx = -f.z;
    const rz = f.x;
    let wishX = f.x * fwd + rx * strafe;
    let wishZ = f.z * fwd + rz * strafe;
    const len = Math.hypot(wishX, wishZ);
    if (len > 0) {
      wishX /= len;
      wishZ /= len;
    }

    let speed = CONFIG.walkSpeed;
    if (this.flying) speed = CONFIG.flySpeed;
    else if (this.inWater) speed = CONFIG.walkSpeed * 0.55;
    else if (cmd.sprint) speed = CONFIG.walkSpeed * CONFIG.sprintMul;
    else if (cmd.sneak) speed = CONFIG.walkSpeed * CONFIG.sneakMul;

    const accel = this.onGround || this.flying ? 14 : this.inWater ? 6 : 5;
    this.vx += (wishX * speed - this.vx) * Math.min(1, accel * dt);
    this.vz += (wishZ * speed - this.vz) * Math.min(1, accel * dt);
    if (len === 0 && (this.onGround || this.flying)) {
      const fr = Math.min(1, 12 * dt);
      this.vx -= this.vx * fr;
      this.vz -= this.vz * fr;
    }

    if (this.flying) {
      this.vy = (cmd.up ? 1 : 0) * CONFIG.flySpeed - (cmd.down ? 1 : 0) * CONFIG.flySpeed;
    } else if (this.onLadder) {
      this.vy = (cmd.up || cmd.jump ? 1 : 0) * 3 - (cmd.down ? 1 : 0) * 3;
      if (!cmd.up && !cmd.down && !cmd.jump) this.vy = -1.2;
    } else if (this.inWater) {
      this.vy -= CONFIG.waterGravity * dt;
      if (cmd.jump) this.vy = CONFIG.swimUpSpeed;
      this.vy = Math.max(this.vy, -4);
      this.vy *= 1 - Math.min(1, CONFIG.waterDrag * dt * 2);
    } else {
      this.vy -= CONFIG.gravity * dt;
      if (this.vy < -CONFIG.terminalVelocity) this.vy = -CONFIG.terminalVelocity;
      if (cmd.jump && this.onGround) {
        this.vy = CONFIG.jumpSpeed;
        this.onGround = false;
        this.jumpCount++;
        this.exhaustion += cmd.sprint ? 0.2 : 0.05;
      }
    }

    const startX = this.x;
    const startZ = this.z;
    const startY = this.y;

    const res = move(world, this, this.vx * dt, this.vy * dt, this.vz * dt);

    const moved = Math.hypot(this.x - startX, this.z - startZ);
    this.distanceWalked += moved;
    if (!this.flying && !this.inWater && this.onGround) {
      this.exhaustion += moved * (cmd.sprint ? 0.08 : 0.01);
    }
    if (moved > 0.01 && this.onGround) this.bob += moved * 1.6;

    // ---- fall damage -----------------------------------------------------
    if (res.landed) {
      if (this.fallStartY !== null && !this.inWater && !this.flying) {
        const dist = this.fallStartY - this.y;
        this.fallDamage = Math.max(0, Math.floor(dist - CONFIG.fallDamageThreshold));
      }
      this.fallStartY = null;
      this.vy = 0;
    }
    if (!this.onGround && this.vy < 0 && !this.inWater && !this.flying) {
      if (this.fallStartY === null) this.fallStartY = startY;
    } else if (this.onGround || this.inWater || this.flying) {
      this.fallStartY = null;
    }

    // Keep the player inside the vertical world.
    if (this.y < -8) {
      this.y = this.spawn.y;
      this.x = this.spawn.x;
      this.z = this.spawn.z;
      this.vy = 0;
      this.fallDamage = 6;
    }
    void res;
  }

  teleport(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.fallStartY = null;
  }
}
