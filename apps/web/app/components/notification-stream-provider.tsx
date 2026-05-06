"use client";

import { useEffect, useRef } from "react";
import { Toaster, sileo } from "sileo";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { SseNotification } from "@crm-agent/shared/types/events";

/**
 * Mounts the Sileo <Toaster /> and opens a single EventSource to
 * `/api/notifications/stream`. Incoming `notification` SSE events fire a
 * toast and dispatch a window event so the bell can refresh its count.
 *
 * The bell listens for `notifications:refresh` to bump unread count without
 * polling.
 */
export function NotificationStreamProvider() {
  const router = useRouter();
  const tToast = useTranslations("notifications");
  // Avoid recreating the EventSource on every render
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (sourceRef.current) return;

    const es = new EventSource("/api/notifications/stream");
    sourceRef.current = es;

    es.addEventListener("notification", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as SseNotification;
        sileo.success({
          title: data.title,
          description: data.body ?? undefined,
          button: data.link
            ? {
                title: tToast("view"),
                onClick: () => router.push(data.link as never),
              }
            : undefined,
        });
        window.dispatchEvent(new CustomEvent("notifications:refresh"));
      } catch (err) {
        console.error("[NotificationStream] parse failed", err);
      }
    });

    es.onerror = () => {
      // Browser will auto-reconnect; nothing to do here
    };

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [router, tToast]);

  return <Toaster position="top-right" />;
}
