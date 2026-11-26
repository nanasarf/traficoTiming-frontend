import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { readHeat } from "../src/model.ts";

function fixture() {
  return JSON.parse(
    readFileSync(new URL("../public/example/heat.json", import.meta.url)),
  );
}
test("both demo cameras have every referenced frame and eight athletes", () => {
  const h = readHeat(fixture());
  assert.equal(h.roster.length, 8);
  for (const c of h.cameras)
    for (const f of c.frames)
      assert.ok(
        readFileSync(new URL("../public/example/" + f.file, import.meta.url))
          .length,
      );
});
test("unmapped frame and duplicate crossing are rejected", () => {
  const h = fixture();
  h.cameras[0].frames[0].localUs = 0;
  assert.throws(() => readHeat(h));
  const duplicate = fixture();
  duplicate.marks = Array(2).fill({
    lane: 1,
    cameraId: "A",
    before: 0,
    after: 1,
  });
  assert.throws(() => readHeat(duplicate));
});
