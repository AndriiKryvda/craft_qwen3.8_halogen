/** FR-3: selection ray, voxel collision and the player body. */

import { describe, expect, it } from 'vitest';
import { raycast } from '../src/player/raycast';
import { boxOverlapsSolid, boxesOverlap, move } from '../src/player/collision';
import { Player } from '../src/player/player';
import { B } from '../src/world/blocks';
import { CONFIG } from '../src/config';
import { groundWorld, solidWorld } from './helpers';

const still = { fwd: 0, strafe: 0, jump: false, sneak: false, sprint: false, up: false, down: false };

describe('selection ray (FR-3.4)', () => {
  it('finds the block under the crosshair', () => {
    const w = groundWorld(9);
    const hit = raycast(w, 0.5, 11.5, 0.5, 0, -1, 0, CONFIG.reach);
    expect(hit).not.toBeNull();
    expect(hit!.y).toBe(9);
    expect(hit!.block).toBe(B.STONE);
    expect(hit!.ny).toBe(1);
  });

  it('gives the face normal back for side hits', () => {
    const w = groundWorld(9);
    w.setBlock(0, 11, -1, B.STONE);
    const hit = raycast(w, 0.5, 11.5, 0.5, 0, 0, -1, CONFIG.reach);
    expect(hit!.z).toBe(-1);
    expect(hit!.nz).toBe(1);
  });

  it('misses anything beyond the five block reach', () => {
    const w = groundWorld(9);
    expect(raycast(w, 0.5, 20, 0.5, 0, -1, 0, CONFIG.reach)).toBeNull();
  });
});

describe('collision (FR-3.2)', () => {
  it('detects a box inside solid rock', () => {
    const w = groundWorld(9);
    expect(boxOverlapsSolid(w, 0.5, 5, 0.5, 0.3, 1.8)).toBe(true);
    expect(boxOverlapsSolid(w, 0.5, 12, 0.5, 0.3, 1.8)).toBe(false);
  });

  it('boxesOverlap is symmetric', () => {
    expect(boxesOverlap(0, 0, 0, 0.5, 1, 0.5, 0, 0, 0.5, 1)).toBe(true);
    expect(boxesOverlap(0, 0, 0, 0.5, 1, 5, 0, 0, 0.5, 1)).toBe(false);
  });

  it('stops a falling body on the ground', () => {
    const w = groundWorld(9);
    const body = { x: 0.5, y: 10.4, z: 0.5, vx: 0, vy: -10, vz: 0, hw: 0.3, h: 1.8, onGround: false };
    const res = move(w, body, 0, -0.5, 0);
    expect(res.landed).toBe(true);
    expect(body.y).toBeCloseTo(10, 3);
  });

  it('blocks sideways movement into a wall', () => {
    const w = groundWorld(9);
    w.setBlock(0, 10, 1, B.STONE);
    const body = { x: 0.5, y: 10, z: 0.5, vx: 0, vy: 0, vz: 0, hw: 0.3, h: 1.8, onGround: true };
    const res = move(w, body, 0, 0, 0.6);
    expect(res.hitZ).toBe(true);
    expect(body.z).toBeLessThan(1);
  });
});

describe('player body', () => {
  it('is the documented size with the documented eye height', () => {
    const p = new Player(0, 0, 0);
    expect(p.h).toBeCloseTo(CONFIG.playerHeight, 6);
    expect(p.hw * 2).toBeCloseTo(CONFIG.playerWidth, 6);
    expect(p.eyeY).toBeCloseTo(CONFIG.eyeHeight, 6);
  });

  it('falls and comes to rest on the ground', () => {
    const w = groundWorld(9);
    const p = new Player(0.5, 14, 0.5);
    for (let i = 0; i < 80; i++) p.update(w, 0.05, still);
    expect(p.onGround).toBe(true);
    expect(p.y).toBeCloseTo(10, 3);
  });

  it('reports fall damage on a long drop (FR-7.4)', () => {
    const w = groundWorld(9);
    const p = new Player(0.5, 30, 0.5);
    for (let i = 0; i < 200; i++) p.update(w, 0.05, still);
    expect(p.fallDamage).toBeGreaterThan(10);
  });

  it('jumps', () => {
    const w = groundWorld(9);
    const p = new Player(0.5, 10, 0.5);
    p.update(w, 0.05, still);
    const before = p.y;
    p.update(w, 0.05, { ...still, jump: true });
    expect(p.y).toBeGreaterThan(before);
  });

  it('walks in the direction it faces', () => {
    const w = groundWorld(9);
    const p = new Player(0.5, 10, 0.5);
    for (let i = 0; i < 20; i++) p.update(w, 0.05, { ...still, fwd: 1 });
    expect(p.z).toBeLessThan(0.5);
    expect(p.distanceWalked).toBeGreaterThan(0.5);
  });

  it('flies when creative flight is on (FR-3.5)', () => {
    const w = groundWorld(9);
    const p = new Player(0.5, 10, 0.5);
    p.creative = true;
    p.flying = true;
    for (let i = 0; i < 20; i++) p.update(w, 0.05, { ...still, up: true });
    expect(p.y).toBeGreaterThan(10);
  });

  it('floats in water and drowns the view (FR-3.3)', () => {
    const w = solidWorld(B.WATER);
    const p = new Player(0.5, 20, 0.5);
    p.update(w, 0.05, still);
    expect(p.inWater).toBe(true);
    expect(p.headInWater).toBe(true);
  });

  it('looks with the mouse and clamps pitch', () => {
    const p = new Player(0, 0, 0);
    p.look(100, 0, 1);
    expect(p.yaw).not.toBe(0);
    p.look(0, -100000, 1);
    expect(p.pitch).toBeLessThan(Math.PI / 2);
    expect(p.pitch).toBeGreaterThan(1);
  });
});
