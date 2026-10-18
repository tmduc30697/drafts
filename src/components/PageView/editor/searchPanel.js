import { SearchQuery, findNext, findPrevious, getSearchQuery, selectMatches, setSearchQuery } from '@codemirror/search';
import { runScopeHandlers } from '@codemirror/view';

// Ô tìm kiếm kiểu Sublime Text, một hàng ở dưới cùng:
//   [.*] [Aa] [""]  [ input ........................ ]  [Find] [Find Prev]   (Esc closes, Alt+Enter selects all matches)
//   status line: "1 of 2 matches"

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

// Đếm số kết quả và vị trí của kết quả đang chọn (dừng ở 5000 để trang rất dài không bị chậm)
function matchInfo(state, query) {
  if (!query.search || !query.valid) return { count: 0, index: 0 };
  const sel = state.selection.main;
  let count = 0;
  let index = 0;
  const cursor = query.getCursor(state);
  for (let r = cursor.next(); !r.done && count < 5000; r = cursor.next()) {
    count++;
    if (r.value.from === sel.from && r.value.to === sel.to) index = count;
  }
  return { count, index };
}

export function createSearchPanel(view) {
  let query = getSearchQuery(view.state);

  const input = el('input', { class: 'sf-input', 'main-field': 'true', title: 'Enter: next · Shift+Enter: previous · Alt+Enter: select all matches', type: 'text', placeholder: 'Find…', 'aria-label': 'Find', spellcheck: 'false', autocomplete: 'off', value: query.search });
  const toggle = (name, label, title) => {
    const b = el('button', { type: 'button', class: 'sf-toggle', title, 'aria-label': title, name }, label);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  };
  const regexp = toggle('re', '.*', 'Regular expression');
  const matchCase = toggle('case', 'Aa', 'Match case');
  const word = toggle('word', '“”', 'Whole word');
  const button = (label, name, run) => {
    const b = el('button', { type: 'button', class: 'sf-btn', name }, label);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', run);
    return b;
  };
  const status = el('div', { class: 'sf-status' });

  const dom = el(
    'div',
    { class: 'cm-search sf-bar' },
    el(
      'div',
      { class: 'sf-row' },
      el('div', { class: 'sf-toggles' }, regexp, matchCase, word),
      input,
      button('Find', 'next', () => findNext(view)),
      button('Find Prev', 'prev', () => findPrevious(view)),
    ),
    status,
  );

  const refresh = () => {
    regexp.setAttribute('aria-pressed', String(query.regexp));
    matchCase.setAttribute('aria-pressed', String(query.caseSensitive));
    word.setAttribute('aria-pressed', String(query.wholeWord));
    if (input.value !== query.search) input.value = query.search;
    const { count, index } = matchInfo(view.state, query);
    status.textContent = !query.search ? '' : !query.valid ? 'Invalid regular expression' : count === 0 ? 'No matches' : index ? `${index} of ${count} ${count === 1 ? 'match' : 'matches'}` : `${count} ${count === 1 ? 'match' : 'matches'}`;
  };

  const commit = () => {
    const next = new SearchQuery({ search: input.value, caseSensitive: matchCase.getAttribute('aria-pressed') === 'true', regexp: regexp.getAttribute('aria-pressed') === 'true', wholeWord: word.getAttribute('aria-pressed') === 'true' });
    if (!next.eq(query)) {
      query = next;
      view.dispatch({ effects: setSearchQuery.of(query) });
    }
  };
  input.addEventListener('input', commit);
  for (const b of [regexp, matchCase, word]) {
    b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      commit();
    });
  }
  dom.addEventListener('keydown', (e) => {
    // Alt+Enter (như Sublime): chọn tất cả chỗ khớp thành nhiều con trỏ rồi đưa focus về trang để gõ/xóa hàng loạt
    if (e.key === 'Enter' && e.altKey && e.target === input) {
      e.preventDefault();
      selectMatches(view);
      view.focus();
      return;
    }
    // Esc, ⌘F, ⌘G... theo các phím tắt tìm kiếm đã đăng ký (scope "search-panel")
    if (runScopeHandlers(view, e, 'search-panel')) {
      e.preventDefault();
    } else if (e.key === 'Enter' && e.target === input) {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(view);
    }
  });

  refresh();
  return {
    dom,
    top: false,
    mount() {
      input.focus();
      input.select();
    },
    update(update) {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(setSearchQuery) && !effect.value.eq(query)) query = effect.value;
        }
      }
      refresh();
    },
  };
}
