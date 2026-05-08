import logging
from logging.handlers import RotatingFileHandler

from app.core.config import Settings


def configure_logging(settings: Settings) -> None:
    settings.ensure_local_dirs()
    log_path = settings.logs_dir / "app.log"

    root = logging.getLogger()
    root.setLevel(settings.log_level.upper())

    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler_exists = any(
        isinstance(handler, RotatingFileHandler)
        and getattr(handler, "baseFilename", "") == str(log_path)
        for handler in root.handlers
    )
    if not file_handler_exists:
        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=2_000_000,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)

    stream_handler_exists = any(
        isinstance(handler, logging.StreamHandler)
        and not isinstance(handler, RotatingFileHandler)
        for handler in root.handlers
    )
    if not stream_handler_exists:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        root.addHandler(stream_handler)
