"use client";

/**
 * cover-popover.tsx
 *
 * Body-level singleton cover-art popover.
 *
 * Usage:
 *   1. Mount <CoverPopoverHost /> once near the root of the confirm-imports subtree.
 *   2. Spread useCoverPopoverTriggerProps(thumbnailUrl, label) onto any trigger element.
 *
 * Behaviour:
 *   - Single fixed-position <div> appended via React portal to document.body.
 *   - Default placement: right of trigger; flips left if it would overflow.
 *   - Vertically centered against the trigger, clamped to viewport with 12 px margin.
 *   - Dismissed on any scroll of window or the cards-scroll element, and on resize.
 *   - On touch / non-hover devices (hover:hover false OR innerWidth ≤ 640) all
 *     listeners are skipped — no popover.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

// ─── Constants ───────────────────────────────────────────────────────────────

const POP_W = 120;
const POP_H = 180;
const GAP = 12;
const EDGE = 12;

// ─── Context ─────────────────────────────────────────────────────────────────

interface PopoverState {
  visible: boolean;
  left: number;
  top: number;
  url: string;
  label: string;
}

interface CoverPopoverContextValue {
  show: (triggerRect: DOMRect, url: string, label: string) => void;
  hide: () => void;
  /** Ref to the cards-scroll element so we can register scroll listener */
  registerScrollContainer: (el: HTMLElement | null) => void;
}

const CoverPopoverContext = createContext<CoverPopoverContextValue | null>(null);

// ─── Host (provider) ─────────────────────────────────────────────────────────

/**
 * Mount once inside the confirm-imports subtree. Renders the portal popover
 * and exposes context so triggers can talk to it.
 */
export function CoverPopoverHost({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PopoverState>({
    visible: false,
    left: 0,
    top: 0,
    url: "",
    label: "",
  });

  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Determine once whether this device supports hover — compute on client only
  const hoverCapableRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    hoverCapableRef.current =
      window.matchMedia("(hover: hover)").matches && window.innerWidth > 640;
  }, []);

  const hide = useCallback(() => {
    setState((s) => (s.visible ? { ...s, visible: false } : s));
  }, []);

  const show = useCallback(
    (triggerRect: DOMRect, url: string, label: string) => {
      if (!hoverCapableRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Default: right of trigger
      let left = triggerRect.right + GAP;
      // Flip left if overflow
      if (left + POP_W > vw - EDGE) {
        left = triggerRect.left - GAP - POP_W;
      }
      // Final horizontal clamp
      if (left < EDGE) left = EDGE;
      if (left + POP_W > vw - EDGE) left = vw - EDGE - POP_W;

      // Vertically centered against trigger, clamped
      let top =
        triggerRect.top + triggerRect.height / 2 - POP_H / 2;
      if (top < EDGE) top = EDGE;
      if (top + POP_H > vh - EDGE) top = vh - EDGE - POP_H;

      setState({ visible: true, left, top, url, label });
    },
    []
  );

  const registerScrollContainer = useCallback(
    (el: HTMLElement | null) => {
      // Remove old listener if container changes
      if (scrollContainerRef.current) {
        scrollContainerRef.current.removeEventListener("scroll", hide);
      }
      scrollContainerRef.current = el;
      if (el) {
        el.addEventListener("scroll", hide, { passive: true });
      }
    },
    [hide]
  );

  // Window-level dismiss listeners
  useEffect(() => {
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide);
      window.removeEventListener("resize", hide);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.removeEventListener("scroll", hide);
      }
    };
  }, [hide]);

  const ctxValue: CoverPopoverContextValue = {
    show,
    hide,
    registerScrollContainer,
  };

  return (
    <CoverPopoverContext.Provider value={ctxValue}>
      {children}
      {mounted &&
        createPortal(
          <div
            className={`iw-cover-pop${state.visible ? " is-visible" : ""}`}
            aria-hidden="true"
            style={{ left: state.left, top: state.top }}
          >
            {state.url ? (
              <Image
                src={state.url}
                alt={state.label}
                width={POP_W}
                height={POP_H}
                className="iw-cover-pop__img"
                unoptimized
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                className="iw-cover-pop__placeholder"
                style={{ width: "100%", height: "100%" }}
              />
            )}
            {state.label && (
              <em className="iw-cover-pop__label">{state.label}</em>
            )}
          </div>,
          document.body
        )}
    </CoverPopoverContext.Provider>
  );
}

// ─── Trigger helper ───────────────────────────────────────────────────────────

/**
 * Returns props to spread onto a trigger element (the cover thumbnail wrapper).
 * The popover will appear on mouseenter/focus and hide on mouseleave/blur.
 */
export function useCoverPopoverTriggerProps(
  url: string | undefined,
  label: string
) {
  const ctx = useContext(CoverPopoverContext);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!ctx || !url) return;
      ctx.show(e.currentTarget.getBoundingClientRect(), url, label);
    },
    [ctx, url, label]
  );

  const handleMouseLeave = useCallback(() => {
    ctx?.hide();
  }, [ctx]);

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      if (!ctx || !url) return;
      ctx.show(e.currentTarget.getBoundingClientRect(), url, label);
    },
    [ctx, url, label]
  );

  const handleBlur = useCallback(() => {
    ctx?.hide();
  }, [ctx]);

  return {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
  };
}

// ─── Scroll container registration helper ────────────────────────────────────

/**
 * Call this from the scroll-panel component to register its scroll container
 * so the popover can be dismissed when the user scrolls.
 */
export function useCoverPopoverScrollRef() {
  const ctx = useContext(CoverPopoverContext);
  return useCallback(
    (el: HTMLElement | null) => {
      ctx?.registerScrollContainer(el);
    },
    [ctx]
  );
}
