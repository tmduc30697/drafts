// Icon SVG dạng chuỗi cho các widget dựng bằng DOM thuần trong CodeMirror
const svg = (body, size = 15) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const CopyIcon = svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>');
export const TrashIcon = svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>');
export const CodeIcon = svg('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>', 18);
