import { useSyncExternalStore } from "react";

/** Nothing to subscribe to — the value flips once, at hydration. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` during SSR and the hydration pass, `true` afterwards.
 *
 * Use it to gate browser-only rendering (portals, `window` measurements)
 * without a `setState` in an effect, which costs an extra render pass and
 * trips `react-hooks/set-state-in-effect`.
 */
export const useIsMounted = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
