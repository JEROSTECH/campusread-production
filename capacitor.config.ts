import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.campusread.app',
  appName: 'CampusRead',
  webDir: 'dist',

  server: {
    url: 'https://campusread.org',
    cleartext: false
  }
};

export default config;