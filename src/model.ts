export type Frame = { localUs: number; file: string };
type Anchor = { localUs: number; starterUs: number };
export type Camera = {
  id: string;
  first: Anchor;
  last: Anchor;
  frames: Frame[];
};
export type Mark = {
  lane: number;
  cameraId: string;
  before: number;
  after: number;
};
export type Heat = {
  version: number;
  title: string;
  startUs: number;
  roster: { lane: number; name: string }[];
  cameras: Camera[];
  marks: Mark[];
};
export type Result = {
  lane: number;
  name: string;
  earliestUs: number | null;
  latestUs: number | null;
};

const clock = (val: unknown) =>
  typeof val === "number" && Number.isSafeInteger(val) && val >= 0;
const named = (val: unknown) =>
  typeof val === "string" && val.trim().length > 0;
export function readHeat(value: unknown): Heat {
  const h = value as Heat;
  if (
    !h ||
    h.version !== 1 ||
    !named(h.title) ||
    !clock(h.startUs) ||
    !Array.isArray(h.cameras) ||
    h.cameras.length !== 2 ||
    !Array.isArray(h.roster) ||
    !h.roster.length ||
    h.roster.length > 9 ||
    !Array.isArray(h.marks)
  )
    throw Error("Invalid heat manifest.");
  const ids = new Set<string>(),
    lanes = new Set<number>(),
    marked = new Set<number>();
  for (const c of h.cameras) {
    if (
      !c ||
      !named(c.id) ||
      ids.has(c.id) ||
      !clock(c.first?.localUs) ||
      !clock(c.last?.localUs) ||
      !clock(c.first?.starterUs) ||
      !clock(c.last?.starterUs) ||
      c.last.localUs <= c.first.localUs ||
      c.last.starterUs <= c.first.starterUs ||
      !Array.isArray(c.frames) ||
      c.frames.length < 2
    )
      throw Error("Invalid camera calibration.");
    ids.add(c.id);
    let previous = -1;
    for (const f of c.frames) {
      if (
        !f ||
        !clock(f.localUs) ||
        f.localUs <= previous ||
        f.localUs < c.first.localUs ||
        f.localUs > c.last.localUs ||
        !named(f.file) ||
        !/^[\w .-]+\.(png|jpe?g|webp)$/i.test(f.file)
      )
        throw Error("Invalid frame sequence or image filename.");
      previous = f.localUs;
    }
  }
  for (const r of h.roster) {
    if (
      !r ||
      !Number.isInteger(r.lane) ||
      r.lane < 1 ||
      r.lane > 9 ||
      lanes.has(r.lane) ||
      !named(r.name)
    )
      throw Error("Invalid lane assignment.");
    lanes.add(r.lane);
  }
  for (const m of h.marks) {
    const c = h.cameras.find((c) => c.id === m?.cameraId);
    if (
      !c ||
      !lanes.has(m.lane) ||
      marked.has(m.lane) ||
      !Number.isInteger(m.before) ||
      !Number.isInteger(m.after) ||
      m.before < 0 ||
      m.before >= m.after ||
      m.after >= c.frames.length
    )
      throw Error("Invalid crossing decision.");
    marked.add(m.lane);
  }
  return h;
}
