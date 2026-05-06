export type ChatEntityType = "account" | "contact";

const ENTITY_ROUTE_SEGMENTS: Record<ChatEntityType, string> = {
  account: "accounts",
  contact: "contacts",
};

function getLocalePrefix(pathname: string): string {
  const match = pathname.match(/^\/([a-z]{2})(?=\/|$)/i);
  return match ? `/${match[1]}` : "";
}

export function isChatPath(pathname: string): boolean {
  return pathname === "/chat" || /\/[a-z]{2}\/chat$/i.test(pathname);
}

export function getEntityPageHref(pathname: string, type: ChatEntityType, id: string): string {
  const localePrefix = getLocalePrefix(pathname);
  return `${localePrefix}/${ENTITY_ROUTE_SEGMENTS[type]}/${id}`;
}

export function buildChatDrawerHref({
  pathname,
  conversationId,
  drawerType,
  drawerId,
}: {
  pathname: string;
  conversationId?: string | null;
  drawerType: ChatEntityType;
  drawerId: string;
}): string {
  const params = new URLSearchParams();
  if (conversationId) {
    params.set("id", conversationId);
  }
  params.set("drawerType", drawerType);
  params.set("drawerId", drawerId);
  return `${pathname}?${params.toString()}`;
}

export function stripDrawerParams(searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams.toString());
  next.delete("drawerType");
  next.delete("drawerId");
  const query = next.toString();
  return query ? `?${query}` : "";
}

export function getDrawerTargetFromUrl(url: URL):
  | { type: ChatEntityType; id: string }
  | null {
  const drawerType = url.searchParams.get("drawerType");
  const drawerId = url.searchParams.get("drawerId");
  if (
    drawerId &&
    (drawerType === "account" || drawerType === "contact")
  ) {
    return { type: drawerType, id: drawerId };
  }

  const match = url.pathname.match(
    /\/(accounts|contacts)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  if (!match) {
    return null;
  }

  return {
    type: match[1].toLowerCase() === "accounts" ? "account" : "contact",
    id: match[2],
  };
}
