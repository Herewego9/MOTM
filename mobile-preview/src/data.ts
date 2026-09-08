export type Player = {
  id: string;
  name: string;
  number: number;
  position: string;
};

export type RankingRow = {
  name: string;
  points: number;
  motm: number;
  goals: number;
  assists: number;
};

export type MatchInfo = {
  id: string;
  home: string;
  away: string;
  competition: string;
  kickoff: string;
  open: boolean;
  revealed: boolean;
  motmName?: string;
};

export const CLUB = {
  name: "ST70",
  competition: "Serie 2, Pulje 3",
  inviteCode: "ST70-KAMP",
};

export const SQUAD: Player[] = [
  { id: "p1", name: "Mads Nielsen", number: 1, position: "Målmand" },
  { id: "p2", name: "Jonas Berg", number: 2, position: "Forsvar" },
  { id: "p3", name: "Oliver Holm", number: 4, position: "Forsvar" },
  { id: "p4", name: "Frederik Lund", number: 6, position: "Midtbane" },
  { id: "p5", name: "Anders Kvist", number: 8, position: "Midtbane" },
  { id: "p6", name: "Emil Ravn", number: 7, position: "Kant" },
  { id: "p7", name: "Christian Søndergaard", number: 9, position: "Angreb" },
  { id: "p8", name: "Mikkel Frost", number: 10, position: "Angreb" },
  { id: "p9", name: "Rasmus Dahl", number: 11, position: "Kant" },
  { id: "p10", name: "Tobias Madsen", number: 5, position: "Forsvar" },
];

export const RANKING: RankingRow[] = [
  { name: "Mikkel Frost", points: 42, motm: 4, goals: 7, assists: 3 },
  { name: "Christian Søndergaard", points: 36, motm: 2, goals: 9, assists: 2 },
  { name: "Emil Ravn", points: 31, motm: 3, goals: 4, assists: 5 },
  { name: "Anders Kvist", points: 27, motm: 2, goals: 3, assists: 6 },
  { name: "Frederik Lund", points: 22, motm: 1, goals: 2, assists: 5 },
  { name: "Rasmus Dahl", points: 18, motm: 1, goals: 3, assists: 2 },
  { name: "Jonas Berg", points: 14, motm: 1, goals: 1, assists: 1 },
  { name: "Oliver Holm", points: 11, motm: 0, goals: 1, assists: 2 },
];

export const OPEN_MATCH: MatchInfo = {
  id: "m-2048",
  home: "ST70",
  away: "FC Nordhavn",
  competition: "Serie 2 · 8. spillerunde",
  kickoff: "Søn 14:00",
  open: true,
  revealed: false,
};

export const RECENT_MATCH: MatchInfo = {
  id: "m-2047",
  home: "BK Vest",
  away: "ST70",
  competition: "Serie 2 · 7. spillerunde",
  kickoff: "Sidste søndag",
  open: false,
  revealed: true,
  motmName: "Mikkel Frost",
};

export const LAUNDRY = {
  name: "Emil Ravn",
  match: "BK Vest – ST70",
  due: "Aflever inden næste træning",
};
