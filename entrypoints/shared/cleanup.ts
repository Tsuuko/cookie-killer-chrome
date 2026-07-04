import {
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
    clearedLocalStorage: false,
    clearedSessionStorageTabs: 0,
    clearedHistory: false,
    errors: [],
  };

  const observedOrigins = await collectObservedOrigins(settings);

  if (settings.targets.cookies) {
    await captureErrors(result, async () => {
      result.removedCookies = await removeNonWhitelistedCookies(settings);
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
      result.clearedSessionStorageTabs = await clearOpenTabSessionStorage(settings);
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

async function removeNonWhitelistedCookies(settings: CleanupSettings): Promise<number> {
  const cookies = await browser.cookies.getAll({});
  let removed = 0;

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
      removed += 1;
    } catch {
      const fallbackUrl = `https://${hostname}${cookie.path}`;
      await browser.cookies.remove({
        url: fallbackUrl,
        name: cookie.name,
        storeId: cookie.storeId,
      });
      removed += 1;
    }
  }));

  return removed;
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

async function clearOpenTabSessionStorage(settings: CleanupSettings): Promise<number> {
  const tabs = await browser.tabs.query({});
  let cleared = 0;

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
      cleared += 1;
    } catch {
      // Chrome internal pages and restricted pages cannot receive injected scripts.
    }
  }));

  return cleared;
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
