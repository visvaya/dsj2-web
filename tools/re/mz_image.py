"""Load a DOS MZ executable built by Borland Pascal 7 and restore x87 opcodes.

Borland's 8087 emulator ({$N+,$E+}) replaces every FPU instruction with an
interrupt call that the runtime patches back on first execution:

    9B D8..DF  ->  CD 34..3B          (FWAIT + ESC 0..7)
    9B <seg> Dx -> CD 3C <b> <modrm>  (segment override, b = ESC with seg bits)
    9B 90      ->  CD 3D              (bare FWAIT)

`restore_fpu` performs the same rewrite statically so that a regular
disassembler sees real x87 instructions. Instruction lengths are preserved
in every case: the override form becomes `9B <seg-prefix> <ESC> <modrm>`.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

PARAGRAPH_BYTES = 16
PAGE_BYTES = 512

# Segment selector held in the two top bits of the byte after INT 3Ch.
EMU_SEGMENT_PREFIX = {0: 0x3E, 1: 0x36, 2: 0x2E, 3: 0x26}  # DS, SS, CS, ES


@dataclass
class MzImage:
    header_paragraphs: int
    entry_cs: int
    entry_ip: int
    initial_ss: int
    initial_sp: int
    image: bytearray
    relocations: list[tuple[int, int]] = field(default_factory=list)

    def linear(self, seg: int, off: int) -> int:
        return seg * PARAGRAPH_BYTES + off

    def reloc_linear_set(self) -> set[int]:
        return {self.linear(seg, off) for off, seg in self.relocations}

    def relocated_segments(self) -> set[int]:
        return {
            struct.unpack_from("<H", self.image, a)[0]
            for a in self.reloc_linear_set()
        }


def load_mz(path: str) -> MzImage:
    with open(path, "rb") as f:
        raw = f.read()
    (magic, last_page, pages, n_reloc, hdr_par, _min, _max, ss, sp, _csum,
     ip, cs, reloc_ofs, _ovl) = struct.unpack_from("<14H", raw, 0)
    if magic != 0x5A4D:
        raise ValueError("not an MZ executable")
    size = (pages - 1) * PAGE_BYTES + (last_page or PAGE_BYTES)
    image = bytearray(raw[hdr_par * PARAGRAPH_BYTES:size])
    relocs = [struct.unpack_from("<HH", raw, reloc_ofs + 4 * i) for i in range(n_reloc)]
    return MzImage(hdr_par, cs, ip, ss, sp, image, relocs)


def restore_fpu(image: bytearray, reloc_linear: set[int]) -> int:
    """Rewrite emulator interrupts into x87 opcodes in place. Returns count."""
    count = 0
    i = 0
    end = len(image) - 1
    while i < end:
        if image[i] != 0xCD or i in reloc_linear or (i + 1) in reloc_linear:
            i += 1
            continue
        vec = image[i + 1]
        if 0x34 <= vec <= 0x3B:
            image[i] = 0x9B
            image[i + 1] = 0xD8 + (vec - 0x34)
            count += 1
            i += 2
        elif vec == 0x3C and i + 2 < len(image):
            b = image[i + 2]
            image[i] = 0x9B
            image[i + 1] = EMU_SEGMENT_PREFIX[b >> 6]
            image[i + 2] = (b & 0x07) | 0xD8
            count += 1
            i += 3
        elif vec == 0x3D:
            image[i] = 0x9B
            image[i + 1] = 0x90
            count += 1
            i += 2
        else:
            i += 1
    return count
