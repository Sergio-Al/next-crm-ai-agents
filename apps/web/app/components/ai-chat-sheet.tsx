"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ChatPanel, type ChatContext } from "./chat-panel";

const MIN_WIDTH = 360;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 520;

interface AiChatSheetProps {
  context: ChatContext;
}

export function AiChatSheet({ context }: AiChatSheetProps) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const t = useTranslations("aiChat");

  const handleOpen = useCallback(() => {
    setKey((k) => k + 1);
    setOpen(true);
  }, []);

  // Drag-to-resize handler
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const newWidth = window.innerWidth - e.clientX;
    setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <>
      {/* Floating AI button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center size-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-105 transition-all duration-300 group"
        title={t("floatButtonLabel")}
      >
        <Sparkles
          strokeWidth={1.5}
          className="size-6 group-hover:rotate-12 transition-transform duration-300"
        />
      </button>

      {/* Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton
          className="w-full p-0 flex flex-col"
          style={{ maxWidth: width }}
        >
          {/* Resize handle */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute inset-y-0 left-0 w-1.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-50"
          />
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs uppercase">
                {context.type === "deal" ? t("sheetTitleDeal") : context.type === "order" ? t("sheetTitleOrder") : t("sheetTitleContact")}
              </Badge>
              <SheetTitle className="text-sm truncate">
                {context.label}
              </SheetTitle>
            </div>
            <SheetDescription className="sr-only">
              {t("floatButtonLabel")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0">
            <ChatPanel key={key} context={context} compact />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
