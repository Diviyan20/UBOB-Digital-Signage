import 'dotenv/config';

export default {
  expo: {
    name: 'Digital-Signage-System',
    slug: 'Digital-Signage-System',
    version: '1.0.0',
    updates: {
      "url": "https://u.expo.dev/9a8ee31b-345f-47d4-a806-9ffe6d107fd8",
      "fallbackToCacheTimeout": 0,
      "checkAutomatically": "ON_LOAD"
    },
    runtimeVersion: {
    "policy": "appVersion"
  },
    orientation: 'landscape',
    scheme: 'digitalsignagesystem',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true
    },
    android: {
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: 'com.diviyan.digitalsignagesystem'
    },
    plugins: [
      'expo-router'
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      EXPO_PUBLIC_ORDER_TRACKING_BASE_URL: process.env.EXPO_PUBLIC_ORDER_TRACKING_BASE_URL,
      router: {},
      eas: {
        projectId: '9a8ee31b-345f-47d4-a806-9ffe6d107fd8'
      }
    },
    owner: 'diviyan'
  },
};