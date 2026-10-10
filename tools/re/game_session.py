"""Scripted DSJ2 session on the headless DOS machine.

Usage:
  python3 -I game_session.py <game-dir> <work-dir> <step> [<step> ...]

Steps:
  w:N      run N timer ticks (18.2 Hz BIOS timer)
  m:X,Y    put the mouse at screen pixel X,Y (320x200)
  c        left click (3 ticks down, 3 ticks up)
  s:NAME   save a screenshot to <work-dir>/shots/NAME.png
  replay:N open the replay studio and start the N-th replay (0-based)

The game directory is copied to <work-dir>/drive-c before every run, so
the configuration files the game writes never leak between runs.
"""

from __future__ import annotations

import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dos_machine import DosMachine

CLICK_HOLD_TICKS = 3
BOOT_TICKS = 280
MENU_SETTLE_TICKS = 40

# Screen positions (320x200) of menu entries in v2.10P, Polish UI.
SOUND_SETUP_DONE = (65, 162)
MAIN_MENU_REPLAY_STUDIO = (80, 130)
REPLAY_LIST_FIRST_Y = 62
REPLAY_LIST_ROW_PX = 10
REPLAY_DETAILS_PLAY = (80, 131)
REPLAY_TOOLBAR_PLAY = (8, 17)


class GameSession:
    def __init__(self, game_dir: str, work_dir: str):
        self.work_dir = work_dir
        drive = os.path.join(work_dir, "drive-c")
        shutil.rmtree(drive, ignore_errors=True)
        shutil.copytree(game_dir, drive)
        self.machine = DosMachine(drive)

    def ticks(self, n: int) -> None:
        m = self.machine
        m.run(m.instructions + n * m.instructions_per_tick())

    def move(self, x: int, y: int) -> None:
        # The game halves the driver's X coordinate (640-wide virtual screen).
        self.machine.mouse.x, self.machine.mouse.y = x * 2, y

    def click(self, x: int | None = None, y: int | None = None) -> None:
        if x is not None and y is not None:
            self.move(x, y)
        self.machine.mouse.buttons = 1
        self.ticks(CLICK_HOLD_TICKS)
        self.machine.mouse.buttons = 0
        self.ticks(CLICK_HOLD_TICKS)

    def screenshot(self, name: str) -> str:
        shots = os.path.join(self.work_dir, "shots")
        os.makedirs(shots, exist_ok=True)
        path = os.path.join(shots, f"{name}.png")
        self.machine.screenshot(path)
        return path

    def start_replay(self, index: int) -> None:
        """Boot to the replay studio and press play on the index-th file."""
        self.ticks(BOOT_TICKS)
        self.click(*SOUND_SETUP_DONE)
        self.ticks(MENU_SETTLE_TICKS)
        self.click(*MAIN_MENU_REPLAY_STUDIO)
        self.ticks(MENU_SETTLE_TICKS)
        self.click(70, REPLAY_LIST_FIRST_Y + index * REPLAY_LIST_ROW_PX)
        self.ticks(20)
        self.click(*REPLAY_DETAILS_PLAY)
        self.ticks(60)
        self.click(*REPLAY_TOOLBAR_PLAY)


def main() -> None:
    session = GameSession(sys.argv[1], sys.argv[2])
    for step in sys.argv[3:]:
        kind, _, arg = step.partition(":")
        if kind == "w":
            session.ticks(int(arg))
        elif kind == "m":
            session.move(*map(int, arg.split(",")))
        elif kind == "c":
            session.click()
        elif kind == "s":
            print(session.screenshot(arg))
        elif kind == "replay":
            session.start_replay(int(arg))
        else:
            raise SystemExit(f"unknown step {step!r}")
    print("stopped at", session.machine.where(), "ticks", session.machine.ticks)


if __name__ == "__main__":
    main()
