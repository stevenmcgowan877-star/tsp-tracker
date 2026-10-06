import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoverage, targetAllocation, DEFAULT_COVERAGE } from "../lib/settings.js";

test("parseCoverage reads fractions, percentages and junk", () => {
  assert.equal(parseCoverage("0.75"), 0.75);
  assert.equal(parseCoverage("75"), 0.75);
  assert.equal(parseCoverage("75%"), 0.75);
  assert.equal(parseCoverage(" 50 % ".replace(/ /g, "")), 0.5);
  assert.equal(parseCoverage(1), 1);
  assert.equal(parseCoverage("0"), 0);
  assert.equal(parseCoverage("0.6"), 0.5, "snaps to the nearest supported step");
  assert.equal(parseCoverage("0.7"), 0.75);
  assert.equal(parseCoverage(undefined), DEFAULT_COVERAGE);
  assert.equal(parseCoverage(""), DEFAULT_COVERAGE);
  assert.equal(parseCoverage("abc"), DEFAULT_COVERAGE, "unreadable never becomes 0");
  assert.equal(parseCoverage("-1"), DEFAULT_COVERAGE);
  assert.equal(parseCoverage("250"), DEFAULT_COVERAGE);
  assert.equal(parseCoverage("abc", 1), 1);
});

test("targetAllocation is all C when ON and the coverage split when OFF", () => {
  assert.deepEqual(targetAllocation("ON", 0.75), { C: 1, G: 0 });
  assert.deepEqual(targetAllocation("OFF", 0.75), { C: 0.25, G: 0.75 });
});
