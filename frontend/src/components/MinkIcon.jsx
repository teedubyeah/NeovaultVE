/**
 * NeovisionVE — Lock Icon
 * Clean padlock SVG, inherits color from CSS currentColor.
 */
export default function MinkIcon({ size = 24, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="NeovisionVE"
    >
      <rect x="3" y="11" width="18" height="12" rx="2.5" fill="currentColor"/>
      <path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="16.5" r="1.8" fill="white" opacity="0.7"/>
    </svg>
  )
}
