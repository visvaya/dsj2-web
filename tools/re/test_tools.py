"""Unit tests for the reverse-engineering tools. Run: python3 -I -m unittest test_tools.py"""

from __future__ import annotations

import gzip
import os
import struct
import sys
import tempfile
import unittest

import capstone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from craft_replays import SCENARIOS, make, set_distance
from fpu_lift import Lifter
from mz_image import restore_fpu
from rpl_codec import (
    HEADER_BYTES,
    RECORD_BYTES,
    BorlandRandom,
    decode_replay,
    encode_replay,
)
from trace_file import open_trace, write_trace


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


class CraftReplaysTest(unittest.TestCase):
    def test_scenarios_change_only_inputs_and_keep_a_valid_checksum(self) -> None:
        header = bytes([12]) + b"/DSJ_v2.1P//"
        record = bytes((i * 37 + 11) & 0xFF for i in range(RECORD_BYTES))
        with tempfile.TemporaryDirectory() as d:
            source = os.path.join(d, "source.rpl")
            with open(source, "wb") as f:
                f.write(encode_replay(header, record))
            make(source, os.path.join(d, "out"))
            for name in SCENARIOS:
                with open(os.path.join(d, "out", f"{name}.RPL"), "rb") as f:
                    got_header, got_record, ok = decode_replay(f.read())
                self.assertTrue(ok, name)
                self.assertEqual(got_header, header)
                # Wind, hill, distance and seed stay as recorded.
                self.assertEqual(got_record[:0x30], record[:0x30], name)
            with open(os.path.join(d, "out", "TELEMARK.RPL"), "rb") as f:
                telemark = decode_replay(f.read())[1]
            self.assertEqual(struct.unpack_from("<ii", telemark, 0x46A), (596, 590))

    def check_set_distance(self, trace_name: str) -> None:
        size = 0x5300
        first = bytearray(size)
        last = bytearray(size)
        struct.pack_into("<f", first, 0x528E, 12.5)
        struct.pack_into("<f", last, 0x528E, 89.92)
        header = bytes([12]) + b"/DSJ_v2.1P//"
        with tempfile.TemporaryDirectory() as d:
            trace = os.path.join(d, trace_name)
            records = [struct.pack("<IB", 1, 0) + first, struct.pack("<IB", 2, 3) + last]
            write_trace(trace, size, records)
            replay = os.path.join(d, "x.rpl")
            with open(replay, "wb") as f:
                f.write(encode_replay(header, bytes(RECORD_BYTES)))
            set_distance(trace, replay)
            with open(replay, "rb") as f:
                record = decode_replay(f.read())[1]
            self.assertEqual(record[0x25 : 0x25 + 6], b"\x0589.92")

    def test_set_distance_reads_the_last_snapshot(self) -> None:
        self.check_set_distance("x.trace")

    def test_set_distance_reads_a_compressed_trace(self) -> None:
        self.check_set_distance("x.trace.gz")


class TraceFileTest(unittest.TestCase):
    SIZE = 64
    RECORDS = (struct.pack("<IB", 7, 0) + bytes([0x11]) * SIZE, struct.pack("<IB", 8, 3) + bytes([0x22]) * SIZE)
    PLAIN = b"DSJTRACE" + struct.pack("<III", 1, SIZE, 2) + b"".join(RECORDS)

    def test_a_plain_name_writes_the_documented_layout(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "a.trace")
            write_trace(path, self.SIZE, list(self.RECORDS))
            with open(path, "rb") as f:
                self.assertEqual(f.read(), self.PLAIN)

    def test_a_gz_name_writes_the_same_bytes_compressed(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "a.trace.gz")
            write_trace(path, self.SIZE, list(self.RECORDS))
            with open(path, "rb") as f:
                raw = f.read()
            self.assertEqual(raw[:2], b"\x1f\x8b")
            self.assertEqual(gzip.decompress(raw), self.PLAIN)

    def test_open_trace_reads_both_forms(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            for name in ("a.trace", "a.trace.gz", "hills.hilltrace.gz"):
                path = os.path.join(d, name)
                write_trace(path, self.SIZE, list(self.RECORDS))
                with open_trace(path) as f:
                    self.assertEqual(f.read(), self.PLAIN, name)


if __name__ == "__main__":
    unittest.main()
