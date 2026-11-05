// The outside-review sample: reproducible, every reader represented, and the agreement between two reviewers worked on paper.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { agreement, allocate, drawSample, parseCsv, rng, writeCsv } from "../../app/sentinel/lib/evaluation/reviewSample";

const HEADER = "file,reader,page,what,values,source_text,verdict (right / wrong / partly),checker_notes";
const sheet = (rows: [string, string, number][], verdicts: string[] = []) =>
  parseCsv([HEADER, ...rows.map(([f, r, p], i) => `${f},${r},${p},"item ${i}","v ${i}","text ${i}",${verdicts[i] ?? ""},`)].join("\n"));

test("the generator is seeded: the same seed gives the same sequence, a different seed does not", () => {
  const a = rng(7), b = rng(7), c = rng(8);
  const xs = [a(), a(), a()], ys = [b(), b(), b()];
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("allocation: proportional, a floor per reader, never more than a reader holds, and the total is the target", () => {
  const sizes = { ratios: 70, caro: 48, finding: 37, related_parties: 30, maturity: 28, ageing: 22, contingent: 19 }; // the first run's 254 items
  const a = allocate(sizes, 100, 5);
  assert.equal(Object.values(a).reduce((x, y) => x + y, 0), 100);
  for (const [k, v] of Object.entries(a)) assert.ok(v >= 5 && v <= sizes[k as keyof typeof sizes], k);
  assert.ok(a.ratios > a.contingent); // bigger readers get more
  assert.deepEqual(allocate({ a: 3, b: 400 }, 50, 5), { a: 3, b: 47 }); // a tiny reader is taken whole, not padded
  const all = allocate({ a: 10, b: 10 }, 100, 5);
  assert.deepEqual(all, { a: 10, b: 10 }); // asking for more than exists returns all of it
});

test("a sample is reproducible, every reader is in it, and the overlap is drawn from the sample", () => {
  const rows: [string, string, number][] = [];
  for (const [reader, n] of [["ratios", 40], ["caro", 30], ["ageing", 8], ["contingent", 4]] as const) for (let i = 0; i < n; i++) rows.push(["tcs", reader, i + 1]);
  const s = sheet(rows);
  const one = drawSample(s, 30, 10, 99, 3), two = drawSample(s, 30, 10, 99, 3), other = drawSample(s, 30, 10, 100, 3);
  assert.equal(writeCsv(one.sheet), writeCsv(two.sheet));
  assert.notEqual(writeCsv(one.sheet), writeCsv(other.sheet));
  assert.equal(one.sheet.rows.length, 30);
  assert.equal(one.overlap.rows.length, 10);
  const readers = new Set(one.sheet.rows.map((r) => r[1]));
  assert.deepEqual([...readers].sort(), ["ageing", "caro", "contingent", "ratios"]);
  assert.ok(one.sheet.rows.filter((r) => r[1] === "contingent").length >= 3);
  const inSample = new Set(one.sheet.rows.map((r) => r.join("|")));
  assert.ok(one.overlap.rows.every((r) => inSample.has(r.join("|"))));
  assert.equal(new Set(one.sheet.rows.map((r) => r.join("|"))).size, 30); // no row twice
  assert.equal(one.perReader.contingent.available, 4);
  assert.ok(one.perReader.contingent.sampled >= 3 && one.perReader.contingent.sampled <= 4); // the floor, topped up in proportion, never above what exists
});

test("a sheet round-trips through a spreadsheet's re-quoting without changing what each item is", () => {
  const original = `${HEADER}\ntcs,caro,12,"clause (xi), fraud","says ""no""","Clause (xi) text",,\n`;
  const parsed = parseCsv(original);
  assert.deepEqual(parsed.rows[0].slice(3, 5), ["clause (xi), fraud", 'says "no"']);
  assert.deepEqual(parseCsv(writeCsv(parsed)).rows, parsed.rows);
  assert.deepEqual(parseCsv(`﻿${original.replace(/\n/g, "\r\n")}`).rows, parsed.rows);
});

test("agreement worked on paper: 3 of 4 agree; chance agreement is 0.5, so kappa is 0.5", () => {
  const rows: [string, string, number][] = [["a", "caro", 1], ["a", "caro", 2], ["a", "caro", 3], ["a", "caro", 4]];
  const A = sheet(rows, ["right", "right", "wrong", "wrong"]);
  const B = sheet(rows, ["right", "wrong", "wrong", "wrong"]);
  const r = agreement(A, B);
  assert.equal(r.n, 4);
  assert.equal(r.agree, 3);
  assert.equal(r.rate, 0.75);
  assert.ok(Math.abs(r.kappa! - 0.5) < 1e-12);
  assert.equal(r.disagreements.length, 1);
  assert.deepEqual([r.disagreements[0].a, r.disagreements[0].b], ["right", "wrong"]);
  assert.ok(r.interval![0] < 0.75 && r.interval![1] > 0.75);
});

test("agreement counts only items both marked, matches them by identity not row order, and says when there is nothing to compare", () => {
  const rows: [string, string, number][] = [["a", "caro", 1], ["a", "caro", 2], ["a", "caro", 3]];
  const A = sheet(rows, ["right", "wrong", ""]); // the third is unmarked
  const B = parseCsv(writeCsv({ header: sheet(rows).header, rows: [...sheet(rows, ["partly", "wrong", "right"]).rows].reverse() })); // re-sorted
  const r = agreement(A, B);
  assert.equal(r.n, 2);
  assert.equal(r.agree, 1);
  assert.equal(agreement(sheet(rows), sheet(rows)).n, 0);
  assert.equal(agreement(sheet(rows), sheet(rows)).kappa, null);
  // Everyone says "right": chance agreement is total and kappa is undefined, not 1.
  const same = agreement(sheet(rows, ["right", "right", "right"]), sheet(rows, ["right", "right", "right"]));
  assert.equal(same.rate, 1);
  assert.equal(same.kappa, null);
});

test("the sample works on the real first-run sheet: 100 of 254, all seven readers present", () => {
  const file = path.join(process.cwd(), "docs", "scorecard", "run-2026-10-30", "items.csv");
  const s = parseCsv(fs.readFileSync(file, "utf8"));
  assert.equal(s.rows.length, 254);
  const d = drawSample(s, 100, 30);
  assert.equal(d.sheet.rows.length, 100);
  assert.equal(d.overlap.rows.length, 30);
  assert.equal(Object.keys(d.perReader).length, 7);
  assert.ok(Object.values(d.perReader).every((v) => v.sampled >= 5));
  assert.ok(d.sheet.rows.every((r) => r[6] === "")); // every verdict is still empty: the sample never leaks a mark
});
