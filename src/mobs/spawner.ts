/** Spawns, updates and despawns mobs around the player. */

import * as THREE from 'three';
import type { World } from '../world/world';
import { Mob, MOB_TYPES, type MobTarget } from './mob';
import { buildMob, animateMob, type MobModel } from './models';
import { CONFIG } from '../config';
import { B, SOLID, LIQUID } from '../world/blocks';

interface Managed {
  mob: Mob;
  model: MobModel;
}

export interface MobStrike {
  damage: number;
  from: { x: number; z: number };
}

export class MobManager {
  readonly list: Managed[] = [];
  private readonly scene: THREE.Scene;
  private readonly world: World;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
  }

  get count(): number {
    return this.list.length;
  }

  private countOf(hostile: boolean): number {
    let n = 0;
    for (const m of this.list) if (m.mob.type.hostile === hostile) n++;
    return n;
  }

  add(typeId: string, x: number, y: number, z: number): Mob {
    const mob = new Mob(typeId, x, y, z);
    const model = buildMob(typeId);
    model.group.position.set(x, y, z);
    this.scene.add(model.group);
    mob.object = model.group;
    this.list.push({ mob, model });
    return mob;
  }

  private remove(entry: Managed): void {
    this.scene.remove(entry.model.group);
    entry.model.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    });
    const i = this.list.indexOf(entry);
    if (i >= 0) this.list.splice(i, 1);
  }

  clear(): void {
    for (const e of [...this.list]) this.remove(e);
  }

  /** Drop a mob's loot at its position (caller adds to inventory). */
  dropsFor(typeId: string): Array<{ id: string; count: number }> {
    const t = MOB_TYPES[typeId];
    return t ? t.drops.map((d) => ({ id: d.id, count: d.count })) : [];
  }

  private trySpawn(player: MobTarget, daylight: number): void {
    const w = this.world;
    const hostile = daylight < 0.35;
    const cap = hostile ? CONFIG.hostileCap : CONFIG.passiveCap;
    if (this.countOf(hostile) >= cap) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = CONFIG.spawnMinDist + Math.random() * (CONFIG.spawnMaxDist - CONFIG.spawnMinDist);
      const x = Math.floor(player.x + Math.cos(a) * r) + 0.5;
      const z = Math.floor(player.z + Math.sin(a) * r) + 0.5;
      const y = w.heightAt(Math.floor(x), Math.floor(z));
      if (y < 2) continue;
      const ground = w.getBlock(Math.floor(x), y, Math.floor(z));
      if (SOLID[ground] !== 1 || LIQUID[ground] === 1) continue;
      if (SOLID[w.getBlock(Math.floor(x), y + 1, Math.floor(z))] === 1) continue;
      if (SOLID[w.getBlock(Math.floor(x), y + 2, Math.floor(z))] === 1) continue;
      const light = w.lightAt(Math.floor(x), y + 1, Math.floor(z), daylight);
      if (hostile) {
        if (light >= 8) continue;
        const typeId = Math.random() < 0.6 ? 'zombie' : 'spider';
        this.add(typeId, x, y + 1, z);
      } else {
        if (daylight < 0.5) continue;
        if (ground !== B.GRASS) continue;
        this.add(Math.random() < 0.5 ? 'cow' : 'pig', x, y + 1, z);
      }
      return;
    }
  }

  /** Advance every mob; returns strikes against the player. */
  update(dt: number, player: { x: number; y: number; z: number }, daylight: number): MobStrike[] {
    const strikes: MobStrike[] = [];
    this.spawnTimer -= dt;
    if (CONFIG.mobsEnabled && this.spawnTimer <= 0) {
      this.spawnTimer = CONFIG.spawnInterval;
      this.trySpawn(player, daylight);
    }

    const target: MobTarget = { x: player.x, y: player.y, z: player.z };
    for (const entry of [...this.list]) {
      const { mob, model } = entry;
      const dx = player.x - mob.x;
      const dz = player.z - mob.z;
      const dist = Math.hypot(dx, dz);
      if (dist > CONFIG.despawnDist) {
        this.remove(entry);
        continue;
      }
      mob.update(this.world, dt, mob.type.hostile ? target : null, daylight);
      if (mob.dead) {
        this.remove(entry);
        continue;
      }
      model.group.position.set(mob.x, mob.y, mob.z);
      model.group.rotation.y = mob.yaw;
      animateMob(model, mob.walkPhase, Math.hypot(mob.vx, mob.vz) > 0.2);
      if (mob.canStrike && dist <= mob.type.reach + 0.4) {
        strikes.push({ damage: mob.type.damage, from: { x: mob.x, z: mob.z } });
      }
    }
    return strikes;
  }

  /** Nearest mob to a point, used for melee attacks. */
  nearest(x: number, y: number, z: number, maxDist: number): Mob | null {
    let best: Mob | null = null;
    let bestD = maxDist;
    for (const e of this.list) {
      const d = Math.hypot(e.mob.x - x, e.mob.y + e.mob.h / 2 - y, e.mob.z - z);
      if (d < bestD) {
        bestD = d;
        best = e.mob;
      }
    }
    return best;
  }

  removeMob(mob: Mob): void {
    const e = this.list.find((x) => x.mob === mob);
    if (e) this.remove(e);
  }

  /** Serialize the living mobs (position + health only). */
  serialize(): Array<{ type: string; x: number; y: number; z: number; health: number }> {
    return this.list.map((e) => ({
      type: e.mob.type.id,
      x: e.mob.x,
      y: e.mob.y,
      z: e.mob.z,
      health: e.mob.health
    }));
  }

  restore(items: Array<{ type: string; x: number; y: number; z: number; health: number }>): void {
    for (const it of items) {
      const mob = this.add(it.type, it.x, it.y, it.z);
      mob.health = it.health;
    }
  }
}
