"""Names recovered for DSJ2 v2.10P (Dsj.exe, 162816 bytes).

Addresses are image-relative segment:offset (load segment 0) for code, and
offsets in the data segment (image segment 22F2h) for data. Each entry notes
how it was established: [run] = observed in emulation, [code] = read from
the listing, [guess] = plausible but unverified.
"""

CALL_NAMES = {
    # Borland Pascal 7 System unit
    "20e0:0530": "stack_check",       # [code] prologue stack probe
    "20e0:0c58": "round",             # [code] fistp with default rounding -> longint
    "20e0:0c39": "trunc",             # [code] fistp under truncating control word
    "20e0:0c99": "sqrt",              # [run]
    "20e0:0c9d": "sin",               # [run]
    "20e0:0ca2": "cos",               # [run]
    "20e0:0ca7": "arctan",            # [run]
    "20e0:0cb1": "exp",               # [run]
    "20e0:1e28": "random_int",        # [code] Random(n), seed at DS:1942
    "20e0:1ebd": "randomize",         # [code] seed from DOS time
    "20e0:18a1": "longint_mul",       # [code]
    "20e0:18de": "longint_divmod",    # [code]
    "20e0:1984": "longint_shr",       # [code]
    "20e0:20b8": "move",              # [code]
    "20e0:20f0": "upcase",            # [code]
    "20e0:19ca": "str_load",          # [code]
    "20e0:19e4": "str_store",         # [code]
    "20e0:1a49": "str_concat",        # [code]
    "20e0:1abb": "str_compare",       # [code]
    # Game units
    "1c06:0010": "jumper_reset",      # [code] zeroes jumper state at the gate
    "1c06:02a1": "jumper_step",       # [run] writes position and velocity once per frame
    "1eee:0000": "hill_profile_y",    # [guess] y of the hill surface at x
    "2011:0000": "mouse_present",     # [code] INT 33h AX=0
    "2011:002d": "mouse_read",        # [code] INT 33h AX=3
    "2011:008f": "mouse_set_pos",     # [code] INT 33h AX=4
    "2011:000e": "mouse_motion",      # [code] INT 33h AX=0Bh
}

DATA_NAMES = {
    0x1942: "rand_seed",              # [code]
    0x5298: "jumper_x",               # [run]
    0x52a0: "jumper_y",               # [run]
    0x52a4: "jumper_vx",              # [run]
    0x52a8: "jumper_vy",              # [run] positive while descending
    0x52ac: "jumper_speed",           # [run] |v|
    0x52b0: "track_angle",            # [run] pi/4 on the K85 inrun
    0x52b4: "jumper_prev_x",          # [code]
    0x52b8: "jumper_prev_y",          # [code]
    0x52f2: "inrun_slope_angle",      # [run] -pi/4 on K85
}
