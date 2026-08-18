import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '../entrypoints',
  manifest: {
    name: 'Jarvis Sync',
    permissions: ['identity', 'storage'],
    oauth2: {
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      client_id: '98831444529-vea88qlt53hm8m53mgnt67msqgb8gcul.apps.googleusercontent.com',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    host_permissions: [
      'https://www.linkedin.com/*',
      'https://crm.zoho.com/*',
      'https://gmail.googleapis.com/*',
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ],
  },
});
