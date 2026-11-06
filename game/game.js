/**
 * NetiShield Run - Pure HTML5 Canvas Endless Runner
 * No external game libraries. Telegram Games compatible.
 */

(function () {
  'use strict';

  // ========== Canvas & Context ==========
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // ========== DOM Elements ==========
  const startScreen = document.getElementById('start-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const hud = document.getElementById('hud');
  const jumpBtn = document.getElementById('jump-btn');
  const playBtn = document.getElementById('play-btn');
  const playAgainBtn = document.getElementById('play-again-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const restartFromPause = document.getElementById('restart-from-pause');
  const pauseBtn = document.getElementById('pause-btn');
  const soundToggle = document.getElementById('sound-toggle');
  const soundToggleStart = document.getElementById('sound-toggle-start');
  const scoreValue = document.getElementById('score-value');
  const hudBest = document.getElementById('hud-best');
  const bestScoreDisplay = document.getElementById('best-score-display');
  const finalScore = document.getElementById('final-score');
  const finalBest = document.getElementById('final-best');
  const livesContainer = document.getElementById('lives-container');
  const shareScoreBtn = document.getElementById('share-score-btn');

  // ========== Game Constants ==========
  const GROUND_RATIO = 0.78;
  const PLAYER_W = 36;
  const PLAYER_H = 48;
  const GRAVITY = 0.55;
  const JUMP_FORCE = -11.5;
  const BASE_SPEED = 4.2;
  const MAX_SPEED = 11;
  const SPEED_INCREMENT = 0.0008;
  const OBSTACLE_MIN_GAP = 220;
  const OBSTACLE_MAX_GAP = 380;
  const CRYSTAL_CHANCE = 0.35;
  const INVINCIBLE_TIME = 120; // frames after hit

  // ========== State ==========
  let W = 0, H = 0, groundY = 0;
  let state = 'start'; // start | playing | paused | gameover
  let score = 0;
  let bestScore = 0;
  let lives = 3;
  let speed = BASE_SPEED;
  let distance = 0;
  let invincible = 0;
  let frame = 0;
  let soundOn = true;
  let lastObstacleX = 0;

  // Player
  const player = {
    x: 0,
    y: 0,
    vy: 0,
    onGround: true,
    animFrame: 0,
    width: PLAYER_W,
    height: PLAYER_H
  };

  // Entities
  let obstacles = [];
  let crystals = [];
  let particles = [];

  // Background parallax layers
  let bgOffset = 0;

  // ========== Storage (only best score - non-sensitive) ==========
  try {
    const stored = localStorage.getItem('netishield_run_best');
    if (stored !== null) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n >= 0) bestScore = n;
    }
  } catch (e) { /* private mode or blocked */ }

  function saveBest() {
    try {
      localStorage.setItem('netishield_run_best', String(bestScore));
    } catch (e) {}
  }

  // ========== Resize ==========
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H * GROUND_RATIO;
    player.x = Math.min(90, W * 0.18);
  }

  window.addEventListener('resize', resize);
  resize();

  // ========== Audio (Web Audio API - no external files required for core) ==========
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        soundOn = false;
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function playTone(freq, duration, type, volume) {
    if (!soundOn || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.value = volume || 0.08;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(volume || 0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  function sfxJump() { playTone(420, 0.12, 'square', 0.07); }
  function sfxCrystal() { playTone(880, 0.1, 'sine', 0.09); playTone(1320, 0.08, 'sine', 0.05); }
  function sfxHit() { playTone(120, 0.25, 'sawtooth', 0.12); }
  function sfxGameOver() { playTone(90, 0.4, 'sawtooth', 0.1); }

  // ========== Input ==========
  function tryJump() {
    if (state !== 'playing') return;
    if (player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
      sfxJump();
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    ensureAudio();
    if (state === 'playing') tryJump();
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ensureAudio();
    tryJump();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      ensureAudio();
      if (state === 'playing') tryJump();
      else if (state === 'start') startGame();
      else if (state === 'gameover') startGame();
      else if (state === 'paused') resumeGame();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
    }
  });

  // ========== UI Buttons ==========
  playBtn.addEventListener('click', () => { ensureAudio(); startGame(); });
  playAgainBtn.addEventListener('click', () => { ensureAudio(); startGame(); });
  resumeBtn.addEventListener('click', resumeGame);
  restartFromPause.addEventListener('click', () => { ensureAudio(); startGame(); });
  pauseBtn.addEventListener('click', pauseGame);

  function updateSoundIcons() {
    const icon = soundOn ? '🔊' : '🔇';
    soundToggle.textContent = icon;
    soundToggleStart.textContent = icon;
  }

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    ensureAudio();
    updateSoundIcons();
  });
  soundToggleStart.addEventListener('click', () => {
    soundOn = !soundOn;
    ensureAudio();
    updateSoundIcons();
  });

  // Telegram share (only works inside Telegram client)
  shareScoreBtn.addEventListener('click', () => {
    try {
      if (typeof TelegramGameProxy !== 'undefined' && TelegramGameProxy.shareScore) {
        TelegramGameProxy.shareScore();
      }
    } catch (e) {}
  });

  // ========== Game Control ==========
  function startGame() {
    score = 0;
    lives = 3;
    speed = BASE_SPEED;
    distance = 0;
    invincible = 0;
    frame = 0;
    obstacles = [];
    crystals = [];
    particles = [];
    lastObstacleX = W + 100;
    player.y = groundY - PLAYER_H;
    player.vy = 0;
    player.onGround = true;
    player.animFrame = 0;

    updateLivesUI();
    scoreValue.textContent = '0';
    hudBest.textContent = String(bestScore);
    bestScoreDisplay.textContent = String(bestScore);

    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    jumpBtn.classList.remove('hidden');

    state = 'playing';
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    pauseScreen.classList.remove('hidden');
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    pauseScreen.classList.add('hidden');
  }

  function gameOver() {
    state = 'gameover';
    sfxGameOver();
    if (score > bestScore) {
      bestScore = score;
      saveBest();
    }
    finalScore.textContent = String(score);
    finalBest.textContent = String(bestScore);
    bestScoreDisplay.textContent = String(bestScore);
    hud.classList.add('hidden');
    jumpBtn.classList.add('hidden');
    gameoverScreen.classList.remove('hidden');

    // Show share button only if TelegramGameProxy is available
    try {
      if (typeof TelegramGameProxy !== 'undefined') {
        shareScoreBtn.style.display = 'block';
      } else {
        shareScoreBtn.style.display = 'none';
      }
    } catch (e) {
      shareScoreBtn.style.display = 'none';
    }
  }

  function updateLivesUI() {
    const hearts = livesContainer.querySelectorAll('.life');
    hearts.forEach((el, i) => {
      if (i < lives) el.classList.remove('lost');
      else el.classList.add('lost');
    });
  }

  // ========== Spawn ==========
  function spawnObstacle() {
    const gap = OBSTACLE_MIN_GAP + Math.random() * (OBSTACLE_MAX_GAP - OBSTACLE_MIN_GAP);
    const x = lastObstacleX + gap + speed * 8;
    lastObstacleX = x;

    const types = ['low', 'tall', 'double'];
    const type = types[Math.floor(Math.random() * types.length)];

    if (type === 'low') {
      obstacles.push({
        x, y: groundY - 28, w: 28, h: 28, type: 'low'
      });
    } else if (type === 'tall') {
      obstacles.push({
        x, y: groundY - 52, w: 26, h: 52, type: 'tall'
      });
    } else {
      obstacles.push({
        x, y: groundY - 28, w: 24, h: 28, type: 'low'
      });
      obstacles.push({
        x: x + 36, y: groundY - 44, w: 24, h: 44, type: 'tall'
      });
    }

    // Crystal chance above gap
    if (Math.random() < CRYSTAL_CHANCE) {
      crystals.push({
        x: x + 40 + Math.random() * 60,
        y: groundY - 90 - Math.random() * 50,
        r: 10,
        collected: false,
        pulse: Math.random() * Math.PI * 2
      });
    }
  }

  // ========== Collision (AABB with small padding for fairness) ==========
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    const pad = 4;
    return (
      ax + pad < bx + bw - pad &&
      ax + aw - pad > bx + pad &&
      ay + pad < by + bh - pad &&
      ay + ah - pad > by + pad
    );
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
  }

  // ========== Particles ==========
  function addParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.8) * 5,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
        size: 2 + Math.random() * 3
      });
    }
  }

  // ========== Update ==========
  function update() {
    if (state !== 'playing') return;

    frame++;
    distance += speed;
    speed = Math.min(MAX_SPEED, BASE_SPEED + distance * SPEED_INCREMENT);

    // Score based on distance + crystals
    const newScore = Math.floor(distance / 12);
    if (newScore > score) score = newScore;
    scoreValue.textContent = String(score);

    // Player physics
    player.vy += GRAVITY;
    player.y += player.vy;

    if (player.y >= groundY - PLAYER_H) {
      player.y = groundY - PLAYER_H;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // Run animation
    if (player.onGround) {
      player.animFrame = (player.animFrame + speed * 0.15) % 4;
    }

    if (invincible > 0) invincible--;

    // Spawn
    if (obstacles.length === 0 || obstacles[obstacles.length - 1].x < W + 50) {
      // keep spawning ahead
    }
    while (lastObstacleX < W + 400) {
      spawnObstacle();
    }

    // Move obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed;
      if (obstacles[i].x + obstacles[i].w < -20) {
        obstacles.splice(i, 1);
        continue;
      }
      // Collision
      if (invincible <= 0 && rectsOverlap(
        player.x, player.y, player.width, player.height,
        obstacles[i].x, obstacles[i].y, obstacles[i].w, obstacles[i].h
      )) {
        lives--;
        updateLivesUI();
        invincible = INVINCIBLE_TIME;
        sfxHit();
        addParticles(player.x + player.width / 2, player.y + player.height / 2, '#ff3b6b', 12);
        if (lives <= 0) {
          gameOver();
          return;
        }
      }
    }

    // Crystals
    for (let i = crystals.length - 1; i >= 0; i--) {
      const c = crystals[i];
      c.x -= speed;
      c.pulse += 0.12;
      if (c.x + c.r < -10) {
        crystals.splice(i, 1);
        continue;
      }
      if (!c.collected && circleRect(c.x, c.y, c.r, player.x, player.y, player.width, player.height)) {
        c.collected = true;
        score += 15;
        scoreValue.textContent = String(score);
        sfxCrystal();
        addParticles(c.x, c.y, '#00f0ff', 10);
        crystals.splice(i, 1);
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }

    bgOffset = (bgOffset + speed * 0.3) % 200;
  }

  // ========== Draw ==========
  function drawBackground() {
    // Sky gradient already on canvas bg, draw stars / grid
    ctx.save();
    // Distant grid lines (neon city feel)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    const offset = bgOffset % gridSize;
    for (let x = -offset; x < W + gridSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, groundY);
      ctx.stroke();
    }
    for (let y = 0; y < groundY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Ground
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, H);
    groundGrad.addColorStop(0, '#0d1f38');
    groundGrad.addColorStop(1, '#050a12');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, W, H - groundY);

    // Ground line neon
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Subtle ground pattern
    ctx.fillStyle = 'rgba(0, 240, 255, 0.06)';
    for (let x = -(bgOffset * 1.5) % 60; x < W; x += 60) {
      ctx.fillRect(x, groundY + 4, 30, 3);
    }
    ctx.restore();
  }

  function drawPlayer() {
    ctx.save();
    if (invincible > 0 && Math.floor(invincible / 4) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    const x = player.x;
    const y = player.y;
    const w = player.width;
    const h = player.height;

    // Body (neon shield suit)
    ctx.fillStyle = '#0a1a30';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;

    // Torso
    roundRect(ctx, x + 6, y + 12, w - 12, h - 20, 6);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 12, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Visor
    ctx.fillStyle = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.fillRect(x + w / 2 - 7, y + 9, 14, 5);

    // Legs (simple run cycle)
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#00d4e6';
    ctx.lineWidth = 3;
    const legOffset = player.onGround ? Math.sin(player.animFrame * Math.PI / 2) * 6 : 0;
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 4, y + h - 8);
    ctx.lineTo(x + w / 2 - 8 - legOffset, y + h);
    ctx.moveTo(x + w / 2 + 4, y + h - 8);
    ctx.lineTo(x + w / 2 + 8 + legOffset, y + h);
    ctx.stroke();

    // Arm
    ctx.beginPath();
    ctx.moveTo(x + w - 6, y + 22);
    ctx.lineTo(x + w + 4, y + 30 - (player.onGround ? legOffset * 0.5 : 4));
    ctx.stroke();

    // N mark on chest
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 6;
    ctx.fillText('N', x + w / 2, y + 30);

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.save();
      ctx.shadowColor = '#ff3b6b';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#1a0a14';
      ctx.strokeStyle = '#ff3b6b';
      ctx.lineWidth = 2;
      roundRect(ctx, o.x, o.y, o.w, o.h, 4);
      ctx.fill();
      ctx.stroke();

      // Inner detail
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 59, 107, 0.25)';
      ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
      ctx.restore();
    }
  }

  function drawCrystals() {
    for (const c of crystals) {
      if (c.collected) continue;
      ctx.save();
      const scale = 1 + Math.sin(c.pulse) * 0.15;
      ctx.translate(c.x, c.y);
      ctx.scale(scale, scale);
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      // Diamond shape
      ctx.moveTo(0, -c.r);
      ctx.lineTo(c.r * 0.7, 0);
      ctx.lineTo(0, c.r);
      ctx.lineTo(-c.r * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(0, -c.r * 0.5);
      ctx.lineTo(c.r * 0.3, 0);
      ctx.lineTo(0, c.r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawObstacles();
    drawCrystals();
    drawPlayer();
    drawParticles();
  }

  // ========== Main Loop ==========
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // Init UI
  bestScoreDisplay.textContent = String(bestScore);
  hudBest.textContent = String(bestScore);
  updateSoundIcons();

  // Start loop
  loop();
})();
