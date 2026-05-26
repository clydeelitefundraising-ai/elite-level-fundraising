"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import {
  teamInfo as _teamInfo,
  athletes as _athletes,
  calendarEvents as _events,
  fundraisingData as _fundraiser,
  products as _products,
  sponsors as _sponsors,
  teamUpdates as _updates,
  heroStats,
  leaderboard,
  spotlightAthlete,
  announcements,
} from "../team-app/_data/mockData";
import type { TeamUpdate } from "../team-app/_data/mockData";

type AppStore = {
  teamInfo: typeof _teamInfo;
  primaryColor: string;
  secondaryColor: string;
  athletes: typeof _athletes;
  calendarEvents: typeof _events;
  fundraisingData: typeof _fundraiser;
  products: typeof _products;
  sponsors: typeof _sponsors;
  teamUpdates: TeamUpdate[];
  heroStats: typeof heroStats;
  leaderboard: typeof leaderboard;
  spotlightAthlete: typeof spotlightAthlete;
  announcements: typeof announcements;
  setTeamInfo: (patch: Partial<typeof _teamInfo>) => void;
  setPrimaryColor: (c: string) => void;
  setSecondaryColor: (c: string) => void;
  setAthletes: (a: typeof _athletes) => void;
  setCalendarEvents: (e: typeof _events) => void;
  setFundraisingData: (patch: Partial<typeof _fundraiser>) => void;
  setProducts: (p: typeof _products) => void;
  setSponsors: (s: typeof _sponsors) => void;
  setTeamUpdates: (u: TeamUpdate[]) => void;
};

const Ctx = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [teamInfo, setTeamInfoState] = useState({ ..._teamInfo });
  const [primaryColor, setPrimaryColor] = useState("#0B1E3D");
  const [secondaryColor, setSecondaryColor] = useState("#C9A84C");
  const [athletes, setAthletes] = useState(_athletes);
  const [calendarEvents, setCalendarEvents] = useState(_events);
  const [fundraisingData, setFundraisingDataState] = useState({ ..._fundraiser });
  const [products, setProducts] = useState(_products);
  const [sponsors, setSponsors] = useState(_sponsors);
  const [teamUpdates, setTeamUpdates] = useState<TeamUpdate[]>(_updates);

  const store: AppStore = {
    teamInfo,
    primaryColor,
    secondaryColor,
    athletes,
    calendarEvents,
    fundraisingData,
    products,
    sponsors,
    teamUpdates,
    heroStats,
    leaderboard,
    spotlightAthlete,
    announcements,
    setTeamInfo: (patch) => setTeamInfoState((t) => ({ ...t, ...patch })),
    setPrimaryColor,
    setSecondaryColor,
    setAthletes,
    setCalendarEvents,
    setFundraisingData: (patch) => setFundraisingDataState((d) => ({ ...d, ...patch })),
    setProducts,
    setSponsors,
    setTeamUpdates,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useAppStore(): AppStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppStore must be inside AppStoreProvider");
  return ctx;
}
