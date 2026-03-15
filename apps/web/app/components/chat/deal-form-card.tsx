"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Handshake, X, Search, Loader2 } from "lucide-react";

interface Stage {
  id: string;
  name: string;
  position: number;
}

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  companyName: string | null;
}

interface Props {
  args: {
    title?: string;
    value?: string;
    contactId?: string;
    stageId?: string;
  };
  toolCallId: string;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
}

export function DealFormCard({ args, toolCallId, addToolResult }: Props) {
  const t = useTranslations("dealForm");
  const tc = useTranslations("common");
  const [form, setForm] = useState({
    title: args.title ?? "",
    value: args.value ?? "",
    contactId: args.contactId ?? "",
    stageId: args.stageId ?? "",
  });
  const [stages, setStages] = useState<Stage[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Contact search state
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [contactSearching, setContactSearching] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactDropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/pipelines")
      .then((r) => r.json())
      .then((data) => {
        if (data.stages) setStages(data.stages);
      })
      .catch(() => {});
  }, []);

  // If contactId was pre-filled by the AI, resolve it to display name
  useEffect(() => {
    if (args.contactId) {
      fetch(`/api/contacts?search=${encodeURIComponent(args.contactId)}&limit=1`)
        .then((r) => r.json())
        .then((data) => {
          if (data.data?.[0]) {
            setSelectedContact(data.data[0]);
          }
        })
        .catch(() => {});
    }
  }, [args.contactId]);

  // Load initial contacts so dropdown isn't empty on focus
  useEffect(() => {
    fetch("/api/contacts?limit=5")
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setContactResults(data.data);
      })
      .catch(() => {});
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchContacts = useCallback((query: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setContactSearching(true);
      try {
        const res = await fetch(`/api/contacts?search=${encodeURIComponent(query)}&limit=8`);
        const data = await res.json();
        if (data.data) setContactResults(data.data);
      } catch {
        // ignore
      } finally {
        setContactSearching(false);
      }
    }, 250);
  }, []);

  const handleContactQueryChange = (value: string) => {
    setContactQuery(value);
    setShowContactDropdown(true);
    if (selectedContact) {
      setSelectedContact(null);
      setForm((f) => ({ ...f, contactId: "" }));
    }
    if (value.trim()) {
      searchContacts(value);
    } else {
      // Reset to initial contacts
      fetch("/api/contacts?limit=5")
        .then((r) => r.json())
        .then((data) => {
          if (data.data) setContactResults(data.data);
        })
        .catch(() => {});
    }
  };

  const handleSelectContact = (contact: ContactOption) => {
    setSelectedContact(contact);
    setForm((f) => ({ ...f, contactId: contact.id }));
    setContactQuery(`${contact.firstName} ${contact.lastName}`);
    setShowContactDropdown(false);
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setForm((f) => ({ ...f, contactId: "" }));
    setContactQuery("");
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          value: form.value || undefined,
          contactId: form.contactId || undefined,
          stageId: form.stageId || undefined,
        }),
      });
      const data = await res.json();
      addToolResult({
        toolCallId,
        result: { confirmed: true, deal: data.data },
      });
    } catch {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    addToolResult({ toolCallId, result: { cancelled: true } });
  };

  return (
    <div className="rounded-md border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Handshake className="size-4 text-primary" />
        {t("title")}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">{t("fieldTitle")}</label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("fieldValue")}</label>
          <Input
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            className="h-8 text-sm"
            type="number"
            step="0.01"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("fieldStage")}</label>
          <Select
            value={form.stageId}
            onValueChange={(v) => setForm({ ...form, stageId: v ?? "" })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={t("stagePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 relative" ref={contactDropdownRef}>
          <label className="text-xs text-muted-foreground">{t("fieldContact")}</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={contactQuery}
              onChange={(e) => handleContactQueryChange(e.target.value)}
              onFocus={() => setShowContactDropdown(true)}
              placeholder={t("contactPlaceholder")}
              className="h-8 text-sm pl-7 pr-7"
            />
            {selectedContact && (
              <button
                type="button"
                onClick={handleClearContact}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {showContactDropdown && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
              {contactSearching && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t("searching")}
                </div>
              )}
              {!contactSearching && contactResults.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {t("noContacts")}
                </div>
              )}
              {contactResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectContact(c)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex flex-col ${
                    selectedContact?.id === c.id ? "bg-accent" : ""
                  }`}
                >
                  <span className="font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[c.email, c.companyName].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={submitting}
        >
          <X className="size-3 mr-1" /> {tc("cancel")}
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={!form.title || submitting}
        >
          <Handshake className="size-3 mr-1" />
          {submitting ? t("creating") : t("createButton")}
        </Button>
      </div>
    </div>
  );
}
