"use client";

import { useState, useCallback } from "react";
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

interface AiChatSheetProps {
  context: ChatContext;
}

export function AiChatSheet({ context }: AiChatSheetProps) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const t = useTranslations("aiChat");

  const handleOpen = useCallback(() => {
    setKey((k) => k + 1);
    setOpen(true);
  }, []);

  return (
    <>
      {/* Floating AI button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center size-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105 transition-all duration-300 group"
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
          className="sm:max-w-[520px] w-full p-0 flex flex-col"
        >
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs uppercase">
                {context.type === "deal" ? t("sheetTitleDeal") : t("sheetTitleContact")}
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
