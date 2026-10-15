// Logo Drafts: chữ D trắng trên nền tối, dùng chung với icon PWA (public/logo.svg)
export default function Logo({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#191919" />
      <path
        d="M176 136h72a120 120 0 0 1 0 240h-72z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="44"
        strokeLinejoin="round"
      />
    </svg>
  );
}
