import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CLUB, type MatchInfo } from "./data";

const STORAGE_KEY = "motm-preview-kampprogram-v1";

export type PreviewMatch = MatchInfo & {
  /** true = hjemmekamp for klubben */
  isHome: boolean;
  opponent: string;
};

type Store = {
  matches: PreviewMatch[];
  addMatch: (input: { opponent: string; isHome: boolean; kickoff: string; competition?: string }) => void;
  removeMatch: (id: string) => void;
  openVoting: (id: string) => void;
  closeVoting: (id: string, motmName?: string) => void;
  seedExample: () => void;
  clearAll: () => void;
  openMatch: PreviewMatch | null;
  recentRevealed: PreviewMatch | null;
};

const Ctx = createContext<Store | null>(null);

function loadMatches(): PreviewMatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toMatch(partial: {
  opponent: string;
  isHome: boolean;
  kickoff: string;
  competition?: string;
  open?: boolean;
  revealed?: boolean;
  motmName?: string;
  id?: string;
}): PreviewMatch {
  const opponent = partial.opponent.trim();
  const home = partial.isHome ? CLUB.name : opponent;
  const away = partial.isHome ? opponent : CLUB.name;
  return {
    id: partial.id || `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    home,
    away,
    opponent,
    isHome: partial.isHome,
    competition: partial.competition?.trim() || CLUB.competition,
    kickoff: partial.kickoff.trim() || "TBA",
    open: !!partial.open,
    revealed: !!partial.revealed,
    motmName: partial.motmName,
  };
}

const EXAMPLE: PreviewMatch[] = [
  toMatch({
    id: "m-example-recent",
    opponent: "BK Vest",
    isHome: false,
    kickoff: "Sidste søndag",
    competition: "Serie 2 · 7. spillerunde",
    open: false,
    revealed: true,
    motmName: "Mikkel Frost",
  }),
  toMatch({
    id: "m-example-open",
    opponent: "FC Nordhavn",
    isHome: true,
    kickoff: "Søn 14:00",
    competition: "Serie 2 · 8. spillerunde",
    open: true,
    revealed: false,
  }),
];

export function StoreProvider({ children }: { children: ReactNode }) {
  const [matches, setMatches] = useState<PreviewMatch[]>(() => loadMatches());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
    } catch {
      /* private mode */
    }
  }, [matches]);

  const addMatch = useCallback(
    (input: { opponent: string; isHome: boolean; kickoff: string; competition?: string }) => {
      if (!input.opponent.trim()) return;
      setMatches((prev) => [toMatch({ ...input, open: false, revealed: false }), ...prev]);
    },
    [],
  );

  const removeMatch = useCallback((id: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const openVoting = useCallback((id: string) => {
    setMatches((prev) =>
      prev.map((m) => ({
        ...m,
        open: m.id === id,
        // closing others that were open but not revealed stays closed
        ...(m.id !== id && m.open && !m.revealed ? { open: false } : {}),
      })),
    );
  }, []);

  const closeVoting = useCallback((id: string, motmName?: string) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, open: false, revealed: true, motmName: motmName || m.motmName }
          : m,
      ),
    );
  }, []);

  const seedExample = useCallback(() => {
    setMatches(EXAMPLE.map((m) => ({ ...m })));
  }, []);

  const clearAll = useCallback(() => setMatches([]), []);

  const openMatch = useMemo(() => matches.find((m) => m.open && !m.revealed) || null, [matches]);
  const recentRevealed = useMemo(
    () => matches.find((m) => m.revealed && m.motmName) || null,
    [matches],
  );

  const value = useMemo(
    () => ({
      matches,
      addMatch,
      removeMatch,
      openVoting,
      closeVoting,
      seedExample,
      clearAll,
      openMatch,
      recentRevealed,
    }),
    [
      matches,
      addMatch,
      removeMatch,
      openVoting,
      closeVoting,
      seedExample,
      clearAll,
      openMatch,
      recentRevealed,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore skal bruges inde i StoreProvider");
  return ctx;
}
