import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elitelevelfundraising.team',
  appName: 'ELF Team',
  webDir: 'public',
  server: {
    url: 'https://app.elitelevelfundraising.com',
    cleartext: false
  }
};

export default config;
