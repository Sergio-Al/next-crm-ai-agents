"""SuiteCRM CDC payload → DB row transformers.

Each transformer receives the raw Debezium payload (flat JSON after
ExtractNewRecordState unwrap) and returns a dict matching the target
Postgres table columns, or None to skip the record.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _epoch_ms_to_dt(val) -> datetime | None:
    """Convert epoch milliseconds to timezone-aware datetime."""
    if val is None:
        return None
    try:
        return datetime.fromtimestamp(int(val) / 1000, tz=timezone.utc)
    except (ValueError, TypeError, OSError):
        return None


def _first_non_empty(*values) -> str | None:
    """Return the first non-None, non-empty-string value."""
    for v in values:
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


def _is_deleted(payload: dict) -> bool:
    """Check if this is a delete event."""
    return str(payload.get("__deleted", "false")).lower() == "true"


# ── Contacts ────────────────────────────────────────────────────

def transform_contact(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    custom_fields = {}
    if payload.get("salutation"):
        custom_fields["salutation"] = payload["salutation"]
    if payload.get("title"):
        custom_fields["title"] = payload["title"]
    if payload.get("department"):
        custom_fields["department"] = payload["department"]

    # Build address from primary address fields
    addr_parts = [
        payload.get("primary_address_street"),
        payload.get("primary_address_city"),
        payload.get("primary_address_state"),
        payload.get("primary_address_country"),
    ]
    addr = ", ".join(p for p in addr_parts if p)
    if addr:
        custom_fields["address"] = addr
    if payload.get("primary_address_city"):
        custom_fields["city"] = payload["primary_address_city"]
    if payload.get("primary_address_country"):
        custom_fields["country"] = payload["primary_address_country"]

    phone = _first_non_empty(
        payload.get("phone_work"),
        payload.get("phone_mobile"),
        payload.get("phone_home"),
        payload.get("phone_other"),
    )

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "first_name": payload.get("first_name"),
        "last_name": payload.get("last_name"),
        "phone": phone,
        "source": payload.get("lead_source"),
        "custom_fields": custom_fields or {},
    }


# ── Accounts ────────────────────────────────────────────────────

def transform_account(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    custom_fields = {}
    source_account_type = payload.get("account_type") or None
    if payload.get("phone_office"):
        custom_fields["phone"] = payload["phone_office"]
    if payload.get("sic_code"):
        custom_fields["sic_code"] = payload["sic_code"]

    addr_parts = [
        payload.get("billing_address_street"),
        payload.get("billing_address_city"),
        payload.get("billing_address_state"),
        payload.get("billing_address_country"),
    ]
    addr = ", ".join(p for p in addr_parts if p)
    if addr:
        custom_fields["address"] = addr
    if payload.get("billing_address_city"):
        custom_fields["city"] = payload["billing_address_city"]
    if payload.get("billing_address_country"):
        custom_fields["country"] = payload["billing_address_country"]

    # Map employees → size (S/M/L/XL)
    size = None
    emp = payload.get("employees")
    if emp is not None:
        try:
            emp_int = int(emp)
            if emp_int <= 50:
                size = "S"
            elif emp_int <= 200:
                size = "M"
            elif emp_int <= 1000:
                size = "L"
            else:
                size = "XL"
        except (ValueError, TypeError):
            pass

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "name": payload.get("name", "Unknown"),
        "industry": payload.get("industry"),
        "website": payload.get("website"),
        "size": size,
        "source_account_type": source_account_type,
        "custom_fields": custom_fields or {},
    }


# ── Invoices → Orders ──────────────────────────────────────────

STATUS_MAP = {
    "Paid": "confirmed",
    "Unpaid": "draft",
    "Cancelled": "cancelled",
    "Overdue": "draft",
}


def transform_invoice(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    custom_fields = {}
    if payload.get("currency_id"):
        custom_fields["currency_id"] = payload["currency_id"]
    invoice_date = _epoch_ms_to_dt(payload.get("invoice_date"))
    if invoice_date:
        custom_fields["invoice_date"] = invoice_date.isoformat()
    due_date = _epoch_ms_to_dt(payload.get("due_date"))
    if due_date:
        custom_fields["due_date"] = due_date.isoformat()

    raw_status = payload.get("status", "")
    status = STATUS_MAP.get(raw_status, "draft")

    # Use `name` field (string invoice ref) not `number` (auto-increment int)
    order_number = str(payload.get("name") or payload.get("number") or payload["id"])

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "number": order_number,
        "status": status,
        "currency": "BOB",
        "subtotal": payload.get("subtotal_amount", 0),
        "discount_amount": payload.get("discount_amount", 0),
        "tax_amount": payload.get("tax_amount", 0),
        "total_amount": payload.get("total_amount", 0),
        "custom_fields": custom_fields or {},
        # FK references — resolved by sync_handler
        "_billing_contact_id": payload.get("billing_contact_id"),
        "_billing_account_id": payload.get("billing_account_id"),
    }


# ── Product Quotes → Order Items ───────────────────────────────

# parent_type values that map to invoices/orders.
# HANPE_Pedidos is the SuiteCRM custom pedido module (primary purchase
# chain); AOS_Invoices/Quotes are kept for compatibility.
INVOICE_PARENT_TYPES = {"AOS_Invoices", "Quotes", "AOS_Quotes", "HANPE_Pedidos"}


def transform_product_quote(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    parent_type = payload.get("parent_type", "")
    if parent_type not in INVOICE_PARENT_TYPES:
        # Not linked to an invoice — skip for now
        logger.debug(
            "Skipping product_quote %s with parent_type=%s",
            payload["id"], parent_type,
        )
        return None

    qty_raw = payload.get("product_qty", 1)
    try:
        quantity = max(1, round(float(qty_raw)))
    except (ValueError, TypeError):
        quantity = 1

    def _safe_float_or_zero(value) -> float:
        try:
            parsed = _to_float(value)
        except Exception:
            return 0.0
        return parsed if parsed is not None else 0.0

    unit_price = _safe_float_or_zero(payload.get("product_unit_price"))
    discount_amount = _safe_float_or_zero(payload.get("product_discount_amount"))
    # Convert dollar discount → percentage
    discount_pct = 0.0
    if unit_price > 0 and discount_amount > 0:
        discount_pct = round((discount_amount / unit_price) * 100, 2)
        if discount_pct > 99.99:
            discount_pct = 99.99

    product_name = _first_non_empty(
        payload.get("item_description"),
        payload.get("name"),
    ) or "Unknown"

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "product_name": product_name,
        "product_sku": payload.get("part_number") or None,
        "unit_price": unit_price,
        "quantity": quantity,
        "discount_pct": discount_pct,
        "line_total": _safe_float_or_zero(payload.get("product_total_price")),
        # FK references — resolved by sync_handler
        "_parent_id": payload.get("parent_id"),
        "_product_id": payload.get("product_id"),
    }


# ── Products ───────────────────────────────────────────────────

def _to_float(val) -> float | None:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _to_int(val) -> int | None:
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _to_bool(val) -> bool | None:
    if val is None or val == "":
        return None
    s = str(val).strip().lower()
    if s in ("1", "true", "t", "yes", "y"):
        return True
    if s in ("0", "false", "f", "no", "n"):
        return False
    return None


def transform_product(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    # Use maincode for SKU (part_number is often empty)
    sku = _first_non_empty(payload.get("maincode"), payload.get("part_number"))

    created_at = _epoch_ms_to_dt(payload.get("date_entered"))
    updated_at = _epoch_ms_to_dt(payload.get("date_modified"))

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "name": payload.get("name", "Unknown"),
        "sku": sku,
        "description": payload.get("description"),
        "category": payload.get("category"),
        # SuiteCRM sends 0.0 as sentinel; real sellable price comes from cstm.minPrice
        "price": _to_float(payload.get("price")),
        "type": payload.get("type"),
        "cost": _to_float(payload.get("cost")),
        "image_url": payload.get("product_image"),
        "created_at": created_at.isoformat() if created_at else None,
        "updated_at": updated_at.isoformat() if updated_at else None,
        "custom_fields": {},
    }


# ── Products cstm ──────────────────────────────────────────────

# Columns from aos_products_cstm promoted to first-class product columns
_PRODUCT_CSTM_PROMOTED = {
    "marca_c", "precio_min_c", "disponible_c", "reservado_c", "homologado_c",
    "idfamilia_c", "nombre_familia_c", "idgrupo_c", "nombre_grupo_c",
    "idsubgrupo_c", "nombre_subgrupo_c", "estado_c", "unidad_c",
}

# Columns to exclude entirely (system/unwrap metadata + join key)
_PRODUCT_CSTM_EXCLUDED = {"id_c", "__deleted"}


def transform_product_cstm(payload: dict, workspace_id: str) -> dict | None:
    """Transform aos_products_cstm row → partial product update.

    Maps to `id_c` (which equals aos_products.id) as the external_id.
    Promoted columns become top-level fields; remaining _c columns go
    into `custom_fields` (merged with existing via JSONB ||).
    """
    external_id = payload.get("id_c")
    if not external_id:
        logger.debug("product-cstm skipped — missing id_c")
        return None

    if _is_deleted(payload):
        # cstm deletes don't remove the parent product — skip
        return None

    # Remaining custom_fields: any *_c column not promoted or excluded
    custom_fields = {
        k: v
        for k, v in payload.items()
        if k.endswith("_c")
        and k not in _PRODUCT_CSTM_PROMOTED
        and k not in _PRODUCT_CSTM_EXCLUDED
        and v is not None
        and str(v) != ""
    }

    return {
        "external_id": external_id,
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "brand": payload.get("marca_c"),
        "min_price": _to_float(payload.get("precio_min_c")),
        "available": _to_float(payload.get("disponible_c")),
        "reserved": _to_int(payload.get("reservado_c")),
        "approved": _to_bool(payload.get("homologado_c")),
        "family_id": payload.get("idfamilia_c"),
        "family_name": payload.get("nombre_familia_c"),
        "group_id": payload.get("idgrupo_c"),
        "group_name": payload.get("nombre_grupo_c"),
        "subgroup_id": payload.get("idsubgrupo_c"),
        "subgroup_name": payload.get("nombre_subgrupo_c"),
        "active": _to_bool(payload.get("estado_c")),
        "unit": payload.get("unidad_c"),
        "custom_fields": custom_fields,
    }


# ── Junction: Email Addresses (lookup only) ────────────────────

def transform_email_address(payload: dict, workspace_id: str) -> dict | None:
    """Returns email address data for lookup table (not direct DB upsert)."""
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    return {
        "external_id": payload["id"],
        "email_address": payload.get("email_address"),
    }


# ── Junction: Email↔Bean Relations ─────────────────────────────

def transform_email_rel(payload: dict, workspace_id: str) -> dict | None:
    """Returns relation data to link emails to contacts/accounts."""
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    return {
        "external_id": payload["id"],
        "email_address_id": payload.get("email_address_id"),
        "bean_id": payload.get("bean_id"),
        "bean_module": payload.get("bean_module"),
        "primary_address": payload.get("primary_address"),
    }


# ── Junction: Account↔Contact Relations ────────────────────────

def transform_account_contact(payload: dict, workspace_id: str) -> dict | None:
    """Returns relation data to link contacts to accounts."""
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    return {
        "external_id": payload["id"],
        "contact_id": payload.get("contact_id"),
        "account_id": payload.get("account_id"),
    }


# ── Visits (deferred — log only for now) ───────────────────────

def transform_visit(payload: dict, workspace_id: str) -> dict | None:
    """Visits are consumed but not persisted yet. Returns None to skip."""
    logger.debug("Visit event received (id=%s) — not persisted", payload.get("id"))
    return None


# ── accounts_cstm → crm_accounts enrichment + kunnr lookup ─────

# Columns from accounts_cstm promoted to first-class crm_accounts columns.
# `idcuentasap_c` becomes sap_account_id and is also pushed into
# suite_reco.kunnr_lookup so pedidos can resolve their account.
_ACCOUNT_CSTM_PROMOTED = {
    "idcuentasap_c",
    "nombre_comercial_c",
    "nit_ci_c",
    "categoria_ventas_c",
    "condicion_pago_c",
    "tipocuenta_c",
    "limite_credito_c",
    "bloqueo_entrega_c",
    "bloqueo_factura_c",
    "jjwg_maps_lat_c",
    "jjwg_maps_lng_c",
}
_ACCOUNT_CSTM_RELACION_FIELDS = {
    "canal_list_c",
    "regimen_tributario_c",
    "tipo_documento_c",
    "tratamientosap_c",
    "bloqueo_documentos_c",
    "estado_verificacion_cuenta_c",
}
_ACCOUNT_CSTM_EXCLUDED = {"id_c", "__deleted"}
_RELACION_LOOKUP_FIELDS = {
    "iddivision_c",
    "idamercado_c",
    "idcanalvta_c",
    "idgrupocliente_c",
}


def transform_account_cstm(payload: dict, workspace_id: str) -> dict | None:
    external_id = payload.get("id_c")
    if not external_id:
        return None
    if _is_deleted(payload):
        return None

    relacion_principal = {
        k: v
        for k, v in payload.items()
        if k in _ACCOUNT_CSTM_RELACION_FIELDS and v is not None and str(v) != ""
    }

    custom_fields = {
        k: v
        for k, v in payload.items()
        if k.endswith("_c")
        and k not in _ACCOUNT_CSTM_PROMOTED
        and k not in _ACCOUNT_CSTM_RELACION_FIELDS
        and k not in _ACCOUNT_CSTM_EXCLUDED
        and v is not None
        and str(v) != ""
    }

    sap_account_id = _first_non_empty(payload.get("idcuentasap_c"))

    return {
        "external_id": external_id,
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "sap_account_id": sap_account_id,
        "nombre_comercial": _first_non_empty(payload.get("nombre_comercial_c")),
        "nit_ci": _first_non_empty(payload.get("nit_ci_c")),
        "categoria_ventas": _first_non_empty(payload.get("categoria_ventas_c")),
        "condicion_pago": _first_non_empty(payload.get("condicion_pago_c")),
        "tipo_cuenta": _first_non_empty(payload.get("tipocuenta_c")),
        "limite_credito": _to_float(payload.get("limite_credito_c")),
        "bloqueo_entrega": _to_bool(payload.get("bloqueo_entrega_c")) or False,
        "bloqueo_factura": _to_bool(payload.get("bloqueo_factura_c")) or False,
        "lat": _to_float(payload.get("jjwg_maps_lat_c")),
        "lng": _to_float(payload.get("jjwg_maps_lng_c")),
        "relacion_principal": relacion_principal,
        "custom_fields": custom_fields,
    }


def transform_relacion(payload: dict, workspace_id: str) -> dict | None:
    external_id = payload.get("id")
    if not external_id:
        return None
    if _is_deleted(payload):
        return None

    relacion_principal = {
        key: value
        for key in _RELACION_LOOKUP_FIELDS
        if (value := _first_non_empty(payload.get(key))) is not None
    }

    tipo_relacion = _first_non_empty(
        payload.get("tipo_relacion"),
        payload.get("tipo_relacion_c"),
    )
    if tipo_relacion is not None:
        relacion_principal["tipo_relacion"] = tipo_relacion

    principal = _to_bool(payload.get("principal"))
    if principal is None:
        principal = _to_bool(payload.get("principal_c"))
    if principal is not None:
        relacion_principal["principal"] = principal

    return {
        "external_id": external_id,
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "zona_ventas": _first_non_empty(
            payload.get("zona_ventas_c"),
            payload.get("zona_ventas"),
        ),
        "id_regional": _first_non_empty(
            payload.get("idregional_c"),
            payload.get("id_regional"),
            payload.get("idregional"),
        ),
        "relacion_principal": relacion_principal,
    }


def transform_relacion_account(payload: dict, workspace_id: str) -> dict | None:
    external_id = payload.get("id")
    if not external_id or _is_deleted(payload):
        return None

    relacion_external_id = _first_non_empty(
        payload.get("hana_relaciones_accountshana_relaciones_ida"),
        payload.get("hana_relaciones_accountshana_relaciones_idb"),
        payload.get("hana_relaciones_id"),
        payload.get("relacion_id"),
    )
    account_external_id = _first_non_empty(
        payload.get("hana_relaciones_accountsaccounts_idb"),
        payload.get("hana_relaciones_accountsaccounts_ida"),
        payload.get("accounts_id"),
        payload.get("account_id"),
    )
    if not relacion_external_id or not account_external_id:
        return None

    return {
        "external_id": external_id,
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "relacion_external_id": relacion_external_id,
        "account_external_id": account_external_id,
    }


# ── hanpe_pedidos → orders + suite_reco.pedidos ───────────────

# Mapping of estado_c → app `orders.status` for the SAP-driven flow.
# Manual flow is confirmed via tasks (status='Completed').
PEDIDO_SAP_CONFIRMED = {"PEDIDO LIBERADO", "ENTREGA CREADA", "FACTURA CREADA"}
PEDIDO_CANCELLED = {"Anulado"}


def _pedido_status(estado: str | None) -> tuple[str, str | None]:
    """Map raw estado_c → (orders.status, status_source).

    Returns ('draft', None) when estado is missing or not an explicit
    confirmed/cancelled state. Manual-flow confirmation comes from tasks.
    """
    if not estado:
        return ("draft", None)
    e = str(estado).strip()
    if e in PEDIDO_SAP_CONFIRMED:
        return ("confirmed", "sap")
    if e in PEDIDO_CANCELLED:
        return ("cancelled", "sap")
    if e.upper().startswith("ERR"):
        return ("cancelled", "sap")
    return ("draft", None)


def transform_pedido(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    estado_original = payload.get("estado_c")
    status, status_source = _pedido_status(estado_original)

    fecha_pedido = _epoch_ms_to_dt(payload.get("fecha_c"))
    fecha_entrega = _epoch_ms_to_dt(payload.get("fecha_entrega_c"))
    fecha_compromiso_pago = _epoch_ms_to_dt(payload.get("fecha_compromiso_pago_c"))
    date_entered = _epoch_ms_to_dt(payload.get("date_entered"))

    # `name` is usually like "PED-000123"; nro_pedido_c is the human number.
    order_number = _first_non_empty(
        payload.get("nro_pedido_c"),
        payload.get("name"),
        payload.get("number_c"),
        payload["id"],
    )

    custom_fields = {}
    for k in (
        "esquema_c", "tipo_doc_c", "tipo_sinc_c", "comentario_compromiso_pago_c",
        "monto_compromiso_pago_c", "lugar_entrega_c", "dir_entrega_c", "dir_factura_c",
    ):
        v = payload.get(k)
        if v is not None and str(v) != "":
            custom_fields[k] = v

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        # orders columns
        "number": order_number,
        "status": status,
        "status_source": status_source,
        "currency": "BOB",
        "subtotal": _to_float(payload.get("subtotal_amount")) or 0,
        "tax_amount": _to_float(payload.get("tax_amount")) or 0,
        "total_amount": (
            _to_float(payload.get("monto_total_c"))
            or _to_float(payload.get("total_amount"))
            or _to_float(payload.get("total_amt"))
            or 0
        ),
        "region_code": payload.get("idregional_c"),
        "division_code": payload.get("iddivision_c"),
        "confirmed_at": fecha_pedido.isoformat() if fecha_pedido and status == "confirmed" else None,
        "custom_fields": custom_fields,
        # suite_reco.pedidos extra fields
        "_kunnr": _first_non_empty(payload.get("kunnr_c")),
        "_kunnr_fact": _first_non_empty(payload.get("kunnr_fact_c")),
        "_kunnr_dest": _first_non_empty(payload.get("kunnr_dest_c")),
        "_estado_original": estado_original,
        "_nro_pedido": payload.get("nro_pedido_c"),
        "_nro_sap": payload.get("nro_sap_c"),
        "_fecha_pedido": fecha_pedido.isoformat() if fecha_pedido else None,
        "_fecha_entrega": fecha_entrega.isoformat() if fecha_entrega else None,
        "_fecha_compromiso_pago": fecha_compromiso_pago.isoformat() if fecha_compromiso_pago else None,
        "_payment_type": payload.get("payment_type") or payload.get("cod_tipo_pago_c"),
        "_cod_tipo_pedido": _to_int(payload.get("cod_tipo_pedido_c")),
        "_tipo_doc": payload.get("tipo_doc_c") or payload.get("tipo_doc"),
        "_canal_code": payload.get("idcanalvta_c"),
        "_sector_code": payload.get("idsector_c"),
        "_mercado_code": payload.get("idamercado_c"),
        "_razon_social": payload.get("razon_social_c") or payload.get("razon_social"),
        "_nit": payload.get("nit_c"),
        "_currency_id": payload.get("currency_id"),
        "_products_quantity": _to_int(payload.get("products_quantity")) or _to_int(payload.get("nro_posiciones_c")),
        "_contacto_sol_id": payload.get("contacto_sol_id_c"),
        "_estado_sync": payload.get("estado_sync_c"),
        "_lat": _to_float(payload.get("jjwg_maps_lat_c")),
        "_lng": _to_float(payload.get("jjwg_maps_lng_c")),
        "_description": payload.get("description") or None,
        "_created_at": date_entered.isoformat() if date_entered else None,
    }


# ── tasks (HANPE_Pedidos completion driver) ────────────────────

def transform_task(payload: dict, workspace_id: str) -> dict | None:
    """Only persist tasks attached to HANPE_Pedidos.

    The Completed status drives manual-flow pedido confirmation.
    """
    bean_type = payload.get("bean_type")
    if bean_type != "HANPE_Pedidos":
        return None

    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    date_start = _epoch_ms_to_dt(payload.get("date_start"))
    date_due = _epoch_ms_to_dt(payload.get("date_due"))

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "name": payload.get("name"),
        "status": payload.get("status"),
        "bean_type": bean_type,
        "bean_id": payload.get("bean_id"),
        "parent_type": payload.get("parent_type"),
        "parent_id": payload.get("parent_id"),
        "date_start": date_start.isoformat() if date_start else None,
        "date_due": date_due.isoformat() if date_due else None,
        "custom_fields": {},
    }


# ── hanq_modelo → suite_reco.modelos ───────────────────────────

def transform_modelo(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    image_url = _first_non_empty(
        payload.get("modelo_image1_c"),
        payload.get("modelo_image2_c"),
        payload.get("modelo_image3_c"),
        payload.get("modelo_image4_c"),
    )

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "name": payload.get("name"),
        "nombre_comercial": payload.get("nombre_comercial_c"),
        "nombre_generico": payload.get("nombre_generico_c"),
        "marca": payload.get("marca_c"),
        "descripcion_basica_text": payload.get("descripcion_basica_text_c"),
        "caracteristicas_text": payload.get("caracteristicas_text_c"),
        "nombre_familia": payload.get("nombre_familia_c"),
        "nombre_grupo": payload.get("nombre_grupo_c"),
        "nombre_subgrupo": payload.get("nombre_subgrupo_c"),
        "idfamilia": payload.get("idfamilia_c"),
        "idgrupo": payload.get("idgrupo_c"),
        "idsubgrupo": payload.get("idsubgrupo_c"),
        "grupo_material1": payload.get("grupo_material1_c"),
        "grupo_material2": payload.get("grupo_material2_c"),
        "grupo_material3": payload.get("grupo_material3_c"),
        "codigoaio": payload.get("codigoaio_c"),
        "codfabrica": payload.get("codfabrica_c"),
        "iddivision": payload.get("iddivision_c"),
        "idamercado": payload.get("idamercado_c"),
        "estado": payload.get("estado"),
        "image_url": image_url,
        "custom_fields": {},
    }


# ── hanq_modelo_aos_products_c junction ────────────────────────

def transform_modelo_product(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    modelo_ext = payload.get("hanq_modelo_aos_productshanq_modelo_ida")
    product_ext = payload.get("hanq_modelo_aos_productsaos_products_idb")
    if not modelo_ext or not product_ext:
        return None

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "modelo_external_id": modelo_ext,
        "product_external_id": product_ext,
    }


# ── hanq_stock → suite_reco.stock_units ────────────────────────

def transform_stock(payload: dict, workspace_id: str) -> dict | None:
    if _is_deleted(payload):
        return {"__deleted": True, "external_id": payload["id"]}

    date_due = _epoch_ms_to_dt(payload.get("date_due_c"))

    return {
        "external_id": payload["id"],
        "external_source": "suitecrm",
        "workspace_id": workspace_id,
        "name": payload.get("name"),
        "chasis": payload.get("chasis_c"),
        "motor": payload.get("motor_c"),
        "lote": payload.get("lote_c"),
        "almacen": payload.get("almacen_c"),
        "ubicacion": payload.get("ubicacion_c"),
        "nombre_color": payload.get("nombre_color_c"),
        "stock": _to_int(payload.get("stock_c")),
        "estado_cotizacion": payload.get("estado_cotizacion_c"),
        "date_due": date_due.isoformat() if date_due else None,
        "custom_fields": {},
    }


# ── Dispatcher ──────────────────────────────────────────────────

TRANSFORMERS = {
    "contact": transform_contact,
    "account": transform_account,
    "account-cstm": transform_account_cstm,
    "invoice": transform_invoice,
    "product-quote": transform_product_quote,
    "product": transform_product,
    "product-cstm": transform_product_cstm,
    "email-address": transform_email_address,
    "email-rel": transform_email_rel,
    "account-contact": transform_account_contact,
    "visit": transform_visit,
    "relacion": transform_relacion,
    "relacion-account": transform_relacion_account,
    "pedido": transform_pedido,
    "task": transform_task,
    "modelo": transform_modelo,
    "modelo-product": transform_modelo_product,
    "stock": transform_stock,
}


def transform(entity: str, payload: dict, workspace_id: str) -> dict | None:
    """Transform a CDC payload for the given entity type."""
    fn = TRANSFORMERS.get(entity)
    if fn is None:
        logger.warning("No transformer for entity: %s", entity)
        return None
    return fn(payload, workspace_id)
