import { renderMermaid } from './mermaid.js';

const EXAMPLE = `graph TD
  A[Bắt đầu] --> B{Có mạng?}
  B -->|Có| C[Đồng bộ]
  B -->|Không| D[Lưu trên máy]`;

// Popup dán/sửa code Mermaid, có xem trước sơ đồ ngay khi gõ.
// onSubmit(code) được gọi khi bấm nút xác nhận (hoặc Cmd/Ctrl+Enter).
export function openMermaidDialog({ code = '', submitLabel = 'Chèn', onSubmit, onClose }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'mermaid-backdrop';
  backdrop.innerHTML = `
    <div class="mermaid-dialog" role="dialog" aria-modal="true" aria-label="Sơ đồ Mermaid">
      <div class="mermaid-dialog-head">
        <span>Sơ đồ Mermaid</span>
        <a href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank" rel="noopener">Cú pháp</a>
      </div>
      <textarea class="mermaid-input" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
      <div class="mermaid-preview"><span class="mermaid-hint">Dán code Mermaid để xem trước sơ đồ</span></div>
      <div class="mermaid-dialog-foot">
        <button type="button" class="btn mermaid-cancel">Hủy</button>
        <button type="button" class="btn btn-primary mermaid-submit"></button>
      </div>
    </div>`;

  const input = backdrop.querySelector('.mermaid-input');
  const preview = backdrop.querySelector('.mermaid-preview');
  const submit = backdrop.querySelector('.mermaid-submit');
  input.value = code;
  input.placeholder = EXAMPLE;
  submit.textContent = submitLabel;

  // Xem trước: render sau khi ngừng gõ 300ms; bỏ kết quả cũ nếu đã gõ tiếp
  let timer = null;
  let version = 0;
  const updatePreview = () => {
    const text = input.value.trim();
    submit.disabled = !text;
    clearTimeout(timer);
    if (!text) {
      preview.innerHTML = '<span class="mermaid-hint">Dán code Mermaid để xem trước sơ đồ</span>';
      return;
    }
    const v = ++version;
    timer = setTimeout(async () => {
      const result = await renderMermaid(text);
      if (v !== version) return;
      if (result.svg) preview.innerHTML = result.svg;
      else {
        preview.innerHTML = '';
        const err = document.createElement('span');
        err.className = 'mermaid-error';
        err.textContent = `Lỗi cú pháp: ${result.error}`;
        preview.appendChild(err);
      }
    }, 300);
  };

  const close = () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    onClose?.();
  };
  const confirm = () => {
    const text = input.value.trim();
    if (!text) return;
    close();
    onSubmit(text);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      confirm();
    }
  };

  input.addEventListener('input', updatePreview);
  backdrop.querySelector('.mermaid-cancel').addEventListener('click', close);
  submit.addEventListener('click', confirm);
  backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey, true);

  document.body.appendChild(backdrop);
  updatePreview();
  input.focus();
}
