(() => {
  if (location.protocol === 'chrome-extension:') return;

  const root = document.documentElement;
  const key = 'squeek-hub-dark-mode';
  try {
    if (localStorage.getItem(key) === 'true') root.dataset.colorMode = 'dark';
  } catch {}

  document.addEventListener('DOMContentLoaded', () => {
    if (root.dataset.mode === 'overlay') return;
    const button = document.querySelector('.theme-toggle');
    const update = () => button.setAttribute('aria-pressed', String(root.dataset.colorMode === 'dark'));

    update();
    button.hidden = false;
    button.addEventListener('click', () => {
      const dark = root.dataset.colorMode !== 'dark';
      if (dark) root.dataset.colorMode = 'dark';
      else delete root.dataset.colorMode;
      update();
      try {
        localStorage.setItem(key, String(dark));
      } catch {}
    });
  });
})();
