/**
 * DF-B01 — Minimal effective-value resolver (not a second legal rule catalog).
 *
 * A confirmed profile owns only properties it explicitly defines. ND30/HD05
 * is consulted for an absent property, never to recheck or overwrite a SET one.
 * Missing data is not silently converted into a default or counted as PASS.
 */
export type AttributeRegime = "administrative" | "party";
export type AttributeState = "SET" | "UNSPECIFIED" | "INVALID" | "PROFILE_CONFLICT";
export type AttributeSource = "company-profile" | "nd30-fallback" | "hd05-fallback";
type AttributeValue = string | number | boolean;

export interface ProfileAttributeLayer {
  profileId: string;
  priority: number;
  approval: "approved" | "draft";
  sourceRef: string;
  values: Readonly<Record<string, unknown>>;
}
export interface RegimeAttributeFallback {
  regime: AttributeRegime;
  sourceRef: string;
  values: Readonly<Record<string, unknown>>;
}
export interface AttributeRequest {
  regime: AttributeRegime;
  profileId?: string | null;
  path: string; // semantic path, e.g. "body.fontSizePt"
  profileLayers: readonly ProfileAttributeLayer[];
  fallback?: RegimeAttributeFallback;
}
export interface EffectiveAttribute {
  regime: AttributeRegime;
  profileId?: string;
  path: string;
  state: AttributeState;
  value?: AttributeValue;
  source?: AttributeSource;
  sourceRef?: string;
  reason?: string;
}

function readExplicit(values: Readonly<Record<string, unknown>>, path: string) {
  let current: unknown = values;
  for (const key of path.split(".")) {
    if (!key || current === null || typeof current !== "object" || Array.isArray(current) ||
        !Object.prototype.hasOwnProperty.call(current, key)) {
      return { present: false as const };
    }
    current = (current as Record<string, unknown>)[key];
  }
  // undefined is absence. 0, false and "" are intentionally SET values.
  return current === undefined ? { present: false as const } : { present: true as const, value: current };
}

function validate(path: string, value: unknown): { ok: true; value: AttributeValue } | { ok: false; reason: string } {
  // null has no approved "clear field" semantics in this contract; fail closed.
  if (value === null) return { ok: false, reason: "NULL_SEMANTICS_NOT_DEFINED" };
  if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean")
    return { ok: false, reason: "ATTRIBUTE_VALUE_TYPE_UNSUPPORTED" };
  if (typeof value === "number" && !Number.isFinite(value))
    return { ok: false, reason: "ATTRIBUTE_NUMBER_NOT_FINITE" };
  if (/(^|\.)(fontSizePt|sizePt)$/.test(path) &&
      (typeof value !== "number" || !Number.isInteger(value) || value <= 0))
    return { ok: false, reason: "INVALID_PROFILE_FONT_SIZE" };
  return { ok: true, value };
}

/** Only the highest approved profile layer for this exact property has authority. */
export function resolveEffectiveAttribute(request: AttributeRequest): EffectiveAttribute {
  const basic: EffectiveAttribute = {
    regime: request.regime,
    profileId: request.profileId || undefined,
    path: request.path,
    state: "UNSPECIFIED",
  };
  if (!request.path || request.path.split(".").some(part => !part))
    return { ...basic, state: "INVALID", reason: "INVALID_PROPERTY_PATH" };

  const candidates = request.profileId
    ? request.profileLayers
      .filter(layer => layer.profileId === request.profileId && layer.approval === "approved")
      .map(layer => ({ layer, property: readExplicit(layer.values, request.path) }))
      .filter(({ property }) => property.present)
      .sort((a, b) => b.layer.priority - a.layer.priority)
    : [];

  if (candidates.length) {
    const selected = candidates[0];
    const peers = candidates.filter(candidate => candidate.layer.priority === selected.layer.priority);
    if (peers.some(candidate => !Object.is(candidate.property.value, selected.property.value)))
      return { ...basic, state: "PROFILE_CONFLICT", reason: "SAME_PRIORITY_PROFILE_VALUES_DIFFER" };
    const checked = validate(request.path, selected.property.value);
    if (!checked.ok) return { ...basic, state: "INVALID", sourceRef: selected.layer.sourceRef, reason: checked.reason };
    return {
      ...basic, state: "SET", value: checked.value, source: "company-profile",
      sourceRef: selected.layer.sourceRef,
    };
  }

  // The fallback must be for the requested regime. Never cross ND30 <-> HD05.
  if (!request.fallback || request.fallback.regime !== request.regime) return basic;
  const fallback = readExplicit(request.fallback.values, request.path);
  if (!fallback.present) return basic;
  const checked = validate(request.path, fallback.value);
  if (!checked.ok) return { ...basic, state: "INVALID", sourceRef: request.fallback.sourceRef, reason: checked.reason };
  return {
    ...basic, state: "SET", value: checked.value,
    source: request.regime === "party" ? "hd05-fallback" : "nd30-fallback",
    sourceRef: request.fallback.sourceRef,
  };
}
