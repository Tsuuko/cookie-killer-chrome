import { cleanupNow, rememberOpenTabOrigins } from './shared/cleanup';
import { loadSettings, patchSettings } from './shared/settings';

const MENU_TOGGLE_AUTO = 'toggle-auto-cleanup';
const MENU_OPEN_OPTIONS = 'open-options';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await setupContextMenus();
  });

  browser.runtime.onStartup.addListener(async () => {
    await setupContextMenus();
    await runAutoCleanup();
  });

  browser.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId === MENU_TOGGLE_AUTO) {
      const settings = await loadSettings();
      await patchSettings({ autoCleanupEnabled: !settings.autoCleanupEnabled });
      await setupContextMenus();
    }

    if (info.menuItemId === MENU_OPEN_OPTIONS) {
      await browser.runtime.openOptionsPage();
    }
  });

  browser.windows.onRemoved.addListener(async () => {
    const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
    if (windows.length === 0) {
      await runAutoCleanup();
    }
  });

  browser.tabs.onUpdated.addListener(async (_tabId, changeInfo) => {
    if (changeInfo.url) {
      await rememberOpenTabOrigins();
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'cleanup-now') {
      return cleanupNow(message.settings);
    }

    if (message?.type === 'refresh-context-menu') {
      return setupContextMenus();
    }
  });
});

async function runAutoCleanup(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.autoCleanupEnabled) return;
  await cleanupNow(settings);
}

async function setupContextMenus(): Promise<void> {
  const settings = await loadSettings();
  await browser.contextMenus.removeAll();
  await browser.contextMenus.create({
    id: MENU_TOGGLE_AUTO,
    title: settings.autoCleanupEnabled ? '自動削除をオフにする' : '自動削除をオンにする',
    contexts: ['action'],
  });
  await browser.contextMenus.create({
    id: MENU_OPEN_OPTIONS,
    title: '設定を開く',
    contexts: ['action'],
  });
}
