/** Owns the per-chunk THREE meshes and the voxel shader. */

import * as THREE from 'three';
import type { World } from '../world/world';
import type { Chunk } from '../world/chunk';
import { CHUNK_SIZE, WORLD_HEIGHT, chunkKey } from '../world/constants';
import { buildChunkMesh, type MeshData } from './mesher';
import { buildAtlasCanvas } from './atlas';

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec2 aLight;
varying vec3 vColor;
varying vec2 vLight;
varying vec2 vUv;
varying float vDepth;
void main() {
  vColor = aColor;
  vLight = aLight;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uDaylight;
uniform vec3 uSunTint;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
uniform float uCutout;
varying vec3 vColor;
varying vec2 vLight;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < uCutout) discard;
  float lvl = max(vLight.y * uDaylight, vLight.x);
  float bright = 0.06 + 0.94 * lvl;
  vec3 c = tex.rgb * vColor * bright * uSunTint;
  float fog = clamp((vDepth - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
  c = mix(c, uFogColor, fog);
  gl_FragColor = vec4(c, tex.a * uAlpha);
}
`;

interface Entry {
  opaque: THREE.Mesh | null;
  transparent: THREE.Mesh | null;
}

const BOUND_RADIUS = Math.sqrt(64 + 64 * 64 + 64);

export class ChunkRenderer {
  private readonly scene: THREE.Scene;
  private readonly world: World;
  private readonly texture: THREE.CanvasTexture;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly opaqueMat: THREE.ShaderMaterial;
  private readonly transparentMat: THREE.ShaderMaterial;
  private readonly entries = new Map<string, Entry>();
  triangles = 0;
  drawCalls = 0;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    this.texture = new THREE.CanvasTexture(buildAtlasCanvas());
    this.texture.flipY = false;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;

    this.uniforms = {
      uMap: { value: this.texture },
      uDaylight: { value: 1 },
      uSunTint: { value: new THREE.Color(1, 1, 1) },
      uFogColor: { value: new THREE.Color(0x9ec8ff) },
      uFogNear: { value: 60 },
      uFogFar: { value: 110 },
      uAlpha: { value: 1 },
      uCutout: { value: 1 }
    };

    this.opaqueMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.FrontSide
    });
    this.transparentMat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uAlpha: { value: 0.72 }, uCutout: { value: 0.02 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  setFog(near: number, far: number, color: THREE.Color): void {
    this.uniforms.uFogNear.value = near;
    this.uniforms.uFogFar.value = far;
    (this.uniforms.uFogColor.value as THREE.Color).copy(color);
  }

  setDaylight(level: number, tint: THREE.Color): void {
    this.uniforms.uDaylight.value = level;
    (this.uniforms.uSunTint.value as THREE.Color).copy(tint);
  }

  private geometry(d: MeshData, cx: number, cz: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(d.color, 3));
    g.setAttribute('aLight', new THREE.BufferAttribute(d.light, 2));
    g.setIndex(new THREE.BufferAttribute(d.index, 1));
    g.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(cx * CHUNK_SIZE + CHUNK_SIZE / 2, WORLD_HEIGHT / 2, cz * CHUNK_SIZE + CHUNK_SIZE / 2),
      BOUND_RADIUS
    );
    return g;
  }

  private disposeEntry(e: Entry): void {
    if (e.opaque) {
      this.scene.remove(e.opaque);
      e.opaque.geometry.dispose();
    }
    if (e.transparent) {
      this.scene.remove(e.transparent);
      e.transparent.geometry.dispose();
    }
  }

  rebuild(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cz);
    let e = this.entries.get(key);
    if (!e) {
      e = { opaque: null, transparent: null };
      this.entries.set(key, e);
    }
    const data = buildChunkMesh(this.world, chunk);
    if (e.opaque) {
      this.scene.remove(e.opaque);
      e.opaque.geometry.dispose();
      e.opaque = null;
    }
    if (e.transparent) {
      this.scene.remove(e.transparent);
      e.transparent.geometry.dispose();
      e.transparent = null;
    }
    if (data.opaque.index.length > 0) {
      const m = new THREE.Mesh(this.geometry(data.opaque, chunk.cx, chunk.cz), this.opaqueMat);
      m.matrixAutoUpdate = false;
      m.renderOrder = 0;
      this.scene.add(m);
      e.opaque = m;
    }
    if (data.transparent.index.length > 0) {
      const m = new THREE.Mesh(this.geometry(data.transparent, chunk.cx, chunk.cz), this.transparentMat);
      m.matrixAutoUpdate = false;
      m.renderOrder = 2;
      this.scene.add(m);
      e.transparent = m;
    }
    chunk.meshDirty = false;
  }

  /** Rebuild dirty chunks within the frame budget. Returns meshes built. */
  update(budgetMs: number): number {
    const t0 = performance.now();
    for (const [key, e] of [...this.entries]) {
      const parts = key.split(',');
      if (!this.world.getChunk(parseInt(parts[0], 10), parseInt(parts[1], 10))) {
        this.disposeEntry(e);
        this.entries.delete(key);
      }
    }
    let built = 0;
    for (const key of [...this.world.pendingMesh]) {
      if (performance.now() - t0 > budgetMs) break;
      const parts = key.split(',');
      const chunk = this.world.getChunk(parseInt(parts[0], 10), parseInt(parts[1], 10));
      if (!chunk) {
        this.world.pendingMesh.delete(key);
        continue;
      }
      if (!chunk.lit) continue;
      this.world.pendingMesh.delete(key);
      try {
        this.rebuild(chunk);
        built++;
      } catch (err) {
        console.error('mesh failed for', key, err);
      }
    }
    return built;
  }

  /** Approximate visible triangles / draw calls for the debug overlay. */
  countStats(camera: THREE.PerspectiveCamera): void {
    let tris = 0;
    let calls = 0;
    const frustum = new THREE.Frustum();
    const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(m);
    const sphere = new THREE.Sphere();
    for (const e of this.entries.values()) {
      for (const mesh of [e.opaque, e.transparent]) {
        if (!mesh) continue;
        const s = mesh.geometry.boundingSphere;
        if (s) {
          sphere.center.copy(s.center);
          sphere.radius = s.radius;
          if (!frustum.intersectsSphere(sphere)) continue;
        }
        const idx = mesh.geometry.index;
        if (idx) tris += idx.count / 3;
        calls++;
      }
    }
    this.triangles = tris;
    this.drawCalls = calls;
  }

  dispose(): void {
    for (const e of this.entries.values()) this.disposeEntry(e);
    this.entries.clear();
    this.opaqueMat.dispose();
    this.transparentMat.dispose();
    this.texture.dispose();
  }
}

