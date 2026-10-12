"""Make replays that exercise what the shipped replays never reach (other hills, falls, bounces, telemark).

Usage:
  python3 -I craft_replays.py from-plan <base.rpl> <plan.json> <out.rpl>
      Writes a replay for the hill and input of a plan (scripts/plan-replays.mjs
      and scripts/search-falls.mjs write plans). The base replay, any replay
      of the game, only lends the names and the date. The distance text is
      left empty: record the replay and run set-distance.
  python3 -I craft_replays.py make <Karpacz.rpl> <out-dir>
      Writes one <NAME>.RPL per scenario, built by changing the inputs of a
      replay recorded on Karpacz. Record the original game's state for each
      with trace_capture.py (one replay per game directory, index 0).
  python3 -I craft_replays.py set-distance <trace> <replay.rpl>
      Stores the distance the original game measured (last snapshot of the
      trace, plain or .gz) in the replay, so the golden tests can compare
      against it.

The input bytes and frame numbers of `make` are relative to the Karpacz replay
of the v2.10P distribution (takeoff buttons from frame 308, flight input
322..614, right landing button at 595). See docs/testing.md and
docs/replay-format.md.
"""

from __future__ import annotations

import json
import os
import struct
import sys
from collections.abc import Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rpl_codec import decode_replay, encode_replay
from trace_file import TRACE_MAGIC, open_trace

WIND = 0x00
WIND_FIELDS = (
    "xMPerS",
    "yMPerS",
    "variabilityMPerS",
    "speedMPerS",
    "directionRad",
    "indicatorDirectionRad",
    "indicatorTurnRateRad",
    "indicatorMaxTurnRateRad",
)
HILL_NUMBER = 0x20
HILL_RECORD = 0x21
RANDOM_SEED = 0x2C
SCENERY_BYTE = 0x449
START_FRAME = 0x44A
BUTTON_WINDOW_START = 0x44E
MOTION_START = 0x452
LEFT_LANDING_FRAME = 0x46A
RIGHT_LANDING_FRAME = 0x46E
MOTION_END = 0x472
BUTTON_WINDOW = 0x456
BUTTON_WINDOW_FRAMES = 20
MOTION_BYTES = 0x30
MOTION_FRAMES = 250
MOTION_CAPACITY_FRAMES = SCENERY_BYTE - MOTION_BYTES
DISTANCE_TEXT = 0x25
HILL_COUNT = 37
# replay_save (190d:05ca) writes the first marker for hills 1..32 and the second for 33..37.
MARKER_V200 = b"//DSJ_v2.00//"
MARKER_V21P = b"//DSJ_v2.1P//"
LAST_V200_HILL = 32
DISTANCE_TEXT_MAX = 6
DISTANCE_OFFSET = 0x528E


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


def header_for_hill(hill: int) -> bytes:
    return MARKER_V21P if hill > LAST_V200_HILL else MARKER_V200


def check_plan(plan: dict) -> None:
    frames = [plan[k] for k in ("startFrame", "buttonWindowStart", "motionStart", "motionEnd")]
    frames += [plan["leftLandingFrame"], plan["rightLandingFrame"]]
    motion = plan["motion"]
    window = plan["buttonWindow"]
    if not 1 <= plan["hillNumber"] <= HILL_COUNT:
        raise ValueError(f"hill number {plan['hillNumber']} is not 1..{HILL_COUNT}")
    if any(frame < 0 for frame in frames):
        raise ValueError("frame numbers must not be negative")
    if len(window) != BUTTON_WINDOW_FRAMES or any(b not in (0, 1, 2) for b in window):
        raise ValueError(f"the takeoff window needs {BUTTON_WINDOW_FRAMES} values of 0, 1 or 2")
    if len(motion) != plan["motionEnd"] - plan["motionStart"] + 1:
        raise ValueError("the motion list does not match its first and last frame")
    if len(motion) > MOTION_CAPACITY_FRAMES:
        raise ValueError(f"motion spans {len(motion)} frames, a replay holds {MOTION_CAPACITY_FRAMES}")
    if any(not -128 <= dy <= 127 for dy in motion):
        raise ValueError("mouse motion must be in -128..127")


def apply_plan(base_record: bytes, plan: dict) -> bytes:
    """The base record with wind, hill, seed and input replaced by the plan's.

    The hill record (0x21) and the scenery byte (0x449) only affect what the
    game draws and are cleared; the distance text is emptied, because only
    the original game can say how far the jump goes (see set-distance).
    """
    check_plan(plan)
    r = bytearray(base_record)
    struct.pack_into("<8f", r, WIND, *(plan["wind"][name] for name in WIND_FIELDS))
    r[HILL_NUMBER] = plan["hillNumber"]
    r[HILL_RECORD : HILL_RECORD + 4] = bytes(4)
    r[DISTANCE_TEXT : DISTANCE_TEXT + 1 + DISTANCE_TEXT_MAX] = bytes(1 + DISTANCE_TEXT_MAX)
    struct.pack_into("<I", r, RANDOM_SEED, plan["randomSeed"])
    r[MOTION_BYTES:SCENERY_BYTE] = bytes(MOTION_CAPACITY_FRAMES)
    r[MOTION_BYTES : MOTION_BYTES + len(plan["motion"])] = bytes(dy & 0xFF for dy in plan["motion"])
    r[SCENERY_BYTE] = 0
    struct.pack_into("<iii", r, START_FRAME, plan["startFrame"], plan["buttonWindowStart"], plan["motionStart"])
    r[BUTTON_WINDOW : BUTTON_WINDOW + BUTTON_WINDOW_FRAMES] = bytes(plan["buttonWindow"])
    struct.pack_into("<iii", r, LEFT_LANDING_FRAME, plan["leftLandingFrame"], plan["rightLandingFrame"], plan["motionEnd"])
    return bytes(r)


def plan_from_record(record: bytes) -> dict:
    """The plan a record holds: the inverse of apply_plan."""
    start, window_start, motion_start = struct.unpack_from("<iii", record, START_FRAME)
    left, right, motion_end = struct.unpack_from("<iii", record, LEFT_LANDING_FRAME)
    count = max(0, motion_end - motion_start + 1)
    return {
        "hillNumber": record[HILL_NUMBER],
        "randomSeed": struct.unpack_from("<I", record, RANDOM_SEED)[0],
        "wind": dict(zip(WIND_FIELDS, struct.unpack_from("<8f", record, WIND), strict=True)),
        "startFrame": start,
        "buttonWindowStart": window_start,
        "buttonWindow": list(record[BUTTON_WINDOW : BUTTON_WINDOW + BUTTON_WINDOW_FRAMES]),
        "motionStart": motion_start,
        "motionEnd": motion_end,
        "motion": [b - 256 if b > 127 else b for b in record[MOTION_BYTES : MOTION_BYTES + count]],
        "leftLandingFrame": left,
        "rightLandingFrame": right,
    }


def from_plan(base_path: str, plan_path: str, out_path: str) -> None:
    with open(base_path, "rb") as f:
        _header, record, ok = decode_replay(f.read())
    if not ok:
        raise SystemExit(f"{base_path}: checksum mismatch")
    with open(plan_path, encoding="utf-8") as f:
        plan = json.load(f)["plan"]
    try:
        crafted = apply_plan(record, plan)
    except ValueError as error:
        raise SystemExit(f"{plan_path}: {error}") from error
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(encode_replay(header_for_hill(plan["hillNumber"]), crafted))
    print(f"{out_path}: hill {plan['hillNumber']}")


def last_snapshot_distance(trace_path: str) -> float:
    with open_trace(trace_path) as f:
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
    elif len(sys.argv) == 5 and sys.argv[1] == "from-plan":
        from_plan(sys.argv[2], sys.argv[3], sys.argv[4])
    elif len(sys.argv) == 4 and sys.argv[1] == "set-distance":
        set_distance(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
