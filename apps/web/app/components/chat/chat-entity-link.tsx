"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildChatDrawerHref,
  getEntityPageHref,
  isChatPath,
  type ChatEntityType,
} from "@/lib/chat-entity-navigation";

interface ChatEntityLinkProps {
  type: ChatEntityType;
  entityId: string;
  children: ReactNode;
  className?: string;
  title?: string;
  mode?: "push" | "replace";
}

export function ChatEntityLink({
  type,
  entityId,
  children,
  className,
  title,
  mode = "push",
}: ChatEntityLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const canonicalHref = getEntityPageHref(pathname, type, entityId);
  const drawerHref = buildChatDrawerHref({
    pathname,
    conversationId: searchParams.get("id"),
    drawerType: type,
    drawerId: entityId,
  });

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !isChatPath(pathname)
      ) {
        return;
      }

      if (window.matchMedia("(max-width: 767px)").matches) {
        return;
      }

      event.preventDefault();
      if (mode === "replace") {
        router.replace(drawerHref);
        return;
      }
      router.push(drawerHref);
    },
    [drawerHref, mode, pathname, router],
  );

  return (
    <a
      href={canonicalHref}
      className={className}
      onClick={handleClick}
      title={title}
    >
      {children}
    </a>
  );
}
