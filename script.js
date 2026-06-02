/**
 * Feather Block — Mini müzik çalar + oyun
 */

/**
 * YouTube oynatma listesi — PL... kimliği veya tam playlist linki yapıştırılabilir.
 * Örnek: https://youtube.com/playlist?list=PLNMMzpFq8an6Y3CYTzLkgMMpBaV6kp5yy
 */
const YOUTUBE_PLAYLIST_ID = "PLNMMzpFq8an6Y3CYTzLkgMMpBaV6kp5yy";

const GRID_SIZE = 8;
const TRAY_SLOT_COUNT = 3;
const HIGH_SCORE_KEY = "featherBlockHighScore";
const FLOAT_TEXT_DURATION_MS = 1000;
const CLEAR_ANIM_MS = 380;
const COMBO_VISUAL_MS = 900;

const SCORE_PLACE_PER_CELL = 1;
const SCORE_LINE_BASE = 10;

const PIECE_COLORS = [
  "#ff6b6b",
  "#4ecdc4",
  "#ffe66d",
  "#a78bfa",
  "#f472b6",
  "#60a5fa",
  "#fb923c",
  "#34d399",
  "#fbbf24",
  "#818cf8",
  "#2dd4bf",
  "#f87171",
];

const TRAY_PIECE_SCALE = 0.55;
/** Dokunmatikte parça parmağın üstünden kalkar (blok görünür kalır) */
const DRAG_TOUCH_LIFT_RATIO = 1.35;
/** Dokunmatik sürükleme yumuşatma (yüksek = daha hızlı takip) */
const DRAG_TOUCH_SMOOTHING = 0.9;

/** Canvas içi dikey bölüm oranları (referans: ~55% tahta, ~20% tepsi) */
const LAYOUT_TRAY_RATIO = 0.15;
const LAYOUT_BOARD_TRAY_GAP_RATIO = 0.018;

const COLORS = {
  background: "#3a3530",
  boardBg: "#2e2a28",
  cellEmpty: "#252220",
  cellBorder: "#3d3835",
  cellFilledBorder: "rgba(255,255,255,0.12)",
  trayBg: "transparent",
  traySlot: "transparent",
  trayBorder: "transparent",
  floatCombo: "#ffe66d",
  floatPoints: "#4ecdc4",
};

/** Temel şekiller — tüm döndürülmüş varyasyonlar buildShapePool ile üretilir */
const SHAPE_BASES = {
  single: [[1]],
  line2: [[1, 1]],
  line3: [[1, 1, 1]],
  lSmall: [
    [1, 0],
    [1, 1],
  ],
  lLarge: [
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  tShape: [
    [1, 1, 1],
    [0, 1, 0],
  ],
  square2: [
    [1, 1],
    [1, 1],
  ],
  zShape: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  sShape: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  rect3x2: [
    [1, 1, 1],
    [1, 1, 1],
  ],
  square3: [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],
};

/** Her temel şeklin benzersiz döndürülmüş matrisleri */
const SHAPE_VARIANTS = buildShapeVariants();
const BASE_SHAPE_NAMES = Object.keys(SHAPE_BASES);

/**
 * Block Blast tarzı spawn ağırlıkları (toplam 18):
 * Kolay ~10/18 | Orta ~5/18 | Zor ~3/18
 */
const SPAWN_TIERS = [
  {
    id: "easy",
    weight: 10,
    shapes: ["single", "line2", "line3", "square2"],
  },
  {
    id: "medium",
    weight: 5,
    shapes: ["lSmall", "lLarge", "rect3x2", "square3"],
  },
  {
    id: "hard",
    weight: 3,
    shapes: ["tShape", "zShape", "sShape"],
  },
];

const canvas = document.getElementById("game-canvas");
const canvasWrap = document.getElementById("canvas-wrap");
const ctx = canvas.getContext("2d");
const currentScoreEl = document.getElementById("current-score");
const highScoreEl = document.getElementById("high-score");
const gameOverOverlay = document.getElementById("game-over-overlay");
const goFinalScoreEl = document.getElementById("go-final-score");
const goHighScoreEl = document.getElementById("go-high-score");
const restartBtn = document.getElementById("restart-btn");
const musicToggle = document.getElementById("music-toggle");
const musicPanel = document.getElementById("music-panel");
const musicPrevBtn = document.getElementById("music-prev");
const musicPlayPauseBtn = document.getElementById("music-play-pause");
const musicNextBtn = document.getElementById("music-next");
const musicShuffleBtn = document.getElementById("music-shuffle");
const musicTrackWrap = document.getElementById("music-track-wrap");
const musicTrackTitle = document.getElementById("music-track-title");

let layout = null;
let viewWidth = 0;
let viewHeight = 0;
let deviceRatio = 1;

let grid = createEmptyGrid();
let trayPieces = [null, null, null];
let drag = null;
let touchDragListenersBound = false;
let floatingTexts = [];
let clearParticles = [];
let lineClearEffect = null;
let comboVisual = null;
let animLoopActive = false;

let currentScore = 0;
let highScore = 0;
let isGameOver = false;

let ytPlayer = null;
let ytPlayerReady = false;
let musicPanelOpen = false;
let musicUserStarted = false;
let isMusicPlaying = false;
let shuffleEnabled = false;
let shuffledQueue = [];
let shuffleQueuePos = 0;

function getPlaylistId() {
  const raw = String(YOUTUBE_PLAYLIST_ID).trim();
  const fromUrl = raw.match(/[?&]list=([^&\s#]+)/);
  if (fromUrl) return fromUrl[1];
  if (raw.includes("&")) return raw.split("&")[0].trim();
  return raw;
}

function isPlaylistConfigured() {
  const id = getPlaylistId();
  return id.length > 0 && id !== "BURAYA_GELECEK" && id.startsWith("PL");
}

function applyTrackTitleMarquee() {
  if (!musicTrackWrap || !musicTrackTitle) return;

  musicTrackTitle.classList.remove("is-marquee");
  musicTrackTitle.style.removeProperty("--scroll-distance");
  musicTrackTitle.style.removeProperty("--scroll-duration");

  const needsScroll = musicTrackTitle.scrollWidth > musicTrackWrap.clientWidth + 2;
  if (!needsScroll) return;

  const base = musicTrackTitle.textContent;
  const gap = "   •   ";
  musicTrackTitle.textContent = base + gap + base;

  const scrollDistance = musicTrackTitle.scrollWidth / 2;
  const durationSec = Math.max(8, Math.min(24, scrollDistance / 28));

  musicTrackTitle.classList.add("is-marquee");
  musicTrackTitle.style.setProperty("--scroll-distance", `-${scrollDistance}px`);
  musicTrackTitle.style.setProperty("--scroll-duration", `${durationSec}s`);
}

function updateTrackTitle() {
  if (!musicTrackTitle) return;

  let title = "Parça yükleniyor…";

  if (ytPlayerReady && ytPlayer && typeof ytPlayer.getVideoData === "function") {
    const data = ytPlayer.getVideoData();
    if (data && data.title) {
      title = data.title;
    }
  }

  musicTrackTitle.textContent = title;
  musicTrackTitle.classList.remove("is-marquee");
  if (musicTrackWrap) {
    musicTrackWrap.title = title;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(applyTrackTitleMarquee);
  });
}

function updatePlayPauseButton() {
  musicPlayPauseBtn.textContent = isMusicPlaying ? "⏸" : "⏯";
  musicPlayPauseBtn.setAttribute(
    "aria-label",
    isMusicPlaying ? "Duraklat" : "Oynat"
  );
}

function setMusicControlsEnabled(enabled) {
  musicPrevBtn.disabled = !enabled;
  musicPlayPauseBtn.disabled = !enabled;
  musicNextBtn.disabled = !enabled;
  if (musicShuffleBtn) musicShuffleBtn.disabled = !enabled;
}

function updateShuffleButton() {
  if (!musicShuffleBtn) return;
  musicShuffleBtn.classList.toggle("is-active", shuffleEnabled);
  musicShuffleBtn.setAttribute("aria-pressed", String(shuffleEnabled));
  musicShuffleBtn.setAttribute(
    "aria-label",
    shuffleEnabled ? "Karışık çal açık" : "Karışık çal"
  );
}

function getPlaylistIndexList() {
  if (!ytPlayer || typeof ytPlayer.getPlaylist !== "function") return [];
  const ids = ytPlayer.getPlaylist();
  if (!ids || ids.length === 0) return [];
  return Array.from({ length: ids.length }, (_, i) => i);
}

function buildShuffledQueue() {
  const indices = getPlaylistIndexList();
  if (indices.length === 0) return false;

  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  if (typeof ytPlayer.getPlaylistIndex === "function") {
    const current = ytPlayer.getPlaylistIndex();
    if (current >= 0 && indices.length > 1) {
      const pos = indices.indexOf(current);
      if (pos > 0) {
        indices.splice(pos, 1);
        indices.unshift(current);
      }
    }
  }

  shuffledQueue = indices;
  shuffleQueuePos = 0;
  return true;
}

function toggleShuffle() {
  if (!ytPlayerReady || !ytPlayer) return;

  shuffleEnabled = !shuffleEnabled;
  updateShuffleButton();

  if (shuffleEnabled) {
    if (!buildShuffledQueue()) {
      shuffleEnabled = false;
      updateShuffleButton();
    }
  } else {
    shuffledQueue = [];
    shuffleQueuePos = 0;
  }
}

function musicPrevious() {
  if (!ytPlayerReady || !ytPlayer) return;

  if (!shuffleEnabled) {
    ytPlayer.previousVideo();
  } else {
    if (shuffledQueue.length === 0 && !buildShuffledQueue()) return;
    shuffleQueuePos =
      (shuffleQueuePos - 1 + shuffledQueue.length) % shuffledQueue.length;
    ytPlayer.playVideoAt(shuffledQueue[shuffleQueuePos]);
  }
  setTimeout(updateTrackTitle, 500);
}

function musicNext() {
  if (!ytPlayerReady || !ytPlayer) return;

  if (!shuffleEnabled) {
    ytPlayer.nextVideo();
  } else {
    if (shuffledQueue.length === 0 && !buildShuffledQueue()) return;

    shuffleQueuePos += 1;
    if (shuffleQueuePos >= shuffledQueue.length) {
      buildShuffledQueue();
      shuffleQueuePos = shuffledQueue.length > 1 ? 1 : 0;
    }
    ytPlayer.playVideoAt(shuffledQueue[shuffleQueuePos]);
  }
  setTimeout(updateTrackTitle, 500);
}

function onYouTubePlayerReady() {
  ytPlayerReady = true;
  setMusicControlsEnabled(true);
  setTimeout(updateTrackTitle, 400);
}

function onYouTubePlayerStateChange(event) {
  if (!window.YT) return;

  if (event.data === YT.PlayerState.PLAYING) {
    isMusicPlaying = true;
    updateTrackTitle();
  } else if (event.data === YT.PlayerState.ENDED) {
    isMusicPlaying = false;
    if (shuffleEnabled) {
      musicNext();
    }
  } else if (event.data === YT.PlayerState.PAUSED) {
    isMusicPlaying = false;
  } else if (
    event.data === YT.PlayerState.BUFFERING ||
    event.data === YT.PlayerState.CUED
  ) {
    updateTrackTitle();
  }
  updatePlayPauseButton();
}

function createYouTubePlayer() {
  if (!isPlaylistConfigured()) {
    setMusicControlsEnabled(false);
    return;
  }

  ytPlayer = new YT.Player("youtube-player-host", {
    height: "0",
    width: "0",
    playerVars: {
      listType: "playlist",
      list: getPlaylistId(),
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
    },
    events: {
      onReady: onYouTubePlayerReady,
      onStateChange: onYouTubePlayerStateChange,
    },
  });
}

function initYouTubeRadio() {
  setMusicControlsEnabled(false);
  updatePlayPauseButton();

  if (!isPlaylistConfigured()) {
    return;
  }

  if (window.YT && window.YT.Player) {
    createYouTubePlayer();
  }
}

function toggleMusicPanel() {
  musicPanelOpen = !musicPanelOpen;
  musicPanel.classList.toggle("is-open", musicPanelOpen);
  musicPanel.hidden = !musicPanelOpen;
  musicToggle.classList.toggle("is-active", musicPanelOpen);
  musicToggle.setAttribute("aria-expanded", String(musicPanelOpen));

  if (musicPanelOpen) {
    updateTrackTitle();
  }
}

function musicPlayPause() {
  if (!ytPlayerReady || !ytPlayer) return;

  if (!musicUserStarted) {
    musicUserStarted = true;
    ytPlayer.playVideo();
    return;
  }

  if (isMusicPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function setupMusicPlayer() {
  setMusicControlsEnabled(false);
  updatePlayPauseButton();
  updateShuffleButton();

  musicToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMusicPanel();
  });

  musicPrevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    musicPrevious();
  });

  musicPlayPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    musicPlayPause();
  });

  musicNextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    musicNext();
  });

  musicShuffleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleShuffle();
  });

  window.addEventListener("resize", () => {
    if (musicPanelOpen) updateTrackTitle();
  });

  document.addEventListener("click", (e) => {
    if (!musicPanelOpen) return;
    if (e.target.closest("#music-widget")) return;
    toggleMusicPanel();
  });

  window.onYouTubeIframeAPIReady = initYouTubeRadio;

  if (window.YT && window.YT.Player) {
    initYouTubeRadio();
  }
}

function rotateMatrixCW(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = matrix[r][c];
    }
  }
  return rotated;
}

function matrixKey(matrix) {
  return matrix.map((row) => row.join("")).join("|");
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function buildShapeVariants() {
  const variants = {};

  for (const [baseName, baseMatrix] of Object.entries(SHAPE_BASES)) {
    const list = [];
    const seen = new Set();
    let current = cloneMatrix(baseMatrix);

    for (let rot = 0; rot < 4; rot++) {
      const key = matrixKey(current);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(cloneMatrix(current));
      }
      current = rotateMatrixCW(current);
    }

    variants[baseName] = list;
  }

  return variants;
}

function countEmptyCellsOnBoard() {
  let count = 0;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (grid[row][col] === 0) count++;
    }
  }
  return count;
}

/** Tahta doldukça kolay parça şansı artar, zor parça hafif azalır */
function getAdjustedTierWeight(tier) {
  const fillRatio = 1 - countEmptyCellsOnBoard() / (GRID_SIZE * GRID_SIZE);

  if (tier.id === "easy") {
    return tier.weight + Math.round(fillRatio * 4);
  }
  if (tier.id === "hard") {
    return Math.max(1, tier.weight - Math.round(fillRatio * 2));
  }
  return tier.weight;
}

function pickSpawnTier() {
  const weighted = SPAWN_TIERS.map((tier) => ({
    tier,
    w: getAdjustedTierWeight(tier),
  }));
  const total = weighted.reduce((sum, item) => sum + item.w, 0);
  let roll = Math.random() * total;

  for (const item of weighted) {
    roll -= item.w;
    if (roll <= 0) return item.tier;
  }

  return SPAWN_TIERS[0];
}

function pickBaseFromTier(tier, avoidBases) {
  const fresh = tier.shapes.filter((name) => !avoidBases.has(name));
  const pool = fresh.length > 0 ? fresh : tier.shapes;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Önce zorluk katmanı (10:5:3), sonra temel şekil + rastgele dönüş.
 * Aynı 3'lü sette mümkünse tekrarlayan temel şekil verilmez.
 */
function createRandomTrayPiece(avoidBases = new Set()) {
  let baseName = null;

  for (let attempt = 0; attempt < 24; attempt++) {
    const tier = pickSpawnTier();
    const candidate = pickBaseFromTier(tier, avoidBases);
    if (!avoidBases.has(candidate)) {
      baseName = candidate;
      break;
    }
    baseName = candidate;
  }

  if (!baseName) {
    baseName = BASE_SHAPE_NAMES[Math.floor(Math.random() * BASE_SHAPE_NAMES.length)];
  }

  const rotations = SHAPE_VARIANTS[baseName];
  const matrix = cloneMatrix(rotations[Math.floor(Math.random() * rotations.length)]);

  return {
    shapeKey: baseName,
    matrix,
    color: randomPieceColor(),
  };
}

function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

function countFilledCells(matrix) {
  let count = 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] === 1) count++;
    }
  }
  return count;
}

function findCompletedLines() {
  const fullRows = [];
  const fullCols = [];

  for (let row = 0; row < GRID_SIZE; row++) {
    if (grid[row].every((cell) => cell !== 0)) {
      fullRows.push(row);
    }
  }

  for (let col = 0; col < GRID_SIZE; col++) {
    let isFull = true;
    for (let row = 0; row < GRID_SIZE; row++) {
      if (grid[row][col] === 0) {
        isFull = false;
        break;
      }
    }
    if (isFull) fullCols.push(col);
  }

  return { fullRows, fullCols };
}

function applyLineClearToGrid(fullRows, fullCols) {
  for (const row of fullRows) {
    for (let col = 0; col < GRID_SIZE; col++) {
      grid[row][col] = 0;
    }
  }
  for (const col of fullCols) {
    for (let row = 0; row < GRID_SIZE; row++) {
      grid[row][col] = 0;
    }
  }
}

function collectCellsToClear(fullRows, fullCols) {
  const seen = new Set();
  const cells = [];

  const addCell = (row, col) => {
    const key = `${row},${col}`;
    if (seen.has(key) || grid[row][col] === 0) return;
    seen.add(key);
    const value = grid[row][col];
    cells.push({
      row,
      col,
      value,
      color: PIECE_COLORS[(value - 1) % PIECE_COLORS.length],
    });
  };

  for (const row of fullRows) {
    for (let col = 0; col < GRID_SIZE; col++) addCell(row, col);
  }
  for (const col of fullCols) {
    for (let row = 0; row < GRID_SIZE; row++) addCell(row, col);
  }

  return cells;
}

function getCellCanvasCenter(row, col) {
  const { board, cellSize } = layout;
  return {
    x: board.x + (col + 0.5) * cellSize,
    y: board.y + (row + 0.5) * cellSize,
  };
}

function spawnClearParticles(cells) {
  if (!layout) return;

  for (const cell of cells) {
    const { x, y } = getCellCanvasCenter(cell.row, cell.col);
    const sparkCount = 6 + Math.floor(Math.random() * 5);

    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 5;
      clearParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        color: cell.color,
        life: 1,
        decay: 0.018 + Math.random() * 0.022,
        size: Math.max(2, layout.cellSize * (0.06 + Math.random() * 0.08)),
      });
    }
  }
}

function startComboVisual(lineCount) {
  if (lineCount < 2 || !layout) return;

  comboVisual = {
    start: performance.now(),
    duration: COMBO_VISUAL_MS,
    lineCount,
    boardCenter: {
      x: layout.board.x + layout.board.size / 2,
      y: layout.board.y + layout.board.size / 2,
    },
  };
}

function updateClearParticles() {
  for (const p of clearParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.life -= p.decay;
  }
  clearParticles = clearParticles.filter((p) => p.life > 0);
}

function updateLineClearEffect() {
  if (!lineClearEffect) return false;

  const elapsed = performance.now() - lineClearEffect.start;
  if (elapsed >= lineClearEffect.duration) {
    const { fullRows, fullCols, dropX, dropY, totalLines } = lineClearEffect;
    applyLineClearToGrid(fullRows, fullCols);
    finishLineClearScoring(dropX, dropY, totalLines);
    lineClearEffect = null;
    return true;
  }
  return false;
}

function finishLineClearScoring(dropX, dropY, comboCount) {
  const linePoints = SCORE_LINE_BASE * comboCount * comboCount;
  addScore(linePoints);

  if (comboCount > 1) {
    spawnFloatingText(dropX, dropY - 8, `Combo x${comboCount}!`, COLORS.floatCombo);
    spawnFloatingText(dropX, dropY + 14, `+${linePoints}`, COLORS.floatPoints);
  } else {
    spawnFloatingText(dropX, dropY, `+${linePoints}`, COLORS.floatPoints);
  }
}

function isCellClearing(row, col) {
  if (!lineClearEffect) return false;
  return lineClearEffect.cellKeys.has(`${row},${col}`);
}

function needsAnimationLoop() {
  return (
    floatingTexts.length > 0 ||
    clearParticles.length > 0 ||
    lineClearEffect !== null ||
    comboVisual !== null ||
    (drag !== null && drag.useSmoothing)
  );
}

function ensureAnimationLoop() {
  if (animLoopActive) return;
  animLoopActive = true;

  function tick() {
    updateClearParticles();
    updateLineClearEffect();

    if (comboVisual) {
      const elapsed = performance.now() - comboVisual.start;
      if (elapsed >= comboVisual.duration) comboVisual = null;
    }

    draw();

    if (needsAnimationLoop()) {
      requestAnimationFrame(tick);
    } else {
      animLoopActive = false;
    }
  }

  requestAnimationFrame(tick);
}

function getPlacementCenterCanvas(gridRow, gridCol, matrix) {
  const { board, cellSize } = layout;
  const cols = matrix[0].length;
  const rows = matrix.length;
  return {
    x: board.x + (gridCol + cols / 2) * cellSize,
    y: board.y + (gridRow + rows / 2) * cellSize,
  };
}

function spawnFloatingText(x, y, text, color) {
  floatingTexts.push({
    x,
    y,
    text,
    color,
    start: performance.now(),
  });
  startFloatAnimationLoop();
}

function startFloatAnimationLoop() {
  ensureAnimationLoop();
}

function drawFloatingTexts() {
  const now = performance.now();

  floatingTexts = floatingTexts.filter(
    (ft) => now - ft.start < FLOAT_TEXT_DURATION_MS
  );

  const fontSize = Math.max(14, layout.cellSize * 0.45);

  for (const ft of floatingTexts) {
    const elapsed = now - ft.start;
    const t = elapsed / FLOAT_TEXT_DURATION_MS;
    const alpha = 1 - t;
    const floatUp = layout.cellSize * 1.2 * t;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ft.color;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(ft.text, ft.x, ft.y - floatUp);
    ctx.restore();
  }
}

function resolveLineClearsAndScore(dropX, dropY) {
  const { fullRows, fullCols } = findCompletedLines();
  const totalLines = fullRows.length + fullCols.length;
  if (totalLines === 0) return;

  const cells = collectCellsToClear(fullRows, fullCols);
  spawnClearParticles(cells);

  if (totalLines >= 2) {
    startComboVisual(totalLines);
  }

  const cellKeys = new Set(cells.map((c) => `${c.row},${c.col}`));
  lineClearEffect = {
    start: performance.now(),
    duration: CLEAR_ANIM_MS,
    fullRows,
    fullCols,
    cellKeys,
    dropX,
    dropY,
    totalLines,
  };

  ensureAnimationLoop();
}

function addScore(points) {
  if (points <= 0) return;
  currentScore += points;
  updateScoreUI();
  updateHighScoreIfNeeded();
}

function updateScoreUI() {
  currentScoreEl.textContent = String(currentScore);
}

function updateHighScoreIfNeeded() {
  if (currentScore <= highScore) return;
  highScore = currentScore;
  localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  highScoreEl.textContent = String(highScore);
}

function canPlace(matrix, gridRow, gridCol) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] !== 1) continue;

      const gr = gridRow + r;
      const gc = gridCol + c;

      if (gr < 0 || gc < 0 || gr >= GRID_SIZE || gc >= GRID_SIZE) {
        return false;
      }
      if (grid[gr][gc] !== 0) {
        return false;
      }
    }
  }
  return true;
}

function canPieceFitOnBoard(matrix) {
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (canPlace(matrix, row, col)) {
        return true;
      }
    }
  }
  return false;
}

function canAnyTrayPieceFit() {
  for (const piece of trayPieces) {
    if (piece && canPieceFitOnBoard(piece.matrix)) {
      return true;
    }
  }
  return false;
}

function showGameOverOverlay() {
  updateHighScoreIfNeeded();
  goFinalScoreEl.textContent = String(currentScore);
  goHighScoreEl.textContent = String(highScore);
  gameOverOverlay.classList.add("is-visible");
  gameOverOverlay.setAttribute("aria-hidden", "false");
  isGameOver = true;
}

function hideGameOverOverlay() {
  gameOverOverlay.classList.remove("is-visible");
  gameOverOverlay.setAttribute("aria-hidden", "true");
  isGameOver = false;
}

function checkGameOver() {
  if (isGameOver) return;
  if (canAnyTrayPieceFit()) return;
  triggerGameOver();
}

function triggerGameOver() {
  if (isGameOver) return;
  showGameOverOverlay();
  draw();
}

function restartGame() {
  hideGameOverOverlay();
  grid = createEmptyGrid();
  currentScore = 0;
  floatingTexts = [];
  clearParticles = [];
  lineClearEffect = null;
  comboVisual = null;
  drag = null;
  updateScoreUI();
  spawnTraySet();
  draw();
}

function randomPieceColor() {
  return PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)];
}

function spawnTraySet() {
  const usedBases = new Set();

  for (let i = 0; i < TRAY_SLOT_COUNT; i++) {
    const piece = createRandomTrayPiece(usedBases);
    usedBases.add(piece.shapeKey);
    trayPieces[i] = {
      ...piece,
      slotIndex: i,
    };
  }
}

function traySetIsEmpty() {
  return trayPieces.every((p) => p === null);
}

/**
 * Izgara + tepsi tek kümede; aralarında küçük boşluk (logo HTML footer'da).
 */
function getLayoutMetrics(width, height) {
  const sidePad = Math.max(10, width * 0.05);
  const innerW = width - sidePad * 2;
  const verticalPad = Math.max(4, height * 0.015);

  const trayHeight = height * LAYOUT_TRAY_RATIO;
  const boardTrayGap = Math.max(6, height * LAYOUT_BOARD_TRAY_GAP_RATIO);

  let boardSide = Math.min(innerW, height - trayHeight - boardTrayGap - verticalPad * 2);
  const clusterHeight = boardSide + boardTrayGap + trayHeight;
  const clusterTop = Math.max(
    verticalPad,
    (height - clusterHeight) / 2 - height * 0.03
  );

  const boardX = (width - boardSide) / 2;
  const boardY = clusterTop;
  const trayW = innerW;
  const trayX = (width - trayW) / 2;
  const trayY = boardY + boardSide + boardTrayGap;
  const slotGap = trayW * 0.06;
  const slotWidth = (trayW - slotGap * (TRAY_SLOT_COUNT - 1)) / TRAY_SLOT_COUNT;
  const cellSize = boardSide / GRID_SIZE;

  return {
    gap: slotGap,
    cellSize,
    board: {
      x: boardX,
      y: boardY,
      size: boardSide,
      cols: GRID_SIZE,
      rows: GRID_SIZE,
    },
    tray: {
      x: trayX,
      y: trayY,
      width: trayW,
      height: trayHeight,
      slotWidth,
      slotHeight: trayHeight,
      count: TRAY_SLOT_COUNT,
    },
  };
}

function getTraySlotRect(slotIndex) {
  const { x, y, slotWidth, slotHeight } = layout.tray;
  const slotGap = layout.gap;
  return {
    x: x + slotIndex * (slotWidth + slotGap),
    y,
    w: slotWidth,
    h: slotHeight,
  };
}

function fitCellSizeInRect(matrix, maxW, maxH) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  return Math.min(maxW / cols, maxH / rows);
}

function getTrayPieceLayout(slotIndex, matrix) {
  const slot = getTraySlotRect(slotIndex);
  const maxTrayCell = layout.cellSize * TRAY_PIECE_SCALE;
  const fitted = fitCellSizeInRect(matrix, slot.w * 0.85, slot.h * 0.85);
  const cellSize = Math.min(fitted, maxTrayCell);
  const pw = matrix[0].length * cellSize;
  const ph = matrix.length * cellSize;
  return {
    x: slot.x + (slot.w - pw) / 2,
    y: slot.y + (slot.h - ph) / 2,
    cellSize,
  };
}

function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const scaleX = viewWidth / rect.width;
  const scaleY = viewHeight / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function hitTestFilledCells(px, py, originX, originY, cellSize, matrix) {
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (matrix[row][col] !== 1) continue;

      const cellX = originX + col * cellSize;
      const cellY = originY + row * cellSize;

      if (
        px >= cellX &&
        px < cellX + cellSize &&
        py >= cellY &&
        py < cellY + cellSize
      ) {
        const relCol = (px - originX) / cellSize;
        const relRow = (py - originY) / cellSize;
        return { relCol, relRow, row, col };
      }
    }
  }
  return null;
}

function hitTestTrayPiece(px, py) {
  if (isGameOver) return null;

  for (let i = 0; i < TRAY_SLOT_COUNT; i++) {
    const piece = trayPieces[i];
    if (!piece) continue;
    if (drag && drag.slotIndex === i) continue;

    const pieceLayout = getTrayPieceLayout(i, piece.matrix);
    const hit = hitTestFilledCells(
      px,
      py,
      pieceLayout.x,
      pieceLayout.y,
      pieceLayout.cellSize,
      piece.matrix
    );

    if (hit) {
      return {
        piece,
        slotIndex: i,
        relCol: hit.relCol,
        relRow: hit.relRow,
      };
    }
  }
  return null;
}

function drawPiece(matrix, originX, originY, cellSize, color, alpha = 1) {
  const inset = Math.max(1, cellSize * 0.08);
  const radius = Math.max(2, cellSize * 0.14);

  ctx.globalAlpha = alpha;

  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (matrix[row][col] !== 1) continue;

      const px = originX + col * cellSize;
      const py = originY + row * cellSize;

      ctx.fillStyle = color;
      roundRect(ctx, px + inset, py + inset, cellSize - inset * 2, cellSize - inset * 2, radius);
      ctx.fill();

      ctx.strokeStyle = COLORS.cellFilledBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

function drawPlacedBlocks() {
  const { x, y } = layout.board;
  const cellSize = layout.cellSize;
  const clearT = lineClearEffect
    ? Math.min(1, (performance.now() - lineClearEffect.start) / lineClearEffect.duration)
    : 0;

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const value = grid[row][col];
      if (value === 0) continue;

      const color = PIECE_COLORS[(value - 1) % PIECE_COLORS.length];
      const px = x + col * cellSize;
      const py = y + row * cellSize;
      const inset = Math.max(1, cellSize * 0.06);
      const size = cellSize - inset * 2;
      const cx = px + inset + size / 2;
      const cy = py + inset + size / 2;

      ctx.save();

      if (isCellClearing(row, col)) {
        const pop = 1 + Math.sin(clearT * Math.PI) * 0.22;
        const alpha = 1 - clearT;
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        ctx.translate(-cx, -cy);
        ctx.shadowColor = color;
        ctx.shadowBlur = 14 * (1 - clearT);
      }

      ctx.fillStyle = color;
      roundRect(ctx, px + inset, py + inset, size, size, Math.max(2, cellSize * 0.12));
      ctx.fill();

      ctx.strokeStyle = COLORS.cellFilledBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawClearParticles() {
  for (const p of clearParticles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawComboRings() {
  if (!comboVisual || !layout) return;

  const elapsed = performance.now() - comboVisual.start;
  const t = elapsed / comboVisual.duration;
  const { x: cx, y: cy } = comboVisual.boardCenter;
  const maxR = layout.board.size * 0.72;

  for (let i = 0; i < comboVisual.lineCount + 1; i++) {
    const phase = (t + i * 0.18) % 1;
    const radius = maxR * phase;
    const alpha = (1 - phase) * 0.55;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `hsla(${32 + i * 40}, 90%, 62%, 1)`;
    ctx.lineWidth = 3 - phase * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBackground() {
  let bg = COLORS.background;

  if (comboVisual) {
    const elapsed = performance.now() - comboVisual.start;
    const t = Math.sin(Math.min(1, elapsed / comboVisual.duration) * Math.PI);
    ctx.fillStyle = blendHexColors(bg, "#5c3a28", t * 0.35);
  } else {
    ctx.fillStyle = bg;
  }

  ctx.fillRect(0, 0, viewWidth, viewHeight);
}

function blendHexColors(a, b, t) {
  const parse = (hex) => {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };
  const c1 = parse(a);
  const c2 = parse(b);
  const mix = (i) => Math.round(c1[i] + (c2[i] - c1[i]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

function colorToGridValue(color) {
  const idx = PIECE_COLORS.indexOf(color);
  return (idx >= 0 ? idx : 0) + 1;
}

function placeOnGrid(matrix, gridRow, gridCol, color) {
  const value = colorToGridValue(color);

  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] !== 1) continue;
      grid[gridRow + r][gridCol + c] = value;
    }
  }
}

function isCoarsePointer() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getDragDesiredOrigin(px, py) {
  const cellSize = layout.cellSize;
  const matrix = drag.piece.matrix;
  const cols = matrix[0].length;
  const rows = matrix.length;
  const pieceW = cols * cellSize;
  const pieceH = rows * cellSize;

  return {
    x: px - drag.normX * pieceW,
    y: py - drag.normY * pieceH - drag.liftY,
  };
}

/**
 * Tutma noktası parça içinde normalize (0–1); tepsi/tahta ölçeği farkında sıçrama olmaz.
 */
function getDragOriginFromPointer(px, py) {
  const desired = getDragDesiredOrigin(px, py);

  if (!drag.useSmoothing) {
    return desired;
  }

  drag.smoothX += (desired.x - drag.smoothX) * DRAG_TOUCH_SMOOTHING;
  drag.smoothY += (desired.y - drag.smoothY) * DRAG_TOUCH_SMOOTHING;
  return { x: drag.smoothX, y: drag.smoothY };
}

function tryPlaceDraggedPiece(px, py) {
  const { board, cellSize } = layout;
  const { matrix, color } = drag.piece;
  const origin = getDragDesiredOrigin(px, py);

  const gridCol = Math.round((origin.x - board.x) / cellSize);
  const gridRow = Math.round((origin.y - board.y) / cellSize);

  if (!canPlace(matrix, gridRow, gridCol)) {
    return false;
  }

  placeOnGrid(matrix, gridRow, gridCol, color);

  const dropCenter = getPlacementCenterCanvas(gridRow, gridCol, matrix);

  const placedCells = countFilledCells(matrix);
  addScore(placedCells * SCORE_PLACE_PER_CELL);

  resolveLineClearsAndScore(dropCenter.x, dropCenter.y);

  trayPieces[drag.slotIndex] = null;

  if (traySetIsEmpty()) {
    spawnTraySet();
  }

  checkGameOver();
  return true;
}

function bindTouchDragListeners() {
  if (touchDragListenersBound) return;
  touchDragListenersBound = true;

  window.addEventListener("touchmove", onWindowTouchMove, { passive: false });
  window.addEventListener("touchend", onWindowTouchEnd, { passive: false });
  window.addEventListener("touchcancel", onWindowTouchEnd, { passive: false });
}

function unbindTouchDragListeners() {
  if (!touchDragListenersBound) return;
  touchDragListenersBound = false;

  window.removeEventListener("touchmove", onWindowTouchMove);
  window.removeEventListener("touchend", onWindowTouchEnd);
  window.removeEventListener("touchcancel", onWindowTouchEnd);
}

function onWindowTouchMove(e) {
  if (!drag) return;
  e.preventDefault();
  if (e.touches.length === 0) return;
  const t = e.touches[0];
  onPointerMove(t.clientX, t.clientY);
}

function onWindowTouchEnd(e) {
  const t = e.changedTouches[0];
  if (t && drag) onPointerUp(t.clientX, t.clientY);
  unbindTouchDragListeners();
}

function startDrag(px, py, hit) {
  const boardCell = layout.cellSize;
  const matrix = hit.piece.matrix;
  const trayLayout = getTrayPieceLayout(hit.slotIndex, matrix);
  const cols = matrix[0].length;
  const rows = matrix.length;
  const pieceWTray = cols * trayLayout.cellSize;
  const pieceHTray = rows * trayLayout.cellSize;
  const pieceWBoard = cols * boardCell;
  const pieceHBoard = rows * boardCell;

  const normX = clamp01((px - trayLayout.x) / pieceWTray);
  const normY = clamp01((py - trayLayout.y) / pieceHTray);
  const useSmoothing = isCoarsePointer();
  const liftY = useSmoothing ? boardCell * DRAG_TOUCH_LIFT_RATIO : 0;

  const originX = px - normX * pieceWBoard;
  const originY = py - normY * pieceHBoard - liftY;

  drag = {
    piece: hit.piece,
    slotIndex: hit.slotIndex,
    normX,
    normY,
    liftY,
    useSmoothing,
    pointerX: px,
    pointerY: py,
    smoothX: originX,
    smoothY: originY,
  };

  if (useSmoothing) {
    bindTouchDragListeners();
    ensureAnimationLoop();
  }
}

function updateDrag(px, py) {
  if (!drag) return;
  drag.pointerX = px;
  drag.pointerY = py;
  getDragOriginFromPointer(px, py);
  draw();
}

function endDrag(px, py) {
  if (!drag) return;
  unbindTouchDragListeners();
  tryPlaceDraggedPiece(px, py);
  drag = null;
  draw();
}

function onPointerDown(clientX, clientY) {
  if (!layout || drag || isGameOver) return;

  const { x, y } = getCanvasPoint(clientX, clientY);
  const hit = hitTestTrayPiece(x, y);
  if (!hit) return;

  startDrag(x, y, hit);
  draw();
}

function onPointerMove(clientX, clientY) {
  if (!drag) return;
  const { x, y } = getCanvasPoint(clientX, clientY);
  updateDrag(x, y);
}

function onPointerUp(clientX, clientY) {
  if (!drag) return;
  const { x, y } = getCanvasPoint(clientX, clientY);
  endDrag(x, y);
}

function resizeCanvas() {
  const wrapRect = canvasWrap.getBoundingClientRect();
  const cssWidth = Math.max(200, Math.floor(wrapRect.width));
  const cssHeight = Math.max(240, Math.floor(wrapRect.height));

  viewWidth = cssWidth;
  viewHeight = cssHeight;
  deviceRatio = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(cssWidth * deviceRatio);
  canvas.height = Math.round(cssHeight * deviceRatio);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  ctx.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
  layout = getLayoutMetrics(cssWidth, cssHeight);
  draw();
}

function drawGrid(board, cellSize) {
  const { x, y, cols, rows, size } = board;

  ctx.fillStyle = COLORS.boardBg;
  roundRect(ctx, x - 4, y - 4, size + 8, size + 8, 10);
  ctx.fill();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid[row][col] !== 0) continue;

      const cx = x + col * cellSize;
      const cy = y + row * cellSize;
      const inset = Math.max(1, cellSize * 0.06);
      const cellDrawSize = cellSize - inset * 2;

      ctx.fillStyle = COLORS.cellEmpty;
      roundRect(ctx, cx + inset, cy + inset, cellDrawSize, cellDrawSize, Math.max(2, cellSize * 0.12));
      ctx.fill();

      ctx.strokeStyle = COLORS.cellBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawTray() {
  /* Tepsi alanı görselde sade; slot çerçevesi çizilmez */
}

function drawTrayPieces() {
  for (let i = 0; i < TRAY_SLOT_COUNT; i++) {
    const piece = trayPieces[i];
    if (!piece) continue;
    if (drag && drag.slotIndex === i) continue;

    const pieceLayout = getTrayPieceLayout(i, piece.matrix);
    drawPiece(piece.matrix, pieceLayout.x, pieceLayout.y, pieceLayout.cellSize, piece.color);
  }
}

function drawDraggedPiece() {
  if (!drag) return;

  const origin = getDragOriginFromPointer(drag.pointerX, drag.pointerY);
  drawPiece(drag.piece.matrix, origin.x, origin.y, layout.cellSize, drag.piece.color, 0.95);
}

function roundRect(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

function draw() {
  if (!layout || viewWidth <= 0 || viewHeight <= 0) return;

  drawBackground();
  drawGrid(layout.board, layout.cellSize);
  drawPlacedBlocks();
  drawComboRings();
  drawClearParticles();
  drawTray();
  drawTrayPieces();
  drawDraggedPiece();
  drawFloatingTexts();
}

function initScores() {
  highScore = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || "0", 10);
  if (Number.isNaN(highScore)) highScore = 0;

  currentScore = 0;
  highScoreEl.textContent = String(highScore);
  currentScoreEl.textContent = "0";
}

function setupInput() {
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onPointerDown(e.clientX, e.clientY);
  });

  window.addEventListener("mousemove", (e) => {
    onPointerMove(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", (e) => {
    onPointerUp(e.clientX, e.clientY);
  });

  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      onPointerDown(t.clientX, t.clientY);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!drag) return;
      e.preventDefault();
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      onPointerMove(t.clientX, t.clientY);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) onPointerUp(t.clientX, t.clientY);
    },
    { passive: false }
  );

  canvas.addEventListener("touchcancel", (e) => {
    const t = e.changedTouches[0];
    if (t) onPointerUp(t.clientX, t.clientY);
    unbindTouchDragListeners();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  restartBtn.addEventListener("click", () => {
    restartGame();
  });
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => {
  setTimeout(resizeCanvas, 150);
});

initScores();
setupInput();
setupMusicPlayer();
restartGame();
resizeCanvas();
