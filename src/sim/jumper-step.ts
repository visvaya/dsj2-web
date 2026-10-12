import { detAtan, detCos, detSin } from "./deterministic-math";
import { inrunYM, landingYM, terrainSlopeRad, terrainYM, type HillProfile } from "./hill-profile";
import {
  AXIS_DRAG_COEF,
  BODY_ANGLE_OFFSET_RAD,
  BODY_FORCE_COEF,
  BODY_FORCE_SCALE,
  GRAVITY_M_PER_S2,
  MIN_RELATIVE_FLOW_M_PER_S,
  MIN_TRACK_SPEED_M_PER_S,
  POSE_BRAKE_MULTIPLIER,
  SKI_FORCE_COEF,
  TRACK_DRAG_COEF,
  TRACK_WIND_FACTOR,
  f32,
} from "./physics-constants";

/** Jumper state owned by the physics step (segment 1c06 of the original). */
export interface JumperState {
  xM: number;
  yM: number;
  vxMPerS: number;
  /** Positive while descending. */
  vyMPerS: number;
  speedMPerS: number;
  trackAngleRad: number;
  prevXM: number;
  prevYM: number;
  xBeforeMoveM: number;
  airborne: boolean;
  /** Set on takeoff or a forced jump; consumed at the end of the next step. */
  contactEvent: boolean;
  landed: boolean;
  /** Energy balance on the track: reference point and energy lost since. */
  refYM: number;
  refSpeedMPerS: number;
  energyLostJ: number;
  massKg: number;
  /** Terrain slope under the jumper at the end of the previous step. */
  slopeAngleRad: number;
  /** Takeoff impulse, N*s, added to the velocity when contactEvent is consumed. */
  impulseXNs: number;
  impulseYNs: number;
  /** Diagnostics kept by the original between steps. */
  flowAngleRad: number;
  relativeSpeedMPerS: number;
  forceBodyN: number;
  forceSki1N: number;
  forceSki2N: number;
  forceYN: number;
  forceXN: number;
  impactAngleRad: number;
  impactSpeedMPerS: number;
}

/** Inputs written by other parts of the game before the step. */
export interface JumperControls {
  dtS: number;
  windSpeedMPerS: number;
  windDirectionRad: number;
  bodyAngleRad: number;
  ski1AngleRad: number;
  ski2AngleRad: number;
  liftFactor: number;
  poseId: number;
}

/** 1c06:02a1, one 1/70 s step. Returns a new state; the input is not modified. */
export function stepJumper(prev: JumperState, c: JumperControls, h: HillProfile): JumperState {
  return stepJumperDetailed(prev, c, h).state;
}

export interface JumperStepResult {
  state: JumperState;
  /** The jumper left the ground in this step (the original then disturbs the pose if falling). */
  liftedOff: boolean;
}

export function stepJumperDetailed(prev: JumperState, c: JumperControls, h: HillProfile): JumperStepResult {
  const s: JumperState = { ...prev };
  let liftedOff = false;
  const dt = f32(c.dtS);
  const m = s.massKg;
  const g = GRAVITY_M_PER_S2;
  s.prevXM = s.xM;
  s.prevYM = s.yM;

  if (!s.airborne) {
    s.trackAngleRad = f32(-s.slopeAngleRad);
    if (s.speedMPerS === 0) {
      s.speedMPerS = f32(MIN_TRACK_SPEED_M_PER_S);
    }
    const mu = s.xM >= h.takeoffXM ? h.landingFrictionCoef : h.inrunFrictionCoef;
    const cosTrack = detCos(s.trackAngleRad);
    let vRel = f32(s.speedMPerS - detCos(c.windDirectionRad) * c.windSpeedMPerS * cosTrack * TRACK_WIND_FACTOR);
    if (!(vRel >= 0)) {
      vRel = 0;
    }
    s.energyLostJ = f32(
      Math.abs(s.speedMPerS * dt * (mu * m * g * cosTrack + TRACK_DRAG_COEF * c.liftFactor * (vRel * vRel))) +
        s.energyLostJ,
    );
    const brake = POSE_BRAKE_MULTIPLIER[c.poseId];
    if (brake !== undefined) {
      s.energyLostJ = f32(Math.abs(s.speedMPerS * dt * mu * brake * m * g * cosTrack) + s.energyLostJ);
    }
    const available = g * m * (s.refYM - s.yM) + 0.5 * m * s.refSpeedMPerS * s.refSpeedMPerS;
    if (!(available >= s.energyLostJ)) {
      s.energyLostJ = f32(available);
    }
    s.speedMPerS = f32(
      Math.sqrt(
        Math.abs(
          ((g * m * s.refYM + 0.5 * m * s.refSpeedMPerS * s.refSpeedMPerS - s.energyLostJ - g * m * s.yM) * 2) / m,
        ),
      ),
    );
    s.vyMPerS = f32(detSin(s.trackAngleRad) * s.speedMPerS);
    s.vxMPerS = f32(cosTrack * s.speedMPerS);
    s.xBeforeMoveM = s.xM;
    s.xM = f32(cosTrack * s.speedMPerS * dt + s.xM);
    if (s.xBeforeMoveM < h.takeoffXM && s.xM > h.takeoffXM) {
      s.contactEvent = true;
    } else {
      s.yM = s.xM > h.takeoffXM ? landingYM(h, s.xM) : inrunYM(h, s.xM);
    }
  } else {
    const u = s.vxMPerS - 1 * c.windSpeedMPerS * detCos(c.windDirectionRad);
    s.flowAngleRad = MIN_RELATIVE_FLOW_M_PER_S >= Math.abs(u) ? f32(Math.PI / 2) : f32(detAtan(s.vyMPerS / u));
    s.relativeSpeedMPerS = f32(Math.sqrt(u * u + s.vyMPerS * s.vyMPerS));
    const v2 = s.relativeSpeedMPerS;
    const bodyRad = BODY_ANGLE_OFFSET_RAD + c.bodyAngleRad;
    s.forceBodyN = f32(BODY_FORCE_COEF * c.liftFactor * v2 * v2 * detSin(bodyRad + s.flowAngleRad) * BODY_FORCE_SCALE);
    s.forceSki1N = f32(SKI_FORCE_COEF * v2 * v2 * detSin(s.flowAngleRad + c.ski1AngleRad));
    s.forceSki2N = f32(SKI_FORCE_COEF * v2 * v2 * detSin(s.flowAngleRad + c.ski2AngleRad));
    s.forceYN = f32(
      Math.abs(detCos(bodyRad) * s.forceBodyN) +
        Math.abs(detCos(c.ski1AngleRad) * s.forceSki1N) +
        Math.abs(detCos(c.ski2AngleRad) * s.forceSki2N),
    );
    s.forceXN = f32(
      Math.abs(detSin(bodyRad) * s.forceBodyN) +
        Math.abs(detSin(c.ski1AngleRad) * s.forceSki1N) +
        Math.abs(detSin(c.ski2AngleRad) * s.forceSki2N),
    );
    s.forceXN = f32(AXIS_DRAG_COEF * s.vxMPerS * s.vxMPerS + s.forceXN);
    s.forceYN = f32(AXIS_DRAG_COEF * s.vyMPerS * s.vyMPerS + s.forceYN);
    if (!(g * m >= s.forceYN)) {
      s.forceYN = f32(g * m);
    }
    s.vyMPerS = f32((g - s.forceYN / m) * dt + s.vyMPerS);
    s.vxMPerS = f32(s.vxMPerS - (s.forceXN / m) * dt);
    s.xM = f32(s.vxMPerS * dt + s.xM);
    s.yM = f32(s.yM - s.vyMPerS * dt);
  }

  const above =
    (s.xM <= h.takeoffXM && inrunYM(h, s.xM) < s.yM) || (s.xM > h.takeoffXM && !(landingYM(h, s.xM) >= s.yM));
  if (above) {
    if (!s.airborne) {
      liftedOff = true;
      s.airborne = true;
      s.contactEvent = true;
    }
  } else if (s.airborne) {
    s.energyLostJ = 0;
    s.refYM = terrainYM(h, s.xM);
    s.impactAngleRad =
      s.vxMPerS !== 0
        ? f32(Math.abs(detAtan(-s.vyMPerS / s.vxMPerS) - s.slopeAngleRad))
        : f32(Math.PI - s.slopeAngleRad);
    s.impactSpeedMPerS = f32(Math.sqrt(s.vyMPerS * s.vyMPerS + s.vxMPerS * s.vxMPerS));
    s.refSpeedMPerS = f32(detCos(s.impactAngleRad) * s.impactSpeedMPerS);
    s.landed = true;
    s.yM = s.refYM;
    s.speedMPerS = s.refSpeedMPerS;
    s.airborne = false;
  }

  if (s.contactEvent) {
    s.contactEvent = false;
    s.airborne = true;
    s.trackAngleRad = f32(-s.slopeAngleRad);
    s.vyMPerS = f32(detSin(s.trackAngleRad) * s.speedMPerS - s.impulseYNs / m);
    s.vxMPerS = f32(detCos(s.trackAngleRad) * s.speedMPerS + s.impulseXNs / m);
    s.impulseXNs = 0;
    s.impulseYNs = 0;
  }
  s.slopeAngleRad = terrainSlopeRad(h, s.xM);
  return { state: s, liftedOff };
}
