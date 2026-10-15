// Chuyển nội dung kiểu cũ (JSON block của BlockNote) sang văn bản thuần.
// Dùng khi mở trang được tạo từ trước khi đổi sang editor văn bản; lần lưu sau sẽ ghi dạng mới.

function inlineText(content) {
  if (!Array.isArray(content)) return '';
  return content.map((c) => (c.type === 'link' ? inlineText(c.content) : c.text || '')).join('');
}

export function blocksToText(json) {
  let blocks;
  try {
    blocks = JSON.parse(json || '[]');
  } catch {
    return '';
  }
  if (!Array.isArray(blocks)) return '';

  const lines = [];
  const walk = (list, depth) => {
    const indent = '  '.repeat(depth);
    let number = 0;
    for (const b of list) {
      number = b.type === 'numberedListItem' ? number + 1 : 0;
      const text = inlineText(b.content);
      switch (b.type) {
        case 'bulletListItem':
          lines.push(`${indent}- ${text}`);
          break;
        case 'numberedListItem':
          lines.push(`${indent}${number}. ${text}`);
          break;
        case 'checkListItem':
          lines.push(`${indent}- [${b.props?.checked ? 'x' : ' '}] ${text}`);
          break;
        case 'codeBlock': {
          const lang = b.props?.language && b.props.language !== 'text' ? b.props.language : '';
          lines.push('```' + lang, ...text.split('\n'), '```');
          break;
        }
        case 'image':
        case 'video':
        case 'audio':
        case 'file':
          if (b.props?.url) lines.push(indent + b.props.url);
          break;
        case 'table':
          for (const row of b.content?.rows || []) {
            lines.push(indent + row.cells.map((c) => inlineText(Array.isArray(c) ? c : c.content)).join(' | '));
          }
          break;
        default:
          lines.push(indent + text);
      }
      if (b.children?.length) walk(b.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return lines.join('\n').replace(/\s+$/, '');
}
