"""Record the hill state the original game sets up for each hill.

Usage: python3 -I hill_capture.py <game-dir> <work-dir> <hills.hilltrace> [first last]

For every hill number in first..last (default 1..37) the game is booted,
training is started on the first hill of the list, and the argument of the
hill setup routine (0baf:631c) is replaced by that number on entry. Once the
routine has configured the inrun and landing profile (the join point after
the per-hill branches) a snapshot of DS[0:SNAPSHOT_BYTES] is stored.

The output uses the trace layout of trace_capture.py with the hill number as
the frame and HILL_SETUP_POINT as the point; the golden tests look for it as
hills.hilltrace or hills.hilltrace.gz in DSJ2_TRACE_DIR (a name that ends in
.gz is written gzip-compressed). It is derived from the original game and
must not be committed.
"""

from __future__ import annotations

import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_SP, UC_X86_REG_SS

from dos_machine import LOAD_SEGMENT
from game_session import BOOT_TICKS, MENU_SETTLE_TICKS, SOUND_SETUP_DONE, GameSession
from trace_capture import DATA_SEGMENT, SNAPSHOT_BYTES
from trace_file import write_trace

HILL_SETUP = (0x0BAF, 0x631C)
# All per-hill branches jump here once inrun_setup and landing_setup have run.
HILL_SETUP_JOIN = (0x0BAF, 0x8843)
HILL_SETUP_POINT = 4
HILL_COUNT = 37
MAIN_MENU_TRAINING = (70, 106)
TRAINING_FIRST_HILL = (75, 74)
MAX_TICKS = 2000


def linear(seg: int, off: int) -> int:
    return (LOAD_SEGMENT + seg) * 16 + off


def capture_hill(game_dir: str, work_dir: str, hill: int) -> bytes:
    session = GameSession(game_dir, work_dir)
    m = session.machine
    ds = (LOAD_SEGMENT + DATA_SEGMENT) * 16
    snapshot: list[bytes] = []

    def on_entry(uc, _address, _size, _user) -> None:
        # Far call with one word argument: [sp] ip, [sp+2] cs, [sp+4] hill.
        sp = uc.reg_read(UC_X86_REG_SS) * 16 + uc.reg_read(UC_X86_REG_SP)
        uc.mem_write(sp + 4, struct.pack("<H", hill))

    def on_join(uc, _address, _size, _user) -> None:
        if not snapshot:
            snapshot.append(bytes(uc.mem_read(ds, SNAPSHOT_BYTES)))

    # Hooks must exist before the code is first translated by Unicorn.
    entry = linear(*HILL_SETUP)
    join = linear(*HILL_SETUP_JOIN)
    m.uc.hook_add(UC_HOOK_CODE, on_entry, None, entry, entry)
    m.uc.hook_add(UC_HOOK_CODE, on_join, None, join, join)
    session.ticks(BOOT_TICKS)
    session.click(*SOUND_SETUP_DONE)
    session.ticks(MENU_SETTLE_TICKS)
    session.click(*MAIN_MENU_TRAINING)
    session.ticks(MENU_SETTLE_TICKS)
    session.click(*TRAINING_FIRST_HILL)
    while not snapshot and m.ticks < MAX_TICKS:
        session.ticks(10)
    if not snapshot:
        raise RuntimeError(f"hill {hill}: setup routine not reached")
    return snapshot[0]


def main() -> None:
    game_dir, work_dir, out_path = sys.argv[1:4]
    first, last = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (1, HILL_COUNT)
    records = []
    for hill in range(first, last + 1):
        data = capture_hill(game_dir, work_dir, hill)
        records.append(struct.pack("<IB", hill, HILL_SETUP_POINT) + data)
        print(f"hill {hill}: K{struct.unpack_from('<h', data, 0x464C)[0]}", flush=True)
    write_trace(out_path, SNAPSHOT_BYTES, records)
    print(f"{len(records)} hills written to {out_path}")


if __name__ == "__main__":
    main()
