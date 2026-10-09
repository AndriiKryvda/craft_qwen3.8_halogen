/** Sky dome with a sun and moon disc, driven by the world clock palette. */

import * as THREE from 'three';
import type { SkyPalette } from '../engine/time';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
varying vec3 vDir;

float disc(vec3 dir, vec3 body, float size, float edge) {
  float d = distance(normalize(dir), normalize(body));
  return 1.0 - smoothstep(size, size + edge, d);
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 1.35 + 0.12, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, h);
  float glow = pow(max(dot(d, normalize(uSunDir)), 0.0), 12.0);
  c += uSun * glow * 0.35;
  c += vec3(1.0, 0.98, 0.9) * disc(d, uSunDir, 0.045, 0.02) * step(0.0, normalize(uSunDir).y + 0.2);
  c += vec3(0.85, 0.9, 1.0) * disc(d, uMoonDir, 0.038, 0.02) * step(0.0, normalize(uMoonDir).y + 0.2);
  gl_FragColor = vec4(c, 1.0);
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uZenith: { value: new THREE.Color(0.36, 0.6, 0.95) },
      uHorizon: { value: new THREE.Color(0.72, 0.85, 1.0) },
      uSun: { value: new THREE.Color(1, 0.96, 0.86) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) }
    };
    const geo = new THREE.SphereGeometry(1, 24, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.setScalar(1000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }

  update(camera: THREE.Camera, p: SkyPalette): void {
    this.mesh.position.copy(camera.position);
    (this.uniforms.uZenith.value as THREE.Color).setRGB(p.zenith[0], p.zenith[1], p.zenith[2]);
    (this.uniforms.uHorizon.value as THREE.Color).setRGB(p.horizon[0], p.horizon[1], p.horizon[2]);
    (this.uniforms.uSun.value as THREE.Color).setRGB(p.sun[0], p.sun[1], p.sun[2]);
    (this.uniforms.uSunDir.value as THREE.Vector3).set(p.sunDir[0], p.sunDir[1], p.sunDir[2]);
    (this.uniforms.uMoonDir.value as THREE.Vector3).set(p.moonDir[0], p.moonDir[1], p.moonDir[2]);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
