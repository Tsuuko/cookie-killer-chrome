import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Cookie Killer',
    description: 'Whitelist-based cleanup for cookies, localStorage, sessionStorage, and history.',
    permissions: [
      'storage',
      'cookies',
      'browsingData',
      'contextMenus',
      'tabs',
      'scripting',
      'history',
    ],
    host_permissions: ['<all_urls>'],
  },
});
