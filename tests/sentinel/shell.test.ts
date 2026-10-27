// The shell's pure logic: display-unit conversion, the side nav, the command palette's filter and the setup
// checklist.

import test from "node:test";
import assert from "node:assert/strict";
import { displayFormat, parseDisplayUnit } from "../../app/sentinel/lib/displayUnitCore";
import { buildCommands, filterCommands, isActive, projectNav, projectSwitchTarget, setupChecklist } from "../../app/sentinel/lib/shell/nav";
import { st } from "./helpers";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

// ---- display unit -------------------------------------------------------------------------------------------
test("display unit: as reported leaves a company's own figures alone and shows comparisons in crore", () => {
  const d = displayFormat("as_reported");
  assert.equal(d.fromCrore(12.5), 12.5);
  assert.equal(d.fromCompany(100000, "INR_LAKH"), 100000);
  assert.equal(d.ownLabel("INR_LAKH"), "₹ Lakh");
  assert.equal(d.crossLabel, "₹ crore");
  assert.equal(d.crossShort, "cr");
  assert.equal(d.ownShort("INR_LAKH"), "lakh");
  assert.equal(d.ownShort("INR_CRORE"), "cr");
});

test("display unit: lakh converts everything, whichever unit it is held in", () => {
  const d = displayFormat("INR_LAKH");
  assert.ok(near(d.fromCrore(12.5), 1250)); // 12.5 crore = 1,250 lakh
  assert.ok(near(d.fromCompany(1250, "INR_CRORE"), 125000));
  assert.ok(near(d.fromCompany(100000, "INR_LAKH"), 100000));
  assert.ok(near(d.fromCompany(50, "INR_MILLION"), 500)); // 50 million = 5 crore = 500 lakh
  assert.equal(d.ownLabel("INR_CRORE"), "₹ Lakh");
  assert.equal(d.crossLabel, "₹ Lakh");
  assert.equal(d.crossShort, "lakh");
});

test("display unit: crore and million", () => {
  assert.ok(near(displayFormat("INR_CRORE").fromCompany(100000, "INR_LAKH"), 1000));
  assert.ok(near(displayFormat("INR_CRORE").fromCompany(500, "INR_MILLION"), 50));
  assert.ok(near(displayFormat("INR_MILLION").fromCrore(1), 10));
  assert.ok(near(displayFormat("INR_MILLION").fromCompany(1000, "INR_LAKH"), 100)); // 1,000 lakh = 10 crore = 100 million
  assert.equal(displayFormat("INR_MILLION").crossShort, "mn");
});

test("display unit: anything unrecognised is 'as reported'", () => {
  assert.equal(parseDisplayUnit("INR_LAKH"), "INR_LAKH");
  assert.equal(parseDisplayUnit("nonsense"), "as_reported");
  assert.equal(parseDisplayUnit(null), "as_reported");
  assert.equal(parseDisplayUnit(undefined), "as_reported");
});

// ---- side nav -------------------------------------------------------------------------------------------------
const flat = (g: ReturnType<typeof projectNav>) => g.flatMap((x) => x.items.map((i) => i.label));

test("nav: an owner sees every page, in the order Overview, Data, Analysis, Settings", () => {
  const nav = projectNav("p1", true);
  assert.deepEqual(flat(nav), ["Overview", "Statements", "Add period", "Import files", "Edit periods", "KPIs", "Peers and trends", "Investigations", "Reviews", "Settings"]);
  assert.deepEqual(nav.map((g) => g.label), [null, "Data", "Analysis", null]);
});

test("nav: a reference company gets only the pages that read", () => {
  assert.deepEqual(flat(projectNav("p1", false)), ["Overview", "Statements", "KPIs", "Peers and trends", "Investigations", "Reviews", "Settings"]);
});

test("nav: links carry the project so a pasted link opens on it", () => {
  const hrefs = projectNav("abc", true).flatMap((g) => g.items.map((i) => i.href));
  assert.ok(hrefs.includes("/sentinel/kpi?workspace=abc"));
  assert.ok(hrefs.includes("/sentinel/projects/abc/import"));
  assert.ok(hrefs.includes("/sentinel/projects/abc"));
});

test("nav: active state ignores query strings, and the Investigations root matches only itself", () => {
  assert.ok(isActive("/sentinel/kpi", "/sentinel/kpi?workspace=abc"));
  assert.ok(isActive("/sentinel/reviews/123", "/sentinel/reviews?workspace=abc"));
  assert.ok(isActive("/sentinel", "/sentinel?workspace=abc", true));
  assert.ok(!isActive("/sentinel/kpi", "/sentinel?workspace=abc", true));
  assert.ok(isActive("/sentinel/projects/abc", "/sentinel/projects/abc", true));
  assert.ok(!isActive("/sentinel/projects/abc/settings", "/sentinel/projects/abc", true));
  assert.ok(isActive("/sentinel/projects/abc/settings", "/sentinel/projects/abc/settings"));
});

// ---- command palette ---------------------------------------------------------------------------------------
const ws = [
  { id: "a", company_name: "Alpha Tyres", owner_id: "me", is_public_reference: false },
  { id: "r", company_name: "Reference Tyres", owner_id: null, is_public_reference: true },
];

test("commands: navigation, project switching and the display units are all there", () => {
  const cmds = buildCommands(ws, "me", "a");
  const labels = cmds.map((c) => c.label);
  for (const l of ["All projects", "New project", "Executive dashboard", "KPIs", "Add period", "Switch to Alpha Tyres", "Switch to Reference Tyres", "Show figures in lakh", "Show figures in crore", "Show figures in million", "Show figures as reported"]) {
    assert.ok(labels.includes(l), l);
  }
});

test("commands: a reference company offers no way to add data", () => {
  const labels = buildCommands(ws, "me", "r").map((c) => c.label);
  assert.ok(!labels.includes("Add period"));
  assert.ok(!labels.includes("Import files"));
  assert.ok(labels.includes("KPIs"));
});

test("commands: with no project open there are no project pages", () => {
  const labels = buildCommands(ws, "me", null).map((c) => c.label);
  assert.ok(!labels.includes("KPIs"));
  assert.ok(labels.includes("New project"));
});

test("commands: every word must match; starts-with ranks first", () => {
  const cmds = buildCommands(ws, "me", "a");
  assert.equal(filterCommands(cmds, "lakh")[0].label, "Show figures in lakh");
  assert.equal(filterCommands(cmds, "zzzz").length, 0);
  assert.equal(filterCommands(cmds, "switch ref")[0].label, "Switch to Reference Tyres");
  assert.equal(filterCommands(cmds, "kp")[0].label, "KPIs");
  assert.equal(filterCommands(cmds, "").length, cmds.length);
  const imp = filterCommands(cmds, "import");
  assert.equal(imp[0].label, "Import files");
});

// ---- setup checklist ---------------------------------------------------------------------------------------
const fy = (label: string, end: string, extra = {}) => st("p", { period_label: label, period_end_date: end, ...extra });
const doneIds = (steps: ReturnType<typeof setupChecklist>) => steps.filter((s) => s.done).map((s) => s.id);

test("checklist: an empty project has nothing done and points at importing", () => {
  const steps = setupChecklist({ projectId: "p", statements: [], investigations: [] });
  assert.deepEqual(doneIds(steps), []);
  assert.equal(steps[0].id, "first-year");
  assert.equal(steps[0].href, "/sentinel/projects/p/import");
  assert.equal(steps.length, 6);
});

test("checklist: it ticks itself off as data arrives", () => {
  const one = [fy("FY26", "2026-03-31")];
  assert.deepEqual(doneIds(setupChecklist({ projectId: "p", statements: one, investigations: [] })), ["first-year"]);

  const withBs = [fy("FY26", "2026-03-31", { total_assets: 2000 })];
  assert.deepEqual(doneIds(setupChecklist({ projectId: "p", statements: withBs, investigations: [] })), ["first-year", "balance-sheet"]);

  const withCf = [fy("FY26", "2026-03-31", { total_assets: 2000, cash_from_operations: 140 })];
  assert.deepEqual(doneIds(setupChecklist({ projectId: "p", statements: withCf, investigations: [] })), ["first-year", "balance-sheet", "cash-flow"]);

  const twoYears = [...withCf, fy("FY25", "2025-03-31")];
  assert.ok(doneIds(setupChecklist({ projectId: "p", statements: twoYears, investigations: [] })).includes("prior-year"));

  const all = setupChecklist({ projectId: "p", statements: twoYears, investigations: [{ status: "pending" }, { status: "approved" }] });
  assert.deepEqual(doneIds(all), ["first-year", "balance-sheet", "cash-flow", "prior-year", "first-investigation", "first-approval"]);
});

test("checklist: a prior year on the OTHER basis does not count, and a quarter is not an annual statement", () => {
  const mixed = [fy("FY26", "2026-03-31"), fy("FY25", "2025-03-31", { basis: "standalone" })];
  assert.ok(!doneIds(setupChecklist({ projectId: "p", statements: mixed, investigations: [] })).includes("prior-year"));
  const quarter = [st("p", { period_type: "Q3", period_label: "Q3 FY26", period_end_date: "2025-12-31" })];
  assert.deepEqual(doneIds(setupChecklist({ projectId: "p", statements: quarter, investigations: [] })), []);
});

test("checklist: a pending draft counts as generated but not as approved; edited counts as approved", () => {
  const base = [fy("FY26", "2026-03-31")];
  assert.deepEqual(doneIds(setupChecklist({ projectId: "p", statements: base, investigations: [{ status: "pending" }] })), ["first-year", "first-investigation"]);
  assert.ok(doneIds(setupChecklist({ projectId: "p", statements: base, investigations: [{ status: "edited" }] })).includes("first-approval"));
  assert.ok(!doneIds(setupChecklist({ projectId: "p", statements: base, investigations: [{ status: "rejected" }] })).includes("first-approval"));
});

test("switching project: a project's own page moves to the same page of the other project, anything else stays put", () => {
  assert.equal(projectSwitchTarget("/sentinel/projects/aaa", "bbb"), "/sentinel/projects/bbb");
  assert.equal(projectSwitchTarget("/sentinel/projects/aaa/settings", "bbb"), "/sentinel/projects/bbb/settings");
  assert.equal(projectSwitchTarget("/sentinel/projects/aaa/import", "bbb"), "/sentinel/projects/bbb/import");
  assert.equal(projectSwitchTarget("/sentinel/kpi", "bbb"), null);
  assert.equal(projectSwitchTarget("/sentinel/projects", "bbb"), null);
  assert.equal(projectSwitchTarget("/sentinel/statements", "bbb"), null);
});

test("palette: 'lakh', 'lac' and 'lacs' all find the lakh display command, and it beats a project called Lakh Industries", () => {
  const wsList = [
    { id: "w1", company_name: "Lakh Industries", owner_id: "u", is_public_reference: false },
    { id: "w2", company_name: "Alpha Tyres", owner_id: "u", is_public_reference: false },
  ];
  const commands = buildCommands(wsList, "u", "w2");
  assert.equal(filterCommands(commands, "lakh")[0].id, "unit-INR_LAKH");
  assert.equal(filterCommands(commands, "lacs")[0].id, "unit-INR_LAKH");
  assert.equal(filterCommands(commands, "lac")[0].id, "unit-INR_LAKH");
  assert.equal(filterCommands(commands, "crores")[0].id, "unit-INR_CRORE");
  assert.equal(filterCommands(commands, "mn")[0].id, "unit-INR_MILLION");
  // Naming the project more specifically still gets the project.
  assert.equal(filterCommands(commands, "lakh ind")[0].id, "switch-w1");
  assert.equal(filterCommands(commands, "alpha")[0].id, "switch-w2");
});
