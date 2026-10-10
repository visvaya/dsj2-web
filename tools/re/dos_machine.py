"""Minimal headless DOS machine on top of Unicorn, enough to run DSJ2.

The CPU (8086..386 and x87) is emulated by Unicorn. DOS and BIOS services
are emulated in Python on demand: when the program executes `INT n`, the
vector is looked up in the guest interrupt table. Vectors the program has
installed itself are entered like a real CPU would (push flags, CS, IP);
vectors still pointing into the BIOS stub area are serviced here.

Usage: python3 -I dos_machine.py <game-dir> [max-instructions]
The game directory is used as the C:\\ drive; files are opened from it and
files created by the game are written there.
"""

from __future__ import annotations

import fnmatch
import os
import struct
import sys
from collections import deque
from dataclasses import dataclass, field

from unicorn import UC_ARCH_X86, UC_HOOK_INSN, UC_HOOK_INTR, UC_MODE_16, Uc, UcError
from unicorn.x86_const import (
    UC_X86_INS_IN,
    UC_X86_INS_OUT,
    UC_X86_REG_AX,
    UC_X86_REG_BX,
    UC_X86_REG_CS,
    UC_X86_REG_CX,
    UC_X86_REG_DS,
    UC_X86_REG_DX,
    UC_X86_REG_EFLAGS,
    UC_X86_REG_ES,
    UC_X86_REG_IP,
    UC_X86_REG_SI,
    UC_X86_REG_SP,
    UC_X86_REG_SS,
)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mz_image import PARAGRAPH_BYTES, load_mz, restore_fpu

MEMORY_BYTES = 0x110000
PSP_SEGMENT = 0x0FF0
LOAD_SEGMENT = PSP_SEGMENT + 0x10
ENV_SEGMENT = 0x0F00
TOP_OF_MEMORY_SEGMENT = 0xA000
BIOS_STUB_SEGMENT = 0xF000
VGA_LINEAR = 0xA0000
PIT_HZ = 1193182
DEFAULT_TIMER_DIVISOR = 0x10000
INSTRUCTIONS_PER_SECOND = 20_000_000  # assumed guest speed for timer pacing

DEVICE_NAMES = {"NUL", "PRN", "LPT1", "LPT2", "CON", "AUX", "COM1", "COM2"}

FLAG_CF = 0x0001
FLAG_ZF = 0x0040
FLAG_IF = 0x0200


class GuestExit(Exception):
    pass


@dataclass
class MouseState:
    x: int = 320
    y: int = 100
    buttons: int = 0
    mickeys_x: int = 0
    mickeys_y: int = 0
    x_range: tuple[int, int] = (0, 639)
    y_range: tuple[int, int] = (0, 199)

    def move(self, dx: int, dy: int) -> None:
        """Relative motion in mickeys, as a physical mouse would report."""
        self.mickeys_x = (self.mickeys_x + dx) & 0xFFFF
        self.mickeys_y = (self.mickeys_y + dy) & 0xFFFF
        self.x = min(max(self.x + dx, self.x_range[0]), self.x_range[1])
        self.y = min(max(self.y + dy, self.y_range[0]), self.y_range[1])


@dataclass
class OpenFile:
    path: str
    handle: object
    writable: bool


@dataclass
class DosMachine:
    game_dir: str
    exe_name: str = "DSJ.EXE"
    restore_x87: bool = True
    log: list[str] = field(default_factory=list)
    trace_ints: bool = False

    def __post_init__(self) -> None:
        self.uc = Uc(UC_ARCH_X86, UC_MODE_16)
        self.uc.mem_map(0, MEMORY_BYTES)
        self.files: dict[int, OpenFile] = {}
        self.next_handle = 5
        self.mem_free_segment = 0
        self.video_mode = 3
        self.palette = bytearray(256 * 3)
        self.dac_write_index = 0
        self.dac_component = 0
        self.mouse = MouseState()
        self.key_queue: deque[int] = deque()  # BIOS keys (scan << 8 | ascii)
        self.scancodes: deque[int] = deque()  # raw port 60h bytes
        self.last_scancode = 0
        self.timer_divisor = DEFAULT_TIMER_DIVISOR
        self.pit_latch_low: int | None = None
        self.pit_write_low: int | None = None
        self.retrace_toggle = 0
        self.instructions = 0
        self.ticks = 0
        self.exit_code: int | None = None
        self.dta = (PSP_SEGMENT, 0x80)
        self.searches: dict[tuple[int, int], deque[str]] = {}
        self.int_counts: dict[str, int] = {}
        self._install_ivt()
        self._load_exe()
        self.uc.hook_add(UC_HOOK_INTR, self._on_interrupt)
        self.uc.hook_add(UC_HOOK_INSN, self._on_in, None, 1, 0, UC_X86_INS_IN)
        self.uc.hook_add(UC_HOOK_INSN, self._on_out, None, 1, 0, UC_X86_INS_OUT)

    # ------------------------------------------------------------------ setup
    def _install_ivt(self) -> None:
        for vec in range(256):
            self.write_word(vec * 4, vec)
            self.write_word(vec * 4 + 2, BIOS_STUB_SEGMENT)
            # The stub is an IRET so a chained far call into it still returns.
            self.uc.mem_write(BIOS_STUB_SEGMENT * 16 + vec, b"\xcf")
        # BIOS data area: equipment word, memory size, tick counter.
        self.write_word(0x410, 0x0021)
        self.write_word(0x413, 640)
        self.write_word(0x449, 3)

    def _load_exe(self) -> None:
        path = self.host_path(self.exe_name)
        mz = load_mz(path)
        image = mz.image
        if self.restore_x87:
            restore_fpu(image, mz.reloc_linear_set())
        for off, seg in mz.relocations:
            a = seg * PARAGRAPH_BYTES + off
            struct.pack_into("<H", image, a, (struct.unpack_from("<H", image, a)[0] + LOAD_SEGMENT) & 0xFFFF)
        self.image_segment = LOAD_SEGMENT
        self.uc.mem_write(LOAD_SEGMENT * 16, bytes(image))
        end_seg = LOAD_SEGMENT + (len(image) + 15) // 16
        # PSP
        psp = PSP_SEGMENT * 16
        self.uc.mem_write(psp, b"\xcd\x20")
        self.write_word(psp + 2, TOP_OF_MEMORY_SEGMENT)
        self.write_word(psp + 0x2C, ENV_SEGMENT)
        self.uc.mem_write(psp + 0x80, b"\x00\x0d")
        env = b"PATH=C:\\\x00COMSPEC=C:\\COMMAND.COM\x00\x00\x01\x00C:\\" + self.exe_name.encode() + b"\x00"
        self.uc.mem_write(ENV_SEGMENT * 16, env)
        self.program_end_segment = end_seg
        self.mem_free_segment = TOP_OF_MEMORY_SEGMENT
        regs = self.uc
        regs.reg_write(UC_X86_REG_CS, LOAD_SEGMENT + mz.entry_cs)
        regs.reg_write(UC_X86_REG_IP, mz.entry_ip)
        regs.reg_write(UC_X86_REG_SS, LOAD_SEGMENT + mz.initial_ss)
        regs.reg_write(UC_X86_REG_SP, mz.initial_sp)
        regs.reg_write(UC_X86_REG_DS, PSP_SEGMENT)
        regs.reg_write(UC_X86_REG_ES, PSP_SEGMENT)
        regs.reg_write(UC_X86_REG_EFLAGS, 0x0202)

    # ---------------------------------------------------------------- helpers
    def host_path(self, dos_name: str) -> str:
        name = dos_name.replace("\\", "/").split(":")[-1].lstrip("/")
        want = name.lower()
        for entry in os.listdir(self.game_dir):
            if entry.lower() == want:
                return os.path.join(self.game_dir, entry)
        return os.path.join(self.game_dir, name.upper())

    def read_word(self, a: int) -> int:
        return struct.unpack("<H", self.uc.mem_read(a, 2))[0]

    def write_word(self, a: int, v: int) -> None:
        self.uc.mem_write(a, struct.pack("<H", v & 0xFFFF))

    def reg(self, r: int) -> int:
        return self.uc.reg_read(r)

    def set(self, r: int, v: int) -> None:
        self.uc.reg_write(r, v & 0xFFFF)

    def asciiz(self, seg: int, off: int) -> str:
        data = self.uc.mem_read(seg * 16 + off, 128)
        return bytes(data).split(b"\x00")[0].decode("latin-1")

    def set_carry(self, on: bool) -> None:
        # The flags live in the IRET frame for vectored calls, but our Python
        # services run in place of the INT instruction, so set them directly.
        fl = self.reg(UC_X86_REG_EFLAGS)
        self.uc.reg_write(UC_X86_REG_EFLAGS, (fl | FLAG_CF) if on else (fl & ~FLAG_CF))

    def set_zero(self, on: bool) -> None:
        fl = self.reg(UC_X86_REG_EFLAGS)
        self.uc.reg_write(UC_X86_REG_EFLAGS, (fl | FLAG_ZF) if on else (fl & ~FLAG_ZF))

    def fail(self, code: int) -> None:
        self.set(UC_X86_REG_AX, code)
        self.set_carry(True)

    def push(self, v: int) -> None:
        sp = (self.reg(UC_X86_REG_SP) - 2) & 0xFFFF
        self.set(UC_X86_REG_SP, sp)
        self.write_word(self.reg(UC_X86_REG_SS) * 16 + sp, v)

    def enter_vector(self, vec: int, return_ip: int) -> None:
        flags = self.reg(UC_X86_REG_EFLAGS)
        self.push(flags)
        self.push(self.reg(UC_X86_REG_CS))
        self.push(return_ip)
        self.uc.reg_write(UC_X86_REG_EFLAGS, flags & ~FLAG_IF & ~0x100)
        self.set(UC_X86_REG_CS, self.read_word(vec * 4 + 2))
        self.set(UC_X86_REG_IP, self.read_word(vec * 4))

    def vector_is_guest(self, vec: int) -> bool:
        return self.read_word(vec * 4 + 2) != BIOS_STUB_SEGMENT

    # ------------------------------------------------------------- interrupts
    def _on_interrupt(self, uc: Uc, intno: int, _user) -> None:
        ip = self.reg(UC_X86_REG_IP)
        key = f"{intno:02x}"
        ah = self.reg(UC_X86_REG_AX) >> 8
        if intno in (0x10, 0x21, 0x16, 0x33):
            key += f":{ah:02x}"
        self.int_counts[key] = self.int_counts.get(key, 0) + 1
        if self.vector_is_guest(intno):
            self.enter_vector(intno, ip)
            return
        handler = getattr(self, f"int_{intno:02x}", None)
        if handler is None:
            self.log.append(f"unhandled int {intno:02x} ax={self.reg(UC_X86_REG_AX):04x} at {self.reg(UC_X86_REG_CS):04x}:{ip:04x}")
            return
        handler()

    def int_08(self) -> None:
        pass

    def int_1c(self) -> None:
        pass

    def int_10(self) -> None:
        ax = self.reg(UC_X86_REG_AX)
        ah, al = ax >> 8, ax & 0xFF
        if ah == 0x00:
            self.video_mode = al & 0x7F
        elif ah == 0x0F:
            self.set(UC_X86_REG_AX, (80 << 8) | self.video_mode)
            self.set(UC_X86_REG_BX, self.reg(UC_X86_REG_BX) & 0x00FF)
        elif ah == 0x10 and al == 0x12:
            start, count = self.reg(UC_X86_REG_BX), self.reg(UC_X86_REG_CX)
            data = self.uc.mem_read(self.reg(UC_X86_REG_ES) * 16 + self.reg(UC_X86_REG_DX), count * 3)
            self.palette[start * 3:(start + count) * 3] = data
        elif ah == 0x10 and al == 0x10:
            i = self.reg(UC_X86_REG_BX)
            dh, ch, cl = self.reg(UC_X86_REG_DX) >> 8, self.reg(UC_X86_REG_CX) >> 8, self.reg(UC_X86_REG_CX) & 0xFF
            self.palette[i * 3:i * 3 + 3] = bytes((dh, ch, cl))
        elif ah == 0x1A:
            self.set(UC_X86_REG_AX, 0x001A)
            self.set(UC_X86_REG_BX, 0x0008)
        elif ah == 0x12:
            self.set(UC_X86_REG_BX, 0x0003)
        # Cursor and text services are ignored.

    def int_11(self) -> None:
        self.set(UC_X86_REG_AX, self.read_word(0x410))

    def int_12(self) -> None:
        self.set(UC_X86_REG_AX, 640)

    def int_15(self) -> None:
        self.set_carry(True)

    def int_16(self) -> None:
        ah = self.reg(UC_X86_REG_AX) >> 8
        if ah in (0x00, 0x10):
            if not self.key_queue:
                raise GuestExit("waiting for key with empty input queue")
            self.set(UC_X86_REG_AX, self.key_queue.popleft())
        elif ah in (0x01, 0x11):
            if self.key_queue:
                self.set(UC_X86_REG_AX, self.key_queue[0])
                self.set_zero(False)
            else:
                self.set_zero(True)
        elif ah in (0x02, 0x12):
            self.set(UC_X86_REG_AX, 0)

    def int_1a(self) -> None:
        ah = self.reg(UC_X86_REG_AX) >> 8
        if ah == 0:
            t = self.ticks
            self.set(UC_X86_REG_CX, t >> 16)
            self.set(UC_X86_REG_DX, t & 0xFFFF)
            self.set(UC_X86_REG_AX, 0)

    def int_33(self) -> None:
        ax = self.reg(UC_X86_REG_AX)
        mouse = self.mouse
        if ax == 0x00:
            self.set(UC_X86_REG_AX, 0xFFFF)
            self.set(UC_X86_REG_BX, 2)
        elif ax == 0x03:
            self.set(UC_X86_REG_BX, mouse.buttons)
            self.set(UC_X86_REG_CX, mouse.x)
            self.set(UC_X86_REG_DX, mouse.y)
        elif ax == 0x04:
            mouse.x, mouse.y = self.reg(UC_X86_REG_CX), self.reg(UC_X86_REG_DX)
        elif ax == 0x0B:
            self.set(UC_X86_REG_CX, mouse.mickeys_x)
            self.set(UC_X86_REG_DX, mouse.mickeys_y)
            mouse.mickeys_x = mouse.mickeys_y = 0
        elif ax in (0x07, 0x08):
            lo, hi = self.reg(UC_X86_REG_CX), self.reg(UC_X86_REG_DX)
            if ax == 0x07:
                mouse.x_range = (lo, hi)
            else:
                mouse.y_range = (lo, hi)
        # Show/hide cursor, sensitivity and the rest are accepted silently.

    def int_2f(self) -> None:
        pass

    def int_21(self) -> None:
        ax = self.reg(UC_X86_REG_AX)
        ah, al = ax >> 8, ax & 0xFF
        ds, dx, bx, cx = (self.reg(UC_X86_REG_DS), self.reg(UC_X86_REG_DX),
                          self.reg(UC_X86_REG_BX), self.reg(UC_X86_REG_CX))
        self.set_carry(False)
        if ah == 0x25:
            self.write_word(al * 4, dx)
            self.write_word(al * 4 + 2, ds)
        elif ah == 0x35:
            self.set(UC_X86_REG_BX, self.read_word(al * 4))
            self.set(UC_X86_REG_ES, self.read_word(al * 4 + 2))
        elif ah == 0x30:
            self.set(UC_X86_REG_AX, 0x0005)
            self.set(UC_X86_REG_BX, 0)
            self.set(UC_X86_REG_CX, 0)
        elif ah == 0x4A:
            pass
        elif ah == 0x48:
            self.mem_free_segment -= bx
            if self.mem_free_segment < self.program_end_segment:
                self.mem_free_segment += bx
                self.set(UC_X86_REG_BX, 0)
                self.fail(8)
            else:
                self.set(UC_X86_REG_AX, self.mem_free_segment)
        elif ah == 0x49:
            pass
        elif ah == 0x4C:
            self.exit_code = al
            raise GuestExit(f"exit {al}")
        elif ah == 0x2C:
            s = self.instructions // INSTRUCTIONS_PER_SECOND
            self.set(UC_X86_REG_CX, (12 << 8) | ((s // 60) % 60))
            self.set(UC_X86_REG_DX, ((s % 60) << 8))
        elif ah == 0x2A:
            self.set(UC_X86_REG_CX, 2002)
            self.set(UC_X86_REG_DX, (1 << 8) | 1)
            self.set(UC_X86_REG_AX, (ah << 8) | 2)
        elif ah == 0x1A:
            self.dta = (ds, dx)
        elif ah == 0x2F:
            self.set(UC_X86_REG_ES, self.dta[0])
            self.set(UC_X86_REG_BX, self.dta[1])
        elif ah in (0x3D, 0x3C, 0x5B):
            name = self.asciiz(ds, dx)
            if name.upper().rstrip(":") in DEVICE_NAMES:
                h = self.next_handle
                self.next_handle += 1
                self.files[h] = OpenFile(name, open(os.devnull, "r+b"), True)  # noqa: SIM115 kept open as a guest handle
                self.set(UC_X86_REG_AX, h)
                return
            path = self.host_path(name)
            try:
                if ah == 0x3D:
                    mode = al & 3
                    f = open(path, "r+b" if mode else "rb")  # noqa: SIM115 guest handle
                    writable = mode != 0
                else:
                    f = open(path, "w+b")  # noqa: SIM115 guest handle
                    writable = True
            except OSError:
                self.log.append(f"open failed: {name}")
                self.fail(2)
                return
            h = self.next_handle
            self.next_handle += 1
            self.files[h] = OpenFile(path, f, writable)
            self.log.append(f"open {name} -> {h}")
            self.set(UC_X86_REG_AX, h)
        elif ah == 0x3E:
            f = self.files.pop(bx, None)
            if f:
                f.handle.close()
        elif ah == 0x3F:
            if bx in self.files:
                data = self.files[bx].handle.read(cx)
                self.uc.mem_write(ds * 16 + dx, data)
                self.set(UC_X86_REG_AX, len(data))
            elif bx == 0:
                self.set(UC_X86_REG_AX, 0)
            else:
                self.fail(6)
        elif ah == 0x40:
            data = bytes(self.uc.mem_read(ds * 16 + dx, cx))
            if bx in self.files:
                self.files[bx].handle.write(data)
            elif bx in (1, 2):
                self.log.append("stdout: " + data.decode("latin-1").rstrip())
            self.set(UC_X86_REG_AX, cx)
        elif ah == 0x42:
            if bx not in self.files:
                self.fail(6)
                return
            pos = (cx << 16) | dx
            if pos & 0x80000000:
                pos -= 1 << 32
            new = self.files[bx].handle.seek(pos, al)
            self.set(UC_X86_REG_AX, new & 0xFFFF)
            self.set(UC_X86_REG_DX, new >> 16)
        elif ah == 0x44:
            if al == 0x00:
                self.set(UC_X86_REG_DX, 0x80D3 if bx < 5 else 0x0000)
            else:
                self.set(UC_X86_REG_AX, 0)
        elif ah == 0x43:
            path = self.host_path(self.asciiz(ds, dx))
            if al == 0 and os.path.exists(path):
                self.set(UC_X86_REG_CX, 0x20)
            elif al != 0:
                pass
            else:
                self.fail(2)
        elif ah == 0x41:
            try:
                os.remove(self.host_path(self.asciiz(ds, dx)))
            except OSError:
                self.fail(2)
        elif ah == 0x4E:
            pattern = self.asciiz(ds, dx).replace("\\", "/").split("/")[-1].split(":")[-1].upper()
            names = sorted(e.upper() for e in os.listdir(self.game_dir)
                           if os.path.isfile(os.path.join(self.game_dir, e)) and len(e) <= 12
                           and fnmatch.fnmatchcase(e.upper(), pattern.replace("*.*", "*")))
            self.searches[self.dta] = deque(names)
            self.find_next()
        elif ah == 0x4F:
            self.find_next()
        elif ah == 0x19:
            self.set(UC_X86_REG_AX, (ah << 8) | 2)
        elif ah in (0x0E,):
            self.set(UC_X86_REG_AX, (ah << 8) | 3)
        elif ah == 0x47:
            self.uc.mem_write(self.reg(UC_X86_REG_DS) * 16 + self.reg(UC_X86_REG_SI), b"\x00")
        elif ah == 0x3B:
            pass
        elif ah == 0x09:
            s = bytes(self.uc.mem_read(ds * 16 + dx, 256)).split(b"$")[0]
            self.log.append("stdout: " + s.decode("latin-1").rstrip())
        elif ah == 0x02:
            pass
        elif ah in (0x06, 0x07, 0x08, 0x0B, 0x0C):
            self.set(UC_X86_REG_AX, (ah << 8) | 0)
        elif ah == 0x58:
            self.set(UC_X86_REG_AX, 0)
        else:
            self.log.append(f"unhandled int21 ah={ah:02x} al={al:02x}")
            self.fail(1)

    def find_next(self) -> None:
        queue = self.searches.get(self.dta)
        if not queue:
            self.fail(18)
            return
        name = queue.popleft()
        size = os.path.getsize(self.host_path(name))
        dta = self.dta[0] * 16 + self.dta[1]
        self.uc.mem_write(dta + 0x15, struct.pack("<BHHI", 0x20, 0, 0x2C21, size))
        self.uc.mem_write(dta + 0x1E, name.encode("latin-1")[:12].ljust(13, b"\x00"))

    # ------------------------------------------------------------------ ports
    def _on_in(self, uc: Uc, port: int, size: int, _user) -> int:
        if port == 0x60:
            if self.scancodes:
                self.last_scancode = self.scancodes.popleft()
            return self.last_scancode
        if port == 0x61:
            return 0
        if port == 0x64:
            return 0x00
        if port in (0x3DA, 0x3BA):
            self.retrace_toggle ^= 0x09
            return self.retrace_toggle
        if port == 0x40:
            count = self.pit_counter()
            if self.pit_latch_low is None:
                self.pit_latch_low = count >> 8
                return count & 0xFF
            hi = self.pit_latch_low
            self.pit_latch_low = None
            return hi
        if port == 0x21:
            return 0
        if port == 0x201:
            return 0xFF
        if 0x220 <= port <= 0x22F or 0x388 <= port <= 0x389:
            return 0xFF
        return 0xFF

    def _on_out(self, uc: Uc, port: int, size: int, value: int, _user) -> None:
        if port == 0x43:
            self.pit_write_low = None
        elif port == 0x40:
            if self.pit_write_low is None:
                self.pit_write_low = value & 0xFF
            else:
                self.timer_divisor = ((value & 0xFF) << 8 | self.pit_write_low) or DEFAULT_TIMER_DIVISOR
                self.pit_write_low = None
                self.log.append(f"timer divisor {self.timer_divisor} ({PIT_HZ / self.timer_divisor:.2f} Hz)")
        elif port == 0x3C8:
            self.dac_write_index = value & 0xFF
            self.dac_component = 0
        elif port == 0x3C9:
            self.palette[self.dac_write_index * 3 + self.dac_component] = value & 0x3F
            self.dac_component += 1
            if self.dac_component == 3:
                self.dac_component = 0
                self.dac_write_index = (self.dac_write_index + 1) & 0xFF

    def pit_counter(self) -> int:
        period = self.timer_divisor
        cycles = int(self.instructions * PIT_HZ / INSTRUCTIONS_PER_SECOND)
        return (period - cycles % period) & 0xFFFF

    # ---------------------------------------------------------------- running
    def instructions_per_tick(self) -> int:
        return int(INSTRUCTIONS_PER_SECOND * self.timer_divisor / PIT_HZ)

    def run(self, max_instructions: int, on_tick=None) -> None:
        """Run, delivering timer IRQ0 at the programmed PIT rate."""
        while self.instructions < max_instructions and self.exit_code is None:
            chunk = self.instructions_per_tick()
            cs, ip = self.reg(UC_X86_REG_CS), self.reg(UC_X86_REG_IP)
            try:
                self.uc.emu_start(cs * 16 + ip, 0xFFFFFFFF, count=chunk)
            except GuestExit as e:
                self.log.append(str(e))
                break
            except UcError as e:
                self.log.append(f"cpu error {e} at {self.reg(UC_X86_REG_CS):04x}:{self.reg(UC_X86_REG_IP):04x}")
                break
            self.instructions += chunk
            self.ticks += 1
            self.write_word(0x46C, self.ticks & 0xFFFF)
            if on_tick:
                on_tick(self)
            if self.reg(UC_X86_REG_EFLAGS) & FLAG_IF and self.vector_is_guest(0x08):
                self.enter_vector(0x08, self.reg(UC_X86_REG_IP))
            if self.scancodes and self.reg(UC_X86_REG_EFLAGS) & FLAG_IF and self.vector_is_guest(0x09):
                self.enter_vector(0x09, self.reg(UC_X86_REG_IP))

    def screenshot(self, path: str, width: int = 320, height: int = 200) -> None:
        import zlib
        pixels = self.uc.mem_read(VGA_LINEAR, width * height)
        pal = [(min(255, c * 255 // 63)) for c in self.palette]
        rows = bytearray()
        for y in range(height):
            rows.append(0)
            for x in range(width):
                i = pixels[y * width + x] * 3
                rows += bytes(pal[i:i + 3])

        def chunk(t: bytes, d: bytes) -> bytes:
            c = struct.pack(">I", len(d)) + t + d
            return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(bytes(rows))) + chunk(b"IEND", b"")
        with open(path, "wb") as f:
            f.write(png)

    def where(self) -> str:
        cs, ip = self.reg(UC_X86_REG_CS), self.reg(UC_X86_REG_IP)
        return f"{cs - self.image_segment:04x}:{ip:04x} (abs {cs:04x}:{ip:04x})"


def main() -> None:
    m = DosMachine(sys.argv[1])
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 50_000_000
    m.run(limit)
    print("\n".join(m.log[-40:]))
    print("stopped at", m.where(), "instructions", m.instructions, "mode", hex(m.video_mode))
    print(sorted(m.int_counts.items(), key=lambda kv: -kv[1])[:30])


if __name__ == "__main__":
    main()
