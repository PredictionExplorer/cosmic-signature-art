// Movement-first visual mockup only. No wallet or protocol integration.
const page = document.body.dataset.page;
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const capture = params.has('capture');
const hasInk = new Set([23, 31, 35]);
const allowed = new Set([2, 7, 13, 22, 23, 31, 35, 39, 40]);
const asset = (id, mode) => 'assets/' + id + '-' + mode + '.webp';
const filmAsset = id => 'assets/' + id + '-ink-preview.mp4';
let motionEnabled = !reduced.matches && !capture && sessionStorage.getItem('cs-art-motion-paused') !== '1';
let refreshMotion = () => {};
let finishCrossing = null;
if (capture) document.documentElement.classList.add('capture');

function updateMaster() {
  document.body.classList.toggle('motion-off', !motionEnabled);
  const button = document.querySelector('#motion-master');
  if (!button) return;
  button.setAttribute('aria-pressed', String(!motionEnabled));
  button.querySelector('.motion-label').textContent = motionEnabled ? 'Pause motion' : 'Resume motion';
  button.querySelector('.motion-symbol').textContent = motionEnabled ? 'Ⅱ' : '▷';
  if (capture) { button.querySelector('.motion-label').textContent = 'Motion paused'; button.disabled = true; }
}
document.querySelector('#motion-master')?.addEventListener('click', () => {
  motionEnabled = !motionEnabled;
  if (!capture) sessionStorage.setItem('cs-art-motion-paused', motionEnabled ? '0' : '1');
  if (!motionEnabled && finishCrossing) finishCrossing();
  updateMaster();
  refreshMotion();
});
reduced.addEventListener('change', () => {
  if (reduced.matches) motionEnabled = false;
  updateMaster(); refreshMotion();
});
document.addEventListener('visibilitychange', () => refreshMotion());
window.addEventListener('pagehide', () => document.querySelectorAll('video').forEach(video => video.pause()));
updateMaster();

function crossMaterial(mode, swap) {
  if (finishCrossing) return;
  const curtain = document.querySelector('#material-curtain');
  if (!curtain || reduced.matches || !motionEnabled || capture) { swap(); return; }
  let swapped = false;
  const apply = () => { if (!swapped) { swapped = true; swap(); } };
  curtain.classList.toggle('to-light', mode === 'light');
  curtain.classList.remove('crossing');
  void curtain.offsetWidth;
  curtain.classList.add('crossing');
  document.body.classList.add('is-crossing');
  const changeTimer = setTimeout(apply, 490);
  const finish = () => {
    clearTimeout(changeTimer); clearTimeout(endTimer);
    apply(); curtain.classList.remove('crossing');
    document.body.classList.remove('is-crossing'); finishCrossing = null;
  };
  const endTimer = setTimeout(finish, 1220);
  finishCrossing = finish;
}
function timeLabel(value) {
  if (!Number.isFinite(value)) return '00:00';
  const seconds = Math.max(0, Math.floor(value));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

if (page === 'home') {
  let mode = 'ink';
  let inView = true;
  let replayTimer;
  let revealTimer;
  let beginning = false;
  const video = document.querySelector('#hero-film');
  const sheet = document.querySelector('#hero-sheet');
  const status = document.querySelector('#hero-state');
  const setStatus = () => {
    status.textContent = mode === 'light' ? 'LIGHT / FINISHED TRACE' : capture || video.dataset.failed ? 'INK / STILL' : video.ended ? 'THE TRACE REMAINS' : motionEnabled ? (beginning ? 'INK / FILM' : 'INK / FILM EXCERPT') : 'INK / PAUSED';
  };
  const canPlay = () => motionEnabled && !capture && mode === 'ink' && inView && !document.hidden && !video.dataset.failed;
  function replay() {
    clearTimeout(replayTimer); clearTimeout(revealTimer);
    if (!canPlay()) return;
    video.classList.add('is-covered');
    replayTimer = setTimeout(() => {
      if (!canPlay()) return;
      beginning = false;
      video.currentTime = Math.min(9, video.duration || 9);
      video.play().catch(() => {});
      revealTimer = setTimeout(() => video.classList.remove('is-covered'), 150);
    }, 500);
  }
  refreshMotion = () => {
    if (canPlay()) {
      if (video.ended) replay();
      else video.play().catch(() => { status.textContent = 'INK / PRESS RESUME TO PLAY'; });
    } else {
      video.pause(); clearTimeout(replayTimer); clearTimeout(revealTimer);
      video.classList.remove('is-covered');
    }
    setStatus();
  };
  video.muted = true;
  video.addEventListener('loadedmetadata', () => {
    if (!capture && !reduced.matches && !beginning) video.currentTime = Math.min(9, video.duration - 1);
    refreshMotion();
  });
  video.addEventListener('playing', () => { video.classList.add('is-playing'); setStatus(); });
  video.addEventListener('timeupdate', () => {
    document.querySelector('#hero-time').textContent = timeLabel(video.currentTime);
    document.querySelector('#hero-progress').style.width = (video.duration ? 100 * video.currentTime / video.duration : 0) + '%';
  });
  video.addEventListener('ended', () => {
    video.classList.add('is-held'); setStatus();
    replayTimer = setTimeout(replay, 1800);
  });
  video.addEventListener('error', () => {
    video.dataset.failed = '1'; video.classList.remove('is-playing', 'is-held'); setStatus();
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting; refreshMotion();
  }, {threshold:.08}).observe(sheet);
  document.querySelector('#hero-restart').addEventListener('click', () => {
    if (mode !== 'ink') return;
    beginning = true; clearTimeout(replayTimer); clearTimeout(revealTimer);
    video.currentTime = 0; motionEnabled = true; sessionStorage.setItem('cs-art-motion-paused', '0');
    video.classList.remove('is-covered'); updateMaster(); refreshMotion();
  });
  document.querySelector('#passage-toggle').addEventListener('click', () => {
    const next = mode === 'ink' ? 'light' : 'ink';
    crossMaterial(next, () => {
      mode = next;
      document.body.classList.toggle('is-ink', mode === 'ink');
      document.querySelector('#hero-art').src = asset(23, mode);
      document.querySelector('#hero-art').alt = 'Signature 23, ' + mode + ' interpretation';
      video.hidden = mode !== 'ink';
      const other = mode === 'ink' ? 'light' : 'ink';
      document.querySelector('#portal-art').src = asset(23, other);
      document.querySelector('#portal-art').alt = 'Signature 23, ' + other + ' interpretation';
      document.querySelector('#portal-label').textContent = 'Cross into ' + (other === 'ink' ? 'Ink' : 'Light');
      document.querySelector('#passage-toggle').setAttribute('aria-label', 'Cross into ' + (other === 'ink' ? 'Ink' : 'Light'));
      document.querySelector('#material-name').textContent = mode === 'ink' ? '01 / INK' : '02 / LIGHT';
      document.querySelector('#hero-restart').hidden = mode !== 'ink';
      document.querySelector('#hero-time').hidden = mode !== 'ink';
      document.querySelector('.film-progress').hidden = mode !== 'ink';
      refreshMotion();
    });
  });
  if (!reduced.matches && !capture) sheet.addEventListener('pointermove', event => {
    if (!motionEnabled) return;
    const rect = sheet.getBoundingClientRect();
    sheet.style.setProperty('--pointer-x', ((event.clientX - rect.left) / rect.width - .5) * 10 + 'px');
    sheet.style.setProperty('--pointer-y', ((event.clientY - rect.top) / rect.height - .5) * 8 + 'px');
  }, {passive:true});
  sheet.addEventListener('pointerleave', () => {
    sheet.style.setProperty('--pointer-x', '0px'); sheet.style.setProperty('--pointer-y', '0px');
  });
  setStatus(); refreshMotion();
}

if (page === 'artwork') {
  const requested = Number(params.get('id') || 31);
  const id = allowed.has(requested) ? requested : 31;
  let mode = params.get('mode') === 'light' || !hasInk.has(id) ? 'light' : 'ink';
  let presentation = params.get('view') === 'still' || capture || reduced.matches ? 'still' : 'film';
  let pair = false;
  let inView = true;
  const image = document.querySelector('#work-image');
  const video = document.querySelector('#work-film');
  const pairImage = document.querySelector('#pair-image');
  const dialog = document.querySelector('#media-dialog');
  const dialogContent = document.querySelector('#dialog-content');
  document.title = 'Cosmic Signature — Signature ' + id;
  document.querySelector('#work-title').textContent = 'Signature ' + id;
  document.querySelector('#token-line').textContent = 'COSMIC SIGNATURE / № ' + String(id).padStart(3, '0');
  document.querySelector('#curtain-label').textContent = 'SIGNATURE ' + id;
  if (hasInk.has(id)) {
    video.src = filmAsset(id); video.poster = asset(id, 'ink');
    video.setAttribute('aria-label', 'Ink film of Signature ' + id);
  } else {
    video.removeAttribute('src');
    document.querySelector('[data-work-mode="ink"]').hidden = true;
    document.querySelector('#compare').hidden = true;
    document.querySelector('#watch-ink').hidden = true;
    document.querySelector('.work-continuation').hidden = true;
  }
  const isFilm = () => mode === 'ink' && presentation === 'film' && hasInk.has(id) && !capture;
  refreshMotion = () => {
    if (isFilm() && motionEnabled && inView && !document.hidden && !dialog.open) {
      if (video.ended) { presentation = 'still'; render(); return; }
      video.play().catch(() => { document.querySelector('#work-play').textContent = 'Play'; });
    } else video.pause();
    document.querySelector('#work-play').textContent = isFilm() && motionEnabled && !video.ended ? 'Pause' : 'Play';
  };
  function render() {
    document.body.classList.toggle('is-ink', mode === 'ink');
    image.src = asset(id, mode); image.alt = 'Signature ' + id + ', ' + mode + ' interpretation';
    if (hasInk.has(id)) {
      pairImage.src = asset(id, mode === 'ink' ? 'light' : 'ink');
      pairImage.alt = 'Signature ' + id + ', alternate interpretation';
    } else pairImage.removeAttribute('src');
    pairImage.hidden = !pair;
    video.hidden = !isFilm();
    document.querySelector('.work-view').classList.toggle('is-pair', pair);
    document.querySelector('.work-transport').hidden = mode !== 'ink' || !hasInk.has(id);
    document.querySelector('#caption-mode').textContent = pair ? 'INK + LIGHT' : mode.toUpperCase() + ' / ' + (isFilm() ? 'FILM' : 'STILL');
    document.querySelector('#interpretation-note').innerHTML = mode === 'ink' ? 'A choreography of currents.<br>The orbit carries ink across the paper.' : 'The orbit, held in light.<br>Every line remembers a movement.';
    document.querySelectorAll('[data-work-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.workMode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.workMode === mode));
    });
    if (hasInk.has(id)) {
      const other = mode === 'ink' ? 'light' : 'ink';
      document.querySelector('#continuation-image').src = asset(id, other);
      document.querySelector('#continuation-image').alt = 'Signature ' + id + ', ' + other + ' interpretation';
      document.querySelector('#continuation-link').href = 'artwork.html?id=' + id + '&mode=' + other;
      document.querySelector('.work-continuation>.eyebrow').textContent = other === 'light' ? 'THE SAME CHOREOGRAPHY, HELD IN LIGHT' : 'THE SAME CHOREOGRAPHY, CARRIED THROUGH INK';
    }
    params.set('id', String(id)); params.set('mode', mode);
    if (presentation === 'still') params.set('view','still'); else params.delete('view');
    history.replaceState(null, '', 'artwork.html?' + params);
    refreshMotion();
  }
  video.muted = true;
  video.addEventListener('playing', () => video.classList.add('is-playing'));
  video.addEventListener('timeupdate', () => {
    document.querySelector('#work-time').textContent = timeLabel(video.currentTime) + ' / ' + timeLabel(video.duration);
    document.querySelector('#work-progress').style.width = (video.duration ? video.currentTime / video.duration * 100 : 0) + '%';
  });
  video.addEventListener('ended', () => {
    presentation = 'still';
    render();
  });
  video.addEventListener('error', () => { presentation = 'still'; render(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting; refreshMotion();
  }, {threshold:.08}).observe(document.querySelector('.work-view'));
  document.querySelectorAll('[data-work-mode]').forEach(button => button.addEventListener('click', () => {
    const nextMode = button.dataset.workMode;
    if (nextMode === mode) return;
    crossMaterial(nextMode, () => { mode = nextMode; render(); });
  }));
  document.querySelector('#work-play').addEventListener('click', () => {
    if (isFilm() && !video.paused) { motionEnabled = false; }
    else {
      presentation = 'film'; motionEnabled = true;
      if (video.ended || video.currentTime >= video.duration - .1) video.currentTime = 0;
    }
    sessionStorage.setItem('cs-art-motion-paused', motionEnabled ? '0' : '1');
    updateMaster(); render();
  });
  document.querySelector('#work-restart').addEventListener('click', () => {
    video.currentTime = 0; presentation = 'film'; motionEnabled = true;
    sessionStorage.setItem('cs-art-motion-paused','0'); updateMaster(); render();
  });
  document.querySelector('#work-still').addEventListener('click', () => { presentation = 'still'; render(); });
  document.querySelector('#compare').addEventListener('click', event => {
    pair = !pair; event.currentTarget.setAttribute('aria-pressed', String(pair));
    event.currentTarget.innerHTML = (pair ? 'Return to one view' : 'See both expressions') + ' <span>↗</span>'; render();
  });
  document.querySelector('#enlarge').addEventListener('click', () => {
    video.pause();
    dialogContent.innerHTML = isFilm() ? '<video src="' + filmAsset(id) + '" controls autoplay muted playsinline poster="' + asset(id,'ink') + '"></video>' : '<img src="' + asset(id,mode) + '" alt="Signature ' + id + '">';
    dialog.showModal();
  });
  document.querySelector('#watch-ink').addEventListener('click', () => {
    video.pause();
    dialogContent.innerHTML = '<video src="' + filmAsset(id) + '" controls autoplay muted playsinline poster="' + asset(id,'ink') + '"></video>';
    dialog.showModal();
  });
  document.querySelector('#record').addEventListener('click', () => {
    video.pause();
    dialogContent.innerHTML = '<div class="record-content"><p class="eyebrow">THE WORK’S RECORD</p><h2>Signature ' + id + '</h2><p>Cosmic Signature · Arbitrum One</p><p>Ink and Light are interpretations of the same token. These are authentic local images and forward-playing ink films. The moving interface does not change their pixels or run a new physics simulation.</p><p>This is a visual mockup. No wallet, ownership feed or auction is connected.</p><p><a href="assets/media-previews.json" target="_blank" rel="noopener">Film provenance ↗</a></p></div>';
    dialog.showModal();
  });
  document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { dialogContent.innerHTML = ''; refreshMotion(); });
  render();
}
