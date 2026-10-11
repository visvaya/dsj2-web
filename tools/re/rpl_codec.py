"""Decode and encode DSJ2 v2.x replay files (.rpl) and other files of unit 1b8f.

The game writes these files through a byte stream cipher keyed by Borland
Pascal's `Random` generator (see docs/replay-format.md):

    seed = key; checksum = random31()
    for each plain byte p:
        c = (p + Random(256)) & 0xFF      # written to disk
        seed += c
        checksum += (c - 1) * (random31() >> 8)
    the 32-bit checksum is appended unencrypted.

Usage: python3 -I rpl_codec.py <file.rpl> [<out.bin>]
Prints the header tag and the checksum status; writes the plain record.
"""

from __future__ import annotations

import struct
import sys

RANDSEED_MULTIPLIER = 0x08088405
REPLAY_KEY = 0x26B51B17
HEADER_BYTES = 13
RECORD_BYTES = 0x4B5
CHECKSUM_BYTES = 4
U32 = 0xFFFFFFFF


class BorlandRandom:
    """Turbo/Borland Pascal 7 `Random` (System unit, RandSeed at DS:1942)."""

    def __init__(self, seed: int):
        self.seed = seed & U32

    def step(self) -> int:
        self.seed = (self.seed * RANDSEED_MULTIPLIER + 1) & U32
        return self.seed

    def below(self, n: int) -> int:
        """Random(n) for 0 < n <= 65535; returns 0..n-1."""
        return (self.step() * (n & 0xFFFF)) >> 32

    def random31(self) -> int:
        """Function 20db:0000: Random($8000) * 65536 + Random($FFFF)."""
        hi = self.below(0x8000)
        lo = self.below(0xFFFF)
        return (hi * 0x10000 + lo) & U32


class CipherStream:
    def __init__(self, key: int = REPLAY_KEY):
        self.rng = BorlandRandom(key)
        self.checksum = self.rng.random31()

    def _advance(self, cipher_byte: int) -> None:
        self.rng.seed = (self.rng.seed + cipher_byte) & U32
        factor = self.rng.random31() >> 8
        # (c - 1) is sign-extended to 32 bits before the longint multiply.
        self.checksum = (self.checksum + ((cipher_byte - 1) * factor)) & U32

    def decrypt(self, data: bytes) -> bytes:
        out = bytearray()
        for c in data:
            k = self.rng.below(0x100)
            self._advance(c)
            out.append((c - k) & 0xFF)
        return bytes(out)

    def encrypt(self, data: bytes) -> bytes:
        out = bytearray()
        for p in data:
            c = (p + self.rng.below(0x100)) & 0xFF
            self._advance(c)
            out.append(c)
        return bytes(out)


def decode_replay(raw: bytes) -> tuple[bytes, bytes, bool]:
    """Returns (header, record, checksum_ok)."""
    if len(raw) != HEADER_BYTES + RECORD_BYTES + CHECKSUM_BYTES:
        raise ValueError(f"unexpected replay size {len(raw)}")
    stream = CipherStream()
    header = stream.decrypt(raw[:HEADER_BYTES])
    record = stream.decrypt(raw[HEADER_BYTES:HEADER_BYTES + RECORD_BYTES])
    stored = struct.unpack_from("<I", raw, HEADER_BYTES + RECORD_BYTES)[0]
    return header, record, stored == stream.checksum


def encode_replay(header: bytes, record: bytes) -> bytes:
    stream = CipherStream()
    body = stream.encrypt(header) + stream.encrypt(record)
    return body + struct.pack("<I", stream.checksum)


def main() -> None:
    with open(sys.argv[1], "rb") as f:
        raw = f.read()
    header, record, ok = decode_replay(raw)
    print("header", header[1:1 + header[0]], "checksum", "ok" if ok else "MISMATCH")
    if len(sys.argv) > 2:
        with open(sys.argv[2], "wb") as f:
            f.write(record)


if __name__ == "__main__":
    main()
