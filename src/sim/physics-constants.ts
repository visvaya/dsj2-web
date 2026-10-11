/**
 * Constants of the DSJ2 v2.10P jumper model (docs/physics-spec.md).
 * Values are copied as they appear in the original code; their physical
 * meaning is noted where it is established.
 */

/** Rounds to IEEE single precision, like every store to a Pascal `Single`. */
export const f32 = Math.fround;

export const GRAVITY_M_PER_S2 = 9.81;
export const JUMPER_MASS_KG = 60;
/** One simulation step; the game stores 1/70 s as a Single. */
export const FRAME_DT_S = f32(1 / 70);

/** Share of the wind's horizontal component that slows the jumper on the track. */
export const TRACK_WIND_FACTOR = 0.2;
/** Air drag coefficient on the track, multiplied by the lift factor. */
export const TRACK_DRAG_COEF = 0.583;
/** Braking multipliers of the friction term for poses 8, 9 and 100. */
export const POSE_BRAKE_MULTIPLIER: Readonly<Record<number, number>> = { 8: 10, 9: 20, 100: 10 };
export const MIN_TRACK_SPEED_M_PER_S = 0.0001;

/** Flight: body lift, two skis, and plain v^2 drag per axis. */
export const BODY_ANGLE_OFFSET_RAD = 0.35;
export const BODY_FORCE_COEF = 1.1;
export const BODY_FORCE_SCALE = 0.53;
export const SKI_FORCE_COEF = 0.139284;
export const AXIS_DRAG_COEF = 0.1166;
export const MIN_RELATIVE_FLOW_M_PER_S = 0.0001;
