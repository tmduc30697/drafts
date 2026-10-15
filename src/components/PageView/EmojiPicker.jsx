import { useEffect, useRef } from 'react';
import { Popover } from '../Menu.jsx';
import { useColorScheme } from '../../hooks/useColorScheme.js';

// Bộ chọn emoji (emoji-mart, có sẵn trong BlockNote). Thư viện và dữ liệu được tải lười khi mở.
export default function EmojiPicker({ anchor, onSelect, onRemove, onClose }) {
  const holder = useRef(null);
  const theme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    let picker;
    Promise.all([
      import('emoji-mart'),
      import('@emoji-mart/data'),
      import('@emoji-mart/data/i18n/vi.json'),
    ]).then(([{ Picker }, data, i18n]) => {
      if (cancelled || !holder.current) return;
      picker = new Picker({
        data: data.default,
        i18n: i18n.default,
        theme,
        locale: 'vi',
        previewPosition: 'none',
        skinTonePosition: 'search',
        autoFocus: !matchMedia('(hover: none)').matches, // điện thoại: không tự bật bàn phím
        onEmojiSelect: (e) => onSelect(e.native),
      });
      holder.current.appendChild(picker);
    });
    return () => {
      cancelled = true;
      picker?.remove();
    };
  }, [theme, onSelect]);

  return (
    <Popover anchor={anchor} onClose={onClose} className="emoji-popover">
      <div className="emoji-popover-head">
        <span>Biểu tượng</span>
        {onRemove && (
          <button className="link-btn" onClick={onRemove}>
            Gỡ bỏ
          </button>
        )}
      </div>
      <div ref={holder} className="emoji-holder" />
    </Popover>
  );
}
