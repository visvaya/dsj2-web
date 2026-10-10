"""Lift x87 stack code into readable expressions, one function at a time.

Usage: python3 -I fpu_lift.py <Dsj.exe> <seg:off> [<seg:off> ...]

Integer instructions are echoed as assembly; FPU sequences are folded into
assignments (`x = expr`) and comparisons (`if (a < b) goto L`). Known data
addresses are replaced by names from `dsj_symbols.py`. The output is a
reading aid for writing the specification, not a compilable program.
"""

from __future__ import annotations

import os
import struct
import sys

from capstone import x86 as cx

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from disasm import Disassembler, extended_to_float
from dsj_symbols import CALL_NAMES, DATA_NAMES

BINARY = {"fadd": "+", "fsub": "-", "fsubr": "-r", "fmul": "*", "fdiv": "/", "fdivr": "/r",
          "faddp": "+", "fsubp": "-", "fsubrp": "-r", "fmulp": "*", "fdivp": "/", "fdivrp": "/r",
          "fiadd": "+", "fisub": "-", "fisubr": "-r", "fimul": "*", "fidiv": "/", "fidivr": "/r"}
UNARY = {"fchs": "-({})", "fabs": "abs({})", "fsqrt": "sqrt({})", "frndint": "rndint({})"}
# After fnstsw/sahf, jcc tests ST(0) against the compared operand.
JCC_RELATION = {"jb": "<", "jae": ">=", "je": "==", "jne": "!=", "jbe": "<=", "ja": ">"}


def fmt_num(v: float) -> str:
    r = repr(v)
    return r.removesuffix(".0")


class Lifter:
    def __init__(self, d: Disassembler):
        self.d = d
        self.stack: list[str] = []
        self.last_call: str | None = None
        self.pending_cmp: tuple[str, str] | None = None
        self.out: list[str] = []

    # ----------------------------------------------------------- operands
    def mem_operand(self, seg: int, insn, op) -> str:
        mem = op.mem
        size = op.size
        disp = mem.disp & 0xFFFF
        base = insn.reg_name(mem.base) if mem.base else None
        index = insn.reg_name(mem.index) if mem.index else None
        segname = insn.reg_name(mem.segment) if mem.segment else None
        if segname == "cs" and not base and not index:
            a = self.d.mz.linear(seg, disp)
            raw = bytes(self.d.mz.image[a:a + size])
            if size == 4:
                return fmt_num(struct.unpack("<f", raw)[0])
            if size == 8:
                return fmt_num(struct.unpack("<d", raw)[0])
            if size == 10:
                return fmt_num(extended_to_float(raw))
            if size == 2:
                return str(struct.unpack("<h", raw)[0])
        if not base and not index and segname in (None, "ds"):
            name = DATA_NAMES.get(disp)
            if name:
                return name
            for start, (nm, length) in DATA_RANGES.items():
                if start <= disp < start + length:
                    return f"{nm}[+{disp - start:#x}]"
            return f"g_{disp:04x}"
        if base == "bp" and not index:
            sdisp = mem.disp if mem.disp < 0x8000 else mem.disp - 0x10000
            return f"local_{-sdisp:x}" if sdisp < 0 else f"arg_{sdisp:x}"
        parts = [p for p in (base, index) if p]
        expr = "+".join(parts)
        if disp:
            expr += f"+{disp:#x}"
        return f"{segname + ':' if segname and segname != 'ds' else ''}[{expr}]"

    def operand(self, seg: int, insn, op) -> str:
        if op.type == cx.X86_OP_MEM:
            return self.mem_operand(seg, insn, op)
        if op.type == cx.X86_OP_REG:
            name = insn.reg_name(op.reg)
            if name.startswith("st"):
                i = int(name[3]) if "(" in name else 0
                return self.st(i)
            return name
        return str(op.imm)

    def st(self, i: int) -> str:
        while len(self.stack) <= i:
            src = f"RET({self.last_call})" if self.last_call else f"ST_IN{len(self.stack)}"
            self.last_call = None
            self.stack.insert(0, src)
        return self.stack[-1 - i]

    def set_st(self, i: int, v: str) -> None:
        self.st(i)
        self.stack[-1 - i] = v

    def pop(self) -> str:
        v = self.st(0)
        self.stack.pop()
        return v

    def emit(self, s: str) -> None:
        self.out.append("    " + s)

    # ---------------------------------------------------------- lifting
    def flush_stack_note(self) -> None:
        if self.stack:
            self.emit(f"; fpu stack at block end: {self.stack}")

    def binop(self, a: str, op: str, b: str) -> str:
        if op == "-r":
            return f"({b} - {a})"
        if op == "/r":
            return f"({b} / {a})"
        return f"({a} {op} {b})"

    def register_arith(self, insn) -> bool:
        """Decode D8/DC/DE register forms from bytes (Intel SDM semantics).

        D8 C0+i: ST0 = ST0 op STi.  DC/DE C0+i: STi = STi op ST0 (DE pops).
        The /4../7 slots differ between D8 and DC/DE: on D8 /4 is ST0-STi,
        on DC/DE /4 (E0+i) is STi = ST0-STi and /5 (E8+i) is STi = STi-ST0.
        """
        raw = bytes(insn.bytes)
        k = 0
        while raw[k] in (0x9B, 0x26, 0x2E, 0x36, 0x3E):
            k += 1
        esc, modrm = raw[k], raw[k + 1]
        if modrm < 0xC0 or esc not in (0xD8, 0xDC, 0xDE):
            return False
        sub, i = (modrm >> 3) & 7, modrm & 7
        a0, ai = self.st(0), self.st(i)
        if esc == 0xD8:
            res = {0: f"({a0} + {ai})", 1: f"({a0} * {ai})", 4: f"({a0} - {ai})",
                   5: f"({ai} - {a0})", 6: f"({a0} / {ai})", 7: f"({ai} / {a0})"}[sub]
            self.set_st(0, res)
            return True
        res = {0: f"({ai} + {a0})", 1: f"({ai} * {a0})", 4: f"({a0} - {ai})",
               5: f"({ai} - {a0})", 6: f"({a0} / {ai})", 7: f"({ai} / {a0})"}[sub]
        self.set_st(i, res)
        if esc == 0xDE:
            self.pop()
        return True

    def lift_fpu(self, seg: int, insn) -> bool:
        m = insn.mnemonic
        ops = insn.operands
        if m in ("wait", "fwait", "fnop"):
            return True
        if m in ("fld", "fild"):
            v = self.operand(seg, insn, ops[0])
            if m == "fild":
                v = f"float({v})"
            self.stack.append(v)
            return True
        if m in ("fld1", "fldz", "fldpi"):
            self.stack.append({"fld1": "1", "fldz": "0", "fldpi": "pi"}[m])
            return True
        if m in ("fst", "fstp", "fist", "fistp"):
            dst = ops[0]
            v = self.st(0)
            if dst.type == cx.X86_OP_REG:
                i = int(insn.reg_name(dst.reg)[3]) if "(" in insn.reg_name(dst.reg) else 0
                self.set_st(i, v)
            else:
                name = self.operand(seg, insn, dst)
                cast = {4: "f32", 8: "f64", 10: "f80"}.get(dst.size, "")
                if m.startswith("fist"):
                    cast = "round_i" + str(dst.size * 8)
                self.emit(f"{name} = {cast}({v})" if cast else f"{name} = {v}")
            if m.endswith("p"):
                self.pop()
            return True
        if m in UNARY:
            self.set_st(0, UNARY[m].format(self.st(0)))
            return True
        if m == "fxch":
            i = int(insn.reg_name(ops[0].reg)[3]) if ops else 1
            a, b = self.st(0), self.st(i)
            self.set_st(0, b)
            self.set_st(i, a)
            return True
        if m in BINARY:
            op = BINARY[m]
            reg_form = self.register_arith(insn)
            if reg_form:
                return True
            if len(ops) == 1:
                src = self.operand(seg, insn, ops[0])
                if m.startswith("fi"):
                    src = f"float({src})"
                self.set_st(0, self.binop(self.st(0), op, src))
                return True
            dst_name = insn.reg_name(ops[0].reg)
            src_name = insn.reg_name(ops[1].reg)
            di = int(dst_name[3]) if "(" in dst_name else 0
            si = int(src_name[3]) if "(" in src_name else 0
            self.set_st(di, self.binop(self.st(di), op, self.st(si)))
            if m.endswith("p"):
                self.pop()
            return True
        if m in ("fcom", "fcomp", "fcompp", "ficom", "ficomp", "ftst"):
            a = self.st(0)
            if m == "ftst":
                b = "0"
            elif ops:
                b = self.operand(seg, insn, ops[0])
            else:
                b = self.st(1)
            self.pending_cmp = (a, b)
            if m in ("fcomp", "ficomp"):
                self.pop()
            elif m == "fcompp":
                self.pop()
                self.pop()
            return True
        if m in ("fnstsw", "fstsw", "fnstcw", "fldcw", "fninit", "fclex", "fnclex"):
            return True
        if m.startswith("f"):
            self.emit(f"; unhandled fpu {m} {insn.op_str}")
            return True
        return False

    def lift(self, func: tuple[int, int]) -> list[str]:
        seg = func[0]
        items = sorted((off, insn) for (s, off), insn in self.d.insns.items()
                       if s == seg and self.d.func_of.get((s, off)) == func)
        self.out = [f"func {seg:04x}:{func[1]:04x}  ; {CALL_NAMES.get(f'{seg:04x}:{func[1]:04x}', '')}"]
        for off, insn in items:
            if (seg, off) in self.d.labels:
                self.flush_stack_note()
                self.stack = []
                self.out.append(f"  L_{off:04x}:")
            if self.lift_fpu(seg, insn):
                continue
            m = insn.mnemonic
            if m == "sahf" or (m == "mov" and insn.op_str.startswith("ah, byte ptr [bp")):
                continue
            if m in JCC_RELATION and self.pending_cmp:
                a, b = self.pending_cmp
                self.pending_cmp = None
                target = insn.operands[0].imm & 0xFFFF
                self.emit(f"if ({a} {JCC_RELATION[m]} {b}) goto L_{target:04x}")
                continue
            if m == "lcall" and insn.bytes[0] == 0x9A:
                lin = self.d.mz.linear(seg, off)
                t = f"{self.d.word(lin + 3):04x}:{self.d.word(lin + 1):04x}"
                name = CALL_NAMES.get(t, t)
                if name == "stack_check":
                    continue
                if name in MATH_UNARY:
                    self.set_st(0, f"{name}({self.st(0)})")
                    continue
                self.flush_stack_note()
                self.last_call = name
                self.emit(f"call {name}")
                continue
            if m == "call":
                t = f"{seg:04x}:{insn.operands[0].imm & 0xFFFF:04x}"
                self.last_call = CALL_NAMES.get(t, t)
                self.emit(f"call {self.last_call}")
                continue
            text = f"{m} {insn.op_str}"
            for op in insn.operands:
                if op.type == cx.X86_OP_MEM and not op.mem.base and not op.mem.index:
                    disp = op.mem.disp & 0xFFFF
                    if disp in DATA_NAMES:
                        text += f"    ; {DATA_NAMES[disp]}"
            if m.startswith("j") and insn.operands and insn.operands[0].type == cx.X86_OP_IMM:
                text = f"{m} L_{insn.operands[0].imm & 0xFFFF:04x}"
            self.emit(text)
        return self.out


MATH_UNARY = {"sin", "cos", "arctan", "exp", "ln", "sqrt", "round", "trunc"}
DATA_RANGES: dict[int, tuple[str, int]] = {}


def main() -> None:
    d = Disassembler(sys.argv[1])
    d.run()
    lifter = Lifter(d)
    for spec in sys.argv[2:]:
        seg, off = (int(x, 16) for x in spec.split(":"))
        print("\n".join(lifter.lift((seg, off))))
        print()


if __name__ == "__main__":
    main()
