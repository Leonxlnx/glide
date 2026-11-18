// Minimal external store + hook.
import { useSyncExternalStore, useRef } from 'react';

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      subs.forEach((f) => f());
    },
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}

export function useStore(store, selector = (s) => s) {
  const sel = useRef(selector);
  sel.current = selector;
  return useSyncExternalStore(store.subscribe, () => sel.current(store.get()));
}
