import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.saisai.accounting",
  appName: "سای‌سای",
  webDir: "dist",
  bundledWebRuntime: false,
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
  },
  server: {
    androidScheme: "https"
  }
};

export default config;
