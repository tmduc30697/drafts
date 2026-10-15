// Icon SVG dạng chuỗi cho các widget dựng bằng DOM thuần trong CodeMirror
const svg = (body, size = 15) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const CopyIcon = svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>');
export const CloseIcon = svg('<path d="M6 6l12 12M18 6L6 18"/>');
export const EditIcon = svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>');
