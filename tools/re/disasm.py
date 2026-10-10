"""Recursive-descent disassembler for the DSJ2 DOS executable.

Usage: python3 -I disasm.py <Dsj.exe> <out-dir>

Writes one listing per code segment plus `functions.tsv` (all call targets)
and `xrefs.tsv` (caller -> callee). Output stays outside the repository: it is
derived from the original binary.
"""

from __future__ import annotations

import os
import struct
import sys
from collections import defaultdict

import capstone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mz_image import load_mz, restore_fpu

FLOAT_FORMATS = {"dword": ("<f", 4), "qword": ("<d", 8), "tbyte": (None, 10)}


def extended_to_float(b: bytes) -> float:
    mant, exp = struct.unpack("<QH", b)
    sign = -1.0 if exp & 0x8000 else 1.0
    exp &= 0x7FFF
    if exp == 0 and mant == 0:
        return 0.0
    return sign * mant * 2.0 ** (exp - 16383 - 63)


class Disassembler:
    def __init__(self, exe_path: str):
        self.mz = load_mz(exe_path)
        self.relocs = self.mz.reloc_linear_set()
        self.fpu_fixed = restore_fpu(self.mz.image, self.relocs)
        self.md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
        self.md.detail = True
        self.insns: dict[tuple[int, int], capstone.CsInsn] = {}
        self.functions: set[tuple[int, int]] = set()
        self.xrefs: set[tuple[tuple[int, int], tuple[int, int]]] = set()
        self.labels: set[tuple[int, int]] = set()
        self.func_of: dict[tuple[int, int], tuple[int, int]] = {}

    def word(self, a: int) -> int:
        return struct.unpack_from("<H", self.mz.image, a)[0]

    def run(self) -> None:
        roots = [(self.mz.entry_cs, self.mz.entry_ip)]
        # Every relocated far call / far pointer gives another root.
        for a in self.relocs:
            if a >= 3 and self.mz.image[a - 3] == 0x9A:
                roots.append((self.word(a), self.word(a - 2)))
        pending = list(dict.fromkeys(roots))
        self.functions.update(pending)
        while pending:
            func = pending.pop()
            pending.extend(self.trace(func))

    def trace(self, func: tuple[int, int]) -> list[tuple[int, int]]:
        seg = func[0]
        new_funcs = []
        work = [func[1]]
        while work:
            off = work.pop()
            while True:
                key = (seg, off)
                if key in self.insns:
                    break
                lin = self.mz.linear(seg, off)
                if lin >= len(self.mz.image):
                    break
                code = bytes(self.mz.image[lin:lin + 16])
                insn = next(self.md.disasm(code, off), None)
                if insn is None:
                    break
                self.insns[key] = insn
                self.func_of.setdefault(key, func)
                m = insn.mnemonic
                nxt = off + insn.size
                if m == "lcall" and insn.bytes[0] == 0x9A:
                    t = (self.word(lin + 3), self.word(lin + 1))
                    self.xrefs.add((func, t))
                    if t not in self.functions:
                        self.functions.add(t)
                        new_funcs.append(t)
                elif m == "call" and insn.bytes[0] == 0xE8:
                    t = (seg, insn.operands[0].imm & 0xFFFF)
                    self.xrefs.add((func, t))
                    if t not in self.functions:
                        self.functions.add(t)
                        new_funcs.append(t)
                elif m.startswith("j") and insn.operands and insn.operands[0].type == capstone.x86.X86_OP_IMM and m != "ljmp":
                    t = insn.operands[0].imm & 0xFFFF
                    self.labels.add((seg, t))
                    if m == "jmp":
                        off = t
                        continue
                    work.append(t)
                elif m in ("ret", "retf", "iret", "jmp", "ljmp"):
                    break
                off = nxt
        return new_funcs

    def annotate(self, seg: int, insn: capstone.CsInsn) -> str:
        notes = []
        lin = self.mz.linear(seg, insn.address)
        if insn.mnemonic == "lcall" and insn.bytes[0] == 0x9A:
            notes.append(f"-> {self.word(lin + 3):04x}:{self.word(lin + 1):04x}")
        # Float constants loaded from the code segment.
        if insn.mnemonic.startswith("f") and "cs:[" in insn.op_str:
            for op in insn.operands:
                if op.type == capstone.x86.X86_OP_MEM and op.mem.base == 0 and op.mem.index == 0:
                    a = self.mz.linear(seg, op.mem.disp & 0xFFFF)
                    kind = insn.op_str.split(" ptr")[0].split()[-1]
                    if kind in FLOAT_FORMATS:
                        fmt, n = FLOAT_FORMATS[kind]
                        b = bytes(self.mz.image[a:a + n])
                        val = extended_to_float(b) if fmt is None else struct.unpack(fmt, b)[0]
                        notes.append(f"const {val!r}")
                    elif kind == "word":
                        notes.append(f"const int16 {struct.unpack('<h', self.mz.image[a:a+2])[0]}")
                    elif kind in ("dword",):
                        pass
        return ("    ; " + "; ".join(notes)) if notes else ""

    def write(self, out_dir: str) -> None:
        os.makedirs(out_dir, exist_ok=True)
        by_seg = defaultdict(list)
        for (seg, off), insn in self.insns.items():
            by_seg[seg].append((off, insn))
        for seg, items in sorted(by_seg.items()):
            items.sort(key=lambda x: x[0])
            with open(os.path.join(out_dir, f"seg_{seg:04x}.asm"), "w") as f:
                prev_end = None
                for off, insn in items:
                    if (seg, off) in self.functions:
                        callers = sorted({c for c, t in self.xrefs if t == (seg, off)})
                        f.write(f"\n; ===== func {seg:04x}:{off:04x}  callers: "
                                + " ".join(f"{c[0]:04x}:{c[1]:04x}" for c in callers[:12])
                                + (" ..." if len(callers) > 12 else "") + "\n")
                    elif prev_end is not None and off != prev_end:
                        f.write("    ; ---- gap ----\n")
                    if (seg, off) in self.labels:
                        f.write(f"  L_{off:04x}:\n")
                    f.write(f"  {seg:04x}:{off:04x}  {insn.bytes.hex():<20} {insn.mnemonic} {insn.op_str}"
                            f"{self.annotate(seg, insn)}\n")
                    prev_end = off + insn.size
        with open(os.path.join(out_dir, "functions.tsv"), "w") as f:
            for seg, off in sorted(self.functions):
                n = sum(1 for k, v in self.func_of.items() if v == (seg, off))
                f.write(f"{seg:04x}:{off:04x}\t{n}\n")
        with open(os.path.join(out_dir, "xrefs.tsv"), "w") as f:
            f.writelines(f"{a[0]:04x}:{a[1]:04x}\t{b[0]:04x}:{b[1]:04x}\n" for (a, b) in sorted(self.xrefs))


def main() -> None:
    d = Disassembler(sys.argv[1])
    d.run()
    d.write(sys.argv[2])
    print(f"fpu rewritten: {d.fpu_fixed}, functions: {len(d.functions)}, insns: {len(d.insns)}")


if __name__ == "__main__":
    main()
