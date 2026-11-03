export interface ComponentMountContext {
  container: HTMLElement;
  navigate: (path: string) => void;
}

export type ShowcaseModuleKey = "idcard" | "presensi" | "sampah" | "perpus" | "ekskul";

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
