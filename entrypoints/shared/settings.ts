export type CleanupTarget = 'cookies' | 'localStorage' | 'sessionStorage' | 'history';

export type CleanupSettings = {
  whitelistDomains: string[];
  targets: Record<CleanupTarget, boolean>;
  autoCleanupEnabled: boolean;
  lastCleanupAt: number | null;
  observedOrigins: string[];
};

export type CleanupResult = {
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  removedCookies: number;
  clearedLocalStorage: boolean;
  clearedSessionStorageTabs: number;
  clearedHistory: boolean;
  errors: string[];
};

export const DEFAULT_SETTINGS: CleanupSettings = {
  whitelistDomains: [],
  targets: {
    cookies: true,
    localStorage: true,
    sessionStorage: true,
    history: false,
  },
  autoCleanupEnabled: false,
  lastCleanupAt: null,
  observedOrigins: [],
};

const SETTINGS_KEY = 'cleanupSettings';

export async function loadSettings(): Promise<CleanupSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: CleanupSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}

export async function patchSettings(
  patch: Partial<CleanupSettings>,
): Promise<CleanupSettings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await saveSettings(next);
  return next;
}

export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  let host = trimmed;
  try {
    host = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    host = trimmed.split('/')[0] ?? '';
  }

  host = host.replace(/^\*\./, '').replace(/^\.+|\.+$/g, '');
  if (!host || host.includes(' ') || !host.includes('.')) return null;
  return host;
}

export function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function hostnameMatchesWhitelist(
  hostname: string,
  whitelistDomains: string[],
): boolean {
  const normalizedHost = hostname.toLowerCase().replace(/^\.+|\.+$/g, '');
  return whitelistDomains.some((domain) => {
    const normalizedDomain = normalizeDomain(domain);
    return (
      normalizedDomain !== null &&
      (normalizedHost === normalizedDomain ||
        normalizedHost.endsWith(`.${normalizedDomain}`))
    );
  });
}

export function originMatchesWhitelist(
  origin: string,
  whitelistDomains: string[],
): boolean {
  try {
    return hostnameMatchesWhitelist(new URL(origin).hostname, whitelistDomains);
  } catch {
    return false;
  }
}

export function dedupeSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function normalizeSettings(value: unknown): CleanupSettings {
  const partial = typeof value === 'object' && value !== null ? value as Partial<CleanupSettings> : {};
  const targets = typeof partial.targets === 'object' && partial.targets !== null
    ? partial.targets
    : DEFAULT_SETTINGS.targets;

  return {
    whitelistDomains: dedupeSorted(
      Array.isArray(partial.whitelistDomains)
        ? partial.whitelistDomains
            .map((domain) => normalizeDomain(String(domain)))
            .filter((domain): domain is string => domain !== null)
        : DEFAULT_SETTINGS.whitelistDomains,
    ),
    targets: {
      cookies: Boolean(targets.cookies),
      localStorage: Boolean(targets.localStorage),
      sessionStorage: Boolean(targets.sessionStorage),
      history: Boolean(targets.history),
    },
    autoCleanupEnabled: Boolean(partial.autoCleanupEnabled),
    lastCleanupAt:
      typeof partial.lastCleanupAt === 'number' ? partial.lastCleanupAt : null,
    observedOrigins: dedupeSorted(
      Array.isArray(partial.observedOrigins)
        ? partial.observedOrigins
            .map((origin) => normalizeOrigin(String(origin)))
            .filter((origin): origin is string => origin !== null)
        : DEFAULT_SETTINGS.observedOrigins,
    ),
  };
}
