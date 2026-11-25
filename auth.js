(() => {
  const SESSION_KEYS = ['tro_token', 'tro_exp', 'tro_refresh', 'tro_user'];
  let refreshPromise = null;

  function clearAuthSession() {
    SESSION_KEYS.forEach(key => localStorage.removeItem(key));
  }

  async function refreshAuthSession() {
    if (refreshPromise) return refreshPromise;
    const refreshToken = localStorage.getItem('tro_refresh');
    if (!refreshToken) return false;

    refreshPromise = (async () => {
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) {
        if (response.status !== 401)
          throw new Error('Không thể kết nối dịch vụ xác thực.');
        if (localStorage.getItem('tro_refresh') !== refreshToken &&
            localStorage.getItem('tro_token') && +localStorage.getItem('tro_exp') > Date.now())
          return true;
        clearAuthSession();
        return false;
      }

      const session = await response.json();
      if (localStorage.getItem('tro_refresh') !== refreshToken) {
        return !!localStorage.getItem('tro_token') &&
          +localStorage.getItem('tro_exp') > Date.now();
      }
      if (!session.access_token || !Number.isFinite(Number(session.expires_in)))
        throw new Error('Dịch vụ xác thực trả về phiên không hợp lệ.');
      localStorage.setItem('tro_token', session.access_token);
      localStorage.setItem('tro_refresh', session.refresh_token || refreshToken);
      localStorage.setItem('tro_exp', Date.now() + Math.max(0, session.expires_in - 60) * 1000);
      return true;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function authFetch(url, options = {}) {
    let token = localStorage.getItem('tro_token');
    let expiresAt = +localStorage.getItem('tro_exp');
    if (!token || !expiresAt || Date.now() >= expiresAt - 60000) {
      if (!await refreshAuthSession()) {
        location.replace('/');
        throw new Error('Phiên đăng nhập đã hết hạn.');
      }
      token = localStorage.getItem('tro_token');
      expiresAt = +localStorage.getItem('tro_exp');
      if (!token || !expiresAt) {
        location.replace('/');
        throw new Error('Phiên đăng nhập không hợp lệ.');
      }
    }

    const send = () => {
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${localStorage.getItem('tro_token') || token}`);
      return fetch(url, { ...options, headers });
    };

    let response = await send();
    if (response.status !== 401) return response;
    if (!await refreshAuthSession()) {
      location.replace('/');
      return response;
    }
    response = await send();
    if (response.status === 401) {
      clearAuthSession();
      location.replace('/');
    }
    return response;
  }

  window.clearAuthSession = clearAuthSession;
  window.refreshAuthSession = refreshAuthSession;
  window.authFetch = authFetch;
})();
