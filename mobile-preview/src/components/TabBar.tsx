import type { ReactNode } from "react";

type TabId = "stem" | "rangliste" | "hold" | "profil";

const icons: Record<TabId, ReactNode> = {
  stem: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5L12 14.8 7.5 16.7l.9-5L4.8 8.2l5-.7L12 3z" />
    </svg>
  ),
  rangliste: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </svg>
  ),
  hold: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c1.5-3 4-4.5 6-4.5s4.5 1.5 6 4.5" />
      <path d="M14 19c.7-1.6 2-2.8 3.5-2.8 1.2 0 2.2.5 3 1.5" />
    </svg>
  ),
  profil: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c1.8-3.5 4.2-5 7-5s5.2 1.5 7 5" />
    </svg>
  ),
};

const labels: Record<TabId, string> = {
  stem: "Stem",
  rangliste: "Rangliste",
  hold: "Hold",
  profil: "Profil",
};

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  const tabs: TabId[] = ["stem", "rangliste", "hold", "profil"];
  return (
    <nav className="tabbar" aria-label="Hovedmenu">
      {tabs.map((id) => (
        <button
          key={id}
          type="button"
          className={`tab${active === id ? " active" : ""}`}
          onClick={() => onChange(id)}
          aria-current={active === id ? "page" : undefined}
        >
          {icons[id]}
          {labels[id]}
        </button>
      ))}
    </nav>
  );
}

export type { TabId };
