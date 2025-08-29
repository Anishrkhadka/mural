let state = {
  images: [],
  index: 0,
  timer: null,
  playing: true,
  settings: null,
  nextPreload: null,
  lastMouseMove: 0,
  slideStart: 0,
  slideDurMs: 0,
  raf: null
};

const els = {
  a: document.getElementById("imgA"),
  b: document.getElementById("imgB"),
  stage: document.getElementById("stage"),
  overlay: document.getElementById("overlay"),
  empty: document.getElementById("emptyState"),
  prev: document.getElementById("prevBtn"),
  next: document.getElementById("nextBtn"),
  playPause: document.getElementById("playPauseBtn"),
  fs: document.getElementById("fsBtn"),
  timer: document.getElementById("timer"),
  clockTime: document.getElementById("clockTime"),
  clockDate: document.getElementById("clockDate"),
};


async function refreshImagesOnce() {
  try {
    const imagesResp = await fetch("/api/images").then(r => r.json());
    const newList = imagesResp.images || [];
    if (!Array.isArray(newList) || newList.length === 0) return;

    // Keep the current image if it still exists in the new list
    const currentSrc = state.images[state.index] || null;
    state.images = newList.slice();

    // Re-shuffle if settings say so
    if (state.settings?.shuffle) shuffleInPlace(state.images);

    if (currentSrc) {
      const keepIdx = state.images.indexOf(currentSrc);
      if (keepIdx >= 0) state.index = keepIdx; // stay on current slide
      else state.index = state.index % state.images.length; // clamp
    }
  } catch (err) {
    console.warn("Could not refresh images:", err);
  }
}

function scheduleDailyRefreshEvery24h() {
  // do a refresh now, then every 24h
  refreshImagesOnce();
  setInterval(refreshImagesOnce, 24 * 60 * 60 * 1000);
}


function updateClock() {
  const now = new Date();
  // 24-hour time for UK
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  els.clockTime.textContent = `${hh}:${mm}`;

  // e.g. Fri, 29 Aug 2025
  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric"
  });
  els.clockDate.textContent = dateFmt.format(now);
}

function setProgress(p01) {
  // p01 is 0..1, clamp defensively
  const p = Math.max(0, Math.min(1, p01));
  if (els.timer) els.timer.style.setProperty("--p", (p * 100).toFixed(1));
}

function startProgressLoop() {
  stopProgressLoop();
  const loop = (t) => {
    // If paused or single-image, freeze progress but keep the clock ticking
    if (!state.playing || state.images.length <= 1) {
      // do not advance progress
    } else {
      const elapsed = performance.now() - state.slideStart;
      const p = state.slideDurMs > 0 ? (elapsed / state.slideDurMs) : 0;
      setProgress(p % 1); // wrap visually if needed
    }
    state.raf = requestAnimationFrame(loop);
  };
  state.raf = requestAnimationFrame(loop);
}

function stopProgressLoop() {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  // leave last visual state as-is
}


function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadSettingsAndImages() {
  const [settings, imagesResp] = await Promise.all([
    fetchJSON("/api/settings"),
    fetchJSON("/api/images")
  ]);
  state.settings = settings;
  const images = imagesResp.images || [];
  state.images = images.slice();
  if (settings.order_by === "name" && settings.shuffle) {
    shuffleInPlace(state.images);
  } else if (settings.order_by === "mtime" && settings.shuffle) {
    shuffleInPlace(state.images);
  }
  document.body.dataset.fit = settings.fit_mode || "cover";
  document.body.classList.add("show-cursor");
  setTimeout(() => document.body.classList.remove("show-cursor"), 1000);
  if (images.length === 0) {
    els.empty.classList.remove("hidden");
  } else {
    els.empty.classList.add("hidden");
  }
}

function setImage(el, src) {
  return new Promise((resolve, reject) => {
    el.onload = () => resolve();
    el.onerror = reject;
    el.src = src;
  });
}

function currentElPair() {
  return state.index % 2 === 0 ? [els.a, els.b] : [els.b, els.a];
}

async function showIndex(i) {
  if (state.images.length === 0) return;
  state.index = ((i % state.images.length) + state.images.length) % state.images.length;
  const src = state.images[state.index];
  const [showEl, hideEl] = currentElPair();
  try {
    await setImage(showEl, src);
  } catch (e) {
    console.warn("Failed image load:", src, e);
  }
  hideEl.classList.remove("visible");
  // force reflow before showing (ensures fade works)
  void showEl.offsetWidth;
  showEl.classList.add("visible");
    // Reset progress for this slide
  state.slideStart = performance.now();
  state.slideDurMs = (state.settings?.duration_seconds ?? 10) * 1000;
  setProgress(0);

  if (state.settings?.preload_next) {
    const nextIdx = (state.index + 1) % state.images.length;
    const nextSrc = state.images[nextIdx];
    state.nextPreload = new Image();
    state.nextPreload.src = nextSrc;
  }
}

function next() { showIndex(state.index + 1); }
function prev() { showIndex(state.index - 1); }

function startTimer() {
  stopTimer();
  if (!state.playing || state.images.length <= 1) return;
  const dur = (state.settings?.duration_seconds ?? 10) * 1000;
  state.slideDurMs = dur;
  state.slideStart = performance.now();
  state.timer = setInterval(next, dur);
  startProgressLoop();
}
function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  stopProgressLoop();
}


function togglePlay() {
  state.playing = !state.playing;
  els.playPause.textContent = state.playing ? "⏯" : "▶";
  if (state.playing) {
    // resume from current progress
    const elapsed = performance.now() - state.slideStart;
    const remaining = Math.max(0, (state.settings?.duration_seconds ?? 10) * 1000 - elapsed);
    stopTimer(); // ensure clean
    state.timer = setInterval(next, remaining);
    // after first tick, switch back to full-duration intervals
    setTimeout(() => { if (state.playing) startTimer(); }, remaining);
    startProgressLoop();
  } else {
    stopTimer();
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function showControlsTemporarily() {
  els.overlay.classList.remove("hidden");
  document.body.classList.add("show-cursor");
  const hideAfter = state.settings?.hide_cursor_after_ms ?? 3000;
  const stamp = Date.now();
  state.lastMouseMove = stamp;
  setTimeout(() => {
    // Only hide if no newer activity
    if (Date.now() - state.lastMouseMove >= hideAfter) {
      els.overlay.classList.add("hidden");
      document.body.classList.remove("show-cursor");
    }
  }, hideAfter + 10);
}

function wireEvents() {
  window.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowRight": next(); showControlsTemporarily(); break;
      case "ArrowLeft":  prev(); showControlsTemporarily(); break;
      case " ":          togglePlay(); showControlsTemporarily(); break;
      case "f": case "F": toggleFullscreen(); showControlsTemporarily(); break;
    }
  });
  ["mousemove","click","touchstart"].forEach(ev =>
    window.addEventListener(ev, () => showControlsTemporarily())
  );
  els.next.addEventListener("click", next);
  els.prev.addEventListener("click", prev);
  els.playPause.addEventListener("click", togglePlay);
  els.fs.addEventListener("click", toggleFullscreen);

  // Keep slideshow running even if tab loses visibility (TV browsers can be odd)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.playing) {
      startTimer();
    }
  });
}

(async function init() {
  try {
    await loadSettingsAndImages();
    updateClock();
    setInterval(updateClock, 1000);
    scheduleDailyRefreshEvery24h();
    
    wireEvents();
    if (state.images.length > 0) {
      await showIndex(0);
      startTimer();
      showControlsTemporarily();
    } else {
      stopTimer();
      els.overlay.classList.add("hidden");
    }
  } catch (err) {
    console.error(err);
    els.empty.classList.remove("hidden");
    els.empty.innerHTML = `<h1>Could not load</h1><p>${String(err)}</p>`;
  }
})();
