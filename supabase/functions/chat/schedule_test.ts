/**
 * Planning a session through AI Chat: the rules a draft must follow and what
 * Novi asks next. No network; the AI step (planSession) is not called.
 *
 *   npx --yes deno@2.5.4 test supabase/functions/chat
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  applyPlan,
  confirmedTimes,
  type Draft,
  localNowFrom,
  nextQuestion,
  validateDraft,
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
