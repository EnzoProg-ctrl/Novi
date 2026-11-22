/**
 * Planning a session through AI Chat: the rules a draft must follow and what
 * Novi asks next. No network; the AI step (planSession) is not called.
 *
 *   npx --yes deno@2.5.4 test supabase/functions/chat
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  applyPlan,
  changeNote,
  clashWarning,
  findClashes,
  durationLabel,
  findStrain,
  mondayOf,
  sameDraft,
  strainWarning,
  confirmedTimes,
  type Draft,
  localNowFrom,
  localParts,
  nextQuestion,
  validateDraft,
  weekOverview,
} from "./schedule.ts";

const now = { date: "2026-11-21", time: "14:05" }; // a Saturday
const packs = [
  { id: "p-bio", title: "Biology: Cells" },
  { id: "p-sql", title: "Database Management & SQL" },
];
const defaults = { session: 60, brk: 10 };
const check = (draft: Draft) => validateDraft(draft, now, packs, defaults);

const complete: Draft = { title: "Biology", date: "2026-11-22", start: "16:00", type: "focus", pack_decided: true };

Deno.test("asks for the details in order: title, day, start time", () => {
  assertEquals(check({}).missing, "title");
  assertEquals(check({ title: "Biology" }).missing, "date");
  assertEquals(check({ title: "Biology", date: "2026-11-22" }).missing, "start");
  assertEquals(check(complete).missing, null);
});

Deno.test("fills in the default length, and the break length for a break", () => {
  assertEquals(check(complete).draft.duration_minutes, 60);
  assertEquals(check({ ...complete, type: "break" }).draft.duration_minutes, 10);
  assertEquals(check({ ...complete, type: "nonsense" as never }).draft.type, "focus");
});

Deno.test("refuses a day that has passed", () => {
  const c = check({ ...complete, date: "2026-11-20" });
  assertEquals(c.missing, "date");
  assertEquals(c.problem, "That day has already passed.");
});

Deno.test("refuses an impossible date", () => {
  const c = check({ ...complete, date: "2026-02-31" });
  assertEquals(c.missing, "date");
  assert(c.problem);
});

Deno.test("refuses a time that has passed today, but not on a later day", () => {
  const today = check({ ...complete, date: "2026-11-21", start: "13:00" });
  assertEquals(today.missing, "start");
  assertEquals(today.problem, "That time has already passed today.");
  assertEquals(check({ ...complete, date: "2026-11-21", start: "15:00" }).missing, null);
  assertEquals(check({ ...complete, start: "13:00" }).missing, null);
});

Deno.test("refuses a session that runs past midnight", () => {
  const c = check({ ...complete, start: "23:30", duration_minutes: 60 });
  assertEquals(c.missing, "start");
  assert(c.problem?.includes("midnight"));
});

Deno.test("refuses lengths outside 5 minutes to 12 hours", () => {
  assertEquals(check({ ...complete, duration_minutes: 13 * 60 }).missing, "duration");
  assertEquals(check({ ...complete, duration_minutes: 2 }).missing, "duration");
  assertEquals(check({ ...complete, duration_minutes: 12 * 60, start: "08:00" }).missing, null);
});

Deno.test("never links a pack that isn't the student's", () => {
  const c = check({ ...complete, pack_id: "someone-elses", suggested_pack_id: "also-not-mine", pack_decided: false });
  assertEquals(c.draft.pack_id, null);
  assertEquals(c.draft.suggested_pack_id, null);
  assertEquals(c.missing, null); // nothing left to offer
});

Deno.test("offers a matching pack before the summary, only once the topic is known", () => {
  // No topic yet: the pack question waits, it isn't skipped for good.
  assertEquals(check({}).draft.pack_decided, false);
  const offer = check({ ...complete, suggested_pack_id: "p-bio", pack_decided: false });
  assertEquals(offer.missing, "pack");
  const q = nextQuestion(offer, now, packs, false);
  assert(q.content.includes("Biology: Cells"));
  assertEquals(q.options, ["Yes, link it", "No pack"]);
});

Deno.test("applies the pack answer and changes", () => {
  const offered: Draft = { ...complete, suggested_pack_id: "p-bio", pack_decided: false };
  const linked = check(applyPlan(offered, { pack_answer: "link" }));
  assertEquals(linked.draft.pack_id, "p-bio");
  assertEquals(linked.missing, null);
  const none = check(applyPlan(offered, { pack_answer: "none" }));
  assertEquals(none.draft.pack_id, null);
  assertEquals(none.missing, null);
  // "Change the time": the start is asked again.
  assertEquals(check(applyPlan(complete, { clear_fields: ["start"] })).missing, "start");
  // Empty values from the model never wipe a detail.
  assertEquals(applyPlan(complete, { title: "", start: null }).start, "16:00");
});

Deno.test("start-time choices skip times that have passed today", () => {
  const q = nextQuestion(check({ title: "Biology", date: "2026-11-21" }), now, packs, false);
  assertEquals(q.options, ["4:00 PM", "6:00 PM", "8:00 PM"]);
});

Deno.test("Confirm only saves times that match the draft and aren't past", () => {
  const draft = check(complete).draft;
  const nowMs = Date.parse("2026-11-21T06:05:00Z");
  const ok = confirmedTimes(draft, "2026-11-22T08:00:00.000Z", "2026-11-22T09:00:00.000Z", nowMs);
  assert(ok);
  assertEquals(confirmedTimes(draft, "2026-11-22T08:00:00.000Z", "2026-11-22T10:00:00.000Z", nowMs), null);
  assertEquals(confirmedTimes(draft, "2026-11-20T08:00:00.000Z", "2026-11-20T09:00:00.000Z", nowMs), null);
  assertEquals(confirmedTimes(draft, "not a date", "2026-11-22T09:00:00.000Z", nowMs), null);
});

Deno.test("reads the app's clock, and falls back when it is missing", () => {
  assertEquals(localNowFrom("2026-11-21T14:05"), { date: "2026-11-21", time: "14:05" });
  const fallback = localNowFrom(undefined);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(fallback.date) && /^\d{2}:\d{2}$/.test(fallback.time));
});

Deno.test("places planned sessions on the student's local day", () => {
  // 17:30 UTC on the 21st is 01:30 on the 22nd in Manila.
  assertEquals(localParts("2026-11-21T17:30:00Z", "Asia/Manila"), { date: "2026-11-22", time: "01:30" });
  assertEquals(localParts("2026-11-21T17:30:00Z", "Not/AZone"), { date: "2026-11-21", time: "17:30" });
});

Deno.test("shows the week with busy and free days, and offers the free ones", () => {
  const week = weekOverview([
    { date: "2026-11-22", start: "16:00", end: "17:00", title: "Biology" },
    { date: "2026-11-24", start: "09:00", end: "10:30", title: "SQL practice" },
    { date: "2026-12-05", start: "09:00", end: "10:00", title: "Too far ahead" },
  ], now);
  assert(week.text.includes("- **Today**: free"));
  assert(week.text.includes("- **Tomorrow**: Biology (4:00 PM – 5:00 PM)"));
  assert(week.text.includes("- **Tuesday, November 24**: SQL practice (9:00 AM – 10:30 AM)"));
  assert(!week.text.includes("Too far ahead"));
  assertEquals(week.freeDates, ["2026-11-21", "2026-11-23", "2026-11-25", "2026-11-26", "2026-11-27"]);
  const q = nextQuestion(validateDraft({ title: "Biology" }, now, packs, defaults), now, packs, false, week.freeDates);
  assertEquals(q.options, ["Today", "Monday", "Wednesday", "Thursday"]);
});

Deno.test("an empty week says the calendar is clear", () => {
  const week = weekOverview([], now);
  assert(week.text.startsWith("Your calendar is clear"));
  assertEquals(week.freeDates.length, 7);
});

Deno.test("changing the type: a new type, or asked for when none is given", () => {
  const base = check(complete).draft;
  const revision = check(applyPlan(base, { type: "revision" }));
  assertEquals(revision.draft.type, "revision");
  assertEquals(revision.missing, null);
  const asked = check(applyPlan(base, { clear_fields: ["type"] }));
  assertEquals(asked.missing, "type");
  assertEquals(nextQuestion(asked, now, packs, false).options, ["Focus", "Practice", "Revision", "Break"]);
  const answered = check(applyPlan(asked.draft, { type: "practice" }));
  assertEquals(answered.draft.type, "practice");
  assertEquals(answered.missing, null);
});

Deno.test("switching to a break takes the break length, unless they chose a length", () => {
  const base = check(complete).draft; // 60 minutes from the default
  assertEquals(check(applyPlan(base, { type: "break" })).draft.duration_minutes, 10);
  const chosen = check(applyPlan(complete, { duration_minutes: 45 })).draft;
  assertEquals(check(applyPlan(chosen, { type: "break" })).draft.duration_minutes, 45);
});

Deno.test("changing the day or time, or dropping them to pick again", () => {
  const base = check(complete).draft;
  assertEquals(check(applyPlan(base, { date: "2026-11-25" })).draft.date, "2026-11-25");
  assertEquals(check(applyPlan(base, { start: "09:30" })).draft.start, "09:30");
  assertEquals(check(applyPlan(base, { clear_fields: ["date"] })).missing, "date");
  // "Change the length": asked for, not quietly refilled with the default.
  assertEquals(check(applyPlan(base, { clear_fields: ["duration"] })).missing, "duration");
  assertEquals(check(applyPlan(base, { clear_fields: ["duration"], duration_minutes: 90 })).draft.duration_minutes, 90);
});

Deno.test("a saved session keeps its id through changes", () => {
  const savedDraft = { ...check(complete).draft, session_id: "s-1" };
  const moved = check(applyPlan(savedDraft, { start: "18:00" }));
  assertEquals(moved.draft.session_id, "s-1");
  assertEquals(moved.missing, null);
});

Deno.test("a change of mind is acknowledged", () => {
  const monday = check({ title: "React framework", date: "2026-11-23" }).draft;
  const wednesday = check(applyPlan(monday, { date: "2026-11-25" })).draft;
  assertEquals(changeNote(monday, wednesday, now, packs), "Okay, I changed the day to **Wednesday, November 25**.");
  const base = check(complete).draft;
  const both = check(applyPlan(base, { start: "18:00", type: "revision" })).draft;
  assertEquals(changeNote(base, both, now, packs), "Okay, I changed the time to **6:00 PM** and the type to **revision session**.");
  // Filling in a detail for the first time is not a change.
  assertEquals(changeNote(check({ title: "Biology" }).draft, check({ title: "Biology", date: "2026-11-25" }).draft, now, packs), "");
});

const wednesday = [
  { id: "s-bio", date: "2026-11-25", start: "16:00", end: "17:00", title: "Biology", pack_id: "p-bio" },
  { id: "s-sql", date: "2026-11-25", start: "09:00", end: "10:00", title: "SQL practice", pack_id: null },
];
const draftAt = (start: string, title = "History", extra: Draft = {}) =>
  check({ title, date: "2026-11-25", start, type: "focus", pack_decided: true, ...extra }).draft;

Deno.test("an overlapping time is a clash, a free slot is not", () => {
  assertEquals(findClashes(draftAt("16:30"), wednesday).map((c) => [c.session.id, c.kind]), [["s-bio", "overlap"]]);
  assertEquals(findClashes(draftAt("16:00"), wednesday).length, 1); // same day and time
  assertEquals(findClashes(draftAt("17:00"), wednesday), []); // starts as Biology ends
  assertEquals(findClashes(draftAt("15:00", "History", { duration_minutes: 60 }), wednesday), []);
});

Deno.test("the same topic on the same day is a likely duplicate", () => {
  assertEquals(findClashes(draftAt("19:00", "Biology revision"), wednesday).map((c) => c.kind), ["same_topic"]);
  assertEquals(findClashes(draftAt("19:00", "Anything", { pack_id: "p-bio" }), wednesday).map((c) => c.kind), ["same_topic"]);
  assertEquals(findClashes(draftAt("19:00", "History"), wednesday), []);
  // Another day is fine.
  assertEquals(findClashes({ ...draftAt("16:00", "Biology"), date: "2026-11-26" }, wednesday), []);
});

Deno.test("editing a saved session doesn't clash with itself", () => {
  assertEquals(findClashes(draftAt("16:30", "Biology", { session_id: "s-bio" }), wednesday), []);
});

Deno.test("the warning names the sessions and offers a choice", () => {
  const overlap = clashWarning(findClashes(draftAt("16:30"), wednesday), now);
  assertEquals(overlap, "Heads up: that overlaps with **Biology** (4:00 PM – 5:00 PM) Wednesday, November 25. Keep both, or change the time?");
  const dup = clashWarning(findClashes(draftAt("19:00", "Biology"), wednesday), now);
  assert(dup.startsWith("You already have **Biology** (4:00 PM – 5:00 PM) planned"));
});

Deno.test("keeping both lasts until the day or time changes", () => {
  const kept = { ...draftAt("16:30"), clash_ok: true };
  assertEquals(applyPlan(kept, { title: "History notes" }).clash_ok, true);
  assertEquals(applyPlan(kept, { start: "18:00" }).clash_ok, false);
  assertEquals(applyPlan(kept, { date: "2026-11-26" }).clash_ok, false);
});

// Week of Monday 2026-11-23 to Sunday 2026-11-29.
const day = (n: number) => `2026-11-${String(22 + n).padStart(2, "0")}`; // day(1) = Monday 23rd
const study = (date: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
  ({ id: `${date}-${start}`, date, start, end, title: "Study", type: "focus" as const, ...extra });
const planDraft = (date: string, start: string, minutes: number, extra: Draft = {}) =>
  check({ title: "New", date, start, duration_minutes: minutes, type: "focus", pack_decided: true, ...extra }).draft;

Deno.test("weeks run Monday to Sunday", () => {
  assertEquals(mondayOf("2026-11-25"), "2026-11-23");
  assertEquals(mondayOf("2026-11-29"), "2026-11-23"); // Sunday
  assertEquals(mondayOf("2026-11-23"), "2026-11-23");
});

Deno.test("a heavy week is warned about above 25 hours, firmly above 30", () => {
  // 24 hours planned over four days, then a one-hour session: exactly 25h, no warning.
  const heavy = [1, 2, 3, 4].map((n) => study(day(n), "08:00", "14:00")); // 6h x 4 = 24h
  assertEquals(findStrain(planDraft(day(5), "09:00", 60), heavy), null);
  const over = findStrain(planDraft(day(5), "09:00", 120), heavy)!; // 26h
  assertEquals(over.reasons, ["week"]);
  assertEquals(over.week_minutes, 26 * 60);
  assert(strainWarning(over, planDraft(day(5), "09:00", 120), now).includes("**26 hours** of study the week of Monday, November 23"));
  const firm = findStrain(planDraft(day(5), "09:00", 7 * 60), heavy)!; // 31h
  assert(strainWarning(firm, planDraft(day(5), "09:00", 7 * 60), now).includes("past what most people can keep up"));
});

Deno.test("breaks never count, finished sessions do, other weeks don't", () => {
  const planned = [
    study(day(1), "08:00", "20:00", { type: "break" }),
    study(day(2), "08:00", "14:00", { completed: true }),
    study("2026-11-30", "08:00", "20:00"), // next Monday
  ];
  assertEquals(findStrain(planDraft(day(3), "09:00", 120), planned), null);
  assertEquals(findStrain(planDraft(day(3), "09:00", 120, { type: "break" }), [study(day(1), "08:00", "20:00"), study(day(2), "08:00", "20:00")]), null);
});

Deno.test("editing a session isn't counted twice", () => {
  const planned = [study(day(1), "08:00", "14:00"), study(day(2), "08:00", "14:00"), study(day(3), "08:00", "14:00"),
    study(day(4), "08:00", "14:00"), study(day(5), "08:00", "09:00", { id: "mine" })]; // 25h
  assertEquals(findStrain(planDraft(day(5), "08:00", 60, { session_id: "mine" }), planned), null);
  assertEquals(findStrain(planDraft(day(5), "10:00", 120), planned)?.reasons, ["week"]);
});

Deno.test("more than 3 hours in a row, including back-to-back sessions", () => {
  assertEquals(findStrain(planDraft(day(1), "09:00", 181), [])?.reasons, ["stretch"]);
  assertEquals(findStrain(planDraft(day(1), "09:00", 180), []), null);
  // Back to back with a 2-hour session: 2h + 2h in a row.
  const joined = findStrain(planDraft(day(1), "11:00", 120), [study(day(1), "09:00", "11:00")])!;
  assertEquals(joined.stretch_minutes, 240);
  assertEquals(joined.reasons, ["stretch"]);
  // A 10-minute gap is a real break.
  assertEquals(findStrain(planDraft(day(1), "11:10", 120), [study(day(1), "09:00", "11:00")]), null);
  // A 9-minute gap is not.
  assertEquals(findStrain(planDraft(day(1), "11:09", 120), [study(day(1), "09:00", "11:00")])?.reasons, ["stretch"]);
  // A break session in between doesn't join them.
  assertEquals(findStrain(planDraft(day(1), "11:00", 120), [study(day(1), "09:00", "11:00", { type: "break" })]), null);
});

Deno.test("a fifth study session in a day is warned about", () => {
  const four = [study(day(1), "08:00", "09:00"), study(day(1), "10:00", "11:00"), study(day(1), "12:00", "13:00"), study(day(1), "14:00", "15:00")];
  const fifth = findStrain(planDraft(day(1), "17:00", 60), four)!;
  assertEquals(fifth.reasons, ["day"]);
  assertEquals(fifth.day_count, 5);
  assert(strainWarning(fifth, planDraft(day(1), "17:00", 60), now).includes("your **5th** study session"));
  assertEquals(findStrain(planDraft(day(1), "17:00", 60), four.slice(0, 3)), null);
});

Deno.test("several reasons share one warning", () => {
  const planned = [1, 2, 3, 4].map((n) => study(day(n), "08:00", "14:00"));
  const draft = planDraft(day(5), "09:00", 4 * 60);
  const strain = findStrain(draft, planned)!;
  assertEquals(strain.reasons, ["week", "stretch"]);
  const text = strainWarning(strain, draft, now);
  assert(text.startsWith("Heads up: ") && text.endsWith("Proceed anyway, or change it?"));
  assert(text.includes("of study the week of") && text.includes("in a row with no real break"));
});

Deno.test("proceeding anyway lasts until the plan changes", () => {
  const ok = { ...planDraft(day(1), "09:00", 240), load_ok: true };
  assertEquals(applyPlan(ok, { title: "Other" }).load_ok, true);
  assertEquals(applyPlan(ok, { duration_minutes: 120 }).load_ok, false);
  assertEquals(applyPlan(ok, { type: "practice" }).load_ok, false);
  assertEquals(applyPlan(ok, { start: "10:00" }).load_ok, false);
});

Deno.test("the warning says 'this week' only for the current week", () => {
  // now is Saturday 2026-11-21, so this week is Monday 16th to Sunday 22nd.
  const heavy = [16, 17, 18, 19].map((d) => study(`2026-11-${d}`, "08:00", "14:00"));
  const draft = planDraft("2026-11-22", "09:00", 120);
  assert(strainWarning(findStrain(draft, heavy)!, draft, now).includes("of study this week"));
});

Deno.test("exact lengths, so a stretch just over the limit doesn't read as within it", () => {
  assertEquals(durationLabel(181), "3 hours 1 minute");
  assertEquals(durationLabel(1), "1 minute");
  const strain = findStrain(planDraft(day(1), "09:00", 181), [])!;
  assert(strainWarning(strain, planDraft(day(1), "09:00", 181), now).includes("**3 hours 1 minute** of study in a row"));
});

Deno.test("which warning was shown doesn't count as a change", () => {
  const draft = planDraft(day(1), "09:00", 240);
  assert(sameDraft({ ...draft, strain_shown: true }, applyPlan({ ...draft, strain_shown: true }, { wants_change: true })));
  assert(sameDraft({ ...draft, clash_shown: true }, { ...draft, clash_shown: false }));
  assert(!sameDraft(draft, applyPlan(draft, { start: "10:00" })));
});
