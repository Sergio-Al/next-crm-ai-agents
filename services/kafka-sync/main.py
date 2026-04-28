"""Entry point for the SuiteCRM Kafka Sync Service."""

import logging
import logging.handlers
import os
import signal
import sys
from pathlib import Path

from dotenv import load_dotenv

from consumer import create_consumer, poll_messages
from sync_handler import SyncHandler

# Load repo-root .env (two levels up from services/kafka-sync/main.py)
_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ROOT_ENV if _ROOT_ENV.exists() else None)

# Log to both stderr and a rotating file under <repo>/logs/kafka-sync.log
_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
_LOG_DIR.mkdir(parents=True, exist_ok=True)
_LOG_FILE = os.getenv("KAFKA_SYNC_LOG_FILE", str(_LOG_DIR / "kafka-sync.log"))

_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
_log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_log_datefmt = "%Y-%m-%d %H:%M:%S"

logging.basicConfig(
    level=_log_level,
    format=_log_format,
    datefmt=_log_datefmt,
    handlers=[
        logging.StreamHandler(),
        logging.handlers.RotatingFileHandler(
            _LOG_FILE, maxBytes=20 * 1024 * 1024, backupCount=5, encoding="utf-8"
        ),
    ],
)
logger = logging.getLogger("kafka-sync")

# ── Configuration ───────────────────────────────────────────────

KAFKA_BROKERS = os.environ["KAFKA_BROKERS"]
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "crm-sync")
KAFKA_TOPIC_PATTERN = os.getenv("KAFKA_TOPIC_PATTERN", r"^crm\.HCRM00365\..*")
KAFKA_USERNAME = os.getenv("KAFKA_USERNAME")
KAFKA_PASSWORD = os.getenv("KAFKA_PASSWORD")

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
if not DATABASE_URL:
    logger.error("DATABASE_URL or POSTGRES_URL must be set")
    sys.exit(1)

WORKSPACE_ID = os.environ["SUITECRM_WORKSPACE_ID"]

BATCH_SIZE = int(os.getenv("SYNC_BATCH_SIZE", "100"))


def build_kafka_conf() -> dict:
    conf = {
        "bootstrap.servers": KAFKA_BROKERS,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    }
    if KAFKA_USERNAME and KAFKA_PASSWORD:
        conf.update({
            "security.protocol": "SASL_PLAINTEXT",
            "sasl.mechanisms": "PLAIN",
            "sasl.username": KAFKA_USERNAME,
            "sasl.password": KAFKA_PASSWORD,
        })
    return conf


# ── Graceful shutdown ───────────────────────────────────────────

_running = True


def _shutdown(signum, frame):
    global _running
    logger.info("Received signal %s, shutting down...", signum)
    _running = False


signal.signal(signal.SIGINT, _shutdown)
signal.signal(signal.SIGTERM, _shutdown)


# ── Main ────────────────────────────────────────────────────────

def main():
    logger.info("Starting SuiteCRM Kafka Sync Service")
    logger.info("  Kafka: %s (group: %s)", KAFKA_BROKERS, KAFKA_GROUP_ID)
    logger.info("  Topic pattern: %s", KAFKA_TOPIC_PATTERN)
    logger.info("  Workspace: %s", WORKSPACE_ID)
    logger.info("  Batch size: %d", BATCH_SIZE)

    # Initialize DB handler
    handler = SyncHandler(
        dsn=DATABASE_URL,
        workspace_id=WORKSPACE_ID,
        redis_url=os.getenv("REDIS_URL"),
    )
    handler.connect()
    handler.ensure_lookup_table()

    # Initialize Kafka consumer
    kafka_conf = build_kafka_conf()
    consumer = create_consumer(kafka_conf, KAFKA_TOPIC_PATTERN)

    try:
        poll_messages(
            consumer,
            handler=handler.handle,
            batch_size=BATCH_SIZE,
        )
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    finally:
        logger.info("Closing consumer and DB connection...")
        consumer.close()
        handler.close()
        logger.info("Shutdown complete")


if __name__ == "__main__":
    main()
