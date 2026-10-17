"""Capture computer jumps of a World Cup competition played by the original game.

Usage:
  python3 -I cpu_capture.py <game-dir> <work-dir> <out-dir> <name> [options]

Options:
  --skip-hills N     untick the first N hills of the cup list, so that the
                     competition takes place on the next one (default 0:
                     Finlandia K105)
  --watch            tick "watching the opponents' jumps": the computer jumps
                     are drawn (presentation mode) instead of computed in the
                     background
  --levels L1,..,L8  skill level (0..4, 5 = random) of opponents 1..8, written
                     into the jumper list before the cup starts, as the
                     jumper editor would
  --jumps A-B        record jumps A..B of the competition (1-based, default
                     1-16: both rounds of eight computer jumpers)
  --seed J:HEX       force the random seed at the entry of the pilot setup of
                     jump J (repeatable): a patch of the generator for branches
                     that are rare in natural play
  --record J:F=V,..  patch fields of the jumper's computer record at the entry
                     of the pilot setup of jump J (repeatable); fields form1,
                     form2, talent1, talent2 (Single) and level (byte)
  --max-ticks N      upper bound of the run (default 12000 timer ticks)
  --shots            save a screenshot after each menu step into <work-dir>

Writes <out-dir>/<name>-NN.cputrace.gz for every recorded jump NN and
<out-dir>/<name>.cuptrace.gz with the cup and competition start. The layout
is that of trace_file.py; the points are listed in POINTS. Every snapshot
holds DS[0:SNAPSHOT_BYTES]. Traces are derived from the original game and
must not be committed.

The path through the menus: sound setup, World Cup, participants (player 1
unticked, so that every jumper is a computer opponent), hills, start of the
cup, two clicks through the start list. Each recorded jump is the stretch from
one call of the jump session (0baf:cc6e) to the next; the pilot setup
(0baf:8aeb) runs inside it before the frame loop.
"""

from __future__ import annotations

import argparse
import os
import struct
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unicorn import UC_HOOK_CODE

from dos_machine import LOAD_SEGMENT
from game_session import BOOT_TICKS, MENU_SETTLE_TICKS, SOUND_SETUP_DONE, GameSession
from trace_capture import DATA_SEGMENT, FRAME_COUNTER, SNAPSHOT_BYTES, TRACE_POINTS
from trace_file import write_trace

# Trace points beyond the four of the frame loop (0..3) and the hill setup (4).
CPU_SETUP_ENTRY = 5
CPU_SETUP_EXIT = 6
CUP_START = 7
CUP_END = 8
COMPETITION_START = 9
COMPETITION_END = 10
JUMP_END = 11
POINTS = [
    *[(i, seg, off) for i, (_name, seg, off) in enumerate(TRACE_POINTS)],
    (CPU_SETUP_ENTRY, 0x0BAF, 0x8AEB),
    # `ret 2` of the setup: its stores are done, the seed is the jump's seed.
    (CPU_SETUP_EXIT, 0x0BAF, 0x8EAB),
    # Before and after the loop that draws the talents of the computer jumpers.
    (CUP_START, 0x003F, 0x4DA1),
    (CUP_END, 0x003F, 0x4FBE),
    # Before and after the loop that draws their form for one competition.
    (COMPETITION_START, 0x003F, 0x5192),
    (COMPETITION_END, 0x003F, 0x51E9),
    # The common exit of the jump loop: the result of the jump is in.
    (JUMP_END, 0x0BAF, 0xD1F9),
]
JUMP_SESSION = (0x0BAF, 0xCC6E)
FRAME_LOGIC = 3
CUP_POINTS = {CUP_START, CUP_END, COMPETITION_START, COMPETITION_END}

RAND_SEED = 0x1942
JUMPER_INDEX = 0x58AE
CPU_RECORD = 0x5CBF
CPU_RECORD_BYTES = 17
# Offset and struct format of each field of a computer record.
CPU_RECORD_FIELDS = {
    "form1": (0, "<f"),
    "form2": (4, "<f"),
    "talent1": (8, "<f"),
    "talent2": (12, "<f"),
    "level": (16, "<B"),
}
JUMPER_LIST = 0x5906
JUMPER_LIST_BYTES = 26
JUMPER_LEVEL = 0x19
OPPONENT_FIRST_INDEX = 9
OPPONENT_COUNT = 8

# Screen positions (320x200) in v2.10P, Polish UI.
MAIN_MENU_WORLD_CUP = (80, 83)
CUP_MENU_START = (80, 83)
CUP_MENU_PARTICIPANTS = (80, 94)
CUP_MENU_HILLS = (80, 105)
PARTICIPANTS_PLAYER_1 = (52, 67)
PARTICIPANTS_WATCH = (52, 162)
HILL_LIST_FIRST = (52, 67)
HILL_LIST_ROW_PX = 11
HILL_LIST_ROWS = 8
HILL_LIST_SECOND_COLUMN_X = 172
BACK = (60, 178)
START_LIST_CONTINUE = (160, 180)
START_LIST_CLICKS = 2
DEFAULT_MAX_TICKS = 12000
POLL_TICKS = 10
# The frame loop has been quiet this long: a menu waits, or the last recorded jump is over.
QUIET_TICKS = 60


def linear(seg: int, off: int) -> int:
    return (LOAD_SEGMENT + seg) * 16 + off


def parse_jumps(text: str) -> tuple[int, int]:
    first, _, last = text.partition("-")
    return int(first), int(last or first)


def parse_seed(text: str) -> tuple[int, int]:
    jump, _, seed = text.partition(":")
    return int(jump), int(seed, 16) & 0xFFFFFFFF


def parse_record_patch(text: str) -> tuple[int, dict[str, float]]:
    jump, _, fields = text.partition(":")
    patch: dict[str, float] = {}
    for item in fields.split(","):
        name, _, value = item.partition("=")
        if name not in CPU_RECORD_FIELDS:
            raise ValueError(f"unknown record field {name!r}")
        patch[name] = float(value)
    return int(jump), patch


def record_patch_bytes(patch: dict[str, float]) -> list[tuple[int, bytes]]:
    """Offsets within the record and the bytes to write there."""
    out = []
    for name, value in patch.items():
        offset, fmt = CPU_RECORD_FIELDS[name]
        out.append((offset, struct.pack(fmt, int(value) if fmt == "<B" else value)))
    return out


def hill_checkbox(index: int) -> tuple[int, int]:
    column, row = divmod(index, HILL_LIST_ROWS)
    x = HILL_LIST_FIRST[0] if column == 0 else HILL_LIST_SECOND_COLUMN_X
    return x, HILL_LIST_FIRST[1] + row * HILL_LIST_ROW_PX


class Recorder:
    """Collects snapshots per jump and writes each jump when the next one starts."""

    def __init__(
        self,
        out_dir: str,
        name: str,
        jumps: tuple[int, int],
        seeds: dict[int, int],
        records: dict[int, dict[str, float]],
    ):
        self.out_dir = out_dir
        self.name = name
        self.first, self.last = jumps
        self.seeds = seeds
        self.records_patch = records
        self.jump = 0
        self.records: list[bytes] = []
        self.cup: list[bytes] = []
        self.written: list[tuple[str, int]] = []
        # Frames of any jump, recorded or not: a quiet frame loop means a menu waits for a click.
        self.frames = 0

    def armed(self) -> bool:
        return self.first <= self.jump <= self.last

    def flush(self) -> None:
        if self.armed() and self.records:
            path = os.path.join(
                self.out_dir, f"{self.name}-{self.jump:02d}.cputrace.gz"
            )
            write_trace(path, SNAPSHOT_BYTES, self.records)
            self.written.append((path, len(self.records)))
            print(
                f"jump {self.jump}: {len(self.records)} snapshots -> {path}", flush=True
            )
        self.records = []

    def done(self) -> bool:
        return self.jump > self.last


def run(args: argparse.Namespace) -> int:
    session = GameSession(args.game_dir, args.work_dir)
    m = session.machine
    ds = (LOAD_SEGMENT + DATA_SEGMENT) * 16
    seeds = dict(parse_seed(s) for s in args.seed)
    patches = dict(parse_record_patch(r) for r in args.record)
    rec = Recorder(args.out_dir, args.name, parse_jumps(args.jumps), seeds, patches)

    def snapshot(uc, point: int) -> bytes:
        data = bytes(uc.mem_read(ds, SNAPSHOT_BYTES))
        frame = struct.unpack_from("<I", data, FRAME_COUNTER)[0]
        return struct.pack("<IB", frame, point) + data

    def make_hook(point: int):
        def hook(uc, _address, _size, _user) -> None:
            if point == FRAME_LOGIC:
                rec.frames += 1
            if point in CUP_POINTS:
                rec.cup.append(snapshot(uc, point))
                return
            if not rec.armed():
                return
            if point == CPU_SETUP_ENTRY and rec.jump in rec.seeds:
                uc.mem_write(ds + RAND_SEED, struct.pack("<I", rec.seeds[rec.jump]))
            if point == CPU_SETUP_ENTRY and rec.jump in rec.records_patch:
                index = bytes(uc.mem_read(ds + JUMPER_INDEX, 1))[0]
                base = ds + CPU_RECORD + CPU_RECORD_BYTES * index
                for offset, data in record_patch_bytes(rec.records_patch[rec.jump]):
                    uc.mem_write(base + offset, data)
            rec.records.append(snapshot(uc, point))

        return hook

    def on_jump_session(_uc, _address, _size, _user) -> None:
        rec.flush()
        rec.jump += 1

    # Hooks must exist before the code is first translated by Unicorn.
    for point, seg, off in POINTS:
        a = linear(seg, off)
        m.uc.hook_add(UC_HOOK_CODE, make_hook(point), None, a, a)
    a = linear(*JUMP_SESSION)
    m.uc.hook_add(UC_HOOK_CODE, on_jump_session, None, a, a)

    def step(
        name: str, position: tuple[int, int], settle: int = MENU_SETTLE_TICKS
    ) -> None:
        session.click(*position)
        session.ticks(settle)
        if args.shots:
            session.screenshot(name)

    session.ticks(BOOT_TICKS)
    step("sound", SOUND_SETUP_DONE)
    step("cup", MAIN_MENU_WORLD_CUP)
    step("participants", CUP_MENU_PARTICIPANTS)
    step("participants-player", PARTICIPANTS_PLAYER_1, 10)
    if args.watch:
        step("participants-watch", PARTICIPANTS_WATCH, 10)
    step("participants-back", BACK)
    if args.skip_hills > 0:
        step("hills", CUP_MENU_HILLS)
        for i in range(args.skip_hills):
            step(f"hills-{i}", hill_checkbox(i), 10)
        step("hills-back", BACK)
    if args.levels:
        levels = [int(v) for v in args.levels.split(",")]
        if len(levels) != OPPONENT_COUNT:
            raise SystemExit(f"--levels needs {OPPONENT_COUNT} values")
        for k, level in enumerate(levels):
            entry = (
                ds
                + JUMPER_LIST
                + (OPPONENT_FIRST_INDEX + k) * JUMPER_LIST_BYTES
                + JUMPER_LEVEL
            )
            m.uc.mem_write(entry, bytes([level]))
    step("start", CUP_MENU_START)
    for i in range(START_LIST_CLICKS):
        step(f"start-list-{i}", START_LIST_CONTINUE)

    quiet = 0
    last_frames = rec.frames
    while m.ticks < args.max_ticks and not rec.done():
        session.ticks(POLL_TICKS)
        quiet = quiet + POLL_TICKS if rec.frames == last_frames else 0
        last_frames = rec.frames
        if quiet < QUIET_TICKS:
            continue
        if rec.jump == rec.last and rec.records:
            break
        # The results after a round, or after a watched jump, wait for a click.
        session.click(*START_LIST_CONTINUE)
        quiet = 0
    rec.flush()
    if rec.cup:
        path = os.path.join(args.out_dir, f"{args.name}.cuptrace.gz")
        write_trace(path, SNAPSHOT_BYTES, rec.cup)
        print(f"cup: {len(rec.cup)} snapshots -> {path}", flush=True)
    if args.shots:
        session.screenshot("end")
    print(
        f"stopped at tick {m.ticks} after jump {rec.jump}; {len(rec.written)} jump trace(s) written",
        flush=True,
    )
    wanted = rec.last - rec.first + 1
    return 0 if len(rec.written) == wanted and rec.cup else 1


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("game_dir")
    p.add_argument("work_dir")
    p.add_argument("out_dir")
    p.add_argument("name")
    p.add_argument("--skip-hills", type=int, default=0)
    p.add_argument("--watch", action="store_true")
    p.add_argument("--levels", default="")
    p.add_argument("--jumps", default="1-16")
    p.add_argument("--seed", action="append", default=[])
    p.add_argument("--record", action="append", default=[])
    p.add_argument("--max-ticks", type=int, default=DEFAULT_MAX_TICKS)
    p.add_argument("--shots", action="store_true")
    args = p.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    started = time.monotonic()
    code = run(args)
    print(f"duration {time.monotonic() - started:.0f} s", flush=True)
    sys.exit(code)


if __name__ == "__main__":
    main()
