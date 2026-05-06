"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ToolInputField = {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  optional?: boolean;
  description?: string;
  enum?: string[];
};

export type ToolRow = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  systemPromptHint: string | null;
  hitl: boolean;
  enabled: boolean;
  inputSchema: ToolInputField[] | null;
  config: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
  } | null;
  updatedAt: string | null;
  createdAt: string | null;
};

type Props = {
  open: boolean;
  tool: ToolRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const DEFAULT_FIELD: ToolInputField = {
  name: "",
  type: "string",
  optional: false,
  description: "",
};

export function ToolFormSheet({ open, tool, onOpenChange, onSaved }: Props) {
  const t = useTranslations("adminTools.form");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPromptHint, setSystemPromptHint] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [hitl, setHitl] = useState(false);
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [headersText, setHeadersText] = useState("{}");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [fields, setFields] = useState<ToolInputField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (tool) {
      setName(tool.name);
      setDescription(tool.description ?? "");
      setSystemPromptHint(tool.systemPromptHint ?? "");
      setEnabled(tool.enabled);
      setHitl(tool.hitl);
      setUrl(tool.config?.url ?? "");
      setMethod(tool.config?.method ?? "GET");
      setHeadersText(JSON.stringify(tool.config?.headers ?? {}, null, 2));
      setBodyTemplate(tool.config?.bodyTemplate ?? "");
      setFields(tool.inputSchema ?? []);
    } else {
      setName("");
      setDescription("");
      setSystemPromptHint("");
      setEnabled(true);
      setHitl(false);
      setUrl("");
      setMethod("GET");
      setHeadersText("{}");
      setBodyTemplate("");
      setFields([]);
    }
    setError(null);
  }, [open, tool]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      let headers: Record<string, string> = {};
      if (headersText.trim()) {
        try {
          headers = JSON.parse(headersText);
        } catch {
          throw new Error("Headers must be valid JSON");
        }
      }
      const payload = {
        name,
        description,
        systemPromptHint,
        enabled,
        hitl,
        kind: "http",
        inputSchema: fields,
        config: {
          url,
          method,
          headers,
          bodyTemplate: bodyTemplate || undefined,
        },
      };

      const res = tool
        ? await fetch(`/api/tools/${tool.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/tools", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("saveError"));
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  function updateField(idx: number, patch: Partial<ToolInputField>) {
    setFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>{tool ? t("editTitle") : t("title")}</SheetTitle>
          <SheetDescription>
            {tool?.kind === "static" ? "Static (read-only)" : null}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-5">
          {/* Basics */}
          <Field label={t("name")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </Field>

          <Field label={t("description")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={2}
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </Field>

          <Field label={t("systemPromptHint")}>
            <textarea
              value={systemPromptHint}
              onChange={(e) => setSystemPromptHint(e.target.value)}
              placeholder={t("systemPromptHintPlaceholder")}
              rows={3}
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </Field>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4 rounded border-border"
              />
              {t("enabled")}
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hitl}
                onChange={(e) => setHitl(e.target.checked)}
                className="size-4 rounded border-border"
              />
              {t("hitl")}
            </label>
          </div>

          {/* HTTP config */}
          <div className="rounded-2xl border border-border p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">HTTP</h3>

            <div className="grid grid-cols-[120px_1fr] gap-3">
              <Select value={method} onValueChange={(v) => v && setMethod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("urlPlaceholder")}
              />
            </div>

            <Field label={t("headers")}>
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </Field>

            {(method === "POST" || method === "PUT") && (
              <Field label={t("bodyTemplate")}>
                <textarea
                  value={bodyTemplate}
                  onChange={(e) => setBodyTemplate(e.target.value)}
                  rows={4}
                  placeholder='{"id": "{{id}}"}'
                  className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </Field>
            )}
          </div>

          {/* Input schema builder */}
          <div className="rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t("inputSchema")}
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFields((prev) => [...prev, { ...DEFAULT_FIELD }])}
              >
                <Plus className="size-3.5 mr-1" />
                {t("addParam")}
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No parameters.</p>
            )}

            {fields.map((f, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_120px_auto_auto] gap-2 items-center"
              >
                <Input
                  value={f.name}
                  onChange={(e) => updateField(idx, { name: e.target.value })}
                  placeholder={t("paramName")}
                />
                <Select
                  value={f.type}
                  onValueChange={(v) =>
                    updateField(idx, { type: v as ToolInputField["type"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">string</SelectItem>
                    <SelectItem value="number">number</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                    <SelectItem value="enum">enum</SelectItem>
                  </SelectContent>
                </Select>
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={f.optional ?? false}
                    onChange={(e) =>
                      updateField(idx, { optional: e.target.checked })
                    }
                  />
                  {t("paramOptional")}
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setFields((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !name}>
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
