"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getEntityPageHref,
  stripDrawerParams,
  type ChatEntityType,
} from "@/lib/chat-entity-navigation";
import { AccountDrawerContent } from "./account-drawer-content";
import { ContactDrawerContent } from "./contact-drawer-content";

const MIN_WIDTH = 420;
const MAX_WIDTH = 920;
const DEFAULT_WIDTH = 620;

export function ChatEntityDrawer({
  type,
  entityId,
}: {
  type: ChatEntityType;
  entityId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("aiChat");
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);

  const closeHref = useMemo(() => {
    const query = stripDrawerParams(new URLSearchParams(searchParams.toString()));
    return `${pathname}${query}`;
  }, [pathname, searchParams]);

  const fullPageHref = useMemo(
    () => getEntityPageHref(pathname, type, entityId),
    [entityId, pathname, type],
  );

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) {
      return;
    }
    router.replace(fullPageHref);
  }, [fullPageHref, router]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      router.replace(closeHref);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const nextWidth = window.innerWidth - event.clientX;
    setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, nextWidth)));
  };

  return (
    <Sheet open onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className="w-full p-0 flex flex-col"
        style={{ maxWidth: width }}
      >
        <div
          onPointerDown={(event) => {
            event.preventDefault();
            setDragging(true);
            (event.target as HTMLElement).setPointerCapture(event.pointerId);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(false)}
          className="absolute inset-y-0 left-0 w-1.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-50"
        />
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle className="text-sm">
            {type === "account" ? t("sheetTitleAccount") : t("sheetTitleContact")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {type === "account" ? t("sheetTitleAccount") : t("sheetTitleContact")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          {type === "account" ? (
            <AccountDrawerContent
              accountId={entityId}
              onOpenFullPage={() => router.push(fullPageHref)}
            />
          ) : (
            <ContactDrawerContent
              contactId={entityId}
              onOpenFullPage={() => router.push(fullPageHref)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
