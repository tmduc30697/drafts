// Bộ icon SVG nét mảnh, kế thừa màu chữ hiện tại
function Svg({ size = 18, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const CloseIcon = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const MenuIcon = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
// Hai mũi tên vòng tròn: đang đồng bộ (xoay bằng CSS)
export const SyncIcon = (p) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
  </Svg>
);
export const EditIcon = (p) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M14 6l4 4" />
  </Svg>
);
export const FolderIcon = (p) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </Svg>
);
export const ChevronRightIcon = (p) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);
export const CloudOffIcon = (p) => (
  <Svg {...p}>
    <path d="M3 3l18 18M8 7.5A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.3 7.3M17 18H7a4.5 4.5 0 0 1-1.8-8.6" />
  </Svg>
);
export const DocIcon = (p) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
);
export const RestoreIcon = (p) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />
    <path d="M4 4v4.6h4.6" />
  </Svg>
);
export const LogoutIcon = (p) => (
  <Svg {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
  </Svg>
);
// » (mở rộng) và « (thu gọn)
export const ChevronsRightIcon = (p) => (
  <Svg {...p}>
    <path d="M6 7l5 5-5 5M13 7l5 5-5 5" />
  </Svg>
);
export const ChevronsLeftIcon = (p) => (
  <Svg {...p}>
    <path d="M18 7l-5 5 5 5M11 7l-5 5 5 5" />
  </Svg>
);
export const BulletListIcon = (p) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" />
  </Svg>
);
export const NumberedListIcon = (p) => (
  <Svg {...p}>
    <path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v4M4 13.5c0-1 2.5-1 2.5 0S4 15 4 16.5h2.5M4 19.5h2.5l-1 1.2c1 0 1.2 1.3 0 1.8H4" />
  </Svg>
);
export const TodoListIcon = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="5" height="5" rx="1" />
    <rect x="3.5" y="14.5" width="5" height="5" rx="1" />
    <path d="M12 7h8M12 17h8" />
  </Svg>
);
export const QuoteIcon = (p) => (
  <Svg {...p}>
    <path d="M10 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1a2 2 0 0 1-2 2M20 7h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1a2 2 0 0 1-2 2" />
  </Svg>
);
export const LinkIcon = (p) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const InlineCodeIcon = (p) => (
  <Svg {...p}>
    <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
  </Svg>
);
export const CodeBlockIcon = (p) => (
  <Svg {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M10 9l-2.5 3 2.5 3M14 9l2.5 3-2.5 3" />
  </Svg>
);
export const TableIcon = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 4v16" />
  </Svg>
);
// Icon Mermaid (nàng tiên cá): thân uốn cong kết thúc bằng đuôi cá
export const MermaidIcon = (p) => (
  <Svg {...p}>
    <path d="M4 3C4 9 12 9 14 14" />
    <path d="M14 14C16 11 18 9.5 21 9.5C20 12 19.5 13.5 18.5 14.5C20 16 20.5 18.5 20.5 21C17 20.5 15 17.5 14 14Z" />
  </Svg>
);
export const LockIcon = (p) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const UnlockIcon = (p) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.5-1.8" />
  </Svg>
);
export const DownloadIcon = (p) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" />
  </Svg>
);
export const HrIcon = (p) => (
  <Svg {...p}>
    <path d="M3 12h18M8 6.5h8M8 17.5h8" />
  </Svg>
);
export const UploadIcon = (p) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14" />
  </Svg>
);
