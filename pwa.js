(() => {
  let installPrompt = null;
  let installed = false;

  const isStandalone = () =>
    installed ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const updateInstallButtons = () => {
    document.querySelectorAll('[data-install-app]').forEach(button => {
      button.hidden = isStandalone();
    });
  };

  new MutationObserver(updateInstallButtons).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installed = true;
    updateInstallButtons();
  });

  document.addEventListener('click', async event => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-install-app]')
      : null;
    if (!target) return;

    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      if (outcome === 'accepted') {
        updateInstallButtons();
        const help = document.getElementById('pwa-install-help');
        if (help) help.hidden = true;
        return;
      }
    }

    const help = document.getElementById('pwa-install-help');
    if (help) help.hidden = !help.hidden;
  });

  updateInstallButtons();

  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' ||
       location.hostname === 'localhost' ||
       location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('/sw.js')
      .catch(error => console.error('Không đăng ký được service worker:', error));
  }
})();
