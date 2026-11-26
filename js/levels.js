/**
 * Handcrafted 3D Fortress Blueprints.
 * Every Y coordinate is computed cleanly from the platform top (BASE_Y = 0.6)
 * so all blocks rest flush with zero interpenetration and zero jitter.
 */

export const FORTRESS_BASE_Y = 0.6; // Top surface of the stone fortress foundation pad
export const FORTRESS_CENTER_Z = -14;

export const MATERIAL_STATS = {
  glass: {
    mass: 1.0,
    hp: 22,
    score: 120,
    friction: 0.45,
    restitution: 0.12
  },
  wood: {
    mass: 2.3,
    hp: 54,
    score: 180,
    friction: 0.72,
    restitution: 0.08
  },
  stone: {
    mass: 5.2,
    hp: 125,
    score: 260,
    friction: 0.82,
    restitution: 0.05
  }
};

export const PROJECTILE_DEFS = {
  heavy: {
    name: 'Heavy Boulder',
    short: 'H',
    desc: 'Heavy Boulder — Crushes wood & stone',
    radius: 0.56,
    mass: 6.2,
    powerMult: 1.0,
    ability: null
  },
  split: {
    name: 'Tri-Splitter',
    short: 'S',
    desc: 'Tri-Splitter — Click / Space mid-air to split into 3',
    radius: 0.46,
    mass: 3.4,
    powerMult: 1.08,
    ability: 'SPLIT'
  },
  bomb: {
    name: 'Blast Bomb',
    short: 'B',
    desc: 'Blast Bomb — Click / Space mid-air to detonate',
    radius: 0.58,
    mass: 5.2,
    powerMult: 0.96,
    ability: 'DETONATE'
  }
};

/** Helper to place a block given its bottom Y coordinate */
function box(material, x, bottomY, z, w, h, d) {
  return {
    material,
    pos: [x, bottomY + h / 2, z],
    size: [w, h, d]
  };
}

/** Helper to place a target sphere resting on top of supportY */
function target(x, supportY, z, radius = 0.62, isBoss = false) {
  return {
    pos: [x, supportY + radius, z],
    radius,
    hp: isBoss ? 52 : 24,
    score: isBoss ? 1000 : 500,
    isBoss
  };
}

function buildLevel1() {
  const b = [];
  const t = [];
  const y0 = FORTRESS_BASE_Y;
  const z0 = FORTRESS_CENTER_Z;

  // Ground floor stone corner pillars (height 2.4)
  const h1 = 2.4;
  b.push(box('stone', -2.4, y0, z0 - 1.3, 0.7, h1, 0.7));
  b.push(box('stone',  2.4, y0, z0 - 1.3, 0.7, h1, 0.7));
  b.push(box('stone', -2.4, y0, z0 + 1.3, 0.7, h1, 0.7));
  b.push(box('stone',  2.4, y0, z0 + 1.3, 0.7, h1, 0.7));

  // Front glass shield panels
  b.push(box('glass', -0.9, y0, z0 + 1.3, 1.5, 2.2, 0.25));
  b.push(box('glass',  0.9, y0, z0 + 1.3, 1.5, 2.2, 0.25));

  // First floor wood deck (thickness 0.45)
  const y1 = y0 + h1;
  const deck1 = 0.45;
  b.push(box('wood', 0, y1, z0, 5.8, deck1, 3.6));

  // Ground target tucked inside
  t.push(target(0, y0, z0, 0.62, false));

  // Second floor wood walls + glass center (height 2.2)
  const y2Base = y1 + deck1;
  const h2 = 2.2;
  b.push(box('wood', -1.8, y2Base, z0 - 0.9, 0.55, h2, 0.55));
  b.push(box('wood',  1.8, y2Base, z0 - 0.9, 0.55, h2, 0.55));
  b.push(box('wood', -1.8, y2Base, z0 + 0.9, 0.55, h2, 0.55));
  b.push(box('wood',  1.8, y2Base, z0 + 0.9, 0.55, h2, 0.55));
  b.push(box('glass', 0, y2Base, z0 + 0.9, 2.6, h2 - 0.1, 0.25));

  // Second floor target
  t.push(target(0, y2Base, z0 - 0.1, 0.6, false));

  // Roof beam (thickness 0.42)
  const y2Top = y2Base + h2;
  const roofH = 0.42;
  b.push(box('wood', 0, y2Top, z0, 4.6, roofH, 2.8));

  // Crown glass turret on roof
  const y3Base = y2Top + roofH;
  b.push(box('glass', -1.0, y3Base, z0, 0.35, 1.5, 1.2));
  b.push(box('glass',  1.0, y3Base, z0, 0.35, 1.5, 1.2));
  b.push(box('wood',   0, y3Base + 1.5, z0, 2.6, 0.35, 1.5));

  // Roof target
  t.push(target(0, y3Base, z0, 0.56, false));

  return {
    id: 1,
    name: 'Outpost Tower',
    shots: ['heavy', 'split', 'heavy', 'bomb'],
    starThresholds: [2200, 3600, 4900],
    blocks: b,
    targets: t
  };
}

function buildLevel2() {
  const b = [];
  const t = [];
  const y0 = FORTRESS_BASE_Y;
  const z0 = FORTRESS_CENTER_Z;

  // Build two symmetrical flanking towers at x = -4.2 and x = +4.2
  [-4.2, 4.2].forEach((tx) => {
    // Stone base pillars
    const h1 = 2.4;
    b.push(box('stone', tx - 1.2, y0, z0 - 1.1, 0.65, h1, 0.65));
    b.push(box('stone', tx + 1.2, y0, z0 - 1.1, 0.65, h1, 0.65));
    b.push(box('stone', tx - 1.2, y0, z0 + 1.1, 0.65, h1, 0.65));
    b.push(box('stone', tx + 1.2, y0, z0 + 1.1, 0.65, h1, 0.65));

    // Lower target inside each tower
    t.push(target(tx, y0, z0, 0.58, false));

    // Mid wood slab
    const y1 = y0 + h1;
    b.push(box('wood', tx, y1, z0, 3.4, 0.42, 3.1));

    // Upper floor glass & wood pillars
    const y2 = y1 + 0.42;
    const h2 = 2.1;
    b.push(box('wood', tx - 1.0, y2, z0 - 0.8, 0.48, h2, 0.48));
    b.push(box('wood', tx + 1.0, y2, z0 - 0.8, 0.48, h2, 0.48));
    b.push(box('glass', tx - 1.0, y2, z0 + 0.8, 0.48, h2, 0.48));
    b.push(box('glass', tx + 1.0, y2, z0 + 0.8, 0.48, h2, 0.48));

    // Upper target
    t.push(target(tx, y2, z0, 0.56, false));

    // Top roof
    const y3 = y2 + h2;
    b.push(box('wood', tx, y3, z0, 3.0, 0.4, 2.5));
  });

  // Central courtyard stone bunker + skybridge connecting the two towers
  b.push(box('stone', -1.1, y0, z0 + 1.4, 0.6, 1.8, 0.6));
  b.push(box('stone',  1.1, y0, z0 + 1.4, 0.6, 1.8, 0.6));
  b.push(box('glass',  0,   y0, z0 + 1.4, 1.4, 1.7, 0.25));
  b.push(box('wood',   0,   y0 + 1.8, z0 + 1.4, 3.0, 0.35, 0.9));

  // Center bridge resting between the mid slabs (y = y0 + 2.4 + 0.42)
  const bridgeY = y0 + 2.4 + 0.42;
  b.push(box('glass', -1.25, y0, z0, 0.5, 2.82, 1.1));
  b.push(box('glass',  1.25, y0, z0, 0.5, 2.82, 1.1));
  b.push(box('wood',   0, bridgeY, z0, 4.9, 0.38, 1.6));

  // Center bridge commander target
  t.push(target(0, bridgeY + 0.38, z0, 0.62, false));

  return {
    id: 2,
    name: 'Twin Forts',
    shots: ['heavy', 'split', 'bomb', 'heavy', 'bomb'],
    starThresholds: [3600, 5400, 7200],
    blocks: b,
    targets: t
  };
}

function buildLevel3() {
  const b = [];
  const t = [];
  const y0 = FORTRESS_BASE_Y;
  const z0 = FORTRESS_CENTER_Z - 1.0;

  // Front outer defensive stone barrier
  b.push(box('stone', -3.2, y0, z0 + 3.4, 1.8, 1.4, 0.65));
  b.push(box('glass',  0.0, y0, z0 + 3.4, 3.8, 1.4, 0.3));
  b.push(box('stone',  3.2, y0, z0 + 3.4, 1.8, 1.4, 0.65));

  // Tier 1 (Base wide citadel: 3 bays across X = -4.2, 0, +4.2)
  const h1 = 2.4;
  [-5.2, -2.1, 2.1, 5.2].forEach((px) => {
    b.push(box('stone', px, y0, z0 - 1.3, 0.72, h1, 0.72));
    b.push(box('stone', px, y0, z0 + 1.3, 0.72, h1, 0.72));
  });

  // Ground floor side guards + center guard
  t.push(target(-3.65, y0, z0, 0.56, false));
  t.push(target( 3.65, y0, z0, 0.56, false));
  t.push(target( 0.0,  y0, z0, 0.58, false));

  // Tier 1 slabs (three non-overlapping wood decks)
  const y1 = y0 + h1;
  const deck1 = 0.45;
  b.push(box('wood', -3.9, y1, z0, 3.4, deck1, 3.5));
  b.push(box('wood',  0.0, y1, z0, 4.3, deck1, 3.5));
  b.push(box('wood',  3.9, y1, z0, 3.4, deck1, 3.5));

  // Tier 2 (Middle pyramid tier)
  const y2Base = y1 + deck1;
  const h2 = 2.2;
  [-3.2, -1.2, 1.2, 3.2].forEach((px) => {
    const mat = Math.abs(px) > 2 ? 'wood' : 'stone';
    b.push(box(mat, px, y2Base, z0 - 1.0, 0.56, h2, 0.56));
    b.push(box(mat, px, y2Base, z0 + 1.0, 0.56, h2, 0.56));
  });
  // Glass front windows on Tier 2
  b.push(box('glass', -2.2, y2Base, z0 + 1.0, 1.3, 2.0, 0.25));
  b.push(box('glass',  2.2, y2Base, z0 + 1.0, 1.3, 2.0, 0.25));

  // Tier 2 targets
  t.push(target(-2.2, y2Base, z0, 0.55, false));
  t.push(target( 2.2, y2Base, z0, 0.55, false));

  // Tier 2 decks (non-overlapping)
  const y2Top = y2Base + h2;
  const deck2 = 0.42;
  b.push(box('wood', -2.45, y2Top, z0, 2.1, deck2, 2.8));
  b.push(box('stone', 0.0,  y2Top, z0, 2.7, deck2, 2.8));
  b.push(box('wood',  2.45, y2Top, z0, 2.1, deck2, 2.8));

  // Tier 3 (Apex Boss Sanctum)
  const y3Base = y2Top + deck2;
  const h3 = 2.1;
  b.push(box('glass', -1.25, y3Base, z0 - 0.8, 0.42, h3, 0.42));
  b.push(box('glass',  1.25, y3Base, z0 - 0.8, 0.42, h3, 0.42));
  b.push(box('glass', -1.25, y3Base, z0 + 0.8, 0.42, h3, 0.42));
  b.push(box('glass',  1.25, y3Base, z0 + 0.8, 0.42, h3, 0.42));
  b.push(box('wood',   0.0,  y3Base + h3, z0, 3.3, 0.4, 2.4));

  // Boss Target inside apex sanctum
  t.push(target(0.0, y3Base, z0, 0.72, true));

  return {
    id: 3,
    name: 'Pyramid Fortress',
    shots: ['bomb', 'heavy', 'split', 'bomb', 'split', 'heavy'],
    starThresholds: [5200, 7600, 9800],
    blocks: b,
    targets: t
  };
}

export const LEVELS = [buildLevel1(), buildLevel2(), buildLevel3()];
