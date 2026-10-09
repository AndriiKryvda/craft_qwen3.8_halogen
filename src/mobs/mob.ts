/** Mob definitions and the mob entity (shares the player's voxel physics). */

import type { World } from '../world/world';
import type { Body } from '../player/collision';
import { move } from '../player/collision';
import { LIQUID, SOLID } from '../world/blocks';

export interface MobDrop {
  id: string;
  count: number;
}

export interface MobType {
  id: string;
  label: string;
  hostile: boolean;
  hw: number;
  h: number;
  health: number;
  speed: number;
  damage: number;
  reach: number;
  attackCooldown: number;
  burnsInSun: boolean;
  drops: MobDrop[];
}

export const MOB_TYPES: Record<string, MobType> = {
  cow: {
    id: 'cow', label: 'Cow', hostile: false, hw: 0.45, h: 1.3, health: 10, speed: 1.6,
    damage: 0, reach: 0, attackCooldown: 1, burnsInSun: false,
    drops: [{ id: 'raw_beef', count: 1 }, { id: 'leather', count: 1 }]
  },
  pig: {
    id: 'pig', label: 'Pig', hostile: false, hw: 0.45, h: 0.9, health: 10, speed: 1.7,
    damage: 0, reach: 0, attackCooldown: 1, burnsInSun: false,
    drops: [{ id: 'raw_pork', count: 1 }]
  },
  zombie: {
    id: 'zombie', label: 'Zombie', hostile: true, hw: 0.3, h: 1.9, health: 20, speed: 2.6,
    damage: 3, reach: 1.7, attackCooldown: 1, burnsInSun: true,
    drops: [{ id: 'bone', count: 1 }]
  },
  spider: {
    id: 'spider', label: 'Spider', hostile: true, hw: 0.5, h: 0.9, health: 16, speed: 3.4,
    damage: 2, reach: 1.7, attackCooldown: 0.9, burnsInSun: false,
    drops: [{ id: 'string_item', count: 1 }, { id: 'spider_eye', count: 1 }]
  }
};

export type MobState = 'idle' | 'wander' | 'flee' | 'chase' | 'attack';

export interface MobTarget {
  x: number;
  y: number;
  z: number;
}

export class Mob implements Body {
  readonly type: MobType;
  x: number;
  y: number;
  z: number;
  vx = 0;
  vy = 0;
  vz = 0;
  hw: number;
  h: number;
  onGround = false;
  health: number;
  yaw = 0;
  state: MobState = 'idle';
  stateTimer = 0;
  attackTimer = 0;
  hurtTimer = 0;
  walkPhase = 0;
  dead = false;
  /** THREE.Group holding the model. */
  object: unknown = null;

  constructor(typeId: string, x: number, y: number, z: number) {
    const t = MOB_TYPES[typeId] ?? MOB_TYPES.cow;
    this.type = t;
    this.x = x;
    this.y = y;
    this.z = z;
    this.hw = t.hw;
    this.h = t.h;
    this.health = t.health;
  }

  hurt(amount: number): void {
    this.health -= amount;
    this.hurtTimer = 4;
    this.state = 'flee';
    this.stateTimer = 4;
    if (this.health <= 0) this.dead = true;
  }

  private pickWander(): void {
    const a = Math.random() * Math.PI * 2;
    this.yaw = a;
    this.state = Math.random() < 0.45 ? 'idle' : 'wander';
    this.stateTimer = 1.5 + Math.random() * 3.5;
  }

  /**
   * Advance AI + physics. `player` is the target position or null when the
   * player is too far / it is not a hostile mob.
   */
  update(world: World, dt: number, player: MobTarget | null, daylight: number): void {
    this.stateTimer -= dt;
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    if (this.stateTimer <= 0 && (this.state === 'idle' || this.state === 'wander' || this.state === 'flee')) {
      this.pickWander();
    }

    let speed = 0;
    let dirX = Math.sin(this.yaw);
    let dirZ = Math.cos(this.yaw);

    if (this.type.hostile && player) {
      const dx = player.x - this.x;
      const dz = player.z - this.z;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dz);
      if (dist < 20 && Math.abs(dy) < 6) {
        this.yaw = Math.atan2(dx, dz);
        dirX = Math.sin(this.yaw);
        dirZ = Math.cos(this.yaw);
        if (dist <= this.type.reach && this.attackTimer <= 0) {
          this.state = 'attack';
          this.attackTimer = this.type.attackCooldown;
        } else {
          this.state = 'chase';
          speed = this.type.speed;
        }
      } else if (this.state === 'chase' || this.state === 'attack') {
        this.state = 'wander';
        this.stateTimer = 2;
      }
    }

    if (this.state === 'wander') speed = this.type.speed * 0.45;
    else if (this.state === 'flee') speed = this.type.speed * (this.hurtTimer > 0 ? 1.1 : 0.5);
    else if (this.state === 'idle' || this.state === 'attack') speed = 0;

    // Undead burn in daylight.
    if (this.type.burnsInSun && daylight > 0.75 && world.skyAt(Math.floor(this.x), Math.floor(this.y + this.h), Math.floor(this.z)) >= 14) {
      this.health -= dt * 1.5;
      if (this.health <= 0) this.dead = true;
    }

    const inWater = LIQUID[world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z))] === 1;
    this.vx = dirX * speed;
    this.vz = dirZ * speed;
    if (inWater) {
      this.vy = 2.2;
    } else {
      this.vy -= 32 * dt;
      if (this.vy < -78) this.vy = -78;
    }

    // Step up obstacles: if blocked and there is room above, hop.
    if (speed > 0 && this.onGround) {
      const aheadX = this.x + dirX * (this.hw + 0.3);
      const aheadZ = this.z + dirZ * (this.hw + 0.3);
      const blocked = SOLID[world.getBlock(Math.floor(aheadX), Math.floor(this.y + 0.1), Math.floor(aheadZ))] === 1;
      const headroom = SOLID[world.getBlock(Math.floor(aheadX), Math.floor(this.y + 1.1), Math.floor(aheadZ))] === 0;
      if (blocked && headroom) this.vy = 8.4;
    }

    const res = move(world, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if (res.hitX || res.hitZ) {
      if (this.state === 'wander' || this.state === 'flee') {
        this.yaw += 1.2 + Math.random();
      }
    }
    this.walkPhase += speed * dt * 3;
    if (this.y < -6) this.dead = true;
  }

  /** True when this mob can hit the player this step (caller applies damage). */
  get canStrike(): boolean {
    return this.type.hostile && this.state === 'attack' && this.attackTimer >= this.type.attackCooldown - 0.001;
  }
}
