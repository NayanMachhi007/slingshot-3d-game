import * as THREE from 'three';

const PARTICLE_COLORS = {
  wood: [0xc98a4b, 0x9b622b, 0xdeb078],
  stone: [0x8b95a1, 0x5c6470, 0xb0b8c2],
  glass: [0xbff6ff, 0x7dd3fc, 0xe0f2fe],
  target: [0x65c43b, 0xa3e635, 0xfde047],
  explosion: [0xff6b00, 0xfacc15, 0xef4444, 0x334155],
  split: [0x60a5fa, 0x93c5fd, 0xffffff]
};

export class EffectsManager {
  constructor(scene, popupContainer) {
    this.scene = scene;
    this.popupContainer = popupContainer;
    this.particles = [];
    this.rings = [];
    this.flashes = [];
    this.sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.sharedRingGeo = new THREE.RingGeometry(0.4, 0.72, 32);
  }

  spawnBurst(position, type = 'wood', count = 14, speedScale = 1) {
    const palette = PARTICLE_COLORS[type] || PARTICLE_COLORS.wood;
    const isGlass = type === 'glass';

    for (let i = 0; i < count; i++) {
      const color = palette[Math.floor(Math.random() * palette.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: isGlass ? 0.15 : 0.75,
        metalness: isGlass ? 0.1 : 0.05,
        transparent: true,
        opacity: isGlass ? 0.8 : 1.0
      });

      const mesh = new THREE.Mesh(this.sharedBoxGeo, mat);
      const sx = (0.14 + Math.random() * 0.24) * (type === 'wood' ? 1.5 : 1);
      const sy = 0.12 + Math.random() * 0.22;
      const sz = 0.12 + Math.random() * 0.22;
      mesh.scale.set(sx, sy, sz);

      mesh.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        position.y + (Math.random() - 0.5) * 0.5,
        position.z + (Math.random() - 0.5) * 0.5
      );
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(mesh);

      const theta = Math.random() * Math.PI * 2;
      const speed = (2.8 + Math.random() * 6.5) * speedScale;
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(theta) * speed,
          (2.5 + Math.random() * 6.5) * speedScale,
          Math.sin(theta) * speed
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14
        ),
        life: 0.65 + Math.random() * 0.55,
        maxLife: 1.2
      });
    }
  }

  spawnExplosion(position) {
    this.spawnBurst(position, 'explosion', 32, 1.85);

    // Expanding shockwave ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb703,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(this.sharedRingGeo, ringMat);
    ring.position.copy(position);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.rings.push({ mesh: ring, age: 0, maxAge: 0.45, maxScale: 10.5 });

    // Dynamic point light flash
    const flash = new THREE.PointLight(0xff7b00, 18, 22);
    flash.position.copy(position);
    this.scene.add(flash);
    this.flashes.push({ light: flash, age: 0, maxAge: 0.35 });
  }

  spawnFloatingScore(worldPos, camera, text, cssClass = 'block') {
    if (!this.popupContainer) return;
    const v = worldPos.clone().project(camera);
    if (v.z > 1) return;

    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = `float-score ${cssClass}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.popupContainer.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1050);
  }

  update(dt) {
    // Update cube particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.1) {
        p.mesh.position.y = 0.1;
        p.vel.y *= -0.35;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;

      const ratio = Math.max(0, p.life / p.maxLife);
      p.mesh.material.opacity = Math.min(1, ratio * 1.4);
    }

    // Update shockwave rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.maxAge) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const t = r.age / r.maxAge;
      const scale = 1 + t * r.maxScale;
      r.mesh.scale.set(scale, scale, 1);
      r.mesh.material.opacity = 0.9 * (1 - t);
    }

    // Update explosion flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      if (f.age >= f.maxAge) {
        this.scene.remove(f.light);
        this.flashes.splice(i, 1);
        continue;
      }
      f.light.intensity = 18 * (1 - f.age / f.maxAge);
    }
  }

  clear() {
    this.particles.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    });
    this.rings.forEach((r) => {
      this.scene.remove(r.mesh);
      r.mesh.material.dispose();
    });
    this.flashes.forEach((f) => this.scene.remove(f.light));
    this.particles = [];
    this.rings = [];
    this.flashes = [];
    if (this.popupContainer) this.popupContainer.innerHTML = '';
  }
}
