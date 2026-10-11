"""Unit tests for the reverse-engineering tools. Run: python3 -I -m unittest test_tools.py"""

from __future__ import annotations

import os
import sys
import unittest

import capstone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fpu_lift import Lifter
from mz_image import restore_fpu
from rpl_codec import (
    HEADER_BYTES,
    RECORD_BYTES,
    BorlandRandom,
    decode_replay,
    encode_replay,
)


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


class ReplayCodecTest(unittest.TestCase):
    def sample(self) -> tuple[bytes, bytes]:
        header = bytes([12]) + b"/DSJ_v2.1P//"
        record = bytes((i * 37 + 11) & 0xFF for i in range(RECORD_BYTES))
        return header, record

    def test_round_trip(self) -> None:
        header, record = self.sample()
        got_header, got_record, ok = decode_replay(encode_replay(header, record))
        self.assertTrue(ok)
        self.assertEqual((got_header, got_record), (header, record))
        self.assertEqual(len(encode_replay(header, record)), HEADER_BYTES + RECORD_BYTES + 4)

    def test_corruption_breaks_checksum(self) -> None:
        raw = bytearray(encode_replay(*self.sample()))
        raw[100] ^= 0x01
        self.assertFalse(decode_replay(bytes(raw))[2])

    def test_random_matches_pascal_definition(self) -> None:
        rng = BorlandRandom(0)
        self.assertEqual(rng.below(1), 0)
        self.assertEqual(rng.seed, 1)
        self.assertEqual(rng.below(0x10000 - 1), (0x08088406 * 0xFFFF) >> 32)


if __name__ == "__main__":
    unittest.main()
