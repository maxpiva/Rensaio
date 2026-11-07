"use client";

import { Download, LayoutGrid, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";

import { DownloadStatus } from "@/components/comp/layout/download-status";
import { ExternalLinks } from "@/components/comp/layout/external-links";
import {
  LiveDot,
  type SectionDef,
  useIsSectionActive,
  useManageSections,
  useSections,
} from "@/components/comp/layout/section-pills";
import { LEVEL_LABEL, UserAvatar } from "@/components/comp/layout/user-menu";
import { AddSeries } from "@/components/comp/series/add-series";
import { useImportWizard } from "@/components/providers/import-wizard-provider";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAuth } from "@/contexts/auth-context";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

/** Sections that get their own tab; everything else lives under More. */
const TAB_HREFS = ["/library", "/cloud-latest", "/queue"];

const tabClass =
  "relative flex min-h-[52px] flex-col items-center justify-center gap-[3px] rounded-lg text-[10.5px] font-semibold text-ink-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-ink [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:[stroke-width:1.6] aria-[current=page]:[&_svg]:text-accent-ink";

/** 2px crimson bar on top of the active tab. */
const tabActiveBar =
  "before:absolute before:left-1/2 before:top-[-5px] before:h-0.5 before:w-7 before:-translate-x-1/2 before:rounded-b-sm before:bg-primary before:opacity-0 aria-[current=page]:before:opacity-100";

/**
 * Phone / tablet (<1024px) bottom tab bar:
 *   Library · Just In · [＋ Add] · Queue · More
 * Tabs follow the same permission gating as the sidebar. "More" opens a
 * bottom sheet with the remaining sections, the Manage routes, Import
 * Series, download status and project links. Swiping right from the left
 * screen edge also opens it (the old nav-drawer gesture).
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const sections = useSections();
  const manage = useManageSections();
  const isActive = useIsSectionActive();
  const canAdd = usePermission("canAddSeries");
  const canRequest = usePermission("canRequestSeries");
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the More sheet when the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Close it when the window grows to the desktop layout: the sheet's content
  // is lg:hidden, but its overlay and modal lock would stay behind.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setMoreOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Swipe-from-left-edge opens the More sheet (preserved gesture).
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    if (t.clientX <= 24) {
      touchStartXRef.current = t.clientX;
      touchStartYRef.current = t.clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) {
      return;
    }
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartXRef.current;
    const dy = Math.abs(t.clientY - touchStartYRef.current);
    if (dx > 40 && dy < dx * 0.8) {
      if (window.matchMedia("(max-width: 1023.98px)").matches) setMoreOpen(true);
      touchStartXRef.current = null;
      touchStartYRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  }, []);

  useEffect(() => {
    const el = window;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const tabs = TAB_HREFS.map((h) => sections.find((s) => s.href === h)).filter(
    (s): s is SectionDef => !!s,
  );
  const moreSections = sections.filter((s) => !TAB_HREFS.includes(s.href));
  const moreItems = [...moreSections, ...manage];
  const moreActive = moreItems.some((s) => isActive(s.href));
  const showAdd = canAdd || canRequest;

  // Add sits in the middle of the visible items ([tab, tab, ADD, tab, More]),
  // even when permissions hide some tabs.
  const split = Math.floor((tabs.length + 1) / 2);
  const before = tabs.slice(0, split);
  const after = tabs.slice(split);

  return (
    <>
      <nav
        aria-label="Primary"
        className="relative z-30 grid shrink-0 auto-cols-fr grid-flow-col border-t border-rule-2 bg-glass px-1.5 pt-1 backdrop-blur-[18px] backdrop-saturate-[1.3] lg:hidden"
        style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom, 0px))" }}
      >
        {before.map((s) => (
          <TabLink key={s.href} item={s} active={isActive(s.href)} />
        ))}
        {showAdd && (
          <AddSeries triggerButton={<AddTabButton label={canAdd ? "Add" : "Request"} />} />
        )}
        {after.map((s) => (
          <TabLink key={s.href} item={s} active={isActive(s.href)} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-current={moreActive ? "page" : undefined}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(tabClass, tabActiveBar)}
        >
          <LayoutGrid aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} items={moreItems} />
    </>
  );
}

function TabLink({ item, active }: { item: SectionDef; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(tabClass, tabActiveBar)}
    >
      <Icon aria-hidden="true" />
      <span>{item.name}</span>
      {item.badge && item.badge > 0 ? (
        <span
          className={cn(
            "absolute left-[calc(50%+5px)] top-1 h-[17px] min-w-[17px] rounded-[3px] px-1 text-center font-mono text-[9.5px] font-bold leading-[17px] tabular-nums text-white",
            item.badgeTone === "bad" ? "bg-bad dark:text-paper" : "bg-primary",
          )}
          aria-label={`${item.badge} items`}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Centre "Add" tab: straight crimson seal button. Trigger for AddSeries.
 * A tap plays a short shake that settles back to straight (skipped when the
 * user prefers reduced motion).
 */
const AddTabButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(({ label, className, onClick, ...props }, ref) => {
  // Bumped on every tap; keying the seal on it remounts the span so the
  // shake restarts even on rapid repeat taps.
  const [shakeCount, setShakeCount] = useState(0);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label === "Add" ? "Add series" : "Request series"}
      className={cn(
        "group flex min-h-[52px] items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={(e) => {
        onClick?.(e);
        setShakeCount((n) => n + 1);
      }}
      {...props}
    >
      <span
        key={shakeCount}
        className={cn(
          "grid h-12 w-12 place-items-center rounded-md bg-primary text-primary-foreground shadow-[0_10px_22px_-10px_hsl(var(--primary)),inset_0_0_0_1.5px_rgba(255,255,255,.25)] transition-transform group-active:scale-95",
          shakeCount > 0 && "motion-safe:animate-seal-shake",
        )}
      >
        <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
      </span>
    </button>
  );
});
AddTabButton.displayName = "AddTabButton";

/* ─── More sheet ───────────────────────────────────────────────────────── */

function MoreSheet({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SectionDef[];
}) {
  const { user, canManage } = useAuth();
  const { startWizard } = useImportWizard();
  const isActive = useIsSectionActive();

  return (
    // A vaul drawer so the sheet can be dragged down to close; it draws the
    // grab handle itself. autoFocus moves focus into the sheet on open like
    // the old Radix Sheet did (vaul turns that off by default; there are no
    // text inputs here to pop up the keyboard).
    <Drawer open={open} onOpenChange={onOpenChange} autoFocus>
      <DrawerContent
        className="pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden"
        aria-describedby={undefined}
      >
        <DrawerTitle className="sr-only">More</DrawerTitle>
        <DrawerClose className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DrawerClose>

        {/* Scrolls inside the drawer on short screens. Not on DrawerContent:
            vaul extends that element with a tall ::after for over-drag,
            which would make it scrollable at every height. */}
        <div className="min-h-0 overflow-y-auto px-3.5">
          {user && (
            <div className="flex items-center gap-[11px] px-1 pb-3 pt-2.5">
              <UserAvatar
                username={user.username}
                avatarBase64={user.avatarBase64}
                avatarContentType={user.avatarContentType}
                className="h-10 w-10 text-[13px]"
              />
              <div className="min-w-0">
                <div className="truncate font-serif text-lg leading-tight text-ink">
                  {user.username}
                </div>
                <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3">
                  {LEVEL_LABEL[user.level] ?? "User"}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 pb-2.5 pt-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-[96px] flex-col items-start gap-1 rounded-lg border border-rule bg-paper p-3 text-left transition-colors hover:border-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:border-accent-line aria-[current=page]:bg-accent-soft"
                >
                  <Icon className="mb-auto h-5 w-5 text-accent-ink" aria-hidden="true" />
                  <b className="text-[13px] font-semibold leading-tight text-ink">{item.name}</b>
                  {item.hint ? (
                    <span className="flex items-center gap-1 font-mono text-[10.5px] font-medium text-ink-3">
                      {item.live ? <LiveDot /> : null}
                      {item.hint}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  startWizard();
                }}
                className="flex min-h-[96px] flex-col items-start gap-1 rounded-lg border border-rule bg-paper p-3 text-left transition-colors hover:border-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Download className="mb-auto h-5 w-5 text-accent-ink" aria-hidden="true" />
                <b className="text-[13px] font-semibold leading-tight text-ink">Import</b>
                <span className="font-mono text-[10.5px] font-medium text-ink-3">From disk</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-rule pt-3">
            <DownloadStatus variant="drawer" />
            <ExternalLinks />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
