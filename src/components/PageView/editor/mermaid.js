// Tải lười thư viện Mermaid (khá nặng) và render sơ đồ thành SVG.
// Các lần render được xếp hàng lần lượt vì Mermaid không chịu render song song tốt.

let mermaidPromise = null;
let currentTheme = null;
let queue = Promise.resolve();
let counter = 0;
const cache = new Map(); // `${theme}\n${code}` -> svg

function loadMermaid() {
  if (!mermaidPromise) mermaidPromise = import('mermaid').then((m) => m.default);
  return mermaidPromise;
}

// Trả về { svg } hoặc { error } (cú pháp sai...)
export function renderMermaid(code) {
  const theme = 'default';
  const key = `${theme}\n${code}`;
  if (cache.has(key)) return Promise.resolve({ svg: cache.get(key) });

  const job = queue.then(async () => {
    const mermaid = await loadMermaid();
    if (currentTheme !== theme) {
      mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict', fontFamily: 'inherit' });
      currentTheme = theme;
    }
    try {
      const { svg } = await mermaid.render(`mermaid-${++counter}`, code);
      cache.set(key, svg);
      return { svg };
    } catch (err) {
      // Mermaid có thể để lại phần tử tạm khi lỗi: dọn đi
      document.getElementById(`dmermaid-${counter}`)?.remove();
      return { error: String(err?.message || err).split('\n')[0] };
    }
  });
  queue = job.catch(() => {});
  return job;
}
