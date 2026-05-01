import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cliopatra.app',
  appName: 'Cliopatra Social',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: false,
  },
  server: {
    // OAuth callbacks redirect through these origins; whitelist them so the
    // in-app webview handles the redirect instead of bouncing out to Safari.
    // cliopatra.app is production; creatorcommand.app stays whitelisted until
    // the domain swap completes.
    allowNavigation: [
      'cliopatra.app',
      '*.cliopatra.app',
      'creatorcommand.app',
      '*.creatorcommand.app',
      'mlionhgievukulyufnnr.supabase.co',
      'accounts.google.com',
      '*.facebook.com',
      'www.tiktok.com',
      'open-api.tiktok.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#F7F4EE', // cream — matches Auth.tsx background
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      // Cream background needs dark content (text/icons) on top
      style: 'DARK',
      backgroundColor: '#F7F4EE',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'LIGHT',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
