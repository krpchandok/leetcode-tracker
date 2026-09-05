"""Structured (JSON) logging for the analytics pipeline, configured via
logging.config.dictConfig — no new Python dependency, since json/logging
are both stdlib.

This is conceptually the same idea as the Node backend's traceId (see
backend/utils/traceId.js): a single id attached to every log line so one
run's full trail can be grepped out. They are deliberately separate
mechanisms, though — this pipeline is a standalone batch job triggered
manually, not a step in the HTTP request chain those traceIds follow, so it
gets its own runId rather than trying to join the two.
"""

import json
import logging
import logging.config


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        run_id = getattr(record, "runId", None)
        if run_id:
            payload["runId"] = run_id
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": f"{__name__}.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}


def configure_logging():
    logging.config.dictConfig(LOGGING_CONFIG)


def get_run_logger(name: str, run_id: str) -> logging.LoggerAdapter:
    return logging.LoggerAdapter(logging.getLogger(name), {"runId": run_id})
