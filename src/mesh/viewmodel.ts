/**
 * First-person view model: the player's own arm (and whatever he is holding),
 * drawn in a dedicated scene + camera after the world pass so it never clips
 * into terrain. The arm punches forward every time a punch lands, which is what
 * sells "the player is hitting the block" instead of a block that just darkens.
 */

import * as THREE from 'three';
import { ATLAS_GRID, UV_EPS, buildAtlasCanvas } from './atlas';

/** Flat-shaded palette, matching the blocky look of the mob models. */
const SKIN = 0xb98a63;
const SLEEVE = 0x1fa8a0;
const SLEEVE_DARK = 0x188b86;

export interface HandPose {
  /** 0..1 punch reach from SwingClock. */
  extension: number;
  /** Player walk-bob phase in radians. */
  bob: number;
  /** Walking/running: adds a stronger arm sway. */
  moving: boolean;
  /** 0..1 daylight, dims the arm at night. */
  daylight: number;
  /** Sneaking pulls the arm down a little. */
  sneak?: boolean;
}

/** Remap a geometry's 0..1 face UVs onto one atlas tile (atlas is flipY = false). */
function retile(geo: THREE.BufferGeometry, tile: number): void {
  const col = ((tile % ATLAS_GRID) + ATLAS_GRID) % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  const s = 1 / ATLAS_GRID;
  const u0 = (col + UV_EPS) * s;
  const u1 = (col + 1 - UV_EPS) * s;
  const v0 = (row + UV_EPS) * s;
  const v1 = (row + 1 - UV_EPS) * s;
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + (1 - v) * (v1 - v0));
  }
  uv.needsUpdate = true;
}

export class HandViewModel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly texture: THREE.CanvasTexture;
  private readonly itemMat: THREE.MeshBasicMaterial;

  /** Root of the arm: the elbow pivot, sitting just off the bottom-right corner. */
  private readonly arm = new THREE.Group();
  private readonly forearm = new THREE.Group();
  private readonly itemAnchor = new THREE.Group();

  /** Materials whose colour tracks daylight: [material, base colour]. */
  private readonly tinted: Array<[THREE.MeshBasicMaterial, THREE.Color]> = [];
  private readonly disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

  private heldIcon = -1;
  private heldIsBlock = false;
  private heldMesh: THREE.Mesh | null = null;

  private time = 0;
  private baseX = 0.3;
  private baseY = -0.62;
  private readonly baseZ = -0.52;

  /** Hide while a panel, the pause menu or the death screen owns the screen. */
  set visible(v: boolean) {
    this.scene.visible = v;
  }
  get visible(): boolean {
    return this.scene.visible;
  }

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(58, width / Math.max(1, height), 0.01, 10);

    this.texture = new THREE.CanvasTexture(buildAtlasCanvas());
    this.texture.flipY = false;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;

    this.itemMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide
    });
    this.tinted.push([this.itemMat, new THREE.Color(1, 1, 1)]);
    this.disposables.push(this.itemMat);

    this.buildArm();
    this.scene.add(this.arm);
    this.resize(width, height);
  }

  /** Box-built arm: elbow pivot at the bottom of the screen, fist pointing up. */
  private buildArm(): void {
    this.arm.add(this.limb(0.17, 0.22, 0.17, 0.11, SLEEVE, 1));
    this.forearm.position.set(0, 0.22, 0);
    this.forearm.rotation.x = 0.22;
    this.forearm.add(this.limb(0.15, 0.19, 0.15, 0.095, SLEEVE_DARK, 0.95));
    this.forearm.add(this.limb(0.16, 0.15, 0.16, 0.26, SKIN, 1));
    this.itemAnchor.position.set(0.03, 0.26, -0.03);
    this.forearm.add(this.itemAnchor);
    this.arm.add(this.forearm);
  }

  /** A flat-shaded box limb hanging from (0, y, 0) of the parent pivot. */
  private limb(w: number, h: number, d: number, y: number, color: number, shade: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(shade) });
    this.tinted.push([mat, mat.color.clone()]);
    this.disposables.push(geo, mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, y, 0);
    return m;
  }

  /** Keep the arm inside the frame on unusual aspect ratios. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360);
    const halfW = halfH * this.camera.aspect;
    this.baseX = Math.min(0.3, halfW * 0.58);
    this.baseY = -halfH * 1.12;
  }

  /**
   * Show the held item: a small cube for placeable blocks, a flat sprite for
   * tools and materials. Pass icon < 0 for a bare hand.
   */
  setHeld(icon: number, isBlock: boolean): void {
    if (icon === this.heldIcon && (icon < 0 || isBlock === this.heldIsBlock)) return;
    this.heldIcon = icon;
    this.heldIsBlock = isBlock;
    if (this.heldMesh) {
      this.itemAnchor.remove(this.heldMesh);
      this.heldMesh.geometry.dispose();
      this.heldMesh = null;
    }
    if (icon < 0) return;
    const geo = isBlock ? new THREE.BoxGeometry(0.24, 0.24, 0.24) : new THREE.PlaneGeometry(0.3, 0.3);
    retile(geo, icon);
    this.heldMesh = new THREE.Mesh(geo, this.itemMat);
    this.itemAnchor.add(this.heldMesh);
  }

  /** Pose the arm for this frame. */
  update(dt: number, pose: HandPose): void {
    this.time += dt;
    const ext = pose.extension < 0 ? 0 : pose.extension > 1 ? 1 : pose.extension;
    const sway = pose.moving ? 1 : 0.25;
    const bobX = Math.cos(pose.bob) * 0.016 * sway;
    const bobY = Math.abs(Math.sin(pose.bob)) * 0.018 * sway;
    const breath = Math.sin(this.time * 1.6) * 0.006;

    this.arm.position.set(
      this.baseX + bobX,
      this.baseY + bobY + breath - (pose.sneak ? 0.05 : 0) - ext * 0.03,
      this.baseZ - ext * 0.1
    );
    // A negative X rotation drives the fist away from the camera, into the block.
    this.arm.rotation.set(-0.12 - ext * 1.05, -0.1 + ext * 0.1, -0.12);
    this.forearm.rotation.x = 0.22 - ext * 0.22;
    if (this.heldMesh) {
      this.heldMesh.rotation.set(
        this.heldIsBlock ? 0.24 - ext * 0.3 : -0.3 - ext * 0.5,
        this.heldIsBlock ? -0.6 : -0.7,
        this.heldIsBlock ? 0 : -0.5
      );
    }

    const d = pose.daylight < 0 ? 0 : pose.daylight > 1 ? 1 : pose.daylight;
    const bright = 0.4 + 0.6 * d;
    for (const [mat, base] of this.tinted) mat.color.copy(base).multiplyScalar(bright);
  }

  /** Draw on top of the world pass, depth-cleared so the arm is never clipped. */
  render(): void {
    if (!this.scene.visible) return;
    const r = this.renderer;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.camera);
    r.autoClear = true;
  }

  dispose(): void {
    if (this.heldMesh) this.heldMesh.geometry.dispose();
    for (const d of this.disposables) d.dispose();
    this.texture.dispose();
    this.arm.clear();
  }
}
