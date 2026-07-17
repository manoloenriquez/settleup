import { useEffect, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Connectivity + lifecycle wiring for React Query.
//
// - NetInfo drives `onlineManager`, so queries pause while offline and
//   refetch automatically when connectivity returns (`refetchOnReconnect`).
// - AppState drives `focusManager`, so returning to the foreground behaves
//   like a window focus (`refetchOnWindowFocus`) — the mobile equivalent of
//   the web's tab-visibility refresh.
//
// Call once from the root layout. Returns an unsubscribe for completeness.
// ---------------------------------------------------------------------------

export function setupReactQueryNetworkWiring(): () => void {
  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    // isInternetReachable is null while undetermined — treat null as online
    // so we never suppress requests on an uncertain signal.
    onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  });

  const appStateSubscription = AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
  });

  return () => {
    unsubscribeNetInfo();
    appStateSubscription.remove();
  };
}

/** Re-renders when React Query's online state changes. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(onlineManager.isOnline());

  useEffect(() => {
    return onlineManager.subscribe(setOnline);
  }, []);

  return online;
}
