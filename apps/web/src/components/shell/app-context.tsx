"use client";

import * as React from "react";

export interface AppUser {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface AppInfo {
  isDemo: boolean;
  authEnabled: boolean;
  user: AppUser;
}

interface AppContextValue extends AppInfo {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  cheatsheetOpen: boolean;
  setCheatsheetOpen: (open: boolean) => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppProvider({ info, children }: { info: AppInfo; children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const value = React.useMemo(
    () => ({
      ...info,
      paletteOpen,
      setPaletteOpen,
      cheatsheetOpen,
      setCheatsheetOpen,
      addOpen,
      setAddOpen,
    }),
    [info, paletteOpen, cheatsheetOpen, addOpen],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
