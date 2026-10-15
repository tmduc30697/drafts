import { autocompletion } from '@codemirror/autocomplete';
import { inCodeBlock } from './codeBlocks.js';

// Các lựa chọn khi gõ "/": khối code trống hoặc khối code có sẵn ngôn ngữ (để tô màu cú pháp)
const CODE_BLOCKS = [
  ['', 'Khối code'],
  ['js', 'Khối code JavaScript'],
  ['ts', 'Khối code TypeScript'],
  ['python', 'Khối code Python'],
  ['html', 'Khối code HTML'],
  ['css', 'Khối code CSS'],
  ['json', 'Khối code JSON'],
  ['sql', 'Khối code SQL'],
  ['bash', 'Khối code Bash'],
  ['java', 'Khối code Java'],
  ['go', 'Khối code Go'],
  ['yaml', 'Khối code YAML'],
];

// Thay "/lệnh" bằng một khối code và đặt con trỏ vào dòng trống bên trong
function insertCodeBlock(view, from, to, lang) {
  const { state } = view;
  const line = state.doc.lineAt(from);
  // Đang có chữ trước "/" thì xuống dòng trước; có chữ phía sau thì xuống dòng sau khối
  const before = state.sliceDoc(line.from, from).trim() ? '\n' : '';
  const after = state.sliceDoc(to, line.to).trim() ? '\n' : '';
  const open = before + '```' + lang + '\n';
  view.dispatch({
    changes: { from, to, insert: open + '\n```' + after },
    selection: { anchor: from + open.length },
    userEvent: 'input.complete',
  });
}

function slashSource(context) {
  const match = context.matchBefore(/\/\w*$/);
  if (!match) return null;
  // Chỉ nhận "/" ở đầu dòng hoặc sau khoảng trắng (không bắt đường dẫn kiểu a/b), và ngoài khối code
  const charBefore = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : '';
  if (charBefore && !/\s/.test(charBefore)) return null;
  if (inCodeBlock(context.state, match.from)) return null;

  return {
    from: match.from,
    options: CODE_BLOCKS.map(([lang, name]) => ({
      label: '/' + (lang || 'code'),
      displayLabel: name,
      apply: (view, _completion, from, to) => insertCodeBlock(view, from, to, lang),
    })),
    validFor: /^\/\w*$/,
  };
}

export const slashMenu = autocompletion({
  override: [slashSource],
  icons: false,
  activateOnTyping: true,
});
