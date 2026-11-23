export function Logo({ className = 'size-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      <path d="M9 10h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8l-5 4v-4H9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" fill="#fff" />
      <circle cx="12" cy="15.5" r="1.4" fill="#4f46e5" />
      <circle cx="16" cy="15.5" r="1.4" fill="#4f46e5" />
      <circle cx="20" cy="15.5" r="1.4" fill="#4f46e5" />
    </svg>
  )
}
