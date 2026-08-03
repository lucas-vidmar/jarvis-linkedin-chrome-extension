import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Jarvis Sync',
    permissions: ['identity'],
    oauth2: {
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      client_id: 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com',
    },
    host_permissions: [
      'https://www.linkedin.com/*',
      'https://gmail.googleapis.com/*',
      'https://www.googleapis.com/*',
    ],
  },
});
