import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Popover nổi gắn với một phần tử neo; đóng khi bấm ra ngoài hoặc nhấn Esc
export function Popover({ anchor, onClose, children, className = '' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });

  // Tính vị trí sau khi đo kích thước popover, giữ trong khung nhìn.
  // Đo lại khi nội dung đổi kích thước (vd. bộ chọn emoji tải xong).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const { width, height } = el.getBoundingClientRect();
      const margin = 8;
      const left = Math.min(a.left, window.innerWidth - width - margin);
      let top = a.bottom + 4;
      if (top + height > window.innerHeight - margin) top = Math.max(margin, a.top - height - 4);
      setPos({ top, left: Math.max(margin, left) });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} className={`popover ${className}`} style={{ top: pos.top, left: pos.left }}>
      {children}
    </div>,
    document.body,
  );
}

// Menu dạng danh sách: items = [{ label, icon, onClick, danger }]
export default function Menu({ anchor, onClose, items, header }) {
  return (
    <Popover anchor={anchor} onClose={onClose} className="menu">
      {header}
      {items.map((item) => (
        <button
          key={item.label}
          className={`menu-item ${item.danger ? 'danger' : ''}`}
          onClick={() => {
            onClose();
            item.onClick();
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </Popover>
  );
}
