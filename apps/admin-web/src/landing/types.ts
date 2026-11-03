export interface ComponentMountContext {
  container: HTMLElement;
  navigate: (path: string) => void;
}

export type ShowcaseModuleKey =
  | "idcard"
  | "presensi"
  | "parent"
  | "sampah"
  | "perpus"
  | "ekskul"
  | "command";

export interface ShowcaseModule {
  id: ShowcaseModuleKey;
  title: string;
  subtitle: string;
  icon: string;
  badge: string;
  features: string[];
  statusLabel: string;
  metricBadge: string;
}

export interface StakeholderBenefit {
  role: string;
  icon: string;
  tagline: string;
  benefits: string[];
  themeColorClass: "sage" | "lime" | "blue" | "sand";
}
