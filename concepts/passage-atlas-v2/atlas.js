// Isolated visual study: real local artwork and film, with no live protocol data.
(() => {
  const params = new URLSearchParams(window.location.search);
  const capture = params.has('capture');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointerPreference = window.matchMedia('(pointer: fine)');
  const smallScreen = window.matchMedia('(max-width: 760px)');
  const body = document.body;
  const constellation = document.querySelector('.constellation');
  const figures = Array.from(document.querySelectorAll('.constellation-work'));
  const ids = figures.map(figure => figure.dataset.token);
  const motionButton = document.querySelector('#atlas-motion-toggle');
  const motionLabel = document.querySelector('#atlas-motion-label');
  const announcement = document.querySelector('#atlas-announcement');
  const firstFrames = { '23': 5, '31': 9, '35': 13 };
  let selectedId = ids.includes(params.get('id')) ? params.get('id') : '31';
  let mode = params.get('mode') === 'light' ? 'light' : 'ink';
  let savedPause = false;
  try { savedPause = window.sessionStorage.getItem('cs-art-motion-paused') === '1'; } catch { /* Storage can be unavailable in private/local contexts. */ }
  let motionEnabled = !motionPreference.matches && !capture && !savedPause;
  let explicitPlayback = false;
  let hang = false;
  let pointerFrame = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  const visible = new Set();
  const replayTimers = new Map();

  if (capture) document.documentElement.classList.add('capture');

  function announce(message) {
    announcement.textContent = message;
  }

  function storeView() {
    params.set('id', selectedId);
    params.set('mode', mode);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }

  function setMotionLabel() {
    body.classList.toggle('motion-paused', !motionEnabled);
    motionButton.setAttribute('aria-pressed', String(!motionEnabled));
    motionLabel.textContent = motionEnabled ? 'Pause motion' : 'Resume motion';
    motionButton.querySelector('.atlas-motion-symbol').textContent = motionEnabled ? 'Ⅱ' : '▷';
    if (capture) {
      motionLabel.textContent = 'Motion paused';
      motionButton.disabled = true;
    }
  }

  function updateMediaLabel(figure) {
    const video = figure.querySelector('video');
    const isFilm = mode === 'ink' && !capture && !video.dataset.failed && (motionEnabled || figure.classList.contains('has-frame'));
    figure.querySelector('.constellation-kind').textContent = mode === 'light' ? 'LIGHT / STILL' : isFilm ? 'INK / FILM' : 'INK / STILL';
  }

  function canPlay(figure) {
    return motionEnabled && mode === 'ink' && visible.has(figure) && !document.hidden && !capture && !figure.querySelector('video').dataset.failed;
  }

  function cancelReplay(figure) {
    const replay = replayTimers.get(figure);
    if (replay) window.clearTimeout(replay.timer);
    replayTimers.delete(figure);
    figure.classList.remove('is-replaying');
  }

  function replayPreview(figure) {
    if (!canPlay(figure) || replayTimers.has(figure)) return;
    const video = figure.querySelector('video');
    const replay = { timer: 0 };
    replayTimers.set(figure, replay);
    replay.timer = window.setTimeout(() => {
      if (!canPlay(figure) || replayTimers.get(figure) !== replay) { cancelReplay(figure); return; }
      figure.classList.add('is-replaying');
      replay.timer = window.setTimeout(() => {
        if (!canPlay(figure) || replayTimers.get(figure) !== replay) { cancelReplay(figure); return; }
        video.currentTime = Math.min(firstFrames[figure.dataset.token], Math.max(0, video.duration - 1));
        video.play().then(() => {
          if (replayTimers.get(figure) !== replay) return;
          if (!canPlay(figure)) video.pause();
          cancelReplay(figure);
        }).catch(() => {
          if (replayTimers.get(figure) !== replay) return;
          figure.classList.remove('has-frame');
          cancelReplay(figure);
          updateMediaLabel(figure);
        });
      }, 420);
    }, 1200);
  }

  function updatePlayback() {
    figures.forEach(figure => {
      const video = figure.querySelector('video');
      if (canPlay(figure)) {
        if (!video.getAttribute('src')) {
          video.src = video.dataset.film;
          video.load();
        }
        if (video.ended) {
          replayPreview(figure);
        } else if (!replayTimers.has(figure)) {
          video.play().catch(() => {
            // A denied autoplay keeps the actual poster visible. The motion control can retry.
            updateMediaLabel(figure);
          });
        }
      } else {
        video.pause();
        cancelReplay(figure);
      }
      updateMediaLabel(figure);
    });
  }

  function updateSelection(announceChange = false) {
    const others = ids.filter(id => id !== selectedId);
    figures.forEach(figure => {
      const id = figure.dataset.token;
      const selected = id === selectedId;
      figure.dataset.position = selected ? 'anchor' : id === others[0] ? 'before' : 'after';
      const button = figure.querySelector('.constellation-select');
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', selected ? `Signature ${id} is the central work` : `Bring Signature ${id} to the center`);
      figure.querySelector('figcaption a').href = `artwork.html?id=${id}&mode=${mode}`;
    });
    document.querySelectorAll('[data-select-token]').forEach(button => {
      const selected = button.dataset.selectToken === selectedId;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelector('#atlas-selected-title').textContent = `Signature ${selectedId}`;
    document.querySelector('#atlas-selected-meta').textContent = `${mode === 'ink' ? 'Ink in motion' : 'Light in stillness'} · an editorial selection`;
    const href = `artwork.html?id=${selectedId}&mode=${mode}`;
    document.querySelector('#atlas-enter').href = href;
    document.querySelector('#atlas-header-work').href = href;
    if (announceChange) announce(`Signature ${selectedId} is now the central work. This is an editorial arrangement.`);
    storeView();
  }

  function updateMode() {
    body.dataset.atlasMode = mode;
    document.querySelectorAll('button[data-atlas-mode]').forEach(button => {
      const selected = button.dataset.atlasMode === mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    figures.forEach(figure => {
      const id = figure.dataset.token;
      const image = figure.querySelector('img');
      image.src = `assets/${id}-${mode}.webp`;
      image.alt = `Signature ${id}, ${mode} interpretation`;
    });
    updateSelection();
    updatePlayback();
  }

  figures.forEach(figure => {
    const video = figure.querySelector('video');
    video.muted = true;
    video.loop = false;
    video.addEventListener('ended', () => replayPreview(figure));
    video.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(video.duration)) video.currentTime = Math.min(firstFrames[figure.dataset.token], Math.max(0, video.duration - 1));
    });
    video.addEventListener('playing', () => {
      if (!canPlay(figure)) { video.pause(); return; }
      figure.classList.add('has-frame');
      updateMediaLabel(figure);
    });
    video.addEventListener('error', () => {
      video.dataset.failed = 'true';
      cancelReplay(figure);
      figure.classList.remove('has-frame');
      updateMediaLabel(figure);
    });
    figure.querySelector('.constellation-select').addEventListener('click', () => {
      if (selectedId === figure.dataset.token) return;
      selectedId = figure.dataset.token;
      updateSelection(true);
      resetDrift();
    });
  });

  document.querySelectorAll('[data-select-token]').forEach(button => {
    button.addEventListener('click', () => {
      selectedId = button.dataset.selectToken;
      updateSelection(true);
      resetDrift();
      if (smallScreen.matches) constellation.scrollIntoView({ behavior: motionPreference.matches || !motionEnabled ? 'instant' : 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('button[data-atlas-mode]').forEach(button => {
    button.addEventListener('click', () => {
      mode = button.dataset.atlasMode;
      updateMode();
      announce(mode === 'ink' ? 'Showing the Ink interpretations.' : 'Showing the actual Light stills of the same three works.');
    });
  });

  document.querySelector('#atlas-rehang').addEventListener('click', event => {
    hang = !hang;
    constellation.dataset.hang = hang ? 'second' : 'first';
    event.currentTarget.setAttribute('aria-pressed', String(hang));
    announce(`Constellation rehung. Signature ${selectedId} remains the central work.`);
    resetDrift();
  });

  motionButton.addEventListener('click', () => {
    motionEnabled = !motionEnabled;
    explicitPlayback = true;
    savedPause = !motionEnabled;
    if (!capture) {
      try {
        if (savedPause) window.sessionStorage.setItem('cs-art-motion-paused', '1');
        else window.sessionStorage.removeItem('cs-art-motion-paused');
      } catch { /* Playback still works if session storage is unavailable. */ }
    }
    setMotionLabel();
    updatePlayback();
    resetDrift();
    announce(motionEnabled ? 'Motion resumed.' : 'Films and decorative movement paused.');
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      updatePlayback();
    }, { threshold: 0.04 });
    figures.forEach(figure => observer.observe(figure));
  } else {
    figures.forEach(figure => visible.add(figure));
  }

  function driftAllowed() {
    return motionEnabled && !capture && !motionPreference.matches && pointerPreference.matches && !smallScreen.matches && !document.hidden;
  }

  function applyDrift() {
    figures.forEach(figure => {
      const strength = figure.dataset.position === 'anchor' ? 3 : 7;
      figure.querySelector('.constellation-plate').style.setProperty('--drift-x', `${(currentX * strength).toFixed(2)}px`);
      figure.querySelector('.constellation-plate').style.setProperty('--drift-y', `${(currentY * strength * .7).toFixed(2)}px`);
    });
  }

  function tickDrift() {
    pointerFrame = 0;
    if (!driftAllowed()) return;
    currentX += (targetX - currentX) * .065;
    currentY += (targetY - currentY) * .065;
    applyDrift();
    if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .003) pointerFrame = window.requestAnimationFrame(tickDrift);
  }

  function resetDrift() {
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    targetX = 0; targetY = 0; currentX = 0; currentY = 0;
    applyDrift();
  }

  constellation.addEventListener('pointermove', event => {
    if (!driftAllowed()) return;
    const rect = constellation.getBoundingClientRect();
    targetX = (event.clientX - rect.left) / rect.width * 2 - 1;
    targetY = (event.clientY - rect.top) / rect.height * 2 - 1;
    if (!pointerFrame) pointerFrame = window.requestAnimationFrame(tickDrift);
  }, { passive: true });
  constellation.addEventListener('pointerleave', () => {
    targetX = 0; targetY = 0;
    if (driftAllowed() && !pointerFrame) pointerFrame = window.requestAnimationFrame(tickDrift);
  });
  document.addEventListener('visibilitychange', () => { updatePlayback(); if (document.hidden) resetDrift(); });
  motionPreference.addEventListener('change', () => {
    if (motionPreference.matches || !explicitPlayback) motionEnabled = !motionPreference.matches && !capture && !savedPause;
    setMotionLabel(); updatePlayback(); resetDrift();
  });
  smallScreen.addEventListener('change', resetDrift);
  window.addEventListener('pagehide', () => {
    figures.forEach(figure => { figure.querySelector('video').pause(); cancelReplay(figure); });
    resetDrift();
  });

  setMotionLabel();
  updateMode();
})();
