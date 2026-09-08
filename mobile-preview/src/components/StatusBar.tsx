export function StatusBar() {
  return (
    <div className="status-bar" aria-hidden>
      <span className="time">9:41</span>
      <span className="icons">
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.5" />
          <rect x="4.5" y="5" width="3" height="7" rx="0.5" />
          <rect x="9" y="2" width="3" height="10" rx="0.5" />
          <rect x="13.5" y="0" width="2.5" height="12" rx="0.5" opacity="0.35" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M1 8.5c2.5-3 5.5-4.5 7-4.5s4.5 1.5 7 4.5" />
          <path d="M4 10c1.5-1.8 3-2.5 4-2.5s2.5.7 4 2.5" />
          <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
        </svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="currentColor">
          <rect x="0" y="1" width="20" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="2" y="3" width="14" height="6" rx="1" />
          <rect x="21" y="4" width="2" height="4" rx="0.5" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
}
