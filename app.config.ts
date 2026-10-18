import type { ExpoConfig } from "expo/config";

const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? "";
const iosMapsKey = process.env.GOOGLE_MAPS_IOS_API_KEY ?? "";

const config: ExpoConfig = {
  name: "Geesling",
  slug: "geesling",
  scheme: "geesling",
  version: "1.0.0",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  backgroundColor: "#F6E7C1",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.geesling.app",
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "Geesling uses your location to start walks near you and show what's happening nearby.",
    },
  },
  android: {
    package: "com.geesling.app",
    adaptiveIcon: {
      backgroundColor: "#F6E7C1",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
    output: "single",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-location",
      { locationWhenInUsePermission: "Geesling uses your location to start walks near you and show what's happening nearby." },
    ],
    [
      "react-native-maps",
      {
        // Android always uses Google Maps; iOS uses Apple Maps unless a Google key is provided.
        androidGoogleMapsApiKey: androidMapsKey,
        ...(iosMapsKey ? { iosGoogleMapsApiKey: iosMapsKey } : {}),
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  owner: "bhargavmod",
  extra: {
    eas: { projectId: "9975ede2-7c74-4bf1-bc9b-a8c7b107165b" },
  },
};

export default config;
