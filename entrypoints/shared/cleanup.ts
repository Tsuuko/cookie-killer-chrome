import {
  CleanupDomainSummary,
  CleanupResult,
  CleanupSettings,
  hostnameMatchesWhitelist,
  normalizeDomain,
  normalizeOrigin,
  originMatchesWhitelist,
  patchSettings,
} from './settings';

const HTTP_URL_MATCH = /^https?:\/\//;

export async function cleanupNow(settings: CleanupSettings): Promise<CleanupResult> {
  const result: CleanupResult = {
    ok: true,
    startedAt: Date.now(),
    finishedAt: Date.now(),
    removedCookies: 0,
    domainSummaries: [],
    clearedLocalStorage: false,
    clearedSessionStorageTabs: 0,
    clearedHistory: false,
    errors: [],
  };

  const observedOrigins = await collectObservedOrigins(settings);
  const domainCounts = new Map<string, CleanupDomainSummary>();

  if (settings.targets.cookies) {
    await captureErrors(result, async () => {
      const cookieCounts = await removeNonWhitelistedCookies(settings);
      result.removedCookies = sumCounts(cookieCounts);
      mergeDomainCounts(domainCounts, cookieCounts, 'cookies');
    });
  }

  if (settings.targets.localStorage) {
    await captureErrors(result, async () => {
      await removeNonWhitelistedLocalStorage(settings, observedOrigins);
      result.clearedLocalStorage = true;
    });
  }

  if (settings.targets.sessionStorage) {
    await captureErrors(result, async () => {
      const sessionCounts = await clearOpenTabSessionStorage(settings);
      result.clearedSessionStorageTabs = sumCounts(sessionCounts);
      mergeDomainCounts(domainCounts, sessionCounts, 'sessionStorageTabs');
    });
  }

  if (settings.targets.history) {
    await captureErrors(result, async () => {
      await browser.browsingData.removeHistory({ since: 0 });
      result.clearedHistory = true;
    });
  }

  result.finishedAt = Date.now();
  result.ok = result.errors.length === 0;
  result.domainSummaries = Array.from(domainCounts.values())
    .sort((a, b) => (b.cookies + b.sessionStorageTabs) - (a.cookies + a.sessionStorageTabs));
  await patchSettings({
    lastCleanupAt: result.finishedAt,
    observedOrigins,
  });
  return result;
}

export async function rememberOpenTabOrigins(): Promise<void> {
  const settings = await import('./settings').then((module) => module.loadSettings());
  const observedOrigins = await collectObservedOrigins(settings);
  await patchSettings({ observedOrigins });
}

async function removeNonWhitelistedCookies(
  settings: CleanupSettings,
): Promise<Map<string, number>> {
  const cookies = await browser.cookies.getAll({});
  const counts = new Map<string, number>();

  await Promise.all(cookies.map(async (cookie) => {
    const hostname = cookie.domain.replace(/^\./, '');
    if (hostnameMatchesWhitelist(hostname, settings.whitelistDomains)) return;

    const url = `${cookie.secure ? 'https' : 'http'}://${hostname}${cookie.path}`;
    try {
      await browser.cookies.remove({
        url,
        name: cookie.name,
        storeId: cookie.storeId,
      });
    } catch {
      const fallbackUrl = `https://${hostname}${cookie.path}`;
      await browser.cookies.remove({
        url: fallbackUrl,
        name: cookie.name,
        storeId: cookie.storeId,
      });
    }

    counts.set(hostname, (counts.get(hostname) ?? 0) + 1);
  }));

  return counts;
}

async function removeNonWhitelistedLocalStorage(
  settings: CleanupSettings,
  observedOrigins: string[],
): Promise<void> {
  const explicitWhitelistOrigins = settings.whitelistDomains.flatMap((domain) => {
    const normalizedDomain = normalizeDomain(domain);
    return normalizedDomain ? [`http://${normalizedDomain}`, `https://${normalizedDomain}`] : [];
  });
  const excludeOrigins = Array.from(new Set([
    ...explicitWhitelistOrigins,
    ...observedOrigins.filter((origin) =>
      originMatchesWhitelist(origin, settings.whitelistDomains),
    ),
  ])).sort();

  await browser.browsingData.remove(
    excludeOrigins.length > 0 ? { excludeOrigins } : {},
    { localStorage: true },
  );
}

async function clearOpenTabSessionStorage(
  settings: CleanupSettings,
): Promise<Map<string, number>> {
  const tabs = await browser.tabs.query({});
  const counts = new Map<string, number>();

  await Promise.all(tabs.map(async (tab) => {
    if (!tab.id || !tab.url || !HTTP_URL_MATCH.test(tab.url)) return;
    const origin = normalizeOrigin(tab.url);
    if (!origin || originMatchesWhitelist(origin, settings.whitelistDomains)) return;

    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          sessionStorage.clear();
        },
      });
      const hostname = new URL(origin).hostname;
      counts.set(hostname, (counts.get(hostname) ?? 0) + 1);
    } catch {
      // Chrome internal pages and restricted pages cannot receive injected scripts.
    }
  }));

  return counts;
}

async function collectObservedOrigins(settings: CleanupSettings): Promise<string[]> {
  const tabs = await browser.tabs.query({});
  const currentOrigins = tabs
    .map((tab) => tab.url ? normalizeOrigin(tab.url) : null)
    .filter((origin): origin is string => origin !== null);
  return Array.from(new Set([...settings.observedOrigins, ...currentOrigins])).sort();
}

async function captureErrors(result: CleanupResult, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
}

function mergeDomainCounts(
  summaries: Map<string, CleanupDomainSummary>,
  counts: Map<string, number>,
  key: 'cookies' | 'sessionStorageTabs',
): void {
  counts.forEach((count, domain) => {
    const current = summaries.get(domain) ?? {
      domain,
      cookies: 0,
      sessionStorageTabs: 0,
    };
    current[key] += count;
    summaries.set(domain, current);
  });
}

function sumCounts(counts: Map<string, number>): number {
  return Array.from(counts.values()).reduce((total, count) => total + count, 0);
}
