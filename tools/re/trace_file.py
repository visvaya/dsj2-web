"""Trace files of trace_capture.py and hill_capture.py, plain or gzip-compressed.

Layout (little endian):
  magic b"DSJTRACE", u32 version, u32 snapshot_bytes, u32 count
  count x { u32 frame, u8 point, u8[snapshot_bytes] data }

A file whose name ends in .gz holds the same bytes compressed with gzip
(about 80 times smaller). Traces are derived from the original game and must
not be committed in either form.
"""

from __future__ import annotations

import gzip
import struct
from typing import BinaryIO

TRACE_MAGIC = b"DSJTRACE"
TRACE_VERSION = 1
GZIP_SUFFIX = ".gz"


def is_compressed(path: str) -> bool:
    return path.lower().endswith(GZIP_SUFFIX)


def open_trace(path: str) -> BinaryIO:
    """Opens a trace for reading; seeking forward works in both forms."""
    return gzip.open(path, "rb") if is_compressed(path) else open(path, "rb")


def write_trace(path: str, snapshot_bytes: int, records: list[bytes]) -> None:
    """Writes records, each already packed as u32 frame, u8 point, data."""
    opener = gzip.open if is_compressed(path) else open
    with opener(path, "wb") as f:
        f.write(TRACE_MAGIC + struct.pack("<III", TRACE_VERSION, snapshot_bytes, len(records)))
        for record in records:
            f.write(record)
