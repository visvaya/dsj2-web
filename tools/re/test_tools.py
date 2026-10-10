"""Unit tests for the reverse-engineering tools. Run: python3 -I -m unittest test_tools.py"""

from __future__ import annotations

import os
import sys
import unittest

import capstone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fpu_lift import Lifter
from mz_image import restore_fpu


class RestoreFpuTest(unittest.TestCase):
    def test_plain_escape(self) -> None:
        image = bytearray(b"\xcd\x35\x06\x00\x01")  # emulated fld dword [0100h]
        self.assertEqual(restore_fpu(image, set()), 1)
        self.assertEqual(image, bytearray(b"\x9b\xd9\x06\x00\x01"))

    def test_segment_override_keeps_length(self) -> None:
        # Selector 2 (top bits 10) means CS; low bits 001 mean ESC D9.
        image = bytearray(b"\xcd\x3c\x99\x06\x00\x01")
        restore_fpu(image, set())
        self.assertEqual(image, bytearray(b"\x9b\x2e\xd9\x06\x00\x01"))

    def test_bare_wait(self) -> None:
        image = bytearray(b"\xcd\x3d")
        restore_fpu(image, set())
        self.assertEqual(image, bytearray(b"\x9b\x90"))

    def test_relocated_bytes_are_left_alone(self) -> None:
        image = bytearray(b"\xcd\x35")
        self.assertEqual(restore_fpu(image, {1}), 0)


class RegisterArithmeticTest(unittest.TestCase):
    """Semantics follow the Intel SDM, independent of disassembler naming."""

    def lift(self, hex_bytes: str, stack: list[str]) -> list[str]:
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
        md.detail = True
        insn = next(md.disasm(bytes.fromhex(hex_bytes), 0))
        lifter = Lifter.__new__(Lifter)
        lifter.stack = list(stack)
        lifter.last_call = None
        lifter.register_arith(insn)
        return lifter.stack

    def test_fsubp_subtracts_st0_from_sti(self) -> None:
        self.assertEqual(self.lift("dee9", ["a", "b"]), ["(a - b)"])

    def test_fsubrp_subtracts_sti_from_st0(self) -> None:
        self.assertEqual(self.lift("dee1", ["a", "b"]), ["(b - a)"])

    def test_fdivp_and_fdivrp(self) -> None:
        self.assertEqual(self.lift("def9", ["a", "b"]), ["(a / b)"])
        self.assertEqual(self.lift("def1", ["a", "b"]), ["(b / a)"])

    def test_d8_forms_write_st0(self) -> None:
        self.assertEqual(self.lift("d8e1", ["a", "b"]), ["a", "(b - a)"])
        self.assertEqual(self.lift("d8e9", ["a", "b"]), ["a", "(a - b)"])


if __name__ == "__main__":
    unittest.main()
