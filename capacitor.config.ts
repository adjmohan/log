import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anonymous.pro',
  appName: 'MQTT',
  webDir: 'dist',
  server: {
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,       // show native splash for 2 seconds
      launchAutoHide: true,           // auto-hide after duration
      launchFadeOutDuration: 500,     // fade out over 500ms
      backgroundColor: '#050B15',    // exact match to app background
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
