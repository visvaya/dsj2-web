"""Make replays that exercise paths the shipped replays never reach (falls, bounces, telemark).

Usage:
  python3 -I craft_replays.py make <Karpacz.rpl> <out-dir>
      Writes one <NAME>.RPL per scenario, built by changing the inputs of a
      replay recorded on Karpacz. Record the original game's state for each
      with trace_capture.py (one replay per game directory, index 0).
  python3 -I craft_replays.py set-distance <trace> <replay.rpl>
      Stores the distance the original game measured (last snapshot of the
      trace) in the replay, so the golden tests can compare against it.

The input bytes and frame numbers are relative to the Karpacz replay of the
v2.10P distribution (takeoff buttons from frame 308, flight input 322..614,
right landing button at 595). See docs/testing.md.
"""

from __future__ import annotations

import os
import struct
import sys
from collections.abc import Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rpl_codec import decode_replay, encode_replay

LEFT_LANDING_FRAME = 0x46A
RIGHT_LANDING_FRAME = 0x46E
BUTTON_WINDOW = 0x456
BUTTON_WINDOW_FRAMES = 20
MOTION_BYTES = 0x30
MOTION_FRAMES = 250
DISTANCE_TEXT = 0x25
DISTANCE_TEXT_MAX = 6
DISTANCE_OFFSET = 0x528E
TRACE_MAGIC = b"DSJTRACE"


def _no_landing(r: bytearray) -> None:
    struct.pack_into("<i", r, LEFT_LANDING_FRAME, 0)
    struct.pack_into("<i", r, RIGHT_LANDING_FRAME, 0)


def _wild(r: bytearray) -> None:
    _no_landing(r)
    for i in range(MOTION_BYTES, MOTION_BYTES + MOTION_FRAMES):
        r[i] = (256 - 60) if (i // 10) % 2 else 60


def _late(r: bytearray) -> None:
    struct.pack_into("<i", r, LEFT_LANDING_FRAME, 0)
    struct.pack_into("<i", r, RIGHT_LANDING_FRAME, 603)


def _early(r: bytearray) -> None:
    struct.pack_into("<i", r, LEFT_LANDING_FRAME, 0)
    struct.pack_into("<i", r, RIGHT_LANDING_FRAME, 340)
    for i in range(BUTTON_WINDOW_FRAMES):
        r[BUTTON_WINDOW + i] = 2


def _telemark(r: bytearray) -> None:
    struct.pack_into("<i", r, LEFT_LANDING_FRAME, 596)
    struct.pack_into("<i", r, RIGHT_LANDING_FRAME, 590)


# Name -> (change to the record, what the original game does with it).
SCENARIOS: dict[str, tuple[Callable[[bytearray], None], str]] = {
    "NOLAND": (_no_landing, "no landing button: fall type 4, bounces"),
    "WILD": (_wild, "no landing button, violent lean: fall type 4 early in the outrun"),
    "LATE": (_late, "landing button 8 frames late: fall type 4"),
    "EARLY": (_early, "takeoff buttons held, landing prepared right after takeoff: phases 6 and 9, fall type 2"),
    "TELEMARK": (_telemark, "second landing button in the air: phase 9, clean landing"),
}


def make(source: str, out_dir: str) -> None:
    with open(source, "rb") as f:
        header, record, ok = decode_replay(f.read())
    if not ok:
        raise SystemExit(f"{source}: checksum mismatch")
    os.makedirs(out_dir, exist_ok=True)
    for name, (mutate, description) in SCENARIOS.items():
        r = bytearray(record)
        mutate(r)
        with open(os.path.join(out_dir, f"{name}.RPL"), "wb") as f:
            f.write(encode_replay(header, bytes(r)))
        print(f"{name}: {description}")


def last_snapshot_distance(trace_path: str) -> float:
    with open(trace_path, "rb") as f:
        if f.read(len(TRACE_MAGIC)) != TRACE_MAGIC:
            raise SystemExit(f"{trace_path}: not a trace")
        _version, size, count = struct.unpack("<III", f.read(12))
        f.seek(f.tell() + (count - 1) * (5 + size) + 5)
        snapshot = f.read(size)
    return struct.unpack_from("<f", snapshot, DISTANCE_OFFSET)[0]


def set_distance(trace_path: str, replay_path: str) -> None:
    text = f"{last_snapshot_distance(trace_path):.2f}".encode()
    if len(text) > DISTANCE_TEXT_MAX:
        raise SystemExit(f"distance text too long: {text!r}")
    with open(replay_path, "rb") as f:
        header, record, ok = decode_replay(f.read())
    if not ok:
        raise SystemExit(f"{replay_path}: checksum mismatch")
    r = bytearray(record)
    r[DISTANCE_TEXT] = len(text)
    r[DISTANCE_TEXT + 1 : DISTANCE_TEXT + 1 + len(text)] = text
    with open(replay_path, "wb") as f:
        f.write(encode_replay(header, bytes(r)))
    print(f"{replay_path}: {text.decode()}")


def main() -> None:
    if len(sys.argv) == 4 and sys.argv[1] == "make":
        make(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 4 and sys.argv[1] == "set-distance":
        set_distance(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
