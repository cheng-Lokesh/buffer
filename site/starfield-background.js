(() => {
  'use strict';

  const canvas = document.getElementById('starfieldCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const GALAXY_BREATH_PERIOD = 16;
  const STAR_TWINKLE_GAP_MIN = 700;
  const STAR_TWINKLE_GAP_MAX = 6500;
  const METEOR_GAP_MIN = 11000;
  const METEOR_GAP_MAX = 26000;
  const VISIBLE_STAR_RADIUS_MIN = 1.05;
  const VISIBLE_STAR_ALPHA_MIN = .34;
  const GALAXY_GLOW_ALPHA_MIN = .07;
  const GALAXY_GLOW_ALPHA_MAX = .18;
  const MIN_VISIBLE_ANCHORS = 18;
  const STAR_SPECTRAL_PALETTES = [
    { haloColor: 'rgba(111,190,255,.4)', flareColor: '#b8ddff' },
    { haloColor: 'rgba(176,144,255,.34)', flareColor: '#ddc9ff' },
    { haloColor: 'rgba(255,203,132,.32)', flareColor: '#ffe3ae' },
    { haloColor: 'rgba(111,234,214,.3)', flareColor: '#c1fff1' },
    { haloColor: 'rgba(255,143,198,.25)', flareColor: '#ffd0e9' }
  ];
  const METEOR_SPECTRAL_PALETTES = [
    { name: 'sapphire', headColor: '#f2fbff', midColor: '#73ddff', tailColor: '#3976ff', glowColor: 'rgba(71,164,255,.72)' },
    { name: 'orchid', headColor: '#fff7ff', midColor: '#d8a0ff', tailColor: '#765cff', glowColor: 'rgba(163,104,255,.68)' },
    { name: 'sunset', headColor: '#fffbed', midColor: '#ffd477', tailColor: '#ff7f7a', glowColor: 'rgba(255,147,99,.67)' },
    { name: 'aurora', headColor: '#f0fff9', midColor: '#87f3cd', tailColor: '#38aeca', glowColor: 'rgba(67,219,190,.64)' },
    { name: 'rose', headColor: '#fff5fb', midColor: '#ff9ed8', tailColor: '#8e77ff', glowColor: 'rgba(231,107,211,.63)' }
  ];
  const ANCHOR_STARS = [
    { x: .052, y: .225, radius: .68, color: '#dcecff', phase: .4 },
    { x: .095, y: .085, radius: .58, color: '#ffffff', phase: 3.6 },
    { x: .154, y: .155, radius: .86, color: '#fff4db', phase: 2.2 },
    { x: .205, y: .235, radius: .64, color: '#d8eaff', phase: 5.1 },
    { x: .245, y: .055, radius: .62, color: '#d4e8ff', phase: 4.7 },
    { x: .305, y: .14, radius: .72, color: '#ffffff', phase: 1.8 },
    { x: .392, y: .255, radius: .78, color: '#ffe7c7', phase: 1.35 },
    { x: .445, y: .075, radius: .64, color: '#d7e9ff', phase: 3.95 },
    { x: .487, y: .145, radius: .94, color: '#d9e9ff', phase: 5.4 },
    { x: .55, y: .275, radius: .7, color: '#fff0d4', phase: .15 },
    { x: .608, y: .165, radius: .72, color: '#ffffff', phase: 3.1 },
    { x: .66, y: .065, radius: .62, color: '#d7eaff', phase: 5.75 },
    { x: .719, y: .095, radius: .84, color: '#d5e8ff', phase: .95 },
    { x: .77, y: .19, radius: .7, color: '#ffffff', phase: 2.45 },
    { x: .823, y: .235, radius: .66, color: '#fff0d4', phase: 4.05 },
    { x: .87, y: .08, radius: .62, color: '#d8eaff', phase: 5.2 },
    { x: .914, y: .18, radius: .88, color: '#d8eaff', phase: 2.75 },
    { x: .965, y: .245, radius: .68, color: '#fff1d8', phase: 1.05 }
  ].map((star, index) => {
    const palette = STAR_SPECTRAL_PALETTES[index % STAR_SPECTRAL_PALETTES.length];
    return {
      ...star,
      ...palette,
      glintAngle: ((index * 37) % 120 - 60) * Math.PI / 180,
      twinkleState: null,
      nextTwinkleAt: 0,
      initialDelay: 120 + ((index * 613) % 4200)
    };
  });

  let width = 1;
  let height = 1;
  let dpr = 1;
  let meteors = [];
  let frameId = 0;
  let meteorTimer = 0;
  let sparkTimer = 0;
  let activeSpark = null;
  let lastTime = performance.now();
  let running = false;

  const diagnostics = window.__starfieldDiagnostics = {
    anchorStars: ANCHOR_STARS.length,
    galaxyBreathing: true,
    visibleEnergy: 'high',
    twinkleEvents: 0,
    sparkEvents: 0,
    meteorsSpawned: 0,
    meteorPaletteSize: METEOR_SPECTRAL_PALETTES.length,
    lastMeteorPalette: '',
    reducedMotion: motionQuery.matches,
    running: false
  };

  const random = (min, max) => min + Math.random() * (max - min);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function syncDiagnostics() {
    canvas.dataset.anchorStars = String(diagnostics.anchorStars);
    canvas.dataset.galaxyBreathing = String(diagnostics.galaxyBreathing);
    canvas.dataset.visibleEnergy = diagnostics.visibleEnergy;
    canvas.dataset.twinkleEvents = String(diagnostics.twinkleEvents);
    canvas.dataset.sparkEvents = String(diagnostics.sparkEvents);
    canvas.dataset.meteorsSpawned = String(diagnostics.meteorsSpawned);
    canvas.dataset.meteorPaletteSize = String(diagnostics.meteorPaletteSize);
    canvas.dataset.lastMeteorPalette = diagnostics.lastMeteorPalette;
    canvas.dataset.reducedMotion = String(diagnostics.reducedMotion);
    canvas.dataset.running = String(diagnostics.running);
  }

  function startRandomTwinkle(star, now) {
    star.twinkleState = {
      born: now,
      attack: random(90, 280),
      hold: random(30, 180),
      decay: random(650, 2600),
      intensity: random(.28, .92),
      radiusBoost: random(.18, .7)
    };
    diagnostics.twinkleEvents += 1;
    syncDiagnostics();
  }

  function updateTwinkleEnvelope(star, now) {
    if (!star.nextTwinkleAt) star.nextTwinkleAt = now + star.initialDelay;
    if (!star.twinkleState && now >= star.nextTwinkleAt) startRandomTwinkle(star, now);
    const state = star.twinkleState;
    if (!state) return 0;

    const elapsed = now - state.born;
    if (elapsed < state.attack) {
      const progress = elapsed / state.attack;
      return (1 - Math.pow(1 - progress, 3)) * state.intensity;
    }
    if (elapsed < state.attack + state.hold) return state.intensity;

    const decayProgress = (elapsed - state.attack - state.hold) / state.decay;
    if (decayProgress < 1) return Math.pow(1 - decayProgress, 2) * state.intensity;

    star.twinkleState = null;
    star.nextTwinkleAt = now + random(STAR_TWINKLE_GAP_MIN, STAR_TWINKLE_GAP_MAX);
    return 0;
  }

  function drawStarHalo(star, x, y, haloRadius, strength) {
    const halo = ctx.createRadialGradient(x, y, 0, x, y, haloRadius);
    halo.addColorStop(0, '#ffffff');
    halo.addColorStop(.08, star.color);
    halo.addColorStop(.3, star.haloColor);
    halo.addColorStop(.64, 'rgba(126,170,255,.1)');
    halo.addColorStop(1, 'rgba(84,128,224,0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = strength;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, haloRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStarDiffraction(star, x, y, coreRadius, energy) {
    if (energy < .12) return;
    const flareLength = coreRadius * (2.4 + energy * 5.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(star.glintAngle);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(.82, energy * .72);
    ctx.strokeStyle = star.flareColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(.34, coreRadius * .28);
    ctx.shadowColor = star.haloColor;
    ctx.shadowBlur = 4 + energy * 5;
    ctx.beginPath();
    ctx.moveTo(-flareLength, 0);
    ctx.lineTo(flareLength, 0);
    ctx.moveTo(0, -flareLength * .42);
    ctx.lineTo(0, flareLength * .42);
    ctx.stroke();
    ctx.restore();
  }

  function drawStarCore(star, x, y, coreRadius, energy) {
    const radius = coreRadius * (.64 + energy * .28);
    const core = ctx.createRadialGradient(x - radius * .16, y - radius * .16, 0, x, y, radius);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(.32, '#ffffff');
    core.addColorStop(.68, star.color);
    core.addColorStop(1, star.haloColor);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .54 + energy * .44;
    ctx.fillStyle = core;
    ctx.shadowColor = star.flareColor;
    ctx.shadowBlur = 2 + energy * 4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAnchorStar(star, now, sparkBoost = 0) {
    const twinkleEnvelope = updateTwinkleEnvelope(star, now);
    const strength = VISIBLE_STAR_ALPHA_MIN + twinkleEnvelope * .58 + sparkBoost * .42;
    const energy = Math.min(1, twinkleEnvelope * .86 + sparkBoost);
    const x = star.x * width;
    const y = star.y * height;
    const coreRadius = Math.max(VISIBLE_STAR_RADIUS_MIN, star.radius * 1.42);
    const radiusVariation = star.twinkleState ? star.twinkleState.radiusBoost : 0;
    const haloRadius = coreRadius * (4.6 + twinkleEnvelope * (4.3 + radiusVariation) + sparkBoost * 6.2);
    drawStarHalo(star, x, y, haloRadius, strength);
    drawStarDiffraction(star, x, y, coreRadius, energy);
    drawStarCore(star, x, y, coreRadius, energy);
  }

  function drawGalaxyBreath(seconds) {
    const atmosphericPulse = .5 - .5 * Math.cos((seconds / GALAXY_BREATH_PERIOD) * Math.PI * 2);
    const glowAlpha = GALAXY_GLOW_ALPHA_MIN
      + atmosphericPulse * (GALAXY_GLOW_ALPHA_MAX - GALAXY_GLOW_ALPHA_MIN);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = glowAlpha;
    ctx.translate(width * .53, height * .11);
    ctx.rotate(.16);
    ctx.scale(1, .14);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, width * .5);
    glow.addColorStop(0, 'rgba(190,207,244,.42)');
    glow.addColorStop(.42, 'rgba(112,148,224,.22)');
    glow.addColorStop(1, 'rgba(44,70,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, width * .5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function scheduleSpark() {
    window.clearTimeout(sparkTimer);
    sparkTimer = window.setTimeout(() => {
      if (running && !document.hidden && !motionQuery.matches) {
        const previousIndex = activeSpark ? activeSpark.index : -1;
        let index = Math.floor(random(0, ANCHOR_STARS.length));
        if (index === previousIndex) index = (index + 5) % ANCHOR_STARS.length;
        activeSpark = {
          index,
          born: performance.now(),
          duration: random(700, 3200)
        };
        diagnostics.sparkEvents += 1;
        syncDiagnostics();
      }
      scheduleSpark();
    }, nextSparkDelay());
  }

  function nextSparkDelay() {
    return Math.random() < .18 ? random(500, 1400) : random(2400, 8000);
  }

  function spawnMeteor() {
    if (!running || motionQuery.matches) return;
    const angle = random(.28, .5);
    const speed = random(480, 760);
    const palette = pick(METEOR_SPECTRAL_PALETTES);
    meteors.push({
      x: random(width * .08, width * .7),
      y: random(height * .035, height * .19),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length: random(width * .045, width * .085),
      lineWidth: random(.72, 1.18),
      life: 0,
      maxLife: random(.72, 1.04),
      ...palette
    });
    diagnostics.meteorsSpawned += 1;
    diagnostics.lastMeteorPalette = palette.name;
    syncDiagnostics();
  }

  function nextMeteorDelay(initial = false) {
    return initial ? random(6500, 11000) : random(METEOR_GAP_MIN, METEOR_GAP_MAX);
  }

  function scheduleMeteor(initial = false) {
    window.clearTimeout(meteorTimer);
    meteorTimer = window.setTimeout(() => {
      if (running && !document.hidden && !motionQuery.matches) spawnMeteor();
      scheduleMeteor();
    }, nextMeteorDelay(initial));
  }

  function drawMeteorTrail(meteor, tailX, tailY, fade) {
    const trail = ctx.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
    trail.addColorStop(0, 'rgba(255,255,255,0)');
    trail.addColorStop(.18, meteor.tailColor);
    trail.addColorStop(.7, meteor.midColor);
    trail.addColorStop(.94, meteor.headColor);
    trail.addColorStop(1, '#ffffff');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.globalAlpha = fade * .25;
    ctx.strokeStyle = meteor.glowColor;
    ctx.lineWidth = meteor.lineWidth * 4.4;
    ctx.shadowColor = meteor.glowColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(meteor.x, meteor.y);
    ctx.stroke();

    ctx.globalAlpha = fade;
    ctx.strokeStyle = trail;
    ctx.lineWidth = meteor.lineWidth;
    ctx.shadowColor = meteor.midColor;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(meteor.x, meteor.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawMeteorHead(meteor, fade) {
    const radius = meteor.lineWidth * (3.2 + fade * 2.2);
    const head = ctx.createRadialGradient(meteor.x, meteor.y, 0, meteor.x, meteor.y, radius);
    head.addColorStop(0, '#ffffff');
    head.addColorStop(.2, meteor.headColor);
    head.addColorStop(.52, meteor.midColor);
    head.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, fade * 1.16);
    ctx.fillStyle = head;
    ctx.shadowColor = meteor.glowColor;
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(meteor.x, meteor.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMeteors(dt) {
    for (let index = meteors.length - 1; index >= 0; index -= 1) {
      const meteor = meteors[index];
      meteor.life += dt;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      const progress = meteor.life / meteor.maxLife;
      if (progress >= 1 || meteor.x > width * 1.1 || meteor.y > height * .7) {
        meteors.splice(index, 1);
        continue;
      }
      const velocity = Math.hypot(meteor.vx, meteor.vy);
      const ux = meteor.vx / velocity;
      const uy = meteor.vy / velocity;
      const tailX = meteor.x - ux * meteor.length;
      const tailY = meteor.y - uy * meteor.length;
      const fade = Math.sin(progress * Math.PI) * .72;
      drawMeteorTrail(meteor, tailX, tailY, fade);
      drawMeteorHead(meteor, fade);
    }
  }

  function draw(now, dt) {
    ctx.clearRect(0, 0, width, height);
    if (motionQuery.matches) return;
    const seconds = now / 1000;
    drawGalaxyBreath(seconds);
    let sparkProgress = -1;
    if (activeSpark) {
      sparkProgress = (now - activeSpark.born) / activeSpark.duration;
      if (sparkProgress >= 1) {
        activeSpark = null;
        sparkProgress = -1;
      }
    }
    ANCHOR_STARS.forEach((star, index) => {
      const sparkBoost = activeSpark && index === activeSpark.index
        ? Math.sin(Math.max(0, sparkProgress) * Math.PI)
        : 0;
      drawAnchorStar(star, now, sparkBoost);
    });
    drawMeteors(dt);
  }

  function animate(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    draw(now, dt);
    frameId = requestAnimationFrame(animate);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now(), 0);
  }

  function stop() {
    running = false;
    diagnostics.running = false;
    cancelAnimationFrame(frameId);
    window.clearTimeout(meteorTimer);
    window.clearTimeout(sparkTimer);
    syncDiagnostics();
  }

  function start() {
    stop();
    diagnostics.reducedMotion = motionQuery.matches;
    if (motionQuery.matches) {
      draw(performance.now(), 0);
      syncDiagnostics();
      return;
    }
    running = true;
    diagnostics.running = true;
    lastTime = performance.now();
    syncDiagnostics();
    frameId = requestAnimationFrame(animate);
    scheduleMeteor(true);
    scheduleSpark();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  motionQuery.addEventListener('change', start);
  new ResizeObserver(resize).observe(canvas);
  resize();
  start();
})();
