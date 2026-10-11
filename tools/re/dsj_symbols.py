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
    "1eee:0000": "inrun_y",           # [run] inrun height at x
    "1eee:00c1": "inrun_slope",       # [code]
    "1eee:015e": "landing_y",         # [run] tanh profile + outrun parabola, cached
    "1eee:0312": "landing_slope",     # [code]
    "1eee:051f": "inrun_setup",       # [code]
    "1eee:06e1": "landing_setup",     # [code]
    "1eee:0627": "terrain_y",         # [code] x < takeoff ? inrun : landing
    "1eee:0676": "terrain_slope_angle",  # [code]
    "1eee:0830": "landing_arc_length",   # [code] midpoint rule
    "1eee:08fb": "landing_x_at_arc_length",  # [code]
    "1980:009c": "random_centered",   # [run] mean of n Random(65535) in [-1, 1]
    "1980:000c": "random_unit",       # [code] abs of random_centered
    "20db:0000": "random31",          # [code] Random($8000)*65536 + Random($FFFF)
    "0baf:976a": "wind_update",       # [run]
    "0baf:9a3c": "read_input",        # [code] replay, mouse or AI input
    "0baf:9c52": "frame_logic",       # [code] phase state machine, scoring, drawing
    "0baf:ca5b": "jump_loop_seek",    # [code] replay seek: restart and fast-forward
    "0baf:cb78": "jump_loop",         # [code]
    "0baf:c9e6": "jump_reset",        # [code]
    "190d:026d": "replay_input_for_frame",  # [code]
    "190d:03e4": "replay_save",       # [code]
    "190d:060d": "replay_load",       # [code]
    "1b8f:0000": "cipher_rewrite",    # [code] key -> RandSeed
    "1b8f:007b": "cipher_write",      # [code]
    "1b8f:01a4": "cipher_reset",      # [code]
    "1b8f:021f": "cipher_read",       # [code]
    "1cb6:0d15": "pose_set",          # [run] writes pose_id and skeleton angles
    "1cb6:107d": "pose_animate",      # [run]
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
    0x52f2: "slope_angle",            # [run] terrain slope under the jumper
    0x5296: "airborne",               # [code]
    0x5297: "contact_event",          # [code]
    0x52d8: "ref_y",                  # [code]
    0x52dc: "ref_speed",              # [code]
    0x52e0: "jumper_mass",            # [run] 60.0
    0x52e4: "energy_lost",            # [code]
    0x52e8: "landed",                 # [code]
    0x52fa: "pose_id",                # [run] word
    0x52fc: "pose_time",              # [code]
    0x5300: "knee_angle",             # [guess] drives the takeoff impulse
    0x5314: "ski1_angle",             # [run]
    0x5340: "ski2_angle",             # [run]
    0x14ee: "frame_dt",               # [run] 1/70 s
    0x3f9a: "replay_mode",            # [code]
    0x3fa4: "replay_record_ptr",      # [code] far pointer to the 1205-byte record
    0x4ca0: "frame_counter",          # [code] longint
    0x4cbb: "jump_phase",             # [code]
    0x4cbc: "body_angle",             # [run]
    0x4cd4: "impulse_x",              # [code] N*s
    0x4cd8: "impulse_y",              # [code] N*s
    0x4d06: "lift_factor",            # [code]
    0x4d10: "wind_x",                 # [run]
    0x4d14: "wind_y",                 # [run]
    0x4d18: "wind_variability",       # [run]
    0x4d1c: "wind_speed",             # [run]
    0x4d20: "wind_direction",         # [run]
    0x45b2: "hill_start_x",           # [run]
    0x45b6: "inrun_friction",         # [run] 0.02
    0x45ce: "takeoff_x",              # [run]
    0x4624: "landing_friction",       # [run] 0.05
    0x4664: "mouse_dy",               # [code] clamped to -128..127
    0x4666: "mouse_left",             # [code]
    0x4667: "mouse_right",            # [code]
}
