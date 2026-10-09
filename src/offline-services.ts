export function initializeOfflineServices(): void {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined), { once: true });
  }
}

initializeOfflineServices();
