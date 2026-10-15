import { autocompletion } from '@codemirror/autocomplete';
import { inCodeBlock } from './codeBlocks.js';
import { CodeIcon, DiagramIcon } from './editorIcons.js';
import { openMermaidDialog } from './mermaidDialog.js';
import { insertMermaidBlock } from './mermaidBlocks.js';

// Thay "/lệnh" bằng một khối code trống (Plain text) và đặt con trỏ vào bên trong.
// Ngôn ngữ đổi sau bằng dropdown trên thanh tiêu đề của khối.
function insertCodeBlock(view, from, to) {
  const { state } = view;
  const line = state.doc.lineAt(from);
  // Đang có chữ trước "/" thì xuống dòng trước; luôn chừa một dòng sau khối để gõ tiếp
  const before = state.sliceDoc(line.from, from).trim() ? '\n' : '';
  const rest = state.sliceDoc(to, line.to);
  const after = rest.trim() || to === state.doc.length || line.to === state.doc.length ? '\n' : '';
  const open = before + '```\n';
  view.dispatch({
    changes: { from, to, insert: open + '\n```' + after },
    selection: { anchor: from + open.length },
    userEvent: 'input.complete',
  });
}

// Các lựa chọn trong menu "/"
const COMMANDS = [
  {
    label: '/code',
    displayLabel: 'Code',
    detail: 'Khối code có tô màu cú pháp',
    icon: CodeIcon,
    apply: (view, _completion, from, to) => insertCodeBlock(view, from, to),
  },
  {
    label: '/mermaid',
    displayLabel: 'Mermaid',
    detail: 'Sơ đồ từ code Mermaid',
    icon: DiagramIcon,
    // Xóa "/lệnh" rồi mở popup dán code; bấm Chèn thì thêm khối sơ đồ vào đúng chỗ đó
    apply: (view, _completion, from, to) => {
      view.dispatch({ changes: { from, to }, selection: { anchor: from } });
      openMermaidDialog({
        onSubmit: (code) => insertMermaidBlock(view, from, code),
        onClose: () => view.focus(),
      });
    },
  },
];

function slashSource(context) {
  const match = context.matchBefore(/\/\w*$/);
  if (!match) return null;
  // Chỉ nhận "/" ở đầu dòng hoặc sau khoảng trắng (không bắt đường dẫn kiểu a/b), và ngoài khối code
  const charBefore = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : '';
  if (charBefore && !/\s/.test(charBefore)) return null;
  if (inCodeBlock(context.state, match.from)) return null;
  return { from: match.from, options: COMMANDS, validFor: /^\/\w*$/ };
}

// Mỗi lựa chọn hiện kiểu Notion: ô icon bên trái, tên + mô tả bên phải
function renderOption(completion) {
  const row = document.createElement('div');
  row.className = 'slash-option';
  row.innerHTML = `<span class="slash-icon">${completion.icon}</span>`;
  const text = document.createElement('span');
  text.className = 'slash-text';
  const name = document.createElement('span');
  name.className = 'slash-name';
  name.textContent = completion.displayLabel;
  const desc = document.createElement('span');
  desc.className = 'slash-desc';
  desc.textContent = completion.detail;
  text.append(name, desc);
  row.append(text);
  return row;
}

export const slashMenu = autocompletion({
  override: [slashSource],
  icons: false,
  activateOnTyping: true,
  tooltipClass: () => 'slash-menu',
  // Dùng giao diện tự dựng thay cho nhãn/chi tiết mặc định
  addToOptions: [{ render: renderOption, position: 10 }],
});
