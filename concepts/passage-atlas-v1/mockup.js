// Isolated presentation mockups. No wallet, contract, indexing or production code.
const page = document.body.dataset.page;
if (new URLSearchParams(location.search).has('capture')) document.documentElement.classList.add('capture');
const hasInk = new Set([23, 31, 35]);
const allowed = new Set([2, 7, 13, 22, 23, 31, 35, 39, 40]);
const asset = (id, mode = 'light') => `assets/${id}-${mode}.webp`;

if (page === 'home') {
  let mode = 'light';
  document.querySelector('#passage-toggle').addEventListener('click', () => {
    mode = mode === 'light' ? 'ink' : 'light';
    const alternate = mode === 'light' ? 'ink' : 'light';
    document.body.classList.toggle('is-ink', mode === 'ink');
    document.querySelector('#hero-art').src = asset(23, mode);
    document.querySelector('#hero-art').alt = `Signature 23, ${mode} interpretation`;
    document.querySelector('#portal-art').src = asset(23, alternate);
    document.querySelector('#portal-art').alt = `Signature 23, ${alternate} interpretation`;
    document.querySelector('#portal-label').textContent = `THE SAME WORK, IN ${alternate.toUpperCase()}`;
    document.querySelector('#material-name').textContent = mode.toUpperCase();
    document.querySelector('#passage-toggle').setAttribute('aria-label', `See Signature 23 in ${alternate}`);
    document.querySelector('.hero-plate').href = `artwork.html?id=23&mode=${mode}`;
  });
}

if (page === 'collection') {
  document.querySelectorAll('[data-atlas-mode]').forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.atlasMode;
    document.body.classList.toggle('ink-atlas', mode === 'ink');
    document.querySelectorAll('[data-atlas-mode]').forEach(item => {
      item.classList.toggle('selected', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    document.querySelectorAll('[data-token]').forEach(figure => {
      const id = Number(figure.dataset.token);
      const actualMode = mode === 'ink' && hasInk.has(id) ? 'ink' : 'light';
      figure.querySelector('img').src = asset(id, actualMode);
      figure.querySelector('img').alt = `Signature ${id}, ${actualMode} interpretation`;
      figure.querySelector('a').href = `artwork.html?id=${id}&mode=${actualMode}`;
    });
  }));
  document.querySelector('#follow-form').addEventListener('click', event => {
    const active = document.querySelector('.atlas').classList.toggle('is-affinity');
    event.currentTarget.setAttribute('aria-pressed', String(active));
    event.currentTarget.innerHTML = `${active ? 'Return to selection' : 'Follow the form'} <span>↗</span>`;
    document.querySelector('#atlas-caption').innerHTML = active ? 'An editorial constellation<br>around Signature 31.' : 'An editorial study<br>in light and trace.';
  });
}

if (page === 'artwork') {
  const params = new URLSearchParams(location.search);
  const requested = Number(params.get('id') || 31);
  const id = allowed.has(requested) ? requested : 31;
  let mode = params.get('mode') === 'ink' && hasInk.has(id) ? 'ink' : 'light';
  let pair = false;
  const image = document.querySelector('#work-image');
  const pairImage = document.querySelector('#pair-image');
  const dialog = document.querySelector('#media-dialog');
  const dialogContent = document.querySelector('#dialog-content');
  document.title = `Cosmic Signature — Signature ${id}`;
  document.querySelector('#work-title').textContent = `Signature ${id}`;
  document.querySelector('#token-line').textContent = `COSMIC SIGNATURE / № ${String(id).padStart(3, '0')}`;
  if (!hasInk.has(id)) {
    document.querySelector('[data-work-mode="ink"]').hidden = true;
    document.querySelector('#compare').hidden = true;
    document.querySelector('.work-continuation').hidden = true;
  }
  document.querySelector('#watch-ink').hidden = id !== 31;
  function render() {
    document.body.classList.toggle('is-ink', mode === 'ink');
    image.src = asset(id, mode);
    image.alt = `Signature ${id}, ${mode} interpretation`;
    pairImage.src = asset(id, mode === 'light' ? 'ink' : 'light');
    pairImage.alt = `Signature ${id}, ${mode === 'light' ? 'ink' : 'light'} interpretation`;
    pairImage.hidden = !pair;
    document.querySelector('.work-view').classList.toggle('is-pair', pair);
    document.querySelector('#caption-mode').textContent = pair ? 'LIGHT + INK / STILL' : `${mode.toUpperCase()} / STILL`;
    document.querySelector('#interpretation-note').innerHTML = mode === 'light' ? 'The orbit, held in light.<br>Every line remembers a movement.' : 'The orbit, carried through ink.<br>Every current remembers a passage.';
    document.querySelectorAll('[data-work-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.workMode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.workMode === mode));
    });
    if (hasInk.has(id)) {
      const other = mode === 'light' ? 'ink' : 'light';
      document.querySelector('#continuation-image').src = asset(id, other);
      document.querySelector('#continuation-image').alt = `Signature ${id}, ${other} interpretation`;
      document.querySelector('#continuation-link').href = `artwork.html?id=${id}&mode=${other}`;
    }
    params.set('id', String(id)); params.set('mode', mode);
    history.replaceState(null, '', `artwork.html?${params}`);
  }
  document.querySelectorAll('[data-work-mode]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.workMode; render(); }));
  document.querySelector('#compare').addEventListener('click', event => {
    pair = !pair; event.currentTarget.setAttribute('aria-pressed', String(pair));
    event.currentTarget.innerHTML = `${pair ? 'Return to one view' : 'See them together'} <span>↗</span>`; render();
  });
  document.querySelector('#enlarge').addEventListener('click', () => {
    dialogContent.innerHTML = `<img src="${asset(id, mode)}" alt="Signature ${id}, ${mode} interpretation">`;
    dialog.showModal();
  });
  document.querySelector('#watch-ink').addEventListener('click', () => {
    dialogContent.innerHTML = '<video src="assets/31-ink.mp4" controls autoplay playsinline poster="assets/31-ink.webp"></video>';
    dialog.showModal();
  });
  document.querySelector('#record').addEventListener('click', () => {
    dialogContent.innerHTML = `<div class="record-content"><p class="eyebrow">THE WORK'S RECORD</p><h2>Signature ${id}</h2><p>Cosmic Signature · Arbitrum One</p><p>Light and Ink are interpretations of the same token. The images in this visual study are real local artwork files, used without cropping, recoloring or regeneration.</p><p>This is a presentation mockup. No wallet, ownership feed or auction is connected.</p><p><a href="assets.json" target="_blank" rel="noopener">Artwork source manifest ↗</a></p></div>`;
    dialog.showModal();
  });
  document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { dialogContent.innerHTML = ''; });
  render();
}
