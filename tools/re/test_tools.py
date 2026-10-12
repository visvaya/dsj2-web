"""Unit tests for the reverse-engineering tools. Run: python3 -I -m unittest test_tools.py"""

from __future__ import annotations

import gzip
import json
import os
import struct
import sys
import tempfile
import unittest

import capstone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from craft_replays import (
    SCENARIOS,
    apply_plan,
    from_plan,
    header_for_hill,
    make,
    plan_from_record,
    set_distance,
)
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


PLAN_WIND = {
    "xMPerS": -1.5,
    "yMPerS": 0.25,
    "variabilityMPerS": 0.125,
    "speedMPerS": 1.75,
    "directionRad": 2.5,
    "indicatorDirectionRad": 2.25,
    "indicatorTurnRateRad": 0.0,
    "indicatorMaxTurnRateRad": 0.5,
}
REPLAY_PLAN = {
    "hillNumber": 32,
    "randomSeed": 0xFEDCBA98,
    "wind": PLAN_WIND,
    "startFrame": 70,
    "buttonWindowStart": 484,
    "buttonWindow": [2, 2, 1, 0] + [0] * 16,
    "motionStart": 498,
    "motionEnd": 501,
    "motion": [1, -128, 0, 127],
    "leftLandingFrame": 1140,
    "rightLandingFrame": 1116,
}


class ReplayFromPlanTest(unittest.TestCase):
    def base(self) -> bytes:
        return bytes((i * 37 + 11) & 0xFF for i in range(RECORD_BYTES))

    def test_fields_land_at_the_documented_offsets(self) -> None:
        record = apply_plan(self.base(), REPLAY_PLAN)
        self.assertEqual(len(record), RECORD_BYTES)
        self.assertEqual(struct.unpack_from("<8f", record, 0), tuple(PLAN_WIND.values()))
        self.assertEqual(record[0x20], 32)
        self.assertEqual(record[0x21:0x25], bytes(4))
        self.assertEqual(record[0x25], 0)
        self.assertEqual(struct.unpack_from("<I", record, 0x2C)[0], 0xFEDCBA98)
        self.assertEqual(record[0x30:0x34], bytes([1, 0x80, 0, 0x7F]))
        self.assertEqual(record[0x34:0x44A], bytes(0x44A - 0x34))
        self.assertEqual(struct.unpack_from("<iii", record, 0x44A), (70, 484, 498))
        self.assertEqual(record[0x456:0x46A], bytes([2, 2, 1] + [0] * 17))
        self.assertEqual(struct.unpack_from("<iii", record, 0x46A), (1140, 1116, 501))

    def test_names_and_date_of_the_base_replay_are_kept(self) -> None:
        self.assertEqual(apply_plan(self.base(), REPLAY_PLAN)[0x476:], self.base()[0x476:])

    def test_the_plan_reads_back_from_the_record(self) -> None:
        self.assertEqual(plan_from_record(apply_plan(self.base(), REPLAY_PLAN)), REPLAY_PLAN)

    def test_an_empty_motion_range_is_kept(self) -> None:
        plan = {**REPLAY_PLAN, "motionStart": 1, "motionEnd": 0, "motion": []}
        self.assertEqual(plan_from_record(apply_plan(self.base(), plan)), plan)

    def test_the_marker_follows_the_hill_number_like_the_game_does(self) -> None:
        self.assertEqual(header_for_hill(1), b"//DSJ_v2.00//")
        self.assertEqual(header_for_hill(32), b"//DSJ_v2.00//")
        self.assertEqual(header_for_hill(33), b"//DSJ_v2.1P//")
        self.assertEqual(header_for_hill(37), b"//DSJ_v2.1P//")

    def test_plans_that_do_not_fit_are_refused(self) -> None:
        bad = [
            {"hillNumber": 0},
            {"hillNumber": 38},
            {"buttonWindow": [3] + [0] * 19},
            {"buttonWindow": [2, 2]},
            {"motion": [1, 2]},
            {"motion": [1, 200, 0, 0]},
            {"motionStart": 1, "motionEnd": 1050, "motion": [0] * 1050},
            {"startFrame": -1},
        ]
        for change in bad:
            with self.assertRaises(ValueError, msg=str(change)):
                apply_plan(self.base(), {**REPLAY_PLAN, **change})

    def test_from_plan_writes_a_replay_with_a_valid_checksum(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            base_path = os.path.join(d, "base.rpl")
            plan_path = os.path.join(d, "HILL32.json")
            out_path = os.path.join(d, "out", "HILL32.RPL")
            with open(base_path, "wb") as f:
                f.write(encode_replay(b"//DSJ_v2.1P//", self.base()))
            with open(plan_path, "w", encoding="utf-8") as f:
                json.dump({"name": "HILL32", "plan": REPLAY_PLAN, "expected": {"fallType": 0}}, f)
            from_plan(base_path, plan_path, out_path)
            with open(out_path, "rb") as f:
                header, record, ok = decode_replay(f.read())
            self.assertTrue(ok)
            self.assertEqual(header, b"//DSJ_v2.00//")
            self.assertEqual(plan_from_record(record), REPLAY_PLAN)


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
