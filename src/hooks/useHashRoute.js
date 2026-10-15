import { useEffect, useState } from 'react';

// Điều hướng bằng hash (#/p/<id>, #/trash) để chạy được trên GitHub Pages
// mà không cần cấu hình rewrite cho SPA.
function parse(hash) {
  const m = hash.match(/^#\/p\/([^/?#]+)/);
  if (m) return { view: 'page', id: decodeURIComponent(m[1]) };
  if (hash.startsWith('#/trash')) return { view: 'trash' };
  return { view: 'home' };
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function goToPage(id, { replace = false } = {}) {
  const hash = `#/p/${encodeURIComponent(id)}`;
  if (replace) window.location.replace(hash);
  else window.location.hash = hash;
}

export function goToTrash() {
  window.location.hash = '#/trash';
}

export function goHome() {
  window.location.hash = '#/';
}
