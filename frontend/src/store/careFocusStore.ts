/**
 * The care focus, shared by every screen without a provider.
 *
 * The list of references lives on the server (GET/PUT /v1/contexts/focus/),
 * per record owner, so a care proxy sees the owner's focus. It is cached here
 * per owner and ranked locally with the same rules as the server, so the
 * dashboard reorders the moment a condition's severity changes.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { fetchCareFocus, saveCareFocus } from "@/services/contexts";
import { rankFocus, type FocusRef, type RankedFocus } from "@/lib/careFocus";
import { useCareProxy } from "@/store/CareProxyContext";
import { useRecords } from "@/store/RecordsContext";

type Entry = { refs: FocusRef[]; loaded: boolean };
const cache = new Map<string, Entry>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const EMPTY: Entry = { refs: [], loaded: false };

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function load(owner: string) {
  if (loading.has(owner)) return;
  loading.add(owner);
  try {
    const res = await fetchCareFocus();
    cache.set(owner, { refs: res.focus ?? [], loaded: true });
  } catch {
    cache.set(owner, { refs: [], loaded: true });
  } finally {
    loading.delete(owner);
    emit();
  }
}

export interface CareFocusState {
  refs: FocusRef[];
  ranked: RankedFocus[];
  loaded: boolean;
  save: (refs: FocusRef[]) => Promise<RankedFocus[]>;
}

export function useCareFocus(): CareFocusState {
  const { activeOwnerId } = useCareProxy();
  const { conditions } = useRecords();
  const owner = activeOwnerId || "self";
  const entry = useSyncExternalStore(subscribe, () => cache.get(owner) ?? EMPTY);

  useEffect(() => {
    if (!cache.get(owner)?.loaded) void load(owner);
  }, [owner]);

  const ranked = useMemo(() => rankFocus(entry.refs, conditions), [entry.refs, conditions]);

  const save = useCallback(
    async (refs: FocusRef[]) => {
      const previous = cache.get(owner) ?? EMPTY;
      cache.set(owner, { refs, loaded: true });
      emit();
      try {
        const res = await saveCareFocus(refs);
        cache.set(owner, { refs: res.focus, loaded: true });
        emit();
        return rankFocus(res.focus, conditions);
      } catch (err) {
        cache.set(owner, previous);
        emit();
        throw err;
      }
    },
    [owner, conditions],
  );

  return { refs: entry.refs, ranked, loaded: entry.loaded, save };
}
