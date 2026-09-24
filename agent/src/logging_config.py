import logging
import sys
from typing import Optional


class MaskingFormatter(logging.Formatter):
    """Custom Log Formatter that redacts sensitive device tokens and secrets from log records."""

    def __init__(self, fmt: Optional[str] = None, secret_token: Optional[str] = None):
        super().__init__(fmt)
        self.secret_token = secret_token

    def format(self, record: logging.LogRecord) -> str:
        formatted = super().format(record)
        if self.secret_token and len(self.secret_token) > 4:
            # Mask secret token with ***REDACTED***
            formatted = formatted.replace(self.secret_token, "***REDACTED_SECRET_TOKEN***")
        return formatted


def setup_logging(secret_token: Optional[str] = None, log_level: int = logging.INFO) -> logging.Logger:
    """Configures structured logging for the desktop activity agent."""
    logger = logging.getLogger("DEVSYNXAgent")
    logger.setLevel(log_level)

    # Avoid duplicate handlers
    if logger.handlers:
        return logger

    handler = logging.StreamHandler(sys.stdout)
    fmt_str = "%(asctime)s [%(levelname)s] [DEVSYNXAgent] %(message)s"
    formatter = MaskingFormatter(fmt=fmt_str, secret_token=secret_token)
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger
