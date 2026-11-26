import * as THREE from 'three';

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return { canvas: c, ctx: c.getContext('2d') };
}

function finalizeTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function drawCracks(ctx, size, color = 'rgba(20, 20, 20, 0.72)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(size * 0.15, size * 0.12);
  ctx.lineTo(size * 0.42, size * 0.45);
  ctx.lineTo(size * 0.33, size * 0.78);
  ctx.moveTo(size * 0.42, size * 0.45);
  ctx.lineTo(size * 0.78, size * 0.35);
  ctx.lineTo(size * 0.88, size * 0.62);
  ctx.moveTo(size * 0.42, size * 0.45);
  ctx.lineTo(size * 0.65, size * 0.85);
  ctx.stroke();
}

export function createGrassTexture() {
  const { canvas, ctx } = makeCanvas(512);
  ctx.fillStyle = '#4e9143';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle turf patches
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 6 + Math.random() * 24;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(116, 179, 86, 0.18)' : 'rgba(46, 102, 44, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Grass blades
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(145, 208, 102, 0.25)' : 'rgba(34, 82, 34, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 5, y - 6 - Math.random() * 6);
    ctx.stroke();
  }
  return finalizeTexture(canvas, 18, 18);
}

export function createWoodTexture(damaged = false) {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = damaged ? '#9e6835' : '#bc7f43';
  ctx.fillRect(0, 0, 256, 256);

  // Wood grain streaks
  for (let y = 0; y < 256; y += 4) {
    const shade = (Math.sin(y * 0.14) * 14) | 0;
    ctx.fillStyle = `rgba(${110 + shade}, ${65 + shade}, ${28}, 0.26)`;
    ctx.fillRect(0, y, 256, 2 + (y % 3));
  }
  // Plank border bevel
  ctx.strokeStyle = 'rgba(72, 40, 14, 0.55)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);

  // Corner nail dots
  ctx.fillStyle = '#47362b';
  [[20, 20], [236, 20], [20, 236], [236, 236]].forEach(([nx, ny]) => {
    ctx.beginPath();
    ctx.arc(nx, ny, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (damaged) drawCracks(ctx, 256, 'rgba(42, 22, 8, 0.85)');
  return finalizeTexture(canvas);
}

export function createStoneTexture(damaged = false) {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = damaged ? '#6c737d' : '#858e99';
  ctx.fillRect(0, 0, 256, 256);

  // Granite speckles
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const s = 1 + Math.random() * 3.5;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(25,30,38,0.16)';
    ctx.fillRect(x, y, s, s);
  }

  // Carved stone block mortar lines
  ctx.strokeStyle = 'rgba(40, 46, 54, 0.65)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 250);
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 128);
  ctx.stroke();

  if (damaged) drawCracks(ctx, 256, 'rgba(18, 22, 28, 0.9)');
  return finalizeTexture(canvas);
}

export function createGlassTexture(damaged = false) {
  const { canvas, ctx } = makeCanvas(256);
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#c7f4ff');
  grad.addColorStop(0.5, '#7ad8f5');
  grad.addColorStop(1, '#4db7e0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Diagonal reflection glint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(92, 0);
  ctx.lineTo(0, 92);
  ctx.lineTo(0, 28);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(120, 0);
  ctx.lineTo(148, 0);
  ctx.lineTo(0, 148);
  ctx.lineTo(0, 120);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);

  if (damaged) drawCracks(ctx, 256, 'rgba(255, 255, 255, 0.95)');
  return finalizeTexture(canvas);
}

export function createTargetFaceTexture(isBoss = false) {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = isBoss ? '#4da82c' : '#65c43b';
  ctx.fillRect(0, 0, 256, 256);

  // Eyes positioned near front hemisphere UV (around x = 128)
  const drawEye = (cx, cy) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f4d14';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx + (cx < 128 ? 3 : -3), cy, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + 2, cy - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  };

  drawEye(96, 114);
  drawEye(160, 114);

  // Cheeky eyebrows
  ctx.strokeStyle = '#1f4d14';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(76, 92);
  ctx.lineTo(112, 98);
  ctx.moveTo(180, 92);
  ctx.lineTo(144, 98);
  ctx.stroke();

  // Snout
  ctx.fillStyle = '#92e65c';
  ctx.beginPath();
  ctx.ellipse(128, 146, 26, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a6b18';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Nostrils
  ctx.fillStyle = '#1d4d12';
  ctx.beginPath();
  ctx.ellipse(118, 146, 5, 7, -0.2, 0, Math.PI * 2);
  ctx.ellipse(138, 146, 5, 7, 0.2, 0, Math.PI * 2);
  ctx.fill();

  return finalizeTexture(canvas);
}

export function createMaterialLibrary() {
  const woodTex = createWoodTexture(false);
  const woodDmgTex = createWoodTexture(true);
  const stoneTex = createStoneTexture(false);
  const stoneDmgTex = createStoneTexture(true);
  const glassTex = createGlassTexture(false);
  const glassDmgTex = createGlassTexture(true);
  const targetTex = createTargetFaceTexture(false);
  const bossTex = createTargetFaceTexture(true);

  return {
    grass: new THREE.MeshStandardMaterial({
      map: createGrassTexture(),
      roughness: 0.92,
      metalness: 0.02
    }),
    wood: new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.78,
      metalness: 0.05
    }),
    woodDamaged: new THREE.MeshStandardMaterial({
      map: woodDmgTex,
      roughness: 0.85,
      metalness: 0.05
    }),
    stone: new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.88,
      metalness: 0.08
    }),
    stoneDamaged: new THREE.MeshStandardMaterial({
      map: stoneDmgTex,
      roughness: 0.92,
      metalness: 0.08
    }),
    glass: new THREE.MeshPhysicalMaterial({
      map: glassTex,
      transparent: true,
      opacity: 0.58,
      roughness: 0.12,
      metalness: 0.08,
      reflectivity: 0.9
    }),
    glassDamaged: new THREE.MeshPhysicalMaterial({
      map: glassDmgTex,
      transparent: true,
      opacity: 0.72,
      roughness: 0.25,
      metalness: 0.05
    }),
    target: new THREE.MeshStandardMaterial({
      map: targetTex,
      roughness: 0.45,
      metalness: 0.05
    }),
    bossTarget: new THREE.MeshStandardMaterial({
      map: bossTex,
      roughness: 0.42,
      metalness: 0.08
    }),
    heavyProjectile: new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.35,
      metalness: 0.18
    }),
    splitProjectile: new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.28,
      metalness: 0.25
    }),
    bombProjectile: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.55
    })
  };
}
