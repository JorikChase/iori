    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // --- Viewport control ---
    // Every animated canvas registers here. It starts when it scrolls into
    // view and stops when it leaves: nothing burns CPU off-screen, nothing
    // sits frozen when the reader reaches it. A scene with a Play/Pause
    // button keeps the reader's choice through `wanted`.
    const scenes = {};
    function registerScene(id, scene) {
      scenes[id] = Object.assign({ visible: false, running: false, inited: false, wanted: () => true }, scene);
    }
    function sceneStart(id) {
      const s = scenes[id];
      if (!s.visible || s.running || !s.wanted()) return;
      if (!s.inited) { if (s.init) s.init(); s.inited = true; }
      s.running = true;
      s.start();
    }
    function sceneStop(id) {
      const s = scenes[id];
      if (!s.running) return;
      s.running = false;
      s.stop();
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const s = scenes[e.target.id];
        if (!s) return;
        s.visible = e.isIntersecting;
        if (s.visible) sceneStart(e.target.id); else sceneStop(e.target.id);
      });
    }, { root: null, threshold: 0.1 });

    // --- Sierpinski Carpet ---
    const carpetCanvas = document.getElementById('sierpinski-carpet-canvas');
    const carpetCtx = carpetCanvas.getContext('2d');
    let carpetIterations = 3;
    function drawCarpet(ctx, level, x, y, size) {
      if (level === 0) return;
      const subSize = size / 3;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (i === 1 && j === 1) ctx.fillRect(x + subSize, y + subSize, subSize, subSize);
          else drawCarpet(ctx, level - 1, x + i * subSize, y + j * subSize, subSize);
        }
      }
    }
    function renderCarpet() {
      carpetCtx.fillStyle = '#ffffff';
      carpetCtx.fillRect(0, 0, carpetCanvas.width, carpetCanvas.height);
      carpetCtx.fillStyle = '#212529';
      drawCarpet(carpetCtx, carpetIterations, 0, 0, carpetCanvas.width);
    }
    document.getElementById('carpet-incr').onclick = () => { if (carpetIterations < 6) carpetIterations++; updateCarpetUI(); };
    document.getElementById('carpet-decr').onclick = () => { if (carpetIterations > 0) carpetIterations--; updateCarpetUI(); };
    function updateCarpetUI() {
      document.getElementById('carpet-level').textContent = carpetIterations;
      renderCarpet();
    }
    updateCarpetUI();

    // --- Menger Sponge ---
    const spongeContainer = document.getElementById('menger-sponge-canvas-container');
    const spongeCanvas = document.getElementById('menger-sponge-canvas');
    let spongeIterations = 2;
    let spongeScene, spongeCamera, spongeRenderer, spongeControls, spongeGroup;
    function getSpongeTransforms(level, size, center) {
      if (level === 0) return [{ position: center, size: size }];
      const transforms = [];
      const subSize = size / 3;
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 1) {
          const newCenter = center.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(subSize));
          transforms.push(...getSpongeTransforms(level - 1, subSize, newCenter));
        }
      }
      return transforms;
    }
    function initSponge() {
      spongeScene = new THREE.Scene();
      spongeScene.background = new THREE.Color(0xffffff);
      const size = spongeContainer.clientWidth;
      const aspect = size / size;
      const frustumSize = 3;
      spongeCamera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 1000);
      spongeCamera.position.set(1.5, 1.5, 1.5);
      spongeRenderer = new THREE.WebGLRenderer({ canvas: spongeCanvas, antialias: true, alpha: true });
      spongeRenderer.setPixelRatio(window.devicePixelRatio);
      spongeRenderer.setSize(size, size);
      spongeControls = new OrbitControls(spongeCamera, spongeRenderer.domElement);
      spongeControls.enableDamping = true;

      const ambientLight = new THREE.AmbientLight(0x404040, 3);
      spongeScene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
      directionalLight.position.set(0.5, 1, 0.75).normalize();
      spongeScene.add(directionalLight);
      buildSponge();
    }
    function buildSponge() {
      if (spongeGroup) {
        spongeGroup.traverse(c => { if (c.isInstancedMesh) { c.geometry.dispose(); c.material.dispose(); } });
        spongeScene.remove(spongeGroup);
      }
      spongeGroup = new THREE.Group();
      const transforms = getSpongeTransforms(spongeIterations, 1.5, new THREE.Vector3(0, 0, 0));
      if (transforms.length === 0) { return; }
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshLambertMaterial({ color: 0x212529 });
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < transforms.length; i++) {
        const { position, size } = transforms[i];
        matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(size, size, size));
        mesh.setMatrixAt(i, matrix);
      }
      spongeGroup.add(mesh);
      spongeScene.add(spongeGroup);
    }
    let spongeRaf = null;
    function animateSponge() {
      spongeRaf = requestAnimationFrame(animateSponge);
      spongeControls.update();
      spongeRenderer.render(spongeScene, spongeCamera);
    }
    document.getElementById('sponge-incr').onclick = () => { if (spongeIterations < 3) spongeIterations++; updateSpongeUI(); };
    document.getElementById('sponge-decr').onclick = () => { if (spongeIterations > 0) spongeIterations--; updateSpongeUI(); };
    function updateSpongeUI() {
      document.getElementById('sponge-level').textContent = spongeIterations;
      const kept = Math.pow(20, spongeIterations), grid = Math.pow(27, spongeIterations);
      document.getElementById('sponge-status').textContent = `${kept.toLocaleString('en')} cubes drawn as copies of one · a grid would need ${grid.toLocaleString('en')} cells`;
      if (scenes['menger-sponge-canvas-container']?.inited) buildSponge();
    }
    updateSpongeUI();

    // --- Brownian Motion ---
    const brownianCanvas = document.getElementById('brownian-motion-canvas');
    const brownianCtx = brownianCanvas.getContext('2d');
    let brownianX, brownianY, brownianTimer = null;
    function resetBrownian() {
      const { width: w, height: h } = brownianCanvas;
      brownianCtx.fillStyle = '#ffffff';
      brownianCtx.fillRect(0, 0, w, h);
      [brownianX, brownianY] = [w / 2, h / 2];
      brownianCtx.strokeStyle = '#212529';
      brownianCtx.lineWidth = 1;
    }
    function stepBrownian() {
      brownianCtx.beginPath();
      brownianCtx.moveTo(brownianX, brownianY);
      brownianX += (Math.random() - 0.5) * 10;
      brownianY += (Math.random() - 0.5) * 10;
      brownianX = Math.max(0, Math.min(brownianCanvas.width, brownianX));
      brownianY = Math.max(0, Math.min(brownianCanvas.height, brownianY));
      brownianCtx.lineTo(brownianX, brownianY);
      brownianCtx.stroke();
    }
    document.getElementById('brownian-reset').onclick = resetBrownian;
    resetBrownian();

    // --- Langton's Ant ---
    const antCanvas = document.getElementById('langtons-ant-canvas');
    const antCtx = antCanvas.getContext('2d');
    const antBtn = document.getElementById('ant-play-pause');
    const antGridSize = 100;
    const antCellSize = antCanvas.width / antGridSize;
    let antGrid, ant, antWanted = true, antTimer = null;
    const antDirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N, E, S, W
    function setupAnt() {
      antGrid = Array(antGridSize).fill(0).map(() => Array(antGridSize).fill(0));
      ant = { x: antGridSize / 2, y: antGridSize / 2, dir: 0 };
      antCtx.fillStyle = '#ffffff'; antCtx.fillRect(0, 0, antCanvas.width, antCanvas.height);
    }
    function updateAnt() {
      const { x, y } = ant;
      if (antGrid[y][x] === 0) { ant.dir = (ant.dir + 1) % 4; antGrid[y][x] = 1; }
      else { ant.dir = (ant.dir - 1 + 4) % 4; antGrid[y][x] = 0; }
      antCtx.fillStyle = antGrid[y][x] ? '#212529' : '#ffffff';
      antCtx.fillRect(x * antCellSize, y * antCellSize, antCellSize, antCellSize);
      // the grid is a torus: the highway comes back and eats its own trail
      ant.x = (ant.x + antDirs[ant.dir][0] + antGridSize) % antGridSize;
      ant.y = (ant.y + antDirs[ant.dir][1] + antGridSize) % antGridSize;
    }
    function startAnt() { antTimer = setInterval(updateAnt, 10); antBtn.textContent = 'Pause'; }
    function stopAnt() { clearInterval(antTimer); antTimer = null; antBtn.textContent = 'Play'; }
    antBtn.onclick = () => {
      antWanted = !antWanted;
      if (antWanted) sceneStart('langtons-ant-canvas'); else sceneStop('langtons-ant-canvas');
    };
    document.getElementById('ant-reset').onclick = setupAnt;
    setupAnt();

    // --- Game of Life ---
    const lifeCanvas = document.getElementById('game-of-life-canvas');
    const lifeCtx = lifeCanvas.getContext('2d');
    const lifeBtn = document.getElementById('life-play-pause');
    const lifeGridSize = 50;
    const lifeCellSize = lifeCanvas.width / lifeGridSize;
    let lifeGrid = [], lifeNextGrid = [], lifeWanted = true, lifeTimer = null;
    function setupLife() {
      lifeGrid = Array(lifeGridSize).fill(0).map(() => Array(lifeGridSize).fill(0).map(() => Math.random() > 0.7 ? 1 : 0));
      lifeNextGrid = Array(lifeGridSize).fill(0).map(() => Array(lifeGridSize).fill(0));
      drawLife();
    }
    function drawLife() {
      lifeCtx.fillStyle = '#ffffff'; lifeCtx.fillRect(0, 0, lifeCanvas.width, lifeCanvas.height);
      lifeCtx.fillStyle = '#212529';
      for (let y = 0; y < lifeGridSize; y++) for (let x = 0; x < lifeGridSize; x++) {
        if (lifeGrid[y][x] === 1) lifeCtx.fillRect(x * lifeCellSize, y * lifeCellSize, lifeCellSize, lifeCellSize);
      }
    }
    function updateLife() {
      for (let y = 0; y < lifeGridSize; y++) for (let x = 0; x < lifeGridSize; x++) {
        let neighbors = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          const ny = (y + i + lifeGridSize) % lifeGridSize, nx = (x + j + lifeGridSize) % lifeGridSize;
          neighbors += lifeGrid[ny][nx];
        }
        if (lifeGrid[y][x] === 1 && (neighbors < 2 || neighbors > 3)) lifeNextGrid[y][x] = 0;
        else if (lifeGrid[y][x] === 0 && neighbors === 3) lifeNextGrid[y][x] = 1;
        else lifeNextGrid[y][x] = lifeGrid[y][x];
      }
      [lifeGrid, lifeNextGrid] = [lifeNextGrid, lifeGrid];
      drawLife();
    }
    function startLife() { lifeTimer = setInterval(updateLife, 100); lifeBtn.textContent = 'Pause'; }
    function stopLife() { clearInterval(lifeTimer); lifeTimer = null; lifeBtn.textContent = 'Play'; }
    lifeBtn.onclick = () => {
      lifeWanted = !lifeWanted;
      if (lifeWanted) sceneStart('game-of-life-canvas'); else sceneStop('game-of-life-canvas');
    };
    document.getElementById('life-reset').onclick = setupLife;
    setupLife();

    // --- Ising Model ---
    const isingCanvas = document.getElementById('ising-model-canvas');
    const isingCtx = isingCanvas.getContext('2d');
    const isingTempSlider = document.getElementById('ising-temp');
    const isingGridSize = 100;
    const isingOff = document.createElement('canvas');
    isingOff.width = isingOff.height = isingGridSize;
    const isingOffCtx = isingOff.getContext('2d');
    const isingImg = isingOffCtx.createImageData(isingGridSize, isingGridSize);
    let spins, temp, isingRaf = null, isingAnnealing = false;
    function setupIsing() {
      spins = Array(isingGridSize).fill(0).map(() => Array(isingGridSize).fill(0).map(() => Math.random() > 0.5 ? 1 : -1));
      temp = parseFloat(isingTempSlider.value);
      document.getElementById('ising-temp-val').textContent = temp.toFixed(1);
      drawIsing();
    }
    function updateIsing() {
      for (let i = 0; i < isingGridSize * isingGridSize; i++) {
        const x = Math.floor(Math.random() * isingGridSize), y = Math.floor(Math.random() * isingGridSize);
        const spin = spins[y][x];
        const neighbors = spins[(y - 1 + isingGridSize) % isingGridSize][x] + spins[(y + 1) % isingGridSize][x] + spins[y][(x - 1 + isingGridSize) % isingGridSize] + spins[y][(x + 1) % isingGridSize];
        const deltaE = 2 * spin * neighbors;
        if (deltaE < 0 || Math.random() < Math.exp(-deltaE / temp)) spins[y][x] *= -1;
      }
    }
    function drawIsing() {
      const d = isingImg.data;
      for (let y = 0; y < isingGridSize; y++) for (let x = 0; x < isingGridSize; x++) {
        const i = (y * isingGridSize + x) * 4, v = spins[y][x] === 1 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      isingOffCtx.putImageData(isingImg, 0, 0);
      isingCtx.imageSmoothingEnabled = false;
      isingCtx.drawImage(isingOff, 0, 0, isingCanvas.width, isingCanvas.height);
    }
    function animateIsing() {
      isingRaf = requestAnimationFrame(animateIsing);
      if (isingAnnealing) {
        const nt = Math.max(0.1, temp - 0.012);
        isingTempSlider.value = nt.toFixed(1); isingTempSlider.dispatchEvent(new Event('input'));
        isingAnnealing = nt > 0.1;
      }
      updateIsing(); drawIsing();
    }
    document.getElementById('ising-anneal').onclick = () => { isingTempSlider.value = '5'; isingTempSlider.dispatchEvent(new Event('input')); isingAnnealing = true; };
    isingTempSlider.oninput = () => { temp = parseFloat(isingTempSlider.value); document.getElementById('ising-temp-val').textContent = temp.toFixed(1); };
    isingTempSlider.addEventListener('pointerdown', () => { isingAnnealing = false; });
    document.getElementById('ising-reset').onclick = () => { isingAnnealing = false; setupIsing(); };
    setupIsing();

    // --- Difference of Gaussians ---
    const dogSourceImg = document.getElementById('dog-source-img');
    const dogCanvas = document.getElementById('dog-canvas');
    const dogCtx = dogCanvas.getContext('2d');
    const sigma1Slider = document.getElementById('sigma1'), sigma2Slider = document.getElementById('sigma2');
    let sourceImageData;
    document.getElementById('image-upload').onchange = (e) => { const reader = new FileReader(); reader.onload = (event) => { dogSourceImg.src = event.target.result; }; reader.readAsDataURL(e.target.files[0]); };
    function applyBoxBlur(src, width, height, radius) {
      const dataIn = new Uint8ClampedArray(src.data), dataOut = new Uint8ClampedArray(src.data.length);
      for (let pass = 0; pass < 2; pass++) {
        const srcData = (pass === 0) ? dataIn : dataOut, destData = (pass === 0) ? dataOut : dataIn;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          let r = 0, g = 0, b = 0, count = 0;
          for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const i = (ny * width + nx) * 4;
              r += srcData[i]; g += srcData[i + 1]; b += srcData[i + 2]; count++;
            }
          }
          const i = (y * width + x) * 4;
          destData[i] = r / count; destData[i + 1] = g / count; destData[i + 2] = b / count; destData[i + 3] = 255;
        }
      }
      return new ImageData(dataIn, width, height);
    }
    function runDoG() {
      if (!sourceImageData) return;
      const s1 = parseFloat(sigma1Slider.value), s2 = parseFloat(sigma2Slider.value);
      document.getElementById('sigma1-val').textContent = s1.toFixed(1); document.getElementById('sigma2-val').textContent = s2.toFixed(1);
      const blur1 = applyBoxBlur(sourceImageData, dogCanvas.width, dogCanvas.height, Math.round(s1));
      const blur2 = applyBoxBlur(sourceImageData, dogCanvas.width, dogCanvas.height, Math.round(s2));
      const resultData = new ImageData(dogCanvas.width, dogCanvas.height);
      for (let i = 0; i < blur1.data.length; i += 4) {
        const gray1 = blur1.data[i] * 0.3 + blur1.data[i + 1] * 0.59 + blur1.data[i + 2] * 0.11;
        const gray2 = blur2.data[i] * 0.3 + blur2.data[i + 1] * 0.59 + blur2.data[i + 2] * 0.11;
        const diff = Math.abs(gray1 - gray2);
        resultData.data[i] = resultData.data[i + 1] = resultData.data[i + 2] = diff; resultData.data[i + 3] = 255;
      }
      dogCtx.putImageData(resultData, 0, 0);
      document.getElementById('fd-result').textContent = '–';
    }
    dogSourceImg.onload = () => {
      dogCanvas.width = dogSourceImg.naturalWidth; dogCanvas.height = dogSourceImg.naturalHeight;
      dogCtx.drawImage(dogSourceImg, 0, 0);
      sourceImageData = dogCtx.getImageData(0, 0, dogCanvas.width, dogCanvas.height);
      runDoG();
    };
    // the default sample is the carpet from 1.1 at level 4 (405 px so every cell is whole pixels);
    // its box-counting dimension is known, log 8 / log 3 = 1.893, so 5.2 has an answer to check against
    dogSourceImg.src = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 405;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 405, 405);
      g.fillStyle = '#212529'; drawCarpet(g, 4, 0, 0, 405);
      return c.toDataURL();
    })();
    sigma1Slider.addEventListener('input', runDoG); sigma2Slider.addEventListener('input', runDoG);

    // --- Fractal Dimension ---
    document.getElementById('calculate-fd-btn').onclick = () => {
      const imageData = dogCtx.getImageData(0, 0, dogCanvas.width, dogCanvas.height);
      const binaryMatrix = [];
      for (let y = 0; y < imageData.height; y++) {
        const row = [];
        for (let x = 0; x < imageData.width; x++) row.push(imageData.data[(y * imageData.width + x) * 4] > 10 ? 1 : 0);
        binaryMatrix.push(row);
      }
      const sizes = [2, 4, 8, 16, 32, 64], counts = [];
      sizes.forEach(size => {
        let count = 0;
        for (let y = 0; y < imageData.height; y += size) for (let x = 0; x < imageData.width; x += size) {
          let found = false;
          for (let dy = 0; dy < size && y + dy < imageData.height; dy++) {
            for (let dx = 0; dx < size && x + dx < imageData.width; dx++) if (binaryMatrix[y + dy][x + dx] === 1) { count++; found = true; break; }
            if (found) break;
          }
        }
        counts.push(count);
      });
      let sum_x = 0, sum_y = 0, sum_xy = 0, sum_x2 = 0, n = 0;
      for (let i = 0; i < sizes.length; i++) {
        if (counts[i] === 0) continue; n++;
        const x = Math.log(1 / sizes[i]), y = Math.log(counts[i]);
        sum_x += x; sum_y += y; sum_xy += x * y; sum_x2 += x * x;
      }
      const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);
      document.getElementById('fd-result').textContent = Math.abs(slope).toFixed(4);
    };

    // ===================== The Brownian casebook =====================
    // Seeded random numbers, so a slider changes one thing at a time.
    function mulberry32(seed) {
      let a = seed >>> 0;
      return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function gaussFrom(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
    const gauss = () => gaussFrom(Math.random);
    function bindSlider(id, labelId, fmt, onInput) {
      const el = document.getElementById(id), lab = document.getElementById(labelId);
      const upd = () => { lab.textContent = fmt(parseFloat(el.value)); };
      upd();
      el.addEventListener('input', () => { upd(); onInput(parseFloat(el.value)); });
      return () => parseFloat(el.value);
    }
    const INK = '#212529', PAPER = '#ffffff';

    // --- 2.2 Fractional Brownian motion: a trace by midpoint displacement ---
    function fbmTrace(n, H, seed) {
      const r = mulberry32(seed), a = new Float32Array(n + 1);
      let step = n, scale = 1;
      while (step > 1) {
        const half = step / 2;
        for (let i = half; i < n; i += step) a[i] = (a[i - half] + a[i + half]) / 2 + gaussFrom(r) * scale;
        scale *= Math.pow(0.5, H);
        step = half;
      }
      return a;
    }
    function drawTrace(ctx, a, w, h, pad) {
      let lo = Infinity, hi = -Infinity;
      for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const span = (hi - lo) || 1;
      ctx.beginPath();
      for (let i = 0; i < a.length; i++) {
        const x = (i / (a.length - 1)) * w, y = pad + (1 - (a[i] - lo) / span) * (h - 2 * pad);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return { lo, hi };
    }
    const fbmCanvas = document.getElementById('fbm-trace-canvas');
    const fbmCtx = fbmCanvas.getContext('2d');
    let fbmSeed = 7;
    const fbmH = bindSlider('fbm-h', 'fbm-h-val', v => `${v.toFixed(2)}  (D = ${(2 - v).toFixed(2)})`, renderFbm);
    function renderFbm() {
      fbmCtx.fillStyle = PAPER; fbmCtx.fillRect(0, 0, fbmCanvas.width, fbmCanvas.height);
      fbmCtx.strokeStyle = INK; fbmCtx.lineWidth = 1;
      drawTrace(fbmCtx, fbmTrace(1024, fbmH(), fbmSeed), fbmCanvas.width, fbmCanvas.height, 20);
    }
    document.getElementById('fbm-reseed').onclick = () => { fbmSeed = (Math.random() * 1e9) | 0; renderFbm(); };
    renderFbm();

    // --- 2.3 Brownian landscapes: diamond-square relief with a coastline ---
    function diamondSquare(size, H, seed) {
      const r = mulberry32(seed), n = size + 1, z = new Float32Array(n * n);
      const at = (x, y) => z[((y + n) % n) * n + ((x + n) % n)];
      let step = size, scale = 1;
      while (step > 1) {
        const half = step / 2;
        for (let y = half; y < n; y += step) for (let x = half; x < n; x += step)
          z[y * n + x] = (at(x - half, y - half) + at(x + half, y - half) + at(x - half, y + half) + at(x + half, y + half)) / 4 + gaussFrom(r) * scale;
        for (let y = 0; y < n; y += half) for (let x = (y / half) % 2 === 0 ? half : 0; x < n; x += step)
          z[y * n + x] = (at(x - half, y) + at(x + half, y) + at(x, y - half) + at(x, y + half)) / 4 + gaussFrom(r) * scale * 0.7071;
        scale *= Math.pow(0.5, H);
        step = half;
      }
      return { z, n };
    }
    const landCanvas = document.getElementById('landscape-canvas');
    const landCtx = landCanvas.getContext('2d');
    const landOff = document.createElement('canvas'); landOff.width = landOff.height = 257;
    const landOffCtx = landOff.getContext('2d');
    let landSeed = 11, landField = null;
    const landH = bindSlider('land-h', 'land-h-val', v => `${v.toFixed(2)}  (relief D = ${(3 - v).toFixed(2)}, coast D = ${(2 - v).toFixed(2)})`, renderLandscape);
    function renderLandscape() {
      const { z, n } = diamondSquare(256, landH(), landSeed);
      landField = { z, n };
      let lo = Infinity, hi = -Infinity, sum = 0;
      for (const v of z) { if (v < lo) lo = v; if (v > hi) hi = v; sum += v; }
      const sea = sum / z.length, img = landOffCtx.createImageData(n, n), d = img.data;
      const lx = -0.6, ly = -0.6, lz = 0.53, gain = 8 / (hi - lo || 1);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = y * n + x, h = z[i];
        let v;
        if (h < sea) v = 236;
        else {
          const dx = (z[y * n + Math.min(x + 1, n - 1)] - z[y * n + Math.max(x - 1, 0)]) * gain;
          const dy = (z[Math.min(y + 1, n - 1) * n + x] - z[Math.max(y - 1, 0) * n + x]) * gain;
          const len = Math.hypot(dx, dy, 1), shade = Math.max(0, (-dx * lx - dy * ly + lz) / len);
          v = 90 + 150 * shade;
        }
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
      }
      // the coastline: a land cell with a sea neighbour
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (z[i] < sea) continue;
        if ((x > 0 && z[i - 1] < sea) || (x < n - 1 && z[i + 1] < sea) || (y > 0 && z[i - n] < sea) || (y < n - 1 && z[i + n] < sea)) {
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 20;
        }
      }
      landOffCtx.putImageData(img, 0, 0);
      landCtx.imageSmoothingEnabled = true;
      landCtx.drawImage(landOff, 0, 0, landCanvas.width, landCanvas.height);
    }
    document.getElementById('land-reseed').onclick = () => { landSeed = (Math.random() * 1e9) | 0; renderLandscape(); };
    renderLandscape();

    // --- 2.4 Lévy flights: a walk whose step lengths have no typical size ---
    const levyCanvas = document.getElementById('levy-canvas');
    const levyCtx = levyCanvas.getContext('2d');
    let levyX, levyY, levyTimer = null, levySteps = 0;
    const levyAlpha = bindSlider('levy-alpha', 'levy-alpha-val', v => `${v.toFixed(1)}  (dust D = ${Math.min(v, 2).toFixed(1)})`, resetLevy);
    function resetLevy() {
      levyCtx.fillStyle = PAPER; levyCtx.fillRect(0, 0, levyCanvas.width, levyCanvas.height);
      levyX = levyCanvas.width / 2; levyY = levyCanvas.height / 2; levySteps = 0;
      document.getElementById('levy-steps').textContent = '0';
    }
    function stepLevy() {
      const w = levyCanvas.width, h = levyCanvas.height, a = levyAlpha();
      for (let k = 0; k < 4; k++) {
        const len = 1.5 * Math.pow(1 - Math.random(), -1 / a), ang = Math.random() * 2 * Math.PI;
        const nx = levyX + Math.cos(ang) * len, ny = levyY + Math.sin(ang) * len;
        const wrapped = nx < 0 || nx >= w || ny < 0 || ny >= h;
        const tx = ((nx % w) + w) % w, ty = ((ny % h) + h) % h;
        if (!wrapped) {
          levyCtx.strokeStyle = 'rgba(33,37,41,0.25)'; levyCtx.lineWidth = 0.6;
          levyCtx.beginPath(); levyCtx.moveTo(levyX, levyY); levyCtx.lineTo(nx, ny); levyCtx.stroke();
        }
        levyCtx.fillStyle = INK; levyCtx.fillRect(tx - 0.75, ty - 0.75, 1.5, 1.5);
        levyX = tx; levyY = ty; levySteps++;
      }
      document.getElementById('levy-steps').textContent = levySteps;
    }
    document.getElementById('levy-reset').onclick = resetLevy;
    resetLevy();

    // --- 2.5 Diffusion-limited aggregation: Brownian walkers that stick ---
    const dlaCanvas = document.getElementById('dla-canvas');
    const dlaCtx = dlaCanvas.getContext('2d');
    const DLA_N = 250, dlaGrid = new Uint8Array(DLA_N * DLA_N);
    const dlaOff = document.createElement('canvas'); dlaOff.width = dlaOff.height = DLA_N;
    const dlaOffCtx = dlaOff.getContext('2d');
    const dlaImg = dlaOffCtx.createImageData(DLA_N, DLA_N);
    let dlaRadius, dlaCount, dlaRaf = null, dlaDone;
    function resetDla() {
      dlaGrid.fill(0); dlaImg.data.fill(255);
      const c = DLA_N >> 1; dlaGrid[c * DLA_N + c] = 1; dlaRadius = 2; dlaCount = 1; dlaDone = false;
      setDlaPixel(c, c); drawDla(); dlaStatus();
    }
    function setDlaPixel(x, y) { const i = (y * DLA_N + x) * 4; dlaImg.data[i] = dlaImg.data[i + 1] = dlaImg.data[i + 2] = 33; }
    function drawDla() { dlaOffCtx.putImageData(dlaImg, 0, 0); dlaCtx.imageSmoothingEnabled = false; dlaCtx.drawImage(dlaOff, 0, 0, dlaCanvas.width, dlaCanvas.height); }
    function dlaStatus() { document.getElementById('dla-count').textContent = `${dlaCount} particles, radius ${dlaRadius}`; }
    function stepDla() {
      const c = DLA_N >> 1, maxR = (DLA_N >> 1) - 4;
      let budget = 60000;
      while (budget > 0 && !dlaDone) {
        const spawnR = Math.min(dlaRadius + 6, maxR), killR = Math.min(Math.max(2 * dlaRadius, dlaRadius + 40), maxR + 2);
        const ang = Math.random() * 2 * Math.PI;
        let x = Math.round(c + Math.cos(ang) * spawnR), y = Math.round(c + Math.sin(ang) * spawnR);
        for (;;) {
          const d = Math.random() * 4 | 0;
          x += d === 0 ? 1 : d === 1 ? -1 : 0; y += d === 2 ? 1 : d === 3 ? -1 : 0;
          budget--;
          const rr = Math.hypot(x - c, y - c);
          if (rr > killR || budget <= 0) break;
          if (dlaGrid[(y - 1) * DLA_N + x] || dlaGrid[(y + 1) * DLA_N + x] || dlaGrid[y * DLA_N + x - 1] || dlaGrid[y * DLA_N + x + 1]) {
            dlaGrid[y * DLA_N + x] = 1; dlaCount++; setDlaPixel(x, y);
            if (rr > dlaRadius) dlaRadius = Math.ceil(rr);
            if (dlaRadius >= maxR) dlaDone = true;
            break;
          }
        }
      }
      drawDla(); dlaStatus();
    }
    function animateDla() { dlaRaf = requestAnimationFrame(animateDla); if (!dlaDone) stepDla(); }
    document.getElementById('dla-reset').onclick = resetDla;
    resetDla();

    // --- Box counting on any binary matrix (shared by 3.2, the trail and the aggregate) ---
    function boxDimension(bin, w, h, maxBox) {
      const sizes = [2, 4, 8, 16, 32, 64, 128].filter(s => s <= maxBox), pts = [];
      for (const size of sizes) {
        let count = 0;
        for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
          let found = false;
          for (let dy = 0; dy < size && y + dy < h && !found; dy++)
            for (let dx = 0; dx < size && x + dx < w; dx++) if (bin[(y + dy) * w + x + dx]) { found = true; break; }
          if (found) count++;
        }
        if (count > 0) pts.push([Math.log(1 / size), Math.log(count)]);
      }
      let sx = 0, sy = 0, sxy = 0, sx2 = 0; const n = pts.length;
      for (const [x, y] of pts) { sx += x; sy += y; sxy += x * y; sx2 += x * x; }
      return Math.abs((n * sxy - sx * sy) / (n * sx2 - sx * sx));
    }
    function binaryFromCanvas(canvas, threshold, dark) {
      const ctx = canvas.getContext('2d'), { width: w, height: h } = canvas, img = ctx.getImageData(0, 0, w, h).data, bin = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) bin[i] = dark ? (img[i * 4] < threshold ? 1 : 0) : (img[i * 4] > threshold ? 1 : 0);
      return { bin, w, h };
    }
    function massRadiusDimension() {
      // N(r) ∝ r^D: particles within radius r of the seed, fitted from 6 cells to the cluster radius
      const c = DLA_N >> 1, rs = [], ns = [];
      for (let r = 6; r <= dlaRadius * 0.7; r = Math.round(r * 1.25)) {
        let n = 0;
        for (let y = c - r; y <= c + r; y++) for (let x = c - r; x <= c + r; x++) if (dlaGrid[y * DLA_N + x] && Math.hypot(x - c, y - c) <= r) n++;
        rs.push(Math.log(r)); ns.push(Math.log(n));
      }
      let sx = 0, sy = 0, sxy = 0, sx2 = 0; const k = rs.length;
      for (let i = 0; i < k; i++) { sx += rs[i]; sy += ns[i]; sxy += rs[i] * ns[i]; sx2 += rs[i] * rs[i]; }
      return (k * sxy - sx * sy) / (k * sx2 - sx * sx);
    }
    document.getElementById('dla-measure').onclick = () => {
      const quarter = Math.max(4, dlaRadius / 4);
      const full = boxDimension(dlaGrid, DLA_N, DLA_N, 128), capped = boxDimension(dlaGrid, DLA_N, DLA_N, quarter);
      document.getElementById('dla-fd').textContent = `mass–radius ${massRadiusDimension().toFixed(3)} · box, all sizes ${full.toFixed(3)} · box ≤ radius/4 ${capped.toFixed(3)} · published 1.71`;
    };
    document.getElementById('brownian-measure').onclick = () => {
      const { bin, w, h } = binaryFromCanvas(brownianCanvas, 128, true);
      document.getElementById('brownian-fd').textContent = `trail D = ${boxDimension(bin, w, h, 128).toFixed(3)} (tends to 2 as the walk runs)`;
    };

    // --- 2.6 The spectrum of a rough world: radially averaged power spectrum ---
    function fft1d(re, im) {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) {
            const a = i + k, b = a + len / 2;
            const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
            const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
          }
        }
      }
    }
    function radialSpectrum(gray, n) {
      // gray: n*n floats. Hann window, 2-D FFT, power averaged over rings of integer radius.
      const re = new Float32Array(n * n), im = new Float32Array(n * n);
      let mean = 0; for (const v of gray) mean += v; mean /= gray.length;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const wx = 0.5 - 0.5 * Math.cos(2 * Math.PI * x / n), wy = 0.5 - 0.5 * Math.cos(2 * Math.PI * y / n);
        re[y * n + x] = (gray[y * n + x] - mean) * wx * wy;
      }
      const rr = new Float32Array(n), ri = new Float32Array(n);
      for (let y = 0; y < n; y++) { rr.set(re.subarray(y * n, y * n + n)); ri.set(im.subarray(y * n, y * n + n)); fft1d(rr, ri); re.set(rr, y * n); im.set(ri, y * n); }
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) { rr[y] = re[y * n + x]; ri[y] = im[y * n + x]; }
        fft1d(rr, ri);
        for (let y = 0; y < n; y++) { re[y * n + x] = rr[y]; im[y * n + x] = ri[y]; }
      }
      const half = n >> 1, power = new Float64Array(half), count = new Uint32Array(half);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const fx = x < half ? x : x - n, fy = y < half ? y : y - n, f = Math.round(Math.hypot(fx, fy));
        if (f < 1 || f >= half) continue;
        const i = y * n + x; power[f] += re[i] * re[i] + im[i] * im[i]; count[f]++;
      }
      for (let f = 1; f < half; f++) if (count[f]) power[f] /= count[f];
      return power;
    }
    const SPEC_N = 256;
    const specCanvas = document.getElementById('spectrum-canvas');
    const specCtx = specCanvas.getContext('2d');
    const specSrc = document.createElement('canvas'); specSrc.width = specSrc.height = SPEC_N;
    const specSrcCtx = specSrc.getContext('2d', { willReadFrequently: true });
    const specPreview = document.getElementById('spectrum-preview');
    const specPreviewCtx = specPreview.getContext('2d');
    const irisPhoto = new Image(); irisPhoto.src = 'assets/fractals/iris-26.jpg';
    const irisTexture = new Image(); irisTexture.src = 'assets/fractals/iris-26-texture.jpg';
    let specUpload = null;
    const specNoise = bindSlider('spec-noise', 'spec-noise-val', v => v.toFixed(2), renderSpectrum);
    function graySource(kind) {
      const g = specSrcCtx; g.fillStyle = PAPER; g.fillRect(0, 0, SPEC_N, SPEC_N);
      if (kind === 'photo' && irisTexture.complete && irisTexture.naturalWidth) {
        // a patch of iris texture between the pupil and the limbus, cropped from the original at full resolution
        g.drawImage(irisTexture, 0, 0, SPEC_N, SPEC_N);
      } else if (kind === 'iris-whole' && irisPhoto.complete && irisPhoto.naturalWidth) {
        // the whole isolated iris with its pupil: one smooth object on black
        const W = irisPhoto.naturalWidth, Hh = irisPhoto.naturalHeight;
        g.drawImage(irisPhoto, (W - Hh) / 2, 0, Hh, Hh, 0, 0, SPEC_N, SPEC_N);
      } else if (kind === 'upload' && specUpload) {
        const s = Math.min(specUpload.naturalWidth, specUpload.naturalHeight);
        g.drawImage(specUpload, (specUpload.naturalWidth - s) / 2, (specUpload.naturalHeight - s) / 2, s, s, 0, 0, SPEC_N, SPEC_N);
      } else if (kind === 'carpet') { g.fillStyle = INK; drawCarpet(g, 5, 0, 0, SPEC_N); }
      else if (kind === 'landscape' && landField) {
        // the height field itself, not the shaded picture: shading is a derivative and would steal 2 from the slope
        const { z, n } = landField, img = g.createImageData(SPEC_N, SPEC_N);
        let lo = Infinity, hi = -Infinity; for (const v of z) { if (v < lo) lo = v; if (v > hi) hi = v; }
        for (let y = 0; y < SPEC_N; y++) for (let x = 0; x < SPEC_N; x++) {
          const v = ((z[y * n + x] - lo) / (hi - lo || 1)) * 255, i = (y * SPEC_N + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }
      else if (kind === 'noise') {
        const img = g.createImageData(SPEC_N, SPEC_N);
        for (let i = 0; i < SPEC_N * SPEC_N; i++) { const v = Math.random() * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
        g.putImageData(img, 0, 0);
      }
      const d = g.getImageData(0, 0, SPEC_N, SPEC_N).data, gray = new Float32Array(SPEC_N * SPEC_N);
      for (let i = 0; i < gray.length; i++) gray[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
      return gray;
    }
    function renderSpectrum() {
      const kind = document.getElementById('spec-source').value;
      const gray = graySource(kind);
      specPreviewCtx.drawImage(specSrc, 0, 0, specPreview.width, specPreview.height);
      const power = radialSpectrum(gray, SPEC_N);
      // white noise of the chosen level, measured the same way, is the floor it would bury the image under
      const sigma = specNoise(); let noisePower = null;
      if (sigma > 0) { const nz = new Float32Array(SPEC_N * SPEC_N); for (let i = 0; i < nz.length; i++) nz[i] = gauss() * sigma; noisePower = radialSpectrum(nz, SPEC_N); }
      // fit log power against log f over the resolved band
      const fLo = 3, fHi = 100; let sx = 0, sy = 0, sxy = 0, sx2 = 0, n = 0;
      for (let f = fLo; f <= fHi; f++) { if (!(power[f] > 0)) continue; const x = Math.log10(f), y = Math.log10(power[f]); sx += x; sy += y; sxy += x * y; sx2 += x * x; n++; }
      const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx), icpt = (sy - slope * sx) / n;
      document.getElementById('spec-slope').textContent = `power ∝ 1 / f^${(-slope).toFixed(2)}`;
      let buried = null;
      if (noisePower) for (let f = 1; f < SPEC_N / 2; f++) if (noisePower[f] > power[f]) { buried = f; break; }
      document.getElementById('spec-buried').textContent = noisePower ? (buried ? `noise ${sigma.toFixed(2)} buries every frequency above ${buried} cycles per image` : `noise ${sigma.toFixed(2)} buries nothing yet`) : '';
      // plot
      const W = specCanvas.width, H = specCanvas.height, padL = 54, padB = 40, padT = 16, padR = 16;
      const c = specCtx; c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
      let pMin = Infinity, pMax = -Infinity;
      for (let f = 1; f < SPEC_N / 2; f++) { if (!(power[f] > 0)) continue; pMin = Math.min(pMin, Math.log10(power[f])); pMax = Math.max(pMax, Math.log10(power[f])); }
      if (noisePower) for (let f = 1; f < SPEC_N / 2; f++) if (noisePower[f] > 0) { pMin = Math.min(pMin, Math.log10(noisePower[f])); pMax = Math.max(pMax, Math.log10(noisePower[f])); }
      pMin = Math.floor(pMin) - 0.5; pMax = Math.ceil(pMax) + 0.5;
      const xOf = f => padL + (Math.log10(f) / Math.log10(SPEC_N / 2)) * (W - padL - padR);
      const yOf = p => padT + (1 - (p - pMin) / (pMax - pMin)) * (H - padT - padB);
      c.strokeStyle = '#dee2e6'; c.lineWidth = 1; c.font = '12px Inter, sans-serif'; c.fillStyle = '#6c757d'; c.textAlign = 'center';
      for (const f of [1, 2, 4, 8, 16, 32, 64, 128]) { if (f >= SPEC_N / 2) continue; c.beginPath(); c.moveTo(xOf(f), padT); c.lineTo(xOf(f), H - padB); c.stroke(); c.fillText(f, xOf(f), H - padB + 16); }
      c.fillText('frequency, cycles per image', (padL + W - padR) / 2, H - 6);
      c.textAlign = 'right';
      for (let p = Math.ceil(pMin); p <= Math.floor(pMax); p++) { c.beginPath(); c.moveTo(padL, yOf(p)); c.lineTo(W - padR, yOf(p)); c.stroke(); c.fillText('1e' + p, padL - 6, yOf(p) + 4); }
      c.save(); c.translate(14, (padT + H - padB) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText('power', 0, 0); c.restore();
      // the fit
      c.strokeStyle = '#ff7e5f'; c.lineWidth = 1.5; c.setLineDash([6, 4]); c.beginPath();
      c.moveTo(xOf(fLo), yOf(icpt + slope * Math.log10(fLo))); c.lineTo(xOf(fHi), yOf(icpt + slope * Math.log10(fHi))); c.stroke(); c.setLineDash([]);
      // the spectrum
      c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath();
      let first = true;
      for (let f = 1; f < SPEC_N / 2; f++) { if (!(power[f] > 0)) continue; const x = xOf(f), y = yOf(Math.log10(power[f])); if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y); }
      c.stroke();
      // the noise floor
      if (noisePower) {
        c.strokeStyle = '#0056b3'; c.lineWidth = 1.2; c.beginPath(); first = true;
        for (let f = 1; f < SPEC_N / 2; f++) { if (!(noisePower[f] > 0)) continue; const x = xOf(f), y = yOf(Math.log10(noisePower[f])); if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y); }
        c.stroke();
        if (buried) { c.fillStyle = 'rgba(0,86,179,0.08)'; c.fillRect(xOf(buried), padT, W - padR - xOf(buried), H - padT - padB); }
      }
    }
    document.getElementById('spec-source').addEventListener('change', renderSpectrum);
    document.getElementById('spec-upload').onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => { const im = new Image(); im.onload = () => { specUpload = im; document.getElementById('spec-source').value = 'upload'; renderSpectrum(); }; im.src = ev.target.result; };
      reader.readAsDataURL(file);
    };
    document.getElementById('land-h').addEventListener('input', () => { if (document.getElementById('spec-source').value === 'landscape') renderSpectrum(); });
    irisPhoto.onload = renderSpectrum; irisTexture.onload = renderSpectrum;
    if (irisPhoto.complete) renderSpectrum(); else renderSpectrum();

    // ===================== Walks that fit =====================
    // --- 4.2 A walker on a rough landscape: Metropolis on a fractional Brownian trace ---
    const walkerCanvas = document.getElementById('walker-canvas');
    const walkerCtx = walkerCanvas.getContext('2d');
    const WALK_N = 1024;
    let walkerSeed = 23, walkerField, walkerPos, walkerBest, walkerVisits, walkerRaf = null, walkerAnneal = false, walkerSteps = 0;
    const walkerH = bindSlider('walker-h', 'walker-h-val', v => v.toFixed(2), resetWalker);
    const walkerT = bindSlider('walker-t', 'walker-t-val', v => v.toFixed(3), () => { walkerAnneal = false; });
    function resetWalker() {
      const raw = fbmTrace(WALK_N, walkerH(), walkerSeed);
      let lo = Infinity, hi = -Infinity; for (const v of raw) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      walkerField = Float32Array.from(raw, v => (v - lo) / (hi - lo || 1)); // heights in [0, 1]
      walkerPos = (Math.random() * (WALK_N + 1)) | 0; walkerBest = walkerPos;
      walkerVisits = new Uint32Array(WALK_N + 1); walkerSteps = 0; walkerAnneal = false;
      drawWalker();
    }
    function stepWalker() {
      const T = walkerT();
      for (let k = 0; k < 20; k++) {
        const jump = (Math.random() < 0.5 ? -1 : 1) * (1 + (Math.random() * 8 | 0));
        const next = Math.max(0, Math.min(WALK_N, walkerPos + jump));
        const dE = walkerField[next] - walkerField[walkerPos];
        if (dE <= 0 || (T > 0 && Math.random() < Math.exp(-dE / T))) walkerPos = next;
        walkerVisits[walkerPos]++; walkerSteps++;
        if (walkerField[walkerPos] < walkerField[walkerBest]) walkerBest = walkerPos;
      }
      if (walkerAnneal) {
        const el = document.getElementById('walker-t');
        const nt = Math.max(0.001, parseFloat(el.value) * 0.985);
        el.value = nt.toFixed(3); el.dispatchEvent(new Event('input'));
        walkerAnneal = nt > 0.001;
      }
      drawWalker();
    }
    function drawWalker() {
      const W = walkerCanvas.width, H = walkerCanvas.height, pad = 20, c = walkerCtx;
      c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
      const xOf = i => (i / WALK_N) * W, yOf = h => pad + (1 - h) * (H - 2 * pad);
      // where it has been
      let vmax = 1; for (const v of walkerVisits) vmax = Math.max(vmax, v);
      c.fillStyle = 'rgba(0,86,179,0.18)';
      for (let i = 0; i <= WALK_N; i++) if (walkerVisits[i]) { const hh = (Math.log1p(walkerVisits[i]) / Math.log1p(vmax)) * (H - 2 * pad) * 0.35; c.fillRect(xOf(i), H - pad - hh, Math.max(1, W / WALK_N), hh); }
      // the landscape
      c.strokeStyle = INK; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i <= WALK_N; i++) { const x = xOf(i), y = yOf(walkerField[i]); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
      // global minimum, best found, walker
      let gmin = 0; for (let i = 1; i <= WALK_N; i++) if (walkerField[i] < walkerField[gmin]) gmin = i;
      c.strokeStyle = '#11998e'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(xOf(gmin), pad); c.lineTo(xOf(gmin), H - pad); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#11998e'; c.beginPath(); c.arc(xOf(walkerBest), yOf(walkerField[walkerBest]), 4, 0, 2 * Math.PI); c.fill();
      c.fillStyle = '#ff7e5f'; c.beginPath(); c.arc(xOf(walkerPos), yOf(walkerField[walkerPos]), 5, 0, 2 * Math.PI); c.fill();
      document.getElementById('walker-status').textContent = `${walkerSteps} steps · best height ${walkerField[walkerBest].toFixed(3)} · global minimum ${walkerField[gmin].toFixed(3)}`;
    }
    function animateWalker() { walkerRaf = requestAnimationFrame(animateWalker); stepWalker(); }
    document.getElementById('walker-reset').onclick = resetWalker;
    document.getElementById('walker-reseed').onclick = () => { walkerSeed = (Math.random() * 1e9) | 0; resetWalker(); };
    document.getElementById('walker-anneal').onclick = () => { const el = document.getElementById('walker-t'); el.value = '1.000'; el.dispatchEvent(new Event('input')); walkerAnneal = true; };
    resetWalker();

    // ===================== Diffusion: the carpet from noise =====================
    // Data: points on the level-4 carpet in [-1, 1]². Forward: add Gaussian noise of width σ.
    // Reverse: Euler–Maruyama on the reverse-time SDE of the variance-exploding process,
    //   x ← x + (σ_k² − σ_{k+1}²) ∇log p_σk(x) + sqrt(σ_k² − σ_{k+1}²) z,
    // with the EXACT score of the noised data, ∇log p_σ(x) = Σ_i w_i (x_i − x) / σ²,
    // w = softmax(−|x − x_i|² / 2σ²). A network learns this function; here it is computed.
    function onCarpet(x, y, levels) {
      for (let l = 0; l < levels; l++) {
        x *= 3; y *= 3;
        const dx = Math.floor(x), dy = Math.floor(y);
        if (dx === 1 && dy === 1) return false;
        x -= dx; y -= dy;
      }
      return true;
    }
    const DIFF_M = 1200, DIFF_K = 1200, DIFF_LEVELS = 120, SIG_MAX = 1.2, SIG_MIN = 0.006;
    const diffData = new Float32Array(DIFF_M * 2);
    for (let i = 0; i < DIFF_M;) { const x = Math.random(), y = Math.random(); if (onCarpet(x, y, 4)) { diffData[i * 2] = x * 2 - 1; diffData[i * 2 + 1] = y * 2 - 1; i++; } }
    const diffSigmas = Array.from({ length: DIFF_LEVELS + 1 }, (_, k) => SIG_MAX * Math.pow(SIG_MIN / SIG_MAX, k / DIFF_LEVELS));
    const diffCanvas = document.getElementById('diffusion-canvas');
    const diffCtx = diffCanvas.getContext('2d');
    const diffX = new Float32Array(DIFF_K * 2);
    let diffLevel, diffRaf = null, diffWanted = true, diffStage;
    const diffBtn = document.getElementById('diff-play-pause');
    function resetDiffusion() {
      for (let i = 0; i < DIFF_K * 2; i++) diffX[i] = gauss() * SIG_MAX;
      diffLevel = 0; drawDiffusion();
    }
    function scoreStep() {
      if (diffLevel >= DIFF_LEVELS) return;
      const s = diffSigmas[diffLevel], s2 = s * s, sn = diffSigmas[diffLevel + 1], dv = s2 - sn * sn, inv2s2 = 1 / (2 * s2);
      for (let j = 0; j < DIFF_K; j++) {
        const x = diffX[j * 2], y = diffX[j * 2 + 1];
        let best = Infinity;
        for (let i = 0; i < DIFF_M; i++) { const dx = diffData[i * 2] - x, dy = diffData[i * 2 + 1] - y; const d2 = dx * dx + dy * dy; if (d2 < best) best = d2; }
        let wsum = 0, mx = 0, my = 0;
        for (let i = 0; i < DIFF_M; i++) {
          const dx = diffData[i * 2] - x, dy = diffData[i * 2 + 1] - y; const d2 = dx * dx + dy * dy;
          const w = Math.exp(-(d2 - best) * inv2s2); if (w < 1e-12) continue;
          wsum += w; mx += w * dx; my += w * dy;
        }
        const gx = mx / wsum / s2, gy = my / wsum / s2; // ∇ log p_σ
        diffX[j * 2] = x + dv * gx + Math.sqrt(dv) * gauss();
        diffX[j * 2 + 1] = y + dv * gy + Math.sqrt(dv) * gauss();
      }
      diffLevel++;
    }
    function drawDiffusion() {
      const W = diffCanvas.width, H = diffCanvas.height, c = diffCtx;
      c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
      // the data, faint: what the walk is trying to find
      c.fillStyle = 'rgba(33,37,41,0.10)'; c.fillRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8);
      c.fillStyle = PAPER;
      (function holes(level, x, y, size) { if (level === 0) return; const s = size / 3; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { if (i === 1 && j === 1) c.fillRect(x + s, y + s, s, s); else holes(level - 1, x + i * s, y + j * s, s); } })(4, W * 0.1, H * 0.1, W * 0.8);
      c.fillStyle = INK;
      for (let j = 0; j < DIFF_K; j++) {
        const px = W * 0.5 + diffX[j * 2] * W * 0.4, py = H * 0.5 + diffX[j * 2 + 1] * H * 0.4;
        if (px < -2 || px > W + 2 || py < -2 || py > H + 2) continue;
        c.fillRect(px - 1, py - 1, 2, 2);
      }
      const s = diffSigmas[Math.min(diffLevel, DIFF_LEVELS)];
      document.getElementById('diff-status').textContent = diffLevel >= DIFF_LEVELS ? `done · σ ${s.toFixed(3)} · ${DIFF_LEVELS} reverse steps` : `step ${diffLevel} of ${DIFF_LEVELS} · σ = ${s.toFixed(3)}`;
      const bar = document.getElementById('diff-bar'); bar.style.width = `${(diffLevel / DIFF_LEVELS) * 100}%`;
    }
    function animateDiffusion() { diffRaf = requestAnimationFrame(animateDiffusion); if (diffLevel < DIFF_LEVELS) { scoreStep(); drawDiffusion(); } }
    function startDiffusion() { animateDiffusion(); diffBtn.textContent = 'Pause'; }
    function stopDiffusion() { cancelAnimationFrame(diffRaf); diffBtn.textContent = 'Play'; }
    diffBtn.onclick = () => { diffWanted = !diffWanted; if (diffWanted) sceneStart('diffusion-canvas'); else sceneStop('diffusion-canvas'); };
    document.getElementById('diff-reset').onclick = resetDiffusion;
    resetDiffusion();
    window.__fractals = { scoreStep, drawDiffusion, level: () => diffLevel, stepDla, dlaCount: () => dlaCount, renderSpectrum };

    // ===================== 1.1 The Koch curve, measured with a ruler =====================
    function kochPoints(level) {
      // math coordinates: base from (0,0) to (1,0), bumps upward
      let pts = [0, 0, 1, 0];
      for (let l = 0; l < level; l++) {
        const out = [pts[0], pts[1]];
        for (let i = 0; i + 3 < pts.length; i += 2) {
          const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
          const dx = (bx - ax) / 3, dy = (by - ay) / 3;
          const p1x = ax + dx, p1y = ay + dy, p2x = ax + 2 * dx, p2y = ay + 2 * dy;
          // peak: rotate (dx, dy) by +60°
          const c = 0.5, s = Math.sqrt(3) / 2;
          const px = p1x + dx * c - dy * s, py = p1y + dx * s + dy * c;
          out.push(p1x, p1y, px, py, p2x, p2y, bx, by);
        }
        pts = out;
      }
      return Float64Array.from(pts);
    }
    function dividerWalk(pts, eps) {
      // Richardson's dividers: from the current point, the next point is where a circle of radius eps
      // first meets the curve further along. Returns the step points and the measured length.
      let px = pts[0], py = pts[1], seg = 0, t0 = 0;
      const steps = [px, py], nSeg = pts.length / 2 - 1;
      let count = 0;
      outer: for (;;) {
        for (let k = seg; k < nSeg; k++) {
          const ax = pts[2 * k], ay = pts[2 * k + 1], bx = pts[2 * k + 2], by = pts[2 * k + 3];
          if (Math.hypot(bx - px, by - py) < eps * (1 - 1e-9)) { if (k === nSeg - 1) break outer; continue; }
          // solve |A + t(B−A) − P| = eps for the smallest t ≥ (k === seg ? t0 : 0)
          const dx = bx - ax, dy = by - ay, fx = ax - px, fy = ay - py;
          const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - eps * eps;
          const disc = b * b - 4 * a * c;
          if (disc < 0 || a === 0) continue;
          const sq = Math.sqrt(disc), lo = k === seg ? t0 : 0;
          let t = (-b - sq) / (2 * a);
          if (t < lo - 1e-12) t = (-b + sq) / (2 * a);
          if (t < lo - 1e-12 || t > 1 + 1e-12) continue;
          px = ax + t * dx; py = ay + t * dy; seg = k; t0 = t + 1e-12; count++;
          steps.push(px, py);
          continue outer;
        }
        break;
      }
      const ex = pts[pts.length - 2], ey = pts[pts.length - 1];
      const rest = Math.hypot(ex - px, ey - py);
      steps.push(ex, ey);
      return { steps, count, length: count * eps + rest };
    }
    const kochCanvas = document.getElementById('koch-canvas'), kochCtx = kochCanvas.getContext('2d');
    const kochChart = document.getElementById('koch-chart'), kochChartCtx = kochChart.getContext('2d');
    let kochPts = null, kochSeries = [];
    const kochLevel = bindSlider('koch-level', 'koch-level-val', v => `${v} rounds`, () => { kochPts = null; renderKoch(); });
    const kochRuler = bindSlider('koch-ruler', 'koch-ruler-val', v => `1/${Math.round(Math.pow(3, v))}`, renderKoch);
    function renderKoch() {
      const level = kochLevel(), r = kochRuler(), eps = Math.pow(3, -r);
      if (!kochPts) {
        kochPts = kochPoints(level);
        kochSeries = [];
        for (let rr = 0; rr <= 7.001; rr += 0.25) kochSeries.push([rr, dividerWalk(kochPts, Math.pow(3, -rr)).length]);
      }
      const W = kochCanvas.width, H = kochCanvas.height, padX = 40, base = H - 70, scale = W - 2 * padX;
      const X = x => padX + x * scale, Y = y => base - y * scale;
      const c = kochCtx;
      c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
      c.strokeStyle = INK; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < kochPts.length; i += 2) { const x = X(kochPts[i]), y = Y(kochPts[i + 1]); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
      const walk = dividerWalk(kochPts, eps);
      c.strokeStyle = '#e0703a'; c.lineWidth = 1.6; c.beginPath();
      for (let i = 0; i < walk.steps.length; i += 2) { const x = X(walk.steps[i]), y = Y(walk.steps[i + 1]); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
      if (walk.count < 700) { c.fillStyle = '#e0703a'; for (let i = 0; i < walk.steps.length; i += 2) { c.beginPath(); c.arc(X(walk.steps[i]), Y(walk.steps[i + 1]), 2.2, 0, 2 * Math.PI); c.fill(); } }
      // the ruler itself, drawn to scale under the curve
      c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(padX, H - 26); c.lineTo(padX + eps * scale, H - 26); c.stroke();
      c.fillStyle = '#74797f'; c.font = '13px Inter, sans-serif'; c.textAlign = 'left';
      c.fillText(`ruler ${'1/' + Math.round(Math.pow(3, r))} of the base`, padX + Math.max(eps * scale, 2) + 10, H - 22);
      // fit over the rulers the drawing resolves (a ruler coarser than one drawn segment)
      // fit on rulers that are exact powers of 1/3 inside the drawn detail; between them the measure oscillates
      const resolved = kochSeries.filter(([rr]) => rr <= level && rr >= 1 && Math.abs(rr - Math.round(rr)) < 1e-9);
      let slope = NaN;
      if (resolved.length >= 2) {
        let sx = 0, sy = 0, sxy = 0, sx2 = 0; const n = resolved.length;
        for (const [rr, L] of resolved) { const x = rr * Math.log10(3), y = Math.log10(L); sx += x; sy += y; sxy += x * y; sx2 += x * x; }
        slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
      }
      const D = 1 + slope;
      const note = r > level + 0.01 ? ' · the ruler is finer than the drawn detail, so the length stops growing: a real coastline never stops' : '';
      document.getElementById('koch-status').textContent =
        `${walk.count} steps · length ${walk.length.toFixed(3)} × the base` + (isFinite(D) ? ` · fitted D = ${D.toFixed(3)}` : ' · add detail to fit D') + note;
      // the chart: log length against log 1/ruler
      const cw = kochChart.width, ch = kochChart.height, pl = 60, pr = 20, pt = 16, pb = 40, g = kochChartCtx;
      g.fillStyle = PAPER; g.fillRect(0, 0, cw, ch);
      const xMax = 7 * Math.log10(3), yMin = 0, yMax = Math.log10(Math.pow(4 / 3, 7)) + 0.05;
      const gx = x => pl + (x / xMax) * (cw - pl - pr), gy = y => pt + (1 - (y - yMin) / (yMax - yMin)) * (ch - pt - pb);
      g.strokeStyle = '#e7e9eb'; g.lineWidth = 1; g.font = '12px Inter, sans-serif'; g.fillStyle = '#74797f'; g.textAlign = 'center';
      for (let k = 0; k <= 7; k++) { const x = gx(k * Math.log10(3)); g.beginPath(); g.moveTo(x, pt); g.lineTo(x, ch - pb); g.stroke(); g.fillText(`1/${Math.pow(3, k)}`, x, ch - pb + 16); }
      g.fillText('ruler, as a fraction of the base (log scale)', (pl + cw - pr) / 2, ch - 6);
      g.textAlign = 'right';
      for (const L of [1, 1.5, 2, 3, 4, 6, 7.5]) { const y = gy(Math.log10(L)); if (y < pt || y > ch - pb) continue; g.beginPath(); g.moveTo(pl, y); g.lineTo(cw - pr, y); g.stroke(); g.fillText(L, pl - 6, y + 4); }
      g.save(); g.translate(14, (pt + ch - pb) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('length', 0, 0); g.restore();
      if (isFinite(slope)) {
        g.strokeStyle = '#8a5cc4'; g.setLineDash([6, 4]); g.lineWidth = 1.4; g.beginPath();
        const x0 = 0, x1 = xMax, y0 = Math.log10(kochSeries[0][1]);
        g.moveTo(gx(x0), gy(y0)); g.lineTo(gx(x1), gy(y0 + slope * (x1 - x0))); g.stroke(); g.setLineDash([]);
      }
      for (const [rr, L] of kochSeries) {
        const whole = Math.abs(rr - Math.round(rr)) < 1e-9;
        g.fillStyle = rr <= level ? INK : '#c4c8cc';
        g.beginPath(); g.arc(gx(rr * Math.log10(3)), gy(Math.log10(L)), whole ? 3.2 : 1.8, 0, 2 * Math.PI); g.fill();
      }
      g.fillStyle = '#e0703a'; g.beginPath(); g.arc(gx(r * Math.log10(3)), gy(Math.log10(walk.length)), 5, 0, 2 * Math.PI); g.fill();
    }
    renderKoch();

    // ===================== 5.2 The four steps: a Gaussian world, noise, and the best guess =====================
    function fft2(re, im, n, inverse) {
      // 2-D FFT in place on n×n complex arrays; inverse via conjugation, scaled by 1/n²
      if (inverse) for (let i = 0; i < im.length; i++) im[i] = -im[i];
      const rr = new Float32Array(n), ri = new Float32Array(n);
      for (let y = 0; y < n; y++) { rr.set(re.subarray(y * n, y * n + n)); ri.set(im.subarray(y * n, y * n + n)); fft1d(rr, ri); re.set(rr, y * n); im.set(ri, y * n); }
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) { rr[y] = re[y * n + x]; ri[y] = im[y * n + x]; }
        fft1d(rr, ri);
        for (let y = 0; y < n; y++) { re[y * n + x] = rr[y]; im[y * n + x] = ri[y]; }
      }
      if (inverse) { const k = 1 / (n * n); for (let i = 0; i < re.length; i++) { re[i] *= k; im[i] = -im[i] * k; } }
    }
    const WN = 256;
    const wFreq = new Float32Array(WN * WN);
    for (let y = 0; y < WN; y++) for (let x = 0; x < WN; x++) {
      const fx = x < WN / 2 ? x : x - WN, fy = y < WN / 2 ? y : y - WN;
      wFreq[y * WN + x] = Math.hypot(fx, fy);
    }
    let wSeed = 5, wWhiteRe, wWhiteIm, wNoise, wP = new Float32Array(WN * WN), wC = 1, wX = new Float32Array(WN * WN), wXr, wXi, wSweepRaf = null;
    const wBeta = bindSlider('wiener-beta', 'wiener-beta-val', v => v.toFixed(1), () => { wStopSweep(); wBuildWorld(); wRender(); });
    const wLogSigma = bindSlider('wiener-sigma', 'wiener-sigma-val', v => Math.pow(10, v).toPrecision(2), () => { wStopSweep(); wRender(); });
    function wDraws() {
      const r = mulberry32(wSeed);
      wWhiteRe = new Float32Array(WN * WN); wWhiteIm = new Float32Array(WN * WN); wNoise = new Float32Array(WN * WN);
      for (let i = 0; i < WN * WN; i++) wWhiteRe[i] = gaussFrom(r);
      fft2(wWhiteRe, wWhiteIm, WN, false);
      for (let i = 0; i < WN * WN; i++) wNoise[i] = gaussFrom(r);
    }
    function wBuildWorld() {
      if (!wWhiteRe) wDraws();
      const beta = wBeta();
      // power per frequency P(f) = c f^−β, normalised so the world has unit variance per pixel: (1/N²) Σ P = 1
      let sum = 0;
      for (let i = 1; i < WN * WN; i++) { const p = Math.pow(wFreq[i], -beta); wP[i] = p; sum += p; }
      wP[0] = 0; wC = (WN * WN) / sum;
      for (let i = 1; i < WN * WN; i++) wP[i] *= wC;
      // E|W_f|² = N², so X_f = sqrt(P) W_f gives E|X_f|² = N² P(f)
      wXr = new Float32Array(WN * WN); wXi = new Float32Array(WN * WN);
      for (let i = 0; i < WN * WN; i++) { const a = Math.sqrt(wP[i]); wXr[i] = wWhiteRe[i] * a; wXi[i] = wWhiteIm[i] * a; }
      const re = wXr.slice(), im = wXi.slice();
      fft2(re, im, WN, true);
      wX.set(re);
      wPaint('wiener-clean', wX);
    }
    function wPaint(id, data) {
      const cv = document.getElementById(id), g = cv.getContext('2d'), img = g.createImageData(WN, WN), d = img.data;
      for (let i = 0; i < WN * WN; i++) { const v = Math.max(0, Math.min(255, 128 + 42 * data[i])); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
    }
    function wRender() {
      const beta = wBeta(), sigma = Math.pow(10, wLogSigma()), s2 = sigma * sigma;
      // what is seen: y = x + σ z
      const y = new Float32Array(WN * WN);
      for (let i = 0; i < WN * WN; i++) y[i] = wX[i] + sigma * wNoise[i];
      wPaint('wiener-noisy', y);
      // the best guess: per frequency, H = P / (P + σ²) times Y
      const re = y.slice(), im = new Float32Array(WN * WN);
      fft2(re, im, WN, false);
      for (let i = 0; i < WN * WN; i++) { const h = wP[i] / (wP[i] + s2); re[i] *= h; im[i] *= h; }
      fft2(re, im, WN, true);
      wPaint('wiener-guess', re);
      // the status line: the cutoff and the octaves settled
      const fMax = WN / 2;
      let txt;
      if (beta < 0.05) {
        txt = `σ = ${sigma.toPrecision(2)} · a flat world has no cutoff: every scale is kept by the same factor ${(1 / (1 + s2)).toFixed(2)}, so all scales arrive together`;
      } else {
        const fStar = Math.pow(wC / s2, 1 / beta);
        const oct = Math.log2(Math.max(1, Math.min(fMax, fStar)));
        const shown = fStar < 1 ? 'below the largest scale: nothing is settled yet' : fStar > fMax ? 'past the finest pixel: everything is settled' : `${fStar.toFixed(1)} cycles per image`;
        txt = `σ = ${sigma.toPrecision(2)} · cutoff ${shown} · ${oct.toFixed(1)} of ${Math.log2(fMax).toFixed(0)} octaves settled · each halving of σ settles ${(2 / beta).toFixed(2)} octaves`;
      }
      document.getElementById('wiener-status').textContent = txt;
      wChart(beta, s2);
    }
    function wChart(beta, s2) {
      const cv = document.getElementById('wiener-spec'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
      const pl = 60, pr = 20, pt = 14, pb = 40, fMax = WN / 2;
      g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
      const yLo = -4, yHi = 5;
      const X = f => pl + (Math.log10(f) / Math.log10(fMax)) * (W - pl - pr);
      const Y = p => pt + (1 - (Math.log10(p) - yLo) / (yHi - yLo)) * (H - pt - pb);
      g.strokeStyle = '#e7e9eb'; g.lineWidth = 1; g.font = '12px Inter, sans-serif'; g.fillStyle = '#74797f'; g.textAlign = 'center';
      for (const f of [1, 2, 4, 8, 16, 32, 64, 128]) { g.beginPath(); g.moveTo(X(f), pt); g.lineTo(X(f), H - pb); g.stroke(); g.fillText(f, X(f), H - pb + 16); }
      g.fillText('scale, cycles per image: continents on the left, grain on the right', (pl + W - pr) / 2, H - 6);
      g.textAlign = 'right';
      for (let p = yLo; p <= yHi; p += 2) { g.beginPath(); g.moveTo(pl, Y(Math.pow(10, p))); g.lineTo(W - pr, Y(Math.pow(10, p))); g.stroke(); g.fillText('1e' + p, pl - 6, Y(Math.pow(10, p)) + 4); }
      g.save(); g.translate(14, (pt + H - pb) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('loudness', 0, 0); g.restore();
      const P = f => wC * Math.pow(f, -beta);
      const clampY = v => Math.min(H - pb, Math.max(pt, v));
      // shaded: what the best guess keeps (the world louder than the noise)
      g.fillStyle = 'rgba(35,147,106,0.14)'; g.beginPath(); g.moveTo(X(1), clampY(Y(Math.max(s2, 1e-4))));
      for (let f = 1; f <= fMax; f *= 1.05) g.lineTo(X(f), clampY(Y(Math.max(P(f), s2))));
      g.lineTo(X(fMax), clampY(Y(s2))); g.closePath(); g.fill();
      // the world
      g.strokeStyle = '#23936a'; g.lineWidth = 2; g.beginPath();
      for (let f = 1; f <= fMax * 1.001; f *= 1.05) { const yy = clampY(Y(P(f))); if (f === 1) g.moveTo(X(f), yy); else g.lineTo(X(f), yy); }
      g.stroke();
      // the noise
      g.strokeStyle = '#2d6fd2'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(1), clampY(Y(s2))); g.lineTo(X(fMax), clampY(Y(s2))); g.stroke();
      // the cutoff
      if (beta >= 0.05) {
        const fStar = Math.pow(wC / s2, 1 / beta);
        if (fStar >= 1 && fStar <= fMax) {
          g.strokeStyle = INK; g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(X(fStar), pt); g.lineTo(X(fStar), H - pb); g.stroke(); g.setLineDash([]);
          g.fillStyle = INK; g.textAlign = 'left'; g.fillText('cutoff f*', X(fStar) + 5, pt + 12);
        }
      }
      g.textAlign = 'left'; g.fillStyle = '#23936a'; g.fillText('the world', pl + 8, Math.max(pt + 28, Math.min(H - pb - 8, Y(P(1.2)) - 6)));
      g.fillStyle = '#2d6fd2'; g.fillText('the noise', W - pr - 70, clampY(Y(s2)) - 6);
    }
    function wSweep() {
      wStopSweep();
      const el = document.getElementById('wiener-sigma'), from = parseFloat(el.max), to = parseFloat(el.min), dur = 6000;
      const t0 = performance.now();
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        el.value = (from + (to - from) * k).toFixed(2);
        document.getElementById('wiener-sigma-val').textContent = Math.pow(10, parseFloat(el.value)).toPrecision(2);
        wRender();
        if (k < 1) wSweepRaf = requestAnimationFrame(tick); else wSweepRaf = null;
      };
      wSweepRaf = requestAnimationFrame(tick);
    }
    function wStopSweep() { if (wSweepRaf) { cancelAnimationFrame(wSweepRaf); wSweepRaf = null; } }
    document.getElementById('wiener-sweep').onclick = wSweep;
    document.getElementById('wiener-reseed').onclick = () => { wStopSweep(); wSeed = (Math.random() * 1e9) | 0; wWhiteRe = null; wBuildWorld(); wRender(); };
    wBuildWorld(); wRender();

    // ===================== 6 Barnes–Hut on Lévy dust =====================
    const bhCanvas = document.getElementById('bh-canvas'), bhCtx = bhCanvas.getContext('2d');
    let bhSeed = 3, bhPts = null, bhN = 0;
    const bhLogN = bindSlider('bh-n', 'bh-n-val', v => Math.round(Math.pow(10, v)).toLocaleString('en'), () => { bhPts = null; renderBH(); });
    const bhTheta = bindSlider('bh-theta', 'bh-theta-val', v => v.toFixed(2), renderBH);
    function levyDust(n, seed) {
      const r = mulberry32(seed), pts = new Float64Array(n * 2);
      let x = 0.5, y = 0.5;
      for (let i = 0; i < n; i++) {
        const len = 0.0015 * Math.pow(1 - r(), -1 / 1.4), a = r() * 2 * Math.PI;
        x = ((x + Math.cos(a) * len) % 1 + 1) % 1; y = ((y + Math.sin(a) * len) % 1 + 1) % 1;
        pts[2 * i] = x; pts[2 * i + 1] = y;
      }
      return pts;
    }
    function buildQuadtree(pts, n) {
      const cap = 8 * n + 16;
      const nx = new Float64Array(cap), ny = new Float64Array(cap), ns = new Float64Array(cap);
      const mass = new Float64Array(cap), cx = new Float64Array(cap), cy = new Float64Array(cap);
      const child = new Int32Array(cap * 4).fill(-1), body = new Int32Array(cap).fill(-1);
      let count = 1; nx[0] = 0; ny[0] = 0; ns[0] = 1;
      function quad(node, x, y) { const h = ns[node] / 2; return (x >= nx[node] + h ? 1 : 0) + (y >= ny[node] + h ? 2 : 0); }
      function make(node, q) {
        const h = ns[node] / 2, c = count++;
        nx[c] = nx[node] + (q & 1 ? h : 0); ny[c] = ny[node] + (q & 2 ? h : 0); ns[c] = h;
        child[node * 4 + q] = c; return c;
      }
      for (let i = 0; i < n; i++) {
        const x = pts[2 * i], y = pts[2 * i + 1];
        let node = 0, depth = 0;
        for (;;) {
          mass[node] += 1; cx[node] += x; cy[node] += y;
          const isLeaf = child[node * 4] < 0 && child[node * 4 + 1] < 0 && child[node * 4 + 2] < 0 && child[node * 4 + 3] < 0;
          if (isLeaf && body[node] < 0 && mass[node] === 1) { body[node] = i; break; }
          if (isLeaf && body[node] >= 0) {
            if (depth > 40) break; // coincident points: keep them together
            const j = body[node]; body[node] = -1;
            const qj = quad(node, pts[2 * j], pts[2 * j + 1]);
            const cj = make(node, qj);
            mass[cj] = 1; cx[cj] = pts[2 * j]; cy[cj] = pts[2 * j + 1]; body[cj] = j;
          }
          const q = quad(node, x, y);
          node = child[node * 4 + q] >= 0 ? child[node * 4 + q] : make(node, q);
          depth++;
        }
      }
      for (let k = 0; k < count; k++) if (mass[k] > 0) { cx[k] /= mass[k]; cy[k] /= mass[k]; }
      return { nx, ny, ns, mass, cx, cy, child, body, count };
    }
    const BH_SOFT = 1e-4;
    function treeForce(T, pts, i, theta, record) {
      const px = pts[2 * i], py = pts[2 * i + 1];
      let fx = 0, fy = 0, inter = 0;
      const stack = [0];
      while (stack.length) {
        const k = stack.pop();
        if (T.mass[k] === 0) continue;
        const dx = T.cx[k] - px, dy = T.cy[k] - py, d2 = dx * dx + dy * dy;
        const leaf = T.child[k * 4] < 0 && T.child[k * 4 + 1] < 0 && T.child[k * 4 + 2] < 0 && T.child[k * 4 + 3] < 0;
        if (leaf || (theta > 0 && T.ns[k] * T.ns[k] < theta * theta * d2)) {
          if (leaf && T.body[k] === i && T.mass[k] === 1) continue;
          const inv = T.mass[k] / Math.pow(d2 + BH_SOFT, 1.5);
          fx += dx * inv; fy += dy * inv; inter++;
          if (record) record.push(k);
        } else {
          for (let q = 0; q < 4; q++) { const c = T.child[k * 4 + q]; if (c >= 0) stack.push(c); }
        }
      }
      return [fx, fy, inter];
    }
    function directForce(pts, n, i) {
      const px = pts[2 * i], py = pts[2 * i + 1]; let fx = 0, fy = 0;
      for (let j = 0; j < n; j++) { if (j === i) continue; const dx = pts[2 * j] - px, dy = pts[2 * j + 1] - py, inv = 1 / Math.pow(dx * dx + dy * dy + BH_SOFT, 1.5); fx += dx * inv; fy += dy * inv; }
      return [fx, fy];
    }
    function renderBH() {
      const n = Math.round(Math.pow(10, bhLogN())), theta = bhTheta();
      if (!bhPts || bhN !== n) { bhPts = levyDust(n, bhSeed); bhN = n; }
      const T = buildQuadtree(bhPts, n);
      // sample bodies: interactions and error against the exact sum
      const r = mulberry32(99), S = Math.min(n, 200);
      let interSum = 0, errSum = 0;
      for (let s = 0; s < S; s++) {
        const i = Math.floor(r() * n);
        const [tx, ty, inter] = treeForce(T, bhPts, i, theta, null);
        const [ex, ey] = directForce(bhPts, n, i);
        interSum += inter; errSum += Math.hypot(tx - ex, ty - ey) / (Math.hypot(ex, ey) || 1);
      }
      const perBody = interSum / S, tree = perBody * n, direct = n * (n - 1);
      // the highlighted body: the one nearest the middle of the densest box
      let focus = 0, best = Infinity;
      for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 4000))) { const d = Math.hypot(bhPts[2 * i] - T.cx[0], bhPts[2 * i + 1] - T.cy[0]); if (d < best) { best = d; focus = i; } }
      const rec = [];
      treeForce(T, bhPts, focus, theta, rec);
      // draw
      const W = bhCanvas.width, c = bhCtx, m = 10, sc = W - 2 * m;
      c.fillStyle = PAPER; c.fillRect(0, 0, W, W);
      c.strokeStyle = 'rgba(29,32,36,0.10)'; c.lineWidth = 0.6;
      let drawn = 0;
      for (let k = 1; k < T.count && drawn < 12000; k++) { if (T.mass[k] > 1) { c.strokeRect(m + T.nx[k] * sc, m + T.ny[k] * sc, T.ns[k] * sc, T.ns[k] * sc); drawn++; } }
      c.fillStyle = INK; const ds = n > 10000 ? 1 : 1.6;
      for (let i = 0; i < n; i++) c.fillRect(m + bhPts[2 * i] * sc - ds / 2, m + bhPts[2 * i + 1] * sc - ds / 2, ds, ds);
      c.strokeStyle = '#e0703a'; c.lineWidth = 1.2;
      for (const k of rec) { if (T.mass[k] > 1) c.strokeRect(m + T.nx[k] * sc, m + T.ny[k] * sc, T.ns[k] * sc, T.ns[k] * sc); }
      c.fillStyle = '#e0703a';
      for (const k of rec) { if (T.mass[k] === 1) c.fillRect(m + T.cx[k] * sc - 1.5, m + T.cy[k] * sc - 1.5, 3, 3); }
      c.strokeStyle = '#e0703a'; c.lineWidth = 2; c.beginPath(); c.arc(m + bhPts[2 * focus] * sc, m + bhPts[2 * focus + 1] * sc, 7, 0, 2 * Math.PI); c.stroke();
      const fmt = v => v >= 1e6 ? (v / 1e6).toFixed(1) + ' M' : v >= 1e3 ? (v / 1e3).toFixed(1) + ' k' : Math.round(v).toString();
      document.getElementById('bh-status').textContent =
        `${n.toLocaleString('en')} bodies · direct ${fmt(direct)} interactions · tree ${fmt(tree)} (${(direct / tree).toFixed(direct / tree < 10 ? 1 : 0)}× fewer) · force error ${(100 * errSum / S).toFixed(2)} % · the ringed body talks to ${rec.length} boxes and bodies instead of ${(n - 1).toLocaleString('en')}`;
    }
    document.getElementById('bh-reseed').onclick = () => { bhSeed = (Math.random() * 1e9) | 0; bhPts = null; renderBH(); };
    renderBH();

    // ===================== Reading layer: contents rail, progress, glossary =====================
    (function readingLayer() {
      const toc = document.querySelector('nav.toc'), main = document.querySelector('main');
      const items = [];
      if (toc) {
        const title = document.createElement('div'); title.className = 'toc-title'; title.textContent = 'Contents'; toc.appendChild(title);
        main.querySelectorAll('section[id] > h2, section[id] > h3[id]').forEach(h => {
          const id = h.tagName === 'H2' ? h.parentElement.id : h.id;
          const a = document.createElement('a'); a.href = '#' + id; a.textContent = h.textContent;
          if (h.tagName === 'H3') a.className = 'sub';
          toc.appendChild(a); items.push({ a, h });
        });
      }
      const bar = document.getElementById('progress');
      let ticking = false;
      function onScroll() {
        ticking = false;
        const max = document.documentElement.scrollHeight - innerHeight;
        if (bar) bar.style.width = `${Math.max(0, Math.min(1, scrollY / (max || 1))) * 100}%`;
        let cur = null;
        for (const it of items) { if (it.h.getBoundingClientRect().top < innerHeight * 0.3) cur = it; else break; }
        for (const it of items) it.a.classList.toggle('active', it === cur);
        if (cur && toc && cur.a.offsetTop) {
          const top = cur.a.offsetTop - toc.clientHeight / 2;
          if (Math.abs(toc.scrollTop - top) > toc.clientHeight / 3) toc.scrollTop = top;
        }
      }
      addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
      onScroll();
      const pop = document.getElementById('term-pop');
      document.querySelectorAll('a.term').forEach(a => {
        const dt = document.querySelector(a.getAttribute('href'));
        if (!dt || !pop) return;
        const dd = dt.nextElementSibling;
        const show = () => {
          pop.innerHTML = '';
          const b = document.createElement('b'); b.textContent = dt.textContent; pop.appendChild(b);
          pop.appendChild(document.createTextNode(dd ? dd.textContent : ''));
          const r = a.getBoundingClientRect();
          pop.style.left = `${Math.max(8, Math.min(scrollX + r.left, scrollX + innerWidth - 336))}px`;
          pop.style.top = `${scrollY + r.bottom + 8}px`;
          pop.classList.add('on');
        };
        const hide = () => pop.classList.remove('on');
        a.addEventListener('mouseenter', show); a.addEventListener('focus', show);
        a.addEventListener('mouseleave', hide); a.addEventListener('blur', hide);
      });
    })();

    // ===================== 2.6 Synthetic silviculture: loaded when it scrolls into view =====================
    let sv = null, svWanted = false, svLoading = null;
    function startSilviculture() {
      svWanted = true;
      if (sv) { sv.start(); return; }
      if (svLoading) return;
      svLoading = import('./silviculture.js?v=1').then(m => {
        sv = m.createSilviculture(document.getElementById('silviculture'));
        if (svWanted) sv.start();
      }).catch(err => {
        console.error(err);
        document.getElementById('silviculture').innerHTML = '<p class="status">The forest could not start in this browser.</p>';
      });
    }
    function stopSilviculture() { svWanted = false; if (sv) sv.stop(); }

    // --- Scenes on the viewport controller ---
    registerScene('menger-sponge-canvas-container', { init: initSponge, start: animateSponge, stop: () => cancelAnimationFrame(spongeRaf) });
    registerScene('brownian-motion-canvas', { start: () => { brownianTimer = setInterval(stepBrownian, 20); }, stop: () => clearInterval(brownianTimer) });
    registerScene('levy-canvas', { start: () => { levyTimer = setInterval(stepLevy, 20); }, stop: () => clearInterval(levyTimer) });
    registerScene('dla-canvas', { start: animateDla, stop: () => cancelAnimationFrame(dlaRaf) });
    registerScene('ising-model-canvas', { start: animateIsing, stop: () => cancelAnimationFrame(isingRaf) });
    registerScene('walker-canvas', { start: animateWalker, stop: () => cancelAnimationFrame(walkerRaf) });
    registerScene('diffusion-canvas', { wanted: () => diffWanted, start: startDiffusion, stop: stopDiffusion });
    registerScene('silviculture', { start: startSilviculture, stop: stopSilviculture });
    registerScene('game-of-life-canvas', { wanted: () => lifeWanted, start: startLife, stop: stopLife });
    registerScene('langtons-ant-canvas', { wanted: () => antWanted, start: startAnt, stop: stopAnt });
    // Live engines: an iframe exists only while its figure is in view, so three
    // GPU engines never run at once with the page's own canvases.
    document.querySelectorAll('figure.embed').forEach(fig => {
      const frame = fig.querySelector('.embed-frame');
      registerScene(fig.id, {
        start: () => {
          const f = document.createElement('iframe');
          f.src = fig.dataset.src; f.title = fig.querySelector('figcaption').textContent.trim();
          f.loading = 'eager'; f.allow = 'fullscreen';
          frame.appendChild(f);
        },
        stop: () => { frame.replaceChildren(); }
      });
    });
    Object.keys(scenes).forEach(id => observer.observe(document.getElementById(id)));
  
