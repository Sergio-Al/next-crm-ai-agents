"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, X, Search, Loader2, Plus, Trash2 } from "lucide-react";

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  companyName: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  price: string;
  currency: string | null;
}

interface LineItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

interface Props {
  args: {
    contactId?: string;
    items?: Array<{ productId: string; quantity: number }>;
    notes?: string;
  };
  toolCallId: string;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
}

export function OrderFormCard({ args, toolCallId, addToolResult }: Props) {
  const t = useTranslations("orderForm");
  const tc = useTranslations("common");

  const [contactId, setContactId] = useState(args.contactId ?? "");
  const [notes, setNotes] = useState(args.notes ?? "");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Contact search
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [contactSearching, setContactSearching] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactDropdownRef = useRef<HTMLDivElement>(null);
  const contactDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Product search (for adding items)
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isUUID = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  // Track whether pre-filled data has already been resolved to avoid re-fetching
  const contactResolved = useRef(false);
  const lastResolvedItemsKey = useRef("");

  // Resolve pre-filled contactId (only once when a valid UUID arrives)
  useEffect(() => {
    if (contactResolved.current) return;
    if (args.contactId && isUUID(args.contactId)) {
      contactResolved.current = true;
      fetch(`/api/contacts/${encodeURIComponent(args.contactId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.data) {
            const c = data.data;
            setSelectedContact(c);
            setContactId(c.id);
            setContactQuery(`${c.firstName} ${c.lastName}`);
          }
        })
        .catch(() => { contactResolved.current = false; });
    }
  }, [args.contactId]);

  // Resolve pre-filled items — wait until ALL items have valid UUIDs (streaming done)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const itemsKey = JSON.stringify(args.items ?? []);
  useEffect(() => {
    if (!args.items || args.items.length === 0) return;
    // Only resolve when every item has a complete UUID (not mid-stream)
    const allValid = args.items.every((item) => isUUID(item.productId));
    if (!allValid) return;
    // Don't re-resolve if we already resolved this exact set
    if (lastResolvedItemsKey.current === itemsKey) return;
    lastResolvedItemsKey.current = itemsKey;
    Promise.all(
      args.items.map(async (item) => {
        const res = await fetch(`/api/products/${encodeURIComponent(item.productId)}`);
        if (!res.ok) return null;
        const data = await res.json();
        const product = data.data;
        if (product) {
          return {
            productId: product.id,
            productName: product.name,
            unitPrice: parseFloat(product.price),
            quantity: item.quantity ?? 1,
          } as LineItem;
        }
        return null;
      }),
    ).then((resolved) => {
      setLineItems(resolved.filter(Boolean) as LineItem[]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  // Load initial contacts
  useEffect(() => {
    fetch("/api/contacts?limit=5")
      .then((r) => r.json())
      .then((data) => { if (data.data) setContactResults(data.data); })
      .catch(() => {});
  }, []);

  // Load initial products
  useEffect(() => {
    fetch("/api/products?limit=8&active=true")
      .then((r) => r.json())
      .then((data) => { if (data.data) setProductResults(data.data); })
      .catch(() => {});
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Contact search
  const searchContacts = useCallback((query: string) => {
    clearTimeout(contactDebounce.current);
    contactDebounce.current = setTimeout(async () => {
      setContactSearching(true);
      try {
        const res = await fetch(`/api/contacts?search=${encodeURIComponent(query)}&limit=8`);
        const data = await res.json();
        if (data.data) setContactResults(data.data);
      } catch { /* ignore */ } finally {
        setContactSearching(false);
      }
    }, 250);
  }, []);

  const handleContactQueryChange = (value: string) => {
    setContactQuery(value);
    setShowContactDropdown(true);
    if (selectedContact) {
      setSelectedContact(null);
      setContactId("");
    }
    if (value.trim()) {
      searchContacts(value);
    } else {
      fetch("/api/contacts?limit=5")
        .then((r) => r.json())
        .then((data) => { if (data.data) setContactResults(data.data); })
        .catch(() => {});
    }
  };

  const handleSelectContact = (c: ContactOption) => {
    setSelectedContact(c);
    setContactId(c.id);
    setContactQuery(`${c.firstName} ${c.lastName}`);
    setShowContactDropdown(false);
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setContactId("");
    setContactQuery("");
  };

  // Product search
  const searchProducts = useCallback((query: string) => {
    clearTimeout(productDebounce.current);
    productDebounce.current = setTimeout(async () => {
      setProductSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=8&active=true`);
        const data = await res.json();
        if (data.data) setProductResults(data.data);
      } catch { /* ignore */ } finally {
        setProductSearching(false);
      }
    }, 250);
  }, []);

  const handleProductQueryChange = (value: string) => {
    setProductQuery(value);
    setShowProductDropdown(true);
    if (value.trim()) {
      searchProducts(value);
    } else {
      fetch("/api/products?limit=8&active=true")
        .then((r) => r.json())
        .then((data) => { if (data.data) setProductResults(data.data); })
        .catch(() => {});
    }
  };

  const handleAddProduct = (product: ProductOption) => {
    const existing = lineItems.find((li) => li.productId === product.id);
    if (existing) {
      setLineItems((prev) =>
        prev.map((li) => li.productId === product.id ? { ...li, quantity: li.quantity + 1 } : li),
      );
    } else {
      setLineItems((prev) => [
        ...prev,
        { productId: product.id, productName: product.name, unitPrice: parseFloat(product.price), quantity: 1 },
      ]);
    }
    setProductQuery("");
    setShowProductDropdown(false);
  };

  const handleRemoveItem = (productId: string) => {
    setLineItems((prev) => prev.filter((li) => li.productId !== productId));
  };

  const handleQuantityChange = (productId: string, qty: number) => {
    if (qty < 1) return;
    setLineItems((prev) =>
      prev.map((li) => li.productId === productId ? { ...li, quantity: qty } : li),
    );
  };

  const subtotal = lineItems.reduce((sum, li) => sum + li.unitPrice * li.quantity, 0);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contactId || undefined,
          notes: notes || undefined,
          items: lineItems.map((li) => ({
            productId: li.productId,
            quantity: li.quantity,
          })),
        }),
      });
      const data = await res.json();
      addToolResult({ toolCallId, result: { confirmed: true, order: data.data } });
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
        <ShoppingCart className="size-4 text-primary" />
        {t("title")}
      </div>

      {/* Contact */}
      <div className="relative" ref={contactDropdownRef}>
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
              <div className="px-3 py-2 text-xs text-muted-foreground">{t("noContacts")}</div>
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
                <span className="font-medium">{c.firstName} {c.lastName}</span>
                <span className="text-xs text-muted-foreground">
                  {[c.email, c.companyName].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Line items */}
      <div>
        <label className="text-xs text-muted-foreground">{t("fieldItems")}</label>
        {lineItems.length > 0 && (
          <div className="space-y-1.5 mt-1.5 mb-2">
            {lineItems.map((li) => (
              <div key={li.productId} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
                <span className="flex-1 truncate font-medium">{li.productName}</span>
                <span className="text-xs text-muted-foreground">
                  ${li.unitPrice.toFixed(2)}
                </span>
                <Input
                  type="number"
                  min={1}
                  value={li.quantity}
                  onChange={(e) => handleQuantityChange(li.productId, parseInt(e.target.value, 10) || 1)}
                  className="h-6 w-14 text-xs text-center"
                />
                <span className="text-xs font-medium w-16 text-right">
                  ${(li.unitPrice * li.quantity).toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(li.productId)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="flex justify-end text-sm font-medium pt-1 pr-1">
              {t("subtotal")}: ${subtotal.toFixed(2)}
            </div>
          </div>
        )}
        {/* Add product search */}
        <div className="relative" ref={productDropdownRef}>
          <div className="relative">
            <Plus className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={productQuery}
              onChange={(e) => handleProductQueryChange(e.target.value)}
              onFocus={() => setShowProductDropdown(true)}
              placeholder={t("addProductPlaceholder")}
              className="h-8 text-sm pl-7"
            />
          </div>
          {showProductDropdown && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
              {productSearching && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t("searching")}
                </div>
              )}
              {!productSearching && productResults.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">{t("noProducts")}</div>
              )}
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAddProduct(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{p.name}</span>
                    {p.sku && <span className="text-xs text-muted-foreground">{p.sku}</span>}
                  </div>
                  <span className="text-xs font-medium">${parseFloat(p.price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs text-muted-foreground">{t("fieldNotes")}</label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("notesPlaceholder")}
          className="h-8 text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={handleCancel} disabled={submitting}>
          <X className="size-3 mr-1" /> {tc("cancel")}
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={lineItems.length === 0 || submitting}>
          <ShoppingCart className="size-3 mr-1" />
          {submitting ? t("creating") : t("createButton")}
        </Button>
      </div>
    </div>
  );
}
