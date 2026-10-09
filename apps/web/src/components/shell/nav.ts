import {
  Activity,
  ChartColumnBig,
  Columns3,
  FolderGit2,
  GraduationCap,
  Inbox,
  Rows3,
  Settings2,
  Sun,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Second key of the `g <key>` chord. */
  chord: string;
  mobile?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: Sun, chord: "t", mobile: true },
  { href: "/pipeline", label: "Pipeline", icon: Columns3, chord: "p", mobile: true },
  { href: "/items", label: "All items", icon: Rows3, chord: "i", mobile: true },
  { href: "/inbox", label: "Inbox", icon: Inbox, chord: "n", mobile: true },
  { href: "/repos", label: "Repos", icon: FolderGit2, chord: "r" },
  { href: "/programs", label: "Programs", icon: GraduationCap, chord: "g" },
  { href: "/insights", label: "Insights", icon: ChartColumnBig, chord: "x" },
  { href: "/sync", label: "Sync log", icon: Activity, chord: "l" },
  { href: "/settings", label: "Settings", icon: Settings2, chord: "s" },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
