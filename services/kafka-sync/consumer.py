"""Kafka consumer with regex topic subscription for SuiteCRM CDC events."""

import json
import logging
import re
from confluent_kafka import Consumer, KafkaException, KafkaError

logger = logging.getLogger(__name__)

# Extract entity name from topic: crm.HCRM00365.contact.updated → contact
TOPIC_ENTITY_RE = re.compile(r"^crm\.[^.]+\.([^.]+)\.updated$")


def extract_entity(topic: str) -> str | None:
    """Extract entity name from a CDC topic name."""
    m = TOPIC_ENTITY_RE.match(topic)
    return m.group(1) if m else None


def create_consumer(conf: dict, topic_pattern: str) -> Consumer:
    """Create a Kafka consumer subscribed to a regex topic pattern."""
    consumer = Consumer(conf)
    consumer.subscribe([topic_pattern])
    logger.info("Subscribed to topic pattern: %s", topic_pattern)
    return consumer


def poll_messages(consumer: Consumer, handler, batch_size: int = 100, timeout: float = 1.0):
    """Poll messages in a loop, dispatching to handler.

    Groups messages by entity for ordered batch processing during snapshot.
    Commits after each batch.
    """
    batch: list[tuple[str, str, dict]] = []  # (topic, entity, payload)

    handler_self = getattr(handler, "__self__", None)

    def _commit_and_flush():
        consumer.commit(asynchronous=False)
        if handler_self is not None and hasattr(handler_self, "flush_stats"):
            try:
                handler_self.flush_stats()
            except Exception:
                logger.exception("flush_stats failed")

    while True:
        msg = consumer.poll(timeout)
        if msg is None:
            # Flush any pending batch on idle
            if batch:
                _process_batch(batch, handler)
                _commit_and_flush()
                batch.clear()
            continue

        if msg.error():
            err = msg.error()
            # UNKNOWN_TOPIC_OR_PART is normal for regex subscriptions when no
            # matching topics exist yet (e.g. connector not yet registered).
            # Log and continue rather than crashing.
            if err.code() == KafkaError.UNKNOWN_TOPIC_OR_PART:
                logger.debug("No matching topics yet, waiting... (%s)", err)
                continue
            raise KafkaException(err)

        topic = msg.topic()
        entity = extract_entity(topic)
        if entity is None:
            logger.warning("Skipping message from unknown topic: %s", topic)
            continue

        try:
            payload = json.loads(msg.value().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.error("Failed to decode message from %s: %s", topic, e)
            continue

        batch.append((topic, entity, payload))

        if len(batch) >= batch_size:
            _process_batch(batch, handler)
            _commit_and_flush()
            batch.clear()


# Processing order to respect FK dependencies.
#
# Entities are grouped into tiers; within a batch we sort by tier so that
# parents are upserted before children. Unknown entities go to the last
# tier so they don't block known dependencies.
#
#   tier 0 — root entities (no FK dependencies inside the batch)
#   tier 1 — cstm/junction enrichments of tier-0 rows
#   tier 2 — entities that depend on tier-0/1 (orders, invoices, links)
#   tier 3 — line items / status events that depend on tier-2 rows
ENTITY_TIERS: dict[str, int] = {
    # tier 0
    "account": 0,
    "contact": 0,
    "product": 0,
    "modelo": 0,
    # tier 1
    "account-cstm": 1,
    "product-cstm": 1,
    "account-contact": 1,
    "email-address": 1,
    "email-rel": 1,
    # tier 2
    "pedido": 2,
    "invoice": 2,
    "modelo-product": 2,
    "visit": 2,
    # tier 3
    "product-quote": 3,
    "task": 3,
    "stock": 3,
}

# Flat list kept for back-compat / introspection.
ENTITY_ORDER = sorted(ENTITY_TIERS, key=lambda e: ENTITY_TIERS[e])

_UNKNOWN_TIER = max(ENTITY_TIERS.values()) + 1


def _entity_sort_key(entity: str) -> int:
    return ENTITY_TIERS.get(entity, _UNKNOWN_TIER)


def _process_batch(batch: list[tuple[str, str, dict]], handler):
    """Process a batch sorted by entity dependency tier (stable sort)."""
    batch.sort(key=lambda x: _entity_sort_key(x[1]))
    for topic, entity, payload in batch:
        try:
            handler(entity, payload)
        except Exception:
            logger.exception("Failed to handle message for entity=%s", entity)
