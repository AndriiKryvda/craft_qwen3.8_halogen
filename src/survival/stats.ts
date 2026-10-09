/** Health, hunger, air and the rules that connect them. */

import { CONFIG } from '../config';

export type DamageCause = 'fall' | 'drown' | 'starve' | 'mob' | 'cactus' | 'suffocate' | 'void';

export interface SurvivalOptions {
  headInWater: boolean;
  inWater: boolean;
  canRegen: boolean;
}

export class SurvivalStats {
  health = CONFIG.maxHealth;
  hunger = CONFIG.maxHunger;
  air = CONFIG.airTicks / 10;
  exhaustion = 0;

  dead = false;
  invulnerable = 0;

  onDamage: ((amount: number, cause: DamageCause) => void) | null = null;
  onDeath: ((cause: DamageCause) => void) | null = null;

  private regenTimer = 0;
  private starveTimer = 0;
  private drownTimer = 0;
  private hurtFlash = 0;

  get hurtLevel(): number {
    return Math.min(1, this.hurtFlash);
  }

  get healthFraction(): number {
    return this.health / CONFIG.maxHealth;
  }

  get hungerFraction(): number {
    return this.hunger / CONFIG.maxHunger;
  }

  get airFraction(): number {
    return this.air / (CONFIG.airTicks / 10);
  }

  addExhaustion(n: number): void {
    this.exhaustion += n;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      this.hunger = Math.max(0, this.hunger - 1);
    }
  }

  eat(points: number): void {
    this.hunger = Math.min(CONFIG.maxHunger, this.hunger + points);
  }

  heal(n: number): void {
    this.health = Math.min(CONFIG.maxHealth, this.health + n);
  }

  hurt(amount: number, cause: DamageCause): void {
    if (this.dead || amount <= 0) return;
    if (this.invulnerable > 0 && cause !== 'starve' && cause !== 'drown') return;
    this.health -= amount;
    this.hurtFlash = 0.6;
    this.invulnerable = 0.4;
    if (this.onDamage) this.onDamage(amount, cause);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      if (this.onDeath) this.onDeath(cause);
    }
  }

  update(dt: number, opts: SurvivalOptions): void {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.dead) return;

    this.addExhaustion(0);

    // Air supply
    if (opts.headInWater) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 1) {
          this.drownTimer = 0;
          this.hurt(2, 'drown');
        }
      }
    } else {
      this.air = Math.min(CONFIG.airTicks / 10, this.air + dt * 4);
      this.drownTimer = 0;
    }

    // Natural regeneration
    if (opts.canRegen && this.hunger >= 18 && this.health < CONFIG.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4) {
        this.regenTimer = 0;
        this.health = Math.min(CONFIG.maxHealth, this.health + 1);
        this.exhaustion += CONFIG.regenExhaustionCost;
      }
    } else {
      this.regenTimer = 0;
    }

    // Starvation never kills outright in v1: it stops at 1 HP.
    if (this.hunger <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        if (this.health > 1) {
          this.health -= 1;
          this.hurtFlash = 0.5;
          if (this.onDamage) this.onDamage(1, 'starve');
        }
      }
    } else {
      this.starveTimer = 0;
    }
  }

  reset(): void {
    this.health = CONFIG.maxHealth;
    this.hunger = CONFIG.maxHunger;
    this.air = CONFIG.airTicks / 10;
    this.exhaustion = 0;
    this.dead = false;
    this.invulnerable = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.drownTimer = 0;
  }

  /** Fall damage from a drop distance, per FR-7.4. */
  static fallDamage(distance: number): number {
    return Math.max(0, Math.floor(distance - CONFIG.fallDamageThreshold));
  }
}
