import type { HillLook } from "../render/hill-look";
import type { InrunSpec, LandingSpec } from "../sim/hill-setup";

/** Version of the hill data format this game reads. */
export const HILL_SPEC_SCHEMA_VERSION = 1;

/**
 * A hill as plain data, the same for every source (made by hand, generated or made by a player): JSON-compatible,
 * with no functions in it, so every hill passes the same checks before the game builds it.
 */
export interface HillSpec {
  readonly schemaVersion: typeof HILL_SPEC_SCHEMA_VERSION;
  /** Records and replays are kept under it; a change of geometry needs a new id. */
  readonly id: string;
  readonly name: string;
  readonly kPointM: number;
  readonly profile: { readonly inrun: InrunSpec; readonly landing: LandingSpec };
  readonly look: HillLook;
}

/** One thing wrong with a hill: a stable rule id, where in the data, and a short text for logs. */
export interface HillProblem {
  readonly rule: string;
  readonly path: string;
  readonly message: string;
}
