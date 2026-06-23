"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Ribbon slot system.
 *
 * A single sticky contextual ribbon lives below the CommandBar. Pages fill it
 * by rendering `<RibbonSlot>{...controls}</RibbonSlot>` somewhere in their
 * tree.
 *
 * Implementation notes:
 *
 * - The shell publishes a portal target (a `<div>` it renders inside the
 *   command bar) via `useRibbonMount()`. Pages render `<RibbonSlot>` which
 *   uses `createPortal` to render its children INTO that target.
 *
 * - This keeps the children inside the page's React subtree even though they
 *   appear in the command bar visually — so React context from the page
 *   (e.g. a Radix `<Tabs>` root wrapping the page body) propagates correctly
 *   to controls rendered in the ribbon. Storing children as a ReactNode and
 *   re-rendering them elsewhere would break that.
 *
 * - We track active slot ids in a Set so the shell can hide the ribbon row
 *   (zero height) when no page has filled it.
 */

interface RibbonContextValue {
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
  activeSlots: number;
  registerSlot: (id: string) => () => void;
}

const RibbonContext = createContext<RibbonContextValue | null>(null);

export function RibbonProvider({ children }: { children: React.ReactNode }) {
  const [target, setTargetState] = useState<HTMLElement | null>(null);
  const [slotIds, setSlotIds] = useState<Set<string>>(() => new Set());

  const setTarget = useCallback((el: HTMLElement | null) => {
    setTargetState(el);
  }, []);

  const registerSlot = useCallback((id: string) => {
    setSlotIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    return () => {
      setSlotIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
  }, []);

  const value = useMemo<RibbonContextValue>(
    () => ({
      target,
      setTarget,
      activeSlots: slotIds.size,
      registerSlot,
    }),
    [target, setTarget, slotIds, registerSlot],
  );

  return (
    <RibbonContext.Provider value={value}>{children}</RibbonContext.Provider>
  );
}

/**
 * Hook used by the shell. Returns the ref callback that captures the portal
 * target element, plus a boolean flagging whether any page has mounted a
 * slot (so the shell can collapse the ribbon row when empty).
 */
export function useRibbonMount(): {
  setTarget: (el: HTMLElement | null) => void;
  active: boolean;
} {
  const ctx = useContext(RibbonContext);
  return {
    setTarget: ctx?.setTarget ?? (() => undefined),
    active: (ctx?.activeSlots ?? 0) > 0,
  };
}

/**
 * Pages render `<RibbonSlot>{...}</RibbonSlot>` to fill the contextual ribbon.
 * Children are portaled into the command bar's ribbon target. The slot itself
 * renders nothing inline.
 *
 * Children remain inside the page's React subtree, so context (Radix Tabs,
 * form state, etc.) flows naturally from the page into the ribbon controls.
 *
 * Multiple slots can be mounted at once — they'll all render into the same
 * target, stacked in mount order. Mount only one per page in practice.
 */
export function RibbonSlot({ children }: { children: React.ReactNode }) {
  const ctx = useContext(RibbonContext);
  const id = useId();

  // CRITICAL: depend only on the stable `registerSlot` callback (wrapped in
  // useCallback with [] deps by RibbonProvider) and the stable `id` from
  // useId. Depending on the whole `ctx` object would cause an infinite
  // render loop — every registerSlot mutation creates a new slotIds Set,
  // which produces a new memoized `value` in the provider, which gives this
  // effect a new `ctx` reference, which re-runs the effect (cleanup
  // unregisters, body re-registers), which mutates state again, forever.
  // See React error #185.
  const registerSlot = ctx?.registerSlot;
  const target = ctx?.target ?? null;

  useEffect(() => {
    if (!registerSlot) return;
    return registerSlot(id);
  }, [registerSlot, id]);

  if (!target) return null;
  return createPortal(children, target);
}
