"""Capture per-frame data-segment snapshots while the original game plays a replay.

Usage: python3 -I trace_capture.py <game-dir> <work-dir> <replay-index> <out.trace> [max-ticks]

The frame loop of v2.10P calls, in order: wind_update (0baf:976a),
jumper_step (1c06:02a1), read_input (0baf:9a3c), frame_logic (0baf:9c52).
A snapshot of DS[0:SNAPSHOT_BYTES] is taken at the entry of each, so the
exit state of one routine is the entry snapshot of the next.

Trace file layout (little endian):
  magic b"DSJTRACE", u32 version, u32 snapshot_bytes, u32 count
  count x { u32 frame, u8 point, u8[snapshot_bytes] data }
`point` indexes TRACE_POINTS. The trace is derived from the original game
and must not be committed.
"""

from __future__ import annotations

import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dos_machine import LOAD_SEGMENT
from game_session import GameSession
from unicorn import UC_HOOK_CODE

DATA_SEGMENT = 0x22F2
SNAPSHOT_BYTES = 0x6000
TRACE_VERSION = 1
FRAME_COUNTER = 0x4CA0
TRACE_POINTS = [
    ("wind_update", 0x0BAF, 0x976A),
    ("jumper_step", 0x1C06, 0x02A1),
    ("read_input", 0x0BAF, 0x9A3C),
    ("frame_logic", 0x0BAF, 0x9C52),
]
DEFAULT_MAX_TICKS = 1500


def capture(game_dir: str, work_dir: str, replay_index: int, out_path: str, max_ticks: int) -> int:
    session = GameSession(game_dir, work_dir)
    m = session.machine
    ds = (LOAD_SEGMENT + DATA_SEGMENT) * 16
    records: list[bytes] = []
    armed = [False]

    def make_hook(point: int):
        def hook(uc, address, size, user_data):
            if not armed[0]:
                return
            data = bytes(uc.mem_read(ds, SNAPSHOT_BYTES))
            frame = struct.unpack_from("<I", data, FRAME_COUNTER)[0]
            records.append(struct.pack("<IB", frame, point) + data)
        return hook

    for i, (_name, seg, off) in enumerate(TRACE_POINTS):
        a = (LOAD_SEGMENT + seg) * 16 + off
        # Hooks must exist before the code is first translated by Unicorn.
        m.uc.hook_add(UC_HOOK_CODE, make_hook(i), None, a, a)
    session.start_replay(replay_index)
    armed[0] = True
    # Stop once the jump loop has ended: no snapshots for a while.
    last = 0
    while m.ticks < max_ticks:
        session.ticks(50)
        if len(records) == last and last > 0:
            break
        last = len(records)
    with open(out_path, "wb") as f:
        f.write(b"DSJTRACE" + struct.pack("<III", TRACE_VERSION, SNAPSHOT_BYTES, len(records)))
        f.writelines(records)
    return len(records)


def main() -> None:
    max_ticks = int(sys.argv[5]) if len(sys.argv) > 5 else DEFAULT_MAX_TICKS
    n = capture(sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], max_ticks)
    print(f"{n} snapshots written to {sys.argv[4]}")


if __name__ == "__main__":
    main()
