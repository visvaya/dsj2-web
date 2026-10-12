import { useEffect, useState } from "react";
import { INITIAL_OFFLINE_STATE, offlineSupportWanted, reduceOffline, type OfflineState } from "../pwa/offline-state";
import { PWA_CONFIG } from "../pwa/pwa-config";
import { browserOfflineEnvironment, startOfflineSupport } from "../pwa/service-worker-client";

function serviceWorkerContainer(): ServiceWorkerContainer | null {
  // Missing in older browsers and in the private windows of some.
  const container = "serviceWorker" in navigator ? navigator.serviceWorker : null;
  const wanted = offlineSupportWanted({
    production: import.meta.env.PROD,
    secureContext: window.isSecureContext,
    supported: container !== null,
    marked: document.querySelector(`meta[name="${PWA_CONFIG.MARKER_META_NAME}"]`) !== null,
  });
  return wanted ? container : null;
}

/**
 * Registers the service worker where the page is meant to have one and follows what it reports. Null where
 * the game has no offline mode at all (the single-file page, the development server, an insecure address).
 */
export function useOfflineState(): OfflineState | null {
  const [container] = useState(serviceWorkerContainer);
  const [state, setState] = useState<OfflineState | null>(() => (container === null ? null : INITIAL_OFFLINE_STATE));
  useEffect(() => {
    if (container === null) return undefined;
    return startOfflineSupport(browserOfflineEnvironment(container), (event) => {
      setState((previous) => (previous === null ? null : reduceOffline(previous, event)));
    });
  }, [container]);
  return state;
}
