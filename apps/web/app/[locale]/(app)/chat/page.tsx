"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/chat-panel";
import { ConversationSidebar } from "@/components/conversation-sidebar";

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");
  const [refreshKey, setRefreshKey] = useState(0);

  // Stable key for ChatPanel — only changes on explicit user navigation,
  // NOT when replaceState updates the URL mid-stream (Next.js 15 syncs
  // replaceState with useSearchParams, which would otherwise remount ChatPanel
  // and destroy the active streaming useChat instance).
  const [panelKey, setPanelKey] = useState(activeId ?? "new");

  // Sync panelKey on browser back/forward navigation (popstate fires only
  // for back/forward, not for pushState or replaceState).
  useEffect(() => {
    const handler = () => {
      const id = new URLSearchParams(window.location.search).get("id");
      setPanelKey(id ?? "new");
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      setPanelKey(id);
      router.push(`/chat?id=${id}`);
    },
    [router],
  );

  const handleNewChat = useCallback(() => {
    setPanelKey("new");
    router.push("/chat");
  }, [router]);

  const handleConversationCreated = useCallback(
    (id: string) => {
      // Update URL for address bar / refresh without changing panelKey,
      // so the ChatPanel is NOT remounted and the stream stays alive.
      window.history.replaceState(null, "", `/chat?id=${id}`);
      setRefreshKey((k) => k + 1);
    },
    [],
  );

  return (
    <>
      <ConversationSidebar
        activeId={activeId}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        refreshKey={refreshKey}
      />
      <div className="flex-1 min-w-0">
        <ChatPanel
          key={panelKey}
          conversationId={panelKey === "new" ? null : panelKey}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    </>
  );
}
