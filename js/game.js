import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createMaterialLibrary } from './textures.js';
import { EffectsManager } from './particles.js';
import { SoundEngine } from './audio.js';
import { LEVELS, MATERIAL_STATS, PROJECTILE_DEFS, FORTRESS_BASE_Y, FORTRESS_CENTER_Z } from './levels.js';

const GRAVITY = -16.5;
const SLING_ANCHOR = new THREE.Vector3(0, 3.65, 14.5);
const MAX_PULL = 3.6;
const LAUNCH_SPEED_SCALE = 9.2; // Launch velocity = pullVector * LAUNCH_SPEED_SCALE
const PROJECTILE_DAMPING = 0.04;
const UNUSED_SHOT_BONUS = 1000;

export class SlingshotGame {
  constructor(canvas, uiCallbacks) {
    this.canvas = canvas;
    this.ui = uiCallbacks;
    this.sound = new SoundEngine();

    // Core state
    this.currentLevelIndex = 0;
    this.gameState = 'MENU'; // MENU | AIMING | FLYING | SETTLING | VICTORY | GAMEOVER
    this.score = 0;
    this.shotQueue = [];
    this.levelGraceTimer = 0;
    this.flightTimer = 0;
    this.settleTimer = 0;
    this.impactOccurred = false;
    this.abilityUsed = false;

    // Entity registries for clean disposal
    this.blocks = [];
    this.targets = [];
    this.projectiles = [];
    this.activeProjectile = null;
    this.loadedVisual = null;
    this.levelDisposables = [];
    this.pendingBodyRemovals = [];

    // Aim & Pointer state
    this.isAiming = false;
    this.isOrbiting = false;
    this.aimStartPointer = new THREE.Vector2();
    this.orbitLastPointer = new THREE.Vector2();
    this.pullOffset = new THREE.Vector3(); // Offset from SLING_ANCHOR
    this.raycaster = new THREE.Raycaster();

    // Camera state
    this.cameraMode = 'SLINGSHOT'; // SLINGSHOT | INSPECT | FOLLOW
    this.orbitYaw = 0;
    this.orbitPitch = 0.28;
    this.orbitDistance = 12.5;
    this.inspectYaw = 0.45;
    this.inspectPitch = 0.34;
    this.inspectDistance = 19.5;
    this.camPos = new THREE.Vector3(0, 7.2, 25.5);
    this.camTarget = new THREE.Vector3(0, 3.4, -4);
    this.shakeIntensity = 0;

    // Initialize 3D Scene, Physics, Environment & Input
    this._initRendererAndScene();
    this._initPhysicsWorld();
    this._buildEnvironment();
    this._buildSlingshot();
    this._buildTrajectoryDots();
    this._bindEvents();

    this.effects = new EffectsManager(this.scene, document.getElementById('floating-scores'));

    // Start render loop
    this.clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _initRendererAndScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9bd0f5, 0.0085);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.2, 260);
    this.camera.position.copy(this.camPos);

    this.materials = createMaterialLibrary();

    // Sky gradient dome
    const skyGeo = new THREE.SphereGeometry(180, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1e60b8) },
        midColor: { value: new THREE.Color(0x7cc4f5) },
        bottomColor: { value: new THREE.Color(0xdbeeff) }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = h > 0.0
            ? mix(midColor, topColor, pow(clamp(h, 0.0, 1.0), 0.7))
            : mix(midColor, bottomColor, clamp(-h * 4.0, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xdff2ff, 0x4c7c41, 0.85);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.85);
    sunLight.position.set(22, 34, 18);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 95;
    const d = 28;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0006;
    this.scene.add(sunLight);

    // Subtle cool back rim light
    const rimLight = new THREE.DirectionalLight(0x8ecae6, 0.45);
    rimLight.position.set(-18, 12, -24);
    this.scene.add(rimLight);
  }

  _initPhysicsWorld() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, GRAVITY, 0)
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 16;
    this.world.solver.tolerance = 0.001;

    this.physMatDefault = new CANNON.Material('default');
    this.physMatGround = new CANNON.Material('ground');
    this.physMatProjectile = new CANNON.Material('projectile');

    // Stable, low-bounce contact materials so towers never jitter
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.physMatDefault, this.physMatDefault, {
        friction: 0.78,
        restitution: 0.05,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.physMatDefault, this.physMatGround, {
        friction: 0.88,
        restitution: 0.04,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.physMatProjectile, this.physMatDefault, {
        friction: 0.45,
        restitution: 0.25
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.physMatProjectile, this.physMatGround, {
        friction: 0.5,
        restitution: 0.35
      })
    );

    // Infinite ground plane
    const groundBody = new CANNON.Body({
      mass: 0,
      material: this.physMatGround,
      shape: new CANNON.Plane()
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    // Fortress stone foundation pad (physics body)
    const padW = 16;
    const padH = FORTRESS_BASE_Y;
    const padD = 12;
    const padBody = new CANNON.Body({
      mass: 0,
      material: this.physMatGround,
      shape: new CANNON.Box(new CANNON.Vec3(padW / 2, padH / 2, padD / 2)),
      position: new CANNON.Vec3(0, padH / 2, FORTRESS_CENTER_Z)
    });
    this.world.addBody(padBody);
  }

  _buildEnvironment() {
    // Textured ground plane
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      this.materials.grass
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    // Stone foundation pad under fortress
    const padMesh = new THREE.Mesh(
      new THREE.BoxGeometry(16, FORTRESS_BASE_Y, 12),
      this.materials.stone
    );
    padMesh.position.set(0, FORTRESS_BASE_Y / 2, FORTRESS_CENTER_Z);
    padMesh.receiveShadow = true;
    padMesh.castShadow = true;
    this.scene.add(padMesh);

    // Slingshot wooden launching deck
    const deckMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.6, 0.5, 16),
      this.materials.wood
    );
    deckMesh.position.set(0, 0.25, SLING_ANCHOR.z);
    deckMesh.receiveShadow = true;
    deckMesh.castShadow = true;
    this.scene.add(deckMesh);

    // Stylized distant hills
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.95 });
    [
      [-42, -52, 26, 11],
      [38, -58, 30, 14],
      [-55, -12, 22, 8],
      [54, -18, 24, 9],
      [0, -76, 42, 16]
    ].forEach(([x, z, r, h]) => {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), hillMat);
      hill.position.set(x, h / 2 - 0.5, z);
      hill.receiveShadow = true;
      this.scene.add(hill);
    });

    // Decorative low-poly pine trees along arena edges
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6a32, roughness: 0.85 });
    const treeCoords = [
      [-16, -24], [-20, -14], [-18, -2], [-16, 10],
      [16, -24], [21, -12], [18, 0], [16, 11],
      [-10, -30], [11, -30]
    ];
    treeCoords.forEach(([tx, tz]) => {
      const group = new THREE.Group();
      const s = 0.85 + Math.random() * 0.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 6), trunkMat);
      trunk.position.y = 0.8;
      trunk.castShadow = true;
      group.add(trunk);

      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.8, 7), leafMat);
      cone1.position.y = 2.6;
      cone1.castShadow = true;
      group.add(cone1);

      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 7), leafMat);
      cone2.position.y = 4.0;
      cone2.castShadow = true;
      group.add(cone2);

      group.position.set(tx, 0, tz);
      group.scale.setScalar(s);
      this.scene.add(group);
    });

    // Floating stylized clouds
    this.clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1.8 + Math.random() * 1.1, 8, 8), cloudMat);
        puff.position.set((j - 1) * 1.8, Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
        puff.scale.set(1.2, 0.72, 0.9);
        cloud.add(puff);
      }
      cloud.position.set(-55 + i * 16, 20 + Math.random() * 7, -38 - Math.random() * 22);
      this.scene.add(cloud);
      this.clouds.push({ mesh: cloud, speed: 0.45 + Math.random() * 0.4 });
    }
  }

  _buildSlingshot() {
    const slingWood = new THREE.MeshStandardMaterial({ color: 0x6b3f1d, roughness: 0.82 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x3b2210, roughness: 0.9 });
    const group = new THREE.Group();
    group.position.set(SLING_ANCHOR.x, 0.5, SLING_ANCHOR.z);

    // Stem
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.9, 10), slingWood);
    stem.position.y = 0.95;
    stem.castShadow = true;
    group.add(stem);

    // Left & Right Y-forks
    const leftFork = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.85, 10), slingWood);
    leftFork.position.set(-0.56, 2.48, 0);
    leftFork.rotation.z = 0.36;
    leftFork.castShadow = true;
    group.add(leftFork);

    const rightFork = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.85, 10), slingWood);
    rightFork.position.set(0.56, 2.48, 0);
    rightFork.rotation.z = -0.36;
    rightFork.castShadow = true;
    group.add(rightFork);

    // Fork leather wraps
    [-0.9, 0.9].forEach((x) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.28, 10), gripMat);
      cap.position.set(x, 3.15, 0);
      group.add(cap);
    });

    this.scene.add(group);

    // World coordinates of the two rubber anchor points
    this.forkLeftPos = new THREE.Vector3(SLING_ANCHOR.x - 0.9, SLING_ANCHOR.y, SLING_ANCHOR.z);
    this.forkRightPos = new THREE.Vector3(SLING_ANCHOR.x + 0.9, SLING_ANCHOR.y, SLING_ANCHOR.z);

    // Dynamic rubber band meshes
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.6 });
    const bandGeo = new THREE.CylinderGeometry(0.065, 0.065, 1, 8);
    this.bandLeft = new THREE.Mesh(bandGeo, bandMat);
    this.bandRight = new THREE.Mesh(bandGeo, bandMat);
    this.scene.add(this.bandLeft, this.bandRight);

    // Leather pouch
    this.pouchMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.4, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 })
    );
    this.scene.add(this.pouchMesh);

    // Subtle grab-hint glow ring around loaded projectile
    this.aimHintRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.92, 28),
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide
      })
    );
    this.aimHintRing.position.copy(SLING_ANCHOR);
    this.scene.add(this.aimHintRing);

    this._updateSlingshotBands(SLING_ANCHOR);
  }

  _updateSlingshotBands(pouchPos) {
    const updateBand = (mesh, start, end) => {
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      mesh.position.copy(start).addScaledVector(dir, 0.5);
      mesh.scale.set(1, Math.max(0.01, len), 1);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    };

    updateBand(this.bandLeft, this.forkLeftPos, pouchPos);
    updateBand(this.bandRight, this.forkRightPos, pouchPos);

    this.pouchMesh.position.copy(pouchPos);
    this.pouchMesh.lookAt(SLING_ANCHOR.x, SLING_ANCHOR.y, SLING_ANCHOR.z - 20);
  }

  _buildTrajectoryDots() {
    this.trajectoryDots = [];
    const count = 24;
    const dotGeo = new THREE.SphereGeometry(0.16, 10, 10);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9 - t * 0.68
      });
      const dot = new THREE.Mesh(dotGeo, mat);
      const s = 1.0 - t * 0.55;
      dot.scale.setScalar(s);
      dot.visible = false;
      this.scene.add(dot);
      this.trajectoryDots.push(dot);
    }
  }

  _updateTrajectoryPreview(startPos, launchVel) {
    // Match exact Cannon-es integration with linearDamping
    const pos = startPos.clone();
    const vel = launchVel.clone();
    const stepDt = 0.085;
    const damp = Math.pow(1 - PROJECTILE_DAMPING, stepDt);

    for (let i = 0; i < this.trajectoryDots.length; i++) {
      vel.y += GRAVITY * stepDt;
      vel.multiplyScalar(damp);
      pos.addScaledVector(vel, stepDt);
      const dot = this.trajectoryDots[i];
      if (pos.y < 0.15) {
        dot.visible = false;
      } else {
        dot.position.copy(pos);
        dot.visible = true;
      }
    }
  }

  _hideTrajectory() {
    this.trajectoryDots.forEach((d) => { d.visible = false; });
  }

  // =========================================================================
  // LEVEL LOADING & CLEAN MEMORY DISPOSAL
  // =========================================================================
  loadLevel(index) {
    this.disposeLevel();
    this.currentLevelIndex = index;
    const cfg = LEVELS[index];

    this.score = 0;
    this.shotQueue = [...cfg.shots];
    this.levelGraceTimer = 0.65;
    this.impactOccurred = false;
    this.abilityUsed = false;
    this.cameraMode = 'SLINGSHOT';
    this.orbitYaw = 0;
    this.orbitPitch = 0.24;
    this.orbitDistance = 12.2;

    // Spawn destructible blocks
    cfg.blocks.forEach((bCfg) => this._spawnBlock(bCfg));

    // Spawn target enemies
    cfg.targets.forEach((tCfg) => this._spawnTarget(tCfg));

    this._loadNextProjectile();
    this.gameState = 'AIMING';
    this._syncUI();
  }

  disposeLevel() {
    // Remove blocks
    this.blocks.forEach((b) => {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      this.world.removeBody(b.body);
    });
    this.blocks = [];

    // Remove targets
    this.targets.forEach((t) => {
      this.scene.remove(t.mesh);
      this.world.removeBody(t.body);
    });
    this.targets = [];

    // Remove launched projectiles
    this.projectiles.forEach((p) => {
      this.scene.remove(p.mesh);
      this.world.removeBody(p.body);
    });
    this.projectiles = [];
    this.activeProjectile = null;

    // Remove loaded preview projectile
    if (this.loadedVisual) {
      this.scene.remove(this.loadedVisual);
      this.loadedVisual = null;
    }

    // Dispose level-specific geometries
    this.levelDisposables.forEach((g) => g.dispose());
    this.levelDisposables = [];
    this.pendingBodyRemovals = [];

    this.effects.clear();
    this._hideTrajectory();
    this._updateSlingshotBands(SLING_ANCHOR);
  }

  _spawnBlock(bCfg) {
    const [w, h, d] = bCfg.size;
    const [x, y, z] = bCfg.pos;
    const stats = MATERIAL_STATS[bCfg.material];

    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = this.materials[bCfg.material];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass: stats.mass * (w * h * d * 0.45),
      material: this.physMatDefault,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
      position: new CANNON.Vec3(x, y, z),
      linearDamping: 0.08,
      angularDamping: 0.16,
      sleepSpeedLimit: 0.25,
      sleepTimeLimit: 0.4
    });
    body.sleep(); // Completely still at start

    const blockObj = {
      type: 'block',
      material: bCfg.material,
      mesh,
      body,
      hp: stats.hp,
      maxHp: stats.hp,
      scoreValue: stats.score,
      damagedVisual: false,
      destroyed: false
    };

    body.addEventListener('collide', (e) => this._handleCollision(blockObj, e));
    this.world.addBody(body);
    this.blocks.push(blockObj);
  }

  _spawnTarget(tCfg) {
    const [x, y, z] = tCfg.pos;
    const r = tCfg.radius;
    const group = new THREE.Group();

    const sphereGeo = new THREE.SphereGeometry(r, 22, 18);
    this.levelDisposables.push(sphereGeo);
    const bodyMesh = new THREE.Mesh(
      sphereGeo,
      tCfg.isBoss ? this.materials.bossTarget : this.materials.target
    );
    // Rotate so canvas face points toward the player (+Z)
    bodyMesh.rotation.y = -Math.PI / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // Cute ears
    const earGeo = new THREE.SphereGeometry(r * 0.25, 10, 10);
    this.levelDisposables.push(earGeo);
    const earMat = new THREE.MeshStandardMaterial({ color: tCfg.isBoss ? 0x4da82c : 0x65c43b, roughness: 0.5 });
    this.levelDisposables.push(earMat);
    const leftEar = new THREE.Mesh(earGeo, earMat);
    leftEar.position.set(-r * 0.65, r * 0.72, 0);
    const rightEar = new THREE.Mesh(earGeo, earMat);
    rightEar.position.set(r * 0.65, r * 0.72, 0);
    group.add(leftEar, rightEar);

    // Golden crown for boss target
    if (tCfg.isBoss) {
      const crownGeo = new THREE.CylinderGeometry(r * 0.48, r * 0.36, r * 0.42, 6);
      this.levelDisposables.push(crownGeo);
      const crownMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.65, roughness: 0.25 });
      this.levelDisposables.push(crownMat);
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.y = r * 1.05;
      crown.castShadow = true;
      group.add(crown);
    }

    group.position.set(x, y, z);
    this.scene.add(group);

    const body = new CANNON.Body({
      mass: tCfg.isBoss ? 2.4 : 1.4,
      material: this.physMatDefault,
      shape: new CANNON.Sphere(r),
      position: new CANNON.Vec3(x, y, z),
      linearDamping: 0.12,
      angularDamping: 0.28,
      sleepSpeedLimit: 0.22,
      sleepTimeLimit: 0.35
    });
    body.sleep();

    const targetObj = {
      type: 'target',
      isBoss: tCfg.isBoss,
      mesh: group,
      body,
      hp: tCfg.hp,
      maxHp: tCfg.hp,
      scoreValue: tCfg.score,
      eliminated: false
    };

    body.addEventListener('collide', (e) => this._handleCollision(targetObj, e));
    this.world.addBody(body);
    this.targets.push(targetObj);
  }

  _createProjectileMesh(typeKey, radius) {
    const group = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(radius, 22, 18);
    this.levelDisposables.push(sphereGeo);

    const matKey =
      typeKey === 'split'
        ? 'splitProjectile'
        : typeKey === 'bomb'
        ? 'bombProjectile'
        : 'heavyProjectile';
    const orb = new THREE.Mesh(sphereGeo, this.materials[matKey]);
    orb.castShadow = true;
    group.add(orb);

    // Visual flair per projectile type
    if (typeKey === 'bomb') {
      const fuseGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8);
      this.levelDisposables.push(fuseGeo);
      const fuse = new THREE.Mesh(fuseGeo, new THREE.MeshStandardMaterial({ color: 0xd4a373 }));
      fuse.position.set(0, radius + 0.12, 0);
      group.add(fuse);

      const sparkGeo = new THREE.SphereGeometry(0.11, 8, 8);
      this.levelDisposables.push(sparkGeo);
      const spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xff6b00 }));
      spark.position.set(0, radius + 0.32, 0);
      group.add(spark);
    } else if (typeKey === 'split') {
      const ringGeo = new THREE.TorusGeometry(radius * 0.92, 0.06, 8, 24);
      this.levelDisposables.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x93c5fd }));
      group.add(ring);
    } else {
      // Determined crest / visor band on heavy boulder
      const bandGeo = new THREE.TorusGeometry(radius * 0.88, 0.07, 8, 24);
      this.levelDisposables.push(bandGeo);
      const band = new THREE.Mesh(bandGeo, new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.4 }));
      band.rotation.x = Math.PI / 2;
      group.add(band);
    }

    return group;
  }

  _loadNextProjectile() {
    if (this.loadedVisual) {
      this.scene.remove(this.loadedVisual);
      this.loadedVisual = null;
    }
    this.pullOffset.set(0, 0, 0);
    this._updateSlingshotBands(SLING_ANCHOR);

    if (this.shotQueue.length === 0) {
      this.aimHintRing.visible = false;
      return;
    }

    const typeKey = this.shotQueue[0];
    const def = PROJECTILE_DEFS[typeKey];
    this.loadedVisual = this._createProjectileMesh(typeKey, def.radius);
    this.loadedVisual.position.copy(SLING_ANCHOR);
    this.scene.add(this.loadedVisual);
    this.aimHintRing.visible = true;
    this.aimHintRing.position.copy(SLING_ANCHOR);
  }

  // =========================================================================
  // LAUNCH & SPECIAL ABILITIES
  // =========================================================================
  _computeLaunchVelocity() {
    if (this.shotQueue.length === 0) return new THREE.Vector3();
    const def = PROJECTILE_DEFS[this.shotQueue[0]];
    // Launch opposite to pullOffset, with a gentle natural upward arc boost
    const vel = this.pullOffset.clone().multiplyScalar(-LAUNCH_SPEED_SCALE * def.powerMult);
    vel.y += 1.6;
    return vel;
  }

  _launchCurrentProjectile() {
    if (this.shotQueue.length === 0 || this.pullOffset.length() < 0.45) {
      // Cancel shot if pull was too small
      this.pullOffset.set(0, 0, 0);
      if (this.loadedVisual) this.loadedVisual.position.copy(SLING_ANCHOR);
      this._updateSlingshotBands(SLING_ANCHOR);
      this._hideTrajectory();
      this.ui.hideAim();
      return;
    }

    const typeKey = this.shotQueue.shift();
    const def = PROJECTILE_DEFS[typeKey];
    const launchPos = SLING_ANCHOR.clone().add(this.pullOffset);
    const launchVel = this._computeLaunchVelocity();
    const pullRatio = Math.min(1, this.pullOffset.length() / MAX_PULL);

    if (this.loadedVisual) {
      this.scene.remove(this.loadedVisual);
      this.loadedVisual = null;
    }
    this.aimHintRing.visible = false;
    this._hideTrajectory();
    this._updateSlingshotBands(SLING_ANCHOR);
    this.ui.hideAim();

    const proj = this._spawnPhysicsProjectile(typeKey, def.radius, def.mass, launchPos, launchVel);
    this.activeProjectile = proj;
    this.impactOccurred = false;
    this.abilityUsed = false;
    this.flightTimer = 0;
    this.settleTimer = 0;
    this.gameState = 'FLYING';
    this.cameraMode = 'FOLLOW';

    this.sound.playLaunch(pullRatio);

    if (def.ability) {
      this.ui.showAbility(
        def.ability === 'SPLIT'
          ? 'CLICK OR PRESS SPACE TO SPLIT INTO 3!'
          : 'CLICK OR PRESS SPACE TO DETONATE!'
      );
    }
    this.ui.setNextShotVisible(true);
    this._syncUI();
  }

  _spawnPhysicsProjectile(typeKey, radius, mass, pos, vel) {
    const mesh = this._createProjectileMesh(typeKey, radius);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass,
      material: this.physMatProjectile,
      shape: new CANNON.Sphere(radius),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      velocity: new CANNON.Vec3(vel.x, vel.y, vel.z),
      angularVelocity: new CANNON.Vec3(-6.5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3),
      linearDamping: PROJECTILE_DAMPING,
      angularDamping: 0.1
    });

    const projObj = {
      type: 'projectile',
      kind: typeKey,
      mesh,
      body,
      detonated: false,
      impactTime: null
    };

    body.addEventListener('collide', (e) => {
      if (!this.impactOccurred) {
        this.impactOccurred = true;
        this.settleTimer = 0;
      }
      if (projObj.impactTime === null) {
        projObj.impactTime = this.flightTimer;
      }
      const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (speed > 7) {
        this._addCameraShake(Math.min(0.65, speed * 0.025));
      }
    });

    this.world.addBody(body);
    this.projectiles.push(projObj);
    return projObj;
  }

  triggerSpecialAbility() {
    if (this.gameState !== 'FLYING' || !this.activeProjectile || this.abilityUsed) return;

    const kind = this.activeProjectile.kind;
    if (kind === 'split') {
      this.abilityUsed = true;
      this.ui.hideAbility();
      const b = this.activeProjectile.body;
      const basePos = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
      const baseVel = new THREE.Vector3(b.velocity.x, b.velocity.y, b.velocity.z);

      this.sound.playSplit();
      this.effects.spawnBurst(basePos, 'split', 14, 1.1);
      this.effects.spawnFloatingScore(basePos, this.camera, 'TRIPLE SPLIT!', 'special');

      // Spawn two additional flanking mini-projectiles
      [-1, 1].forEach((side) => {
        const offset = new THREE.Vector3(side * 0.85, 0.25, 0);
        const spreadVel = baseVel.clone();
        spreadVel.x += side * 4.4;
        spreadVel.y += 1.5;
        this._spawnPhysicsProjectile('split', 0.36, 2.5, basePos.clone().add(offset), spreadVel);
      });
    } else if (kind === 'bomb') {
      this._detonateBomb(this.activeProjectile);
    }
  }

  _detonateBomb(projObj) {
    if (!projObj || projObj.detonated) return;
    projObj.detonated = true;
    this.abilityUsed = true;
    this.impactOccurred = true;
    this.ui.hideAbility();

    const origin = new THREE.Vector3(
      projObj.body.position.x,
      projObj.body.position.y,
      projObj.body.position.z
    );

    this.sound.playExplosion();
    this.effects.spawnExplosion(origin);
    this.effects.spawnFloatingScore(origin, this.camera, 'BOOM!', 'special');
    this._addCameraShake(1.15);

    const blastRadius = 7.8;
    const maxImpulse = 48;

    // Wake and blast all blocks
    this.blocks.forEach((blk) => {
      if (blk.destroyed) return;
      const pos = new THREE.Vector3(blk.body.position.x, blk.body.position.y, blk.body.position.z);
      const dist = pos.distanceTo(origin);
      if (dist < blastRadius) {
        blk.body.wakeUp();
        const factor = 1 - dist / blastRadius;
        const dir = pos.sub(origin).normalize();
        dir.y = Math.max(0.35, dir.y + 0.35);
        dir.normalize();
        const imp = maxImpulse * factor * Math.min(1.6, blk.body.mass * 0.45);
        blk.body.applyImpulse(new CANNON.Vec3(dir.x * imp, dir.y * imp, dir.z * imp));
        this._damageBlock(blk, 115 * factor);
      }
    });

    // Blast all targets
    this.targets.forEach((tgt) => {
      if (tgt.eliminated) return;
      const pos = new THREE.Vector3(tgt.body.position.x, tgt.body.position.y, tgt.body.position.z);
      const dist = pos.distanceTo(origin);
      if (dist < blastRadius) {
        tgt.body.wakeUp();
        const factor = 1 - dist / blastRadius;
        this._damageTarget(tgt, 95 * factor);
      }
    });

    // Remove detonated bomb body & mesh
    this.scene.remove(projObj.mesh);
    this.pendingBodyRemovals.push(projObj.body);
    const idx = this.projectiles.indexOf(projObj);
    if (idx !== -1) this.projectiles.splice(idx, 1);
    if (this.activeProjectile === projObj) this.activeProjectile = null;
  }

  // =========================================================================
  // COLLISION & DAMAGE SYSTEM
  // =========================================================================
  _handleCollision(entity, event) {
    if (this.levelGraceTimer > 0) return;

    const impactSpeed = Math.abs(event.contact.getImpactVelocityAlongNormal());
    if (impactSpeed < 2.2) return;

    const otherBody = event.body;
    const otherMass = otherBody.mass === 0 ? 5.0 : otherBody.mass;
    // Scale damage by impact speed & mass ratio
    const damage = impactSpeed * (1.7 + Math.min(3.2, otherMass * 0.55));

    if (entity.type === 'block' && !entity.destroyed) {
      if (impactSpeed > 3.0) {
        this.sound.playImpact(entity.material, Math.min(1, impactSpeed / 14));
      }
      if (damage > 6) {
        this._damageBlock(entity, damage);
      }
    } else if (entity.type === 'target' && !entity.eliminated) {
      if (damage > 7) {
        this._damageTarget(entity, damage);
      }
    }
  }

  _damageBlock(block, amount) {
    if (block.destroyed) return;
    block.hp -= amount;

    // Award partial damage points
    const dmgPts = Math.round(Math.min(amount, 30));
    if (dmgPts > 2) this.score += dmgPts;

    // Show cracked visual when below 58% HP
    if (!block.damagedVisual && block.hp > 0 && block.hp < block.maxHp * 0.58) {
      block.damagedVisual = true;
      block.mesh.material = this.materials[`${block.material}Damaged`];
    }

    if (block.hp <= 0) {
      block.destroyed = true;
      const pos = new THREE.Vector3(block.body.position.x, block.body.position.y, block.body.position.z);
      this.score += block.scoreValue;
      this.sound.playBreak(block.material);
      this.effects.spawnBurst(pos, block.material, block.material === 'glass' ? 18 : 13, 1.0);
      this.effects.spawnFloatingScore(pos, this.camera, `+${block.scoreValue}`, 'block');

      this.scene.remove(block.mesh);
      block.mesh.geometry.dispose();
      this.pendingBodyRemovals.push(block.body);
      this._syncUI();
    }
  }

  _damageTarget(target, amount) {
    if (target.eliminated) return;
    target.hp -= amount;
    if (target.hp <= 0) {
      this._eliminateTarget(target);
    }
  }

  _eliminateTarget(target) {
    if (target.eliminated) return;
    target.eliminated = true;
    const pos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
    this.score += target.scoreValue;

    this.sound.playTargetPop();
    this.effects.spawnBurst(pos, 'target', 22, 1.25);
    this.effects.spawnFloatingScore(pos, this.camera, `+${target.scoreValue}`, 'target');
    this._addCameraShake(0.32);

    this.scene.remove(target.mesh);
    this.pendingBodyRemovals.push(target.body);
    this._syncUI();
  }

  // =========================================================================
  // SHOT PROGRESSION & WIN/LOSS EVALUATION
  // =========================================================================
  advanceToNextShot() {
    if (this.gameState !== 'FLYING' && this.gameState !== 'SETTLING') return;
    this.ui.hideAbility();
    this.ui.setNextShotVisible(false);

    const remainingTargets = this.targets.filter((t) => !t.eliminated).length;
    if (remainingTargets === 0) {
      this._triggerVictory();
      return;
    }

    if (this.shotQueue.length === 0) {
      this._triggerGameOver(remainingTargets);
      return;
    }

    // Return smoothly to slingshot with next projectile loaded
    this.activeProjectile = null;
    this.cameraMode = 'SLINGSHOT';
    this.gameState = 'AIMING';
    this._loadNextProjectile();
    this._syncUI();
  }

  _triggerVictory() {
    this.gameState = 'VICTORY';
    this.ui.hideAbility();
    this.ui.setNextShotVisible(false);

    const baseScore = this.score;
    const unusedBonus = this.shotQueue.length * UNUSED_SHOT_BONUS;
    const totalScore = baseScore + unusedBonus;
    this.score = totalScore;

    const cfg = LEVELS[this.currentLevelIndex];
    let stars = 1;
    if (totalScore >= cfg.starThresholds[2]) stars = 3;
    else if (totalScore >= cfg.starThresholds[1]) stars = 2;

    this.sound.playVictory();
    this._syncUI();
    this.ui.showVictory({
      levelIndex: this.currentLevelIndex,
      levelName: cfg.name,
      baseScore,
      unusedBonus,
      totalScore,
      stars,
      hasNextLevel: this.currentLevelIndex < LEVELS.length - 1
    });
  }

  _triggerGameOver(remainingTargets) {
    this.gameState = 'GAMEOVER';
    this.ui.hideAbility();
    this.ui.setNextShotVisible(false);
    this.sound.playGameOver();
    this.ui.showGameOver({
      remainingTargets,
      score: this.score
    });
  }

  // =========================================================================
  // INPUT & CAMERA CONTROLS
  // =========================================================================
  _bindEvents() {
    const getPointerNDC = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
    };

    const isNearSlingshot = (e) => {
      const ndc = getPointerNDC(e);
      this.raycaster.setFromCamera(ndc, this.camera);
      // Generous invisible grab sphere around the slingshot pouch
      const grabSphere = new THREE.Sphere(SLING_ANCHOR, 2.2);
      return this.raycaster.ray.intersectsSphere(grabSphere);
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.sound.ensureContext();
      if (this.gameState === 'MENU' || this.gameState === 'VICTORY' || this.gameState === 'GAMEOVER') return;

      // Mid-air special ability trigger
      if (this.gameState === 'FLYING' && e.button === 0 && !this.abilityUsed && this.activeProjectile) {
        const def = PROJECTILE_DEFS[this.activeProjectile.kind];
        if (def.ability) {
          this.triggerSpecialAbility();
          return;
        }
      }

      if (this.gameState === 'AIMING' && e.button === 0 && this.cameraMode === 'SLINGSHOT' && isNearSlingshot(e)) {
        this.isAiming = true;
        this.aimStartPointer.set(e.clientX, e.clientY);
        this.canvas.classList.add('aiming');
        this.canvas.setPointerCapture(e.pointerId);
        this.ui.showAim();
      } else {
        this.isOrbiting = true;
        this.orbitLastPointer.set(e.clientX, e.clientY);
        this.canvas.classList.add('grabbing');
        this.canvas.setPointerCapture(e.pointerId);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.isAiming && this.gameState === 'AIMING') {
        const dx = (e.clientX - this.aimStartPointer.x) / Math.min(window.innerWidth, 900);
        const dy = (e.clientY - this.aimStartPointer.y) / Math.min(window.innerHeight, 750);

        // Map screen drag into intuitive 3D pull behind slingshot:
        // Pulling right moves ball right (fires left); pulling down pulls back & lowers pouch (fires higher/farther)
        const pullX = THREE.MathUtils.clamp(dx * 7.2, -2.5, 2.5);
        const pullBackZ = THREE.MathUtils.clamp(dy * 9.5, 0.2, MAX_PULL);
        const pullY = THREE.MathUtils.clamp(-dy * 3.8, -2.0, 0.8);

        this.pullOffset.set(pullX, pullY, pullBackZ);
        if (this.pullOffset.length() > MAX_PULL) {
          this.pullOffset.setLength(MAX_PULL);
        }

        const ballPos = SLING_ANCHOR.clone().add(this.pullOffset);
        if (this.loadedVisual) this.loadedVisual.position.copy(ballPos);
        this._updateSlingshotBands(ballPos);

        const launchVel = this._computeLaunchVelocity();
        this._updateTrajectoryPreview(ballPos, launchVel);

        const powerPct = Math.round((this.pullOffset.length() / MAX_PULL) * 100);
        const yawDeg = Math.round(THREE.MathUtils.radToDeg(Math.atan2(launchVel.x, -launchVel.z)));
        const horiz = Math.hypot(launchVel.x, launchVel.z);
        const pitchDeg = Math.round(THREE.MathUtils.radToDeg(Math.atan2(launchVel.y, horiz)));
        this.ui.updateAim(powerPct, yawDeg, pitchDeg);

        if (powerPct > 12) this.sound.playStretch(powerPct / 100);
      } else if (this.isOrbiting) {
        const dx = e.clientX - this.orbitLastPointer.x;
        const dy = e.clientY - this.orbitLastPointer.y;
        this.orbitLastPointer.set(e.clientX, e.clientY);

        if (this.cameraMode === 'INSPECT') {
          this.inspectYaw -= dx * 0.0065;
          this.inspectPitch = THREE.MathUtils.clamp(this.inspectPitch + dy * 0.005, 0.12, 1.12);
        } else if (this.cameraMode === 'SLINGSHOT') {
          this.orbitYaw = THREE.MathUtils.clamp(this.orbitYaw - dx * 0.0055, -0.95, 0.95);
          this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.0045, 0.08, 0.85);
        }
      }
    });

    const releasePointer = (e) => {
      if (this.isAiming) {
        this.isAiming = false;
        this.canvas.classList.remove('aiming');
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
        this._launchCurrentProjectile();
      }
      if (this.isOrbiting) {
        this.isOrbiting = false;
        this.canvas.classList.remove('grabbing');
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      }
    };

    this.canvas.addEventListener('pointerup', releasePointer);
    this.canvas.addEventListener('pointercancel', releasePointer);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.cameraMode === 'INSPECT') {
          this.inspectDistance = THREE.MathUtils.clamp(this.inspectDistance + e.deltaY * 0.015, 11, 34);
        } else if (this.cameraMode === 'SLINGSHOT') {
          this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance + e.deltaY * 0.012, 8, 22);
        }
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      if (this.gameState === 'MENU') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.gameState === 'FLYING' && !this.abilityUsed && this.activeProjectile && PROJECTILE_DEFS[this.activeProjectile.kind].ability) {
          this.triggerSpecialAbility();
        } else if (this.gameState === 'FLYING' || this.gameState === 'SETTLING') {
          this.advanceToNextShot();
        }
      } else if (e.code === 'KeyR') {
        this.loadLevel(this.currentLevelIndex);
      } else if (e.code === 'KeyV') {
        this.toggleCameraView();
      } else if (e.code === 'KeyM') {
        this.ui.onMuteShortcut();
      }
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  toggleCameraView() {
    if (this.gameState !== 'AIMING') return;
    this.cameraMode = this.cameraMode === 'INSPECT' ? 'SLINGSHOT' : 'INSPECT';
    if (this.cameraMode === 'SLINGSHOT') {
      this.orbitYaw = 0;
      this.orbitPitch = 0.24;
    }
    this.ui.updateCameraButton(this.cameraMode === 'INSPECT');
  }

  _addCameraShake(amount) {
    this.shakeIntensity = Math.min(1.4, this.shakeIntensity + amount);
  }

  _updateCamera(dt) {
    const desiredPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();

    if (this.gameState === 'MENU') {
      const t = performance.now() * 0.00025;
      desiredTarget.set(0, 3.6, FORTRESS_CENTER_Z);
      desiredPos.set(Math.sin(t) * 20, 10.5, FORTRESS_CENTER_Z + Math.cos(t) * 20);
    } else if (this.cameraMode === 'INSPECT') {
      desiredTarget.set(0, 3.8, FORTRESS_CENTER_Z);
      desiredPos.set(
        desiredTarget.x + Math.sin(this.inspectYaw) * Math.cos(this.inspectPitch) * this.inspectDistance,
        desiredTarget.y + Math.sin(this.inspectPitch) * this.inspectDistance,
        desiredTarget.z + Math.cos(this.inspectYaw) * Math.cos(this.inspectPitch) * this.inspectDistance
      );
    } else if (this.cameraMode === 'FOLLOW') {
      if (this.activeProjectile && !this.impactOccurred) {
        const p = this.activeProjectile.body.position;
        desiredTarget.set(p.x * 0.65, Math.max(2.2, p.y), Math.max(FORTRESS_CENTER_Z, p.z - 4));
        desiredPos.set(p.x * 0.65 + 4.5, Math.max(4.5, p.y + 3.2), p.z + 10.5);
      } else {
        // Hold nicely on the fortress impact zone to admire the collapse
        desiredTarget.set(0, 3.2, FORTRESS_CENTER_Z);
        desiredPos.set(7.5, 8.2, FORTRESS_CENTER_Z + 17.5);
      }
    } else {
      // SLINGSHOT aiming view (orbitable around slingshot deck)
      desiredTarget.set(0, 3.6, -6.5);
      const pivot = new THREE.Vector3(0, 3.8, SLING_ANCHOR.z);
      desiredPos.set(
        pivot.x + Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDistance,
        pivot.y + Math.sin(this.orbitPitch) * this.orbitDistance + 1.2,
        pivot.z + Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDistance
      );
    }

    const lerpRate = 1 - Math.exp(-5.2 * dt);
    this.camPos.lerp(desiredPos, lerpRate);
    this.camTarget.lerp(desiredTarget, lerpRate);

    this.camera.position.copy(this.camPos);
    if (this.shakeIntensity > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.exp(-7.5 * dt);
    } else {
      this.shakeIntensity = 0;
    }
    this.camera.lookAt(this.camTarget);
  }

  _isSceneSettled() {
    let maxSpeed = 0;
    for (const b of this.blocks) {
      if (!b.destroyed && b.body.sleepState !== CANNON.Body.SLEEPING) {
        maxSpeed = Math.max(maxSpeed, b.body.velocity.length());
      }
    }
    for (const t of this.targets) {
      if (!t.eliminated && t.body.sleepState !== CANNON.Body.SLEEPING) {
        maxSpeed = Math.max(maxSpeed, t.body.velocity.length());
      }
    }
    if (this.activeProjectile) {
      maxSpeed = Math.max(maxSpeed, this.activeProjectile.body.velocity.length());
    }
    return maxSpeed < 0.75;
  }

  _syncUI() {
    const cfg = LEVELS[this.currentLevelIndex];
    const remainingTargets = this.targets.filter((t) => !t.eliminated).length;
    this.ui.updateHUD({
      levelNumber: cfg.id,
      totalLevels: LEVELS.length,
      levelName: cfg.name,
      remainingTargets,
      score: this.score,
      shotQueue: this.shotQueue,
      projectileDefs: PROJECTILE_DEFS
    });
    this.ui.updateCameraButton(this.cameraMode === 'INSPECT');
  }

  // =========================================================================
  // MAIN ANIMATION & PHYSICS LOOP
  // =========================================================================
  _animate() {
    requestAnimationFrame(this._animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.levelGraceTimer > 0) {
      this.levelGraceTimer -= dt;
    }

    // Step physics world and flush deferred body removals safely
    this.world.step(1 / 60, dt, 4);
    if (this.pendingBodyRemovals.length > 0) {
      for (const body of this.pendingBodyRemovals) {
        if (this.world.bodies.includes(body)) {
          this.world.removeBody(body);
        }
      }
      this.pendingBodyRemovals.length = 0;
    }

    // Sync blocks
    for (const b of this.blocks) {
      if (b.destroyed) continue;
      b.mesh.position.copy(b.body.position);
      b.mesh.quaternion.copy(b.body.quaternion);
    }

    // Sync targets & check ring-out eliminations
    for (const t of this.targets) {
      if (t.eliminated) continue;
      t.mesh.position.copy(t.body.position);
      t.mesh.quaternion.copy(t.body.quaternion);

      const p = t.body.position;
      if (p.y < -1.5 || Math.abs(p.x) > 22 || p.z < -36 || p.z > 24) {
        this._eliminateTarget(t);
      }
    }

    // Sync projectiles
    for (const p of this.projectiles) {
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);

      // Auto-detonate bomb 1.1s after impact if player didn't manually trigger it
      if (
        p.kind === 'bomb' &&
        !p.detonated &&
        p.impactTime !== null &&
        this.flightTimer - p.impactTime > 1.05
      ) {
        this._detonateBomb(p);
      }
    }

    // Animate drifting clouds & aim hint ring
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 68) c.mesh.position.x = -68;
    }
    if (this.aimHintRing && this.aimHintRing.visible) {
      const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.1;
      this.aimHintRing.scale.setScalar(pulse);
      this.aimHintRing.lookAt(this.camera.position);
    }

    // Flight & settling state progression
    if (this.gameState === 'FLYING' || this.gameState === 'SETTLING') {
      this.flightTimer += dt;

      // Instant victory check once all targets are popped and brief delay passes
      const remainingTargets = this.targets.filter((t) => !t.eliminated).length;
      if (remainingTargets === 0 && this.settleTimer > 1.3) {
        this._triggerVictory();
      }

      if (this.activeProjectile) {
        const ap = this.activeProjectile.body.position;
        if (ap.y < -2 || ap.z < -42 || Math.abs(ap.x) > 30) {
          this.impactOccurred = true;
        }
      }

      if (this.impactOccurred || this.flightTimer > 3.2) {
        this.settleTimer += dt;
        if (this.settleTimer > 2.2 && (this._isSceneSettled() || this.settleTimer > 4.6)) {
          this.advanceToNextShot();
        }
      }
    }

    this.effects.update(dt);
    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
