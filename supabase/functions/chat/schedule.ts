/**
 * Planning a study session through AI Chat.
 *
 * The student says something like "schedule a study session", and Novi asks
 * for one missing detail at a time: what they'll study, the day, the start
 * time, and (when one of their packs fits) whether to link that pack. Length
 * comes from their default session length and the type is guessed from the
 * wording. Once everything is there, Novi shows a summary card; the session
 * is saved only when they press Confirm.
 *
 * The draft lives on Novi's last reply (metadata.schedule_draft), so the flow
 * survives a reload and needs no table of its own. Dates and times are the
 * student's own wall-clock values ("2026-11-25", "16:00"); the app turns them
 * into instants when they confirm, so no time-zone maths happens here.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateJson } from "../_shared/ai/generate.ts";

export const SESSION_TYPES = ["focus", "practice", "revision", "break"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export type Draft = {
  title?: string | null;
  /** The student's local date, YYYY-MM-DD. */
  date?: string | null;
  /** The student's local start time, HH:MM (24-hour). */
  start?: string | null;
  duration_minutes?: number | null;
  type?: SessionType | null;
  pack_id?: string | null;
  /** A pack that fits the topic, offered to the student. */
  suggested_pack_id?: string | null;
  /** True once the student has said yes or no to linking a pack. */
  pack_decided?: boolean;
  /** The length came from their default, so it follows a change of type. */
  duration_default?: boolean;
  /** They want a different length but haven't said which. */
  duration_pending?: boolean;
  /** They want a different type but haven't said which. */
  type_pending?: boolean;
  /** Set once the session is saved: changes now update (or remove) that row. */
  session_id?: string | null;
  /** Novi asked whether to remove the saved session. */
  pending_delete?: boolean;
  /** Novi warned about a clash and is waiting for "keep both" or a change. */
  clash_shown?: boolean;
  /** The student chose to keep it despite the clash (until the day or time changes). */
  clash_ok?: boolean;
  /** Novi warned that the plan is too much and is waiting for "proceed anyway" or a change. */
  strain_shown?: boolean;
  /** The student chose to proceed despite a heavy plan (until the day, time, length or type changes). */
  load_ok?: boolean;
};

export type Field = "title" | "date" | "start" | "duration" | "pack" | "type";

export const TYPE_LABELS: Record<SessionType, string> = {
  focus: "focus session",
  practice: "practice session",
  revision: "revision session",
  break: "break",
};
export type Pack = { id: string; title: string };
/** The student's wall clock right now. */
export type LocalNow = { date: string; time: string };

/** Same limits as the Calendar form and the scheduled_sessions constraints. */
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 12 * 60;
const MAX_TITLE = 120;
const DAY_MINUTES = 24 * 60;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after midnight for "HH:MM", or null. */
export function minutesOf(time: string | null | undefined): number | null {
  const m = time ? TIME_RE.exec(time) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "YYYY-MM-DD" as a UTC-midnight Date, only if it is a real calendar day. */
function dayOf(date: string | null | undefined): Date | null {
  const m = date ? DATE_RE.exec(date) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

/** The date `days` after "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const d = dayOf(date)!;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(dayOf(date)!);
}

/** "Tuesday, November 25" */
export function dayLabel(date: string, now: LocalNow): string {
  if (date === now.date) return "today";
  if (date === addDays(now.date, 1)) return "tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
    .format(dayOf(date)!);
}

/** "4:00 PM" */
export function timeLabel(time: string): string {
  const mins = minutesOf(time)!;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const mins = `${m} ${m === 1 ? "minute" : "minutes"}`;
  if (!h) return mins;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return m ? `${hours} ${mins}` : hours;
}

/** "Today", "Tomorrow", or the weekday name for the days after (within a week). */
export function dayChip(date: string, now: LocalNow): string {
  if (date === now.date) return "Today";
  if (date === addDays(now.date, 1)) return "Tomorrow";
  return weekdayOf(date);
}

// ── The student's week ─────────────────────────────────────────

/** A planned session in the student's own wall-clock time. */
export type Planned = {
  date: string;
  start: string;
  end: string;
  title: string;
  id?: string;
  pack_id?: string | null;
  type?: SessionType;
  completed?: boolean;
};

/** An instant as the student's local date and time ("YYYY-MM-DD", "HH:MM"). */
export function localParts(iso: string, timeZone: string | null): LocalNow {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  } catch {
    return localParts(iso, "UTC");
  }
  const part = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}` };
}

/** The student's unfinished planned sessions from today through the next week. */
export async function fetchPlanned(
  db: SupabaseClient,
  now: LocalNow,
  timeZone: string | null,
  /** Local days to cover, inclusive. Defaults to today through the next week. */
  range: { from: string; to: string } = { from: now.date, to: addDays(now.date, 7) },
  /** Also return sessions already marked done (for counting the week's load). */
  includeCompleted = false,
): Promise<Planned[]> {
  // A generous window in UTC; each session is then placed on its local day.
  const from = new Date(`${addDays(range.from, -1)}T00:00:00Z`).toISOString();
  const to = new Date(`${addDays(range.to, 2)}T00:00:00Z`).toISOString();
  let query = db.from("scheduled_sessions").select("id, title, starts_at, ends_at, study_set_id, session_type, completed_at")
    .gte("starts_at", from).lt("starts_at", to).order("starts_at");
  if (!includeCompleted) query = query.is("completed_at", null);
  const { data } = await query;
  return ((data ?? []) as SessionRow[]).map((row) => {
    const start = localParts(row.starts_at, timeZone);
    const end = localParts(row.ends_at, timeZone);
    return {
      id: row.id,
      date: start.date,
      start: start.time,
      end: end.time,
      title: row.title,
      pack_id: row.study_set_id ?? null,
      type: row.session_type,
      completed: Boolean(row.completed_at),
    };
  });
}

/** The columns fetchPlanned reads from scheduled_sessions. */
type SessionRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  study_set_id: string | null;
  session_type: SessionType;
  completed_at: string | null;
};

// ── Duplicates and overlaps ────────────────────────────────────

export type Clash = { session: Planned; kind: "overlap" | "same_topic" };

const topicKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Same topic: the same pack, or titles where one contains the other ("Biology" / "Biology revision"). */
function sameTopic(draft: Draft, other: Planned): boolean {
  if (draft.pack_id && other.pack_id && draft.pack_id === other.pack_id) return true;
  const a = topicKey(draft.title ?? "");
  const b = topicKey(other.title);
  if (!a || !b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short === long || (short.length >= 4 && long.includes(short));
}

/**
 * Planned sessions a complete draft would clash with: any that overlap its
 * time, or one on the same topic on the same day (a likely duplicate). The
 * session being edited is not compared with itself. Pure, so it is tested.
 */
export function findClashes(draft: Draft, planned: Planned[]): Clash[] {
  const start = minutesOf(draft.start);
  if (!draft.date || start == null || !draft.duration_minutes) return [];
  const end = start + draft.duration_minutes;
  const clashes: Clash[] = [];
  for (const other of planned) {
    if (other.date !== draft.date || (draft.session_id && other.id === draft.session_id)) continue;
    const oStart = minutesOf(other.start) ?? 0;
    const oEnd = minutesOf(other.end) ?? oStart;
    if (start < oEnd && oStart < end) clashes.push({ session: other, kind: "overlap" });
    else if (sameTopic(draft, other)) clashes.push({ session: other, kind: "same_topic" });
  }
  return clashes;
}

/** Novi's warning about clashes, naming at most two sessions. */
export function clashWarning(clashes: Clash[], now: LocalNow): string {
  const day = dayLabel(clashes[0].session.date, now);
  const named = clashes.slice(0, 2).map(({ session }) => `**${session.title}** (${timeLabel(session.start)} – ${timeLabel(session.end)})`);
  const list = named.join(" and ") + (clashes.length > 2 ? ` and ${clashes.length - 2} more` : "");
  const overlap = clashes.some((c) => c.kind === "overlap");
  return overlap
    ? `Heads up: that overlaps with ${list} ${day}. Keep both, or change the time?`
    : `You already have ${list} planned ${day}, which looks like the same topic. Keep both, or change it?`;
}

/**
 * The next seven days, each with its planned sessions or "free", and the free
 * days in order. Pure, so it is tested directly.
 */
export function weekOverview(planned: Planned[], now: LocalNow): { text: string; freeDates: string[] } {
  const late = (minutesOf(now.time) ?? 0) > 22 * 60;
  const lines: string[] = [];
  const freeDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(now.date, i);
    const label = dayChip(date, now) === weekdayOf(date) ? dayLabel(date, now) : dayChip(date, now);
    const sessions = planned.filter((p) => p.date === date).sort((a, b) => a.start.localeCompare(b.start));
    if (sessions.length) {
      const list = sessions.map((p) => `${p.title} (${timeLabel(p.start)} – ${timeLabel(p.end)})`).join(", ");
      lines.push(`- **${label}**: ${list}`);
    } else {
      lines.push(`- **${label}**: free`);
      if (!(late && date === now.date)) freeDates.push(date);
    }
  }
  const intro = planned.some((p) => p.date >= now.date && p.date <= addDays(now.date, 6))
    ? "Here's your next 7 days:"
    : "Your calendar is clear for the next 7 days:";
  return { text: `${intro}\n\n${lines.join("\n")}`, freeDates };
}

// ── Too much study ─────────────────────────────────────────────

/** Fixed limits: a heavy week, a long stretch without rest, a crowded day. */
export const WEEK_WARN_MINUTES = 25 * 60;
export const WEEK_FIRM_MINUTES = 30 * 60;
export const STRETCH_MAX_MINUTES = 3 * 60;
/** Study sessions closer together than this count as one stretch. */
export const REST_GAP_MINUTES = 10;
export const DAY_MAX_SESSIONS = 4;

export type Strain = {
  week_minutes: number;
  stretch_minutes: number;
  day_count: number;
  reasons: ("week" | "stretch" | "day")[];
};

/** The Monday on or before "YYYY-MM-DD". */
export function mondayOf(date: string): string {
  const day = dayOf(date)!.getUTCDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

const span = (p: { start: string; end: string }): [number, number] => {
  const start = minutesOf(p.start) ?? 0;
  return [start, Math.max(start, minutesOf(p.end) ?? start)];
};

/**
 * How heavy the plan gets if this complete draft is added: the week's study
 * (Monday to Sunday, finished or not), the longest stretch it joins with no
 * real break, and how many study sessions that day. Breaks never count. The
 * session being edited isn't counted twice. Pure, so it is tested.
 */
export function findStrain(draft: Draft, planned: Planned[]): Strain | null {
  const start = minutesOf(draft.start);
  if (!draft.date || start == null || !draft.duration_minutes || draft.type === "break") return null;
  const end = start + draft.duration_minutes;
  const others = planned.filter((p) => p.type !== "break" && !(draft.session_id && p.id === draft.session_id));

  const monday = mondayOf(draft.date);
  const sunday = addDays(monday, 6);
  const week = others.filter((p) => p.date >= monday && p.date <= sunday)
    .reduce((sum, p) => sum + (span(p)[1] - span(p)[0]), draft.duration_minutes);

  // Merge the day's study into stretches; the new session's stretch is what matters.
  const day = others.filter((p) => p.date === draft.date).map(span).sort((a, b) => a[0] - b[0]);
  let stretchStart = start;
  let stretchEnd = end;
  for (let changed = true; changed;) {
    changed = false;
    for (const [s, e] of day) {
      if (s <= stretchEnd + REST_GAP_MINUTES - 1 && e >= stretchStart - REST_GAP_MINUTES + 1 && (s < stretchStart || e > stretchEnd)) {
        stretchStart = Math.min(stretchStart, s);
        stretchEnd = Math.max(stretchEnd, e);
        changed = true;
      }
    }
  }
  const stretch = stretchEnd - stretchStart;
  const count = day.length + 1;

  const reasons: Strain["reasons"] = [];
  if (week > WEEK_WARN_MINUTES) reasons.push("week");
  if (stretch > STRETCH_MAX_MINUTES) reasons.push("stretch");
  if (count > DAY_MAX_SESSIONS) reasons.push("day");
  return reasons.length ? { week_minutes: week, stretch_minutes: stretch, day_count: count, reasons } : null;
}

const ordinal = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 < 4 ? n % 10 : 0]}`;
};

/** Novi's warning about a heavy plan: one message for every reason that applies. */
export function strainWarning(strain: Strain, draft: Draft, now: LocalNow): string {
  const parts: string[] = [];
  const week = mondayOf(draft.date!) === mondayOf(now.date) ? "this week" : `the week of ${dayLabel(mondayOf(draft.date!), now)}`;
  if (strain.reasons.includes("week")) {
    parts.push(
      strain.week_minutes > WEEK_FIRM_MINUTES
        ? `that would be **${durationLabel(strain.week_minutes)}** of study ${week}, which is past what most people can keep up. Retention drops and burnout rises`
        : `that would be **${durationLabel(strain.week_minutes)}** of study ${week}, which is a lot. Most people do best with 10 to 25 hours`,
    );
  }
  if (strain.reasons.includes("stretch")) {
    parts.push(`that is **${durationLabel(strain.stretch_minutes)}** of study in a row with no real break`);
  }
  if (strain.reasons.includes("day")) {
    parts.push(`that would be your **${ordinal(strain.day_count)}** study session ${dayLabel(draft.date!, now)}`);
  }
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join("; ")}; and ${parts.at(-1)}`;
  return `Heads up: ${list}. Proceed anyway, or change it?`;
}

export type Checked = {
  draft: Draft;
  /** The first detail still needed, in the order Novi asks for them. */
  missing: Field | null;
  /** Why a detail the student gave couldn't be used. */
  problem: string | null;
};

/**
 * Cleans a draft against the rules a session must follow, dropping anything
 * that can't be used, and says what to ask for next. Pure, so it is tested
 * directly (schedule_test.ts).
 */
export function validateDraft(input: Draft, now: LocalNow, packs: Pack[], defaults: { session: number; brk: number }): Checked {
  const draft: Draft = { ...input };
  let problem: string | null = null;
  const owned = new Set(packs.map((p) => p.id));

  const title = typeof draft.title === "string" ? draft.title.replace(/\s+/g, " ").trim() : "";
  draft.title = title ? title.slice(0, MAX_TITLE) : null;

  draft.type = SESSION_TYPES.includes(draft.type as SessionType) ? draft.type : "focus";

  if (draft.duration_minutes == null && draft.duration_pending) {
    // They want a different length: ask, don't refill the default.
  } else if (draft.duration_minutes == null) {
    draft.duration_minutes = draft.type === "break" ? defaults.brk : defaults.session;
    draft.duration_default = true;
  } else {
    const minutes = Math.round(Number(draft.duration_minutes));
    if (!Number.isFinite(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      problem = "Sessions can be from 5 minutes to 12 hours long.";
      draft.duration_minutes = null;
      draft.duration_pending = true;
    } else {
      draft.duration_minutes = minutes;
    }
  }

  if (draft.date != null) {
    if (!dayOf(draft.date)) {
      problem ??= "I couldn't work out that day.";
      draft.date = null;
    } else if (draft.date < now.date) {
      problem ??= "That day has already passed.";
      draft.date = null;
    }
  }

  const start = minutesOf(draft.start);
  if (draft.start != null && start == null) {
    problem ??= "I couldn't work out that time.";
    draft.start = null;
  } else if (start != null && draft.date === now.date && start <= (minutesOf(now.time) ?? 0)) {
    problem ??= "That time has already passed today.";
    draft.start = null;
  } else if (start != null && draft.duration_minutes && start + draft.duration_minutes > DAY_MINUTES) {
    problem ??= "That would run past midnight, and a session has to stay within one day.";
    draft.start = null;
  }

  // Only the student's own packs can be linked or offered.
  if (draft.pack_id && !owned.has(draft.pack_id)) draft.pack_id = null;
  if (draft.suggested_pack_id && !owned.has(draft.suggested_pack_id)) draft.suggested_pack_id = null;
  if (draft.pack_id) draft.pack_decided = true;
  // The topic is known and no pack fits it: nothing to offer, so nothing to ask.
  if (draft.title && !draft.suggested_pack_id && !draft.pack_id) draft.pack_decided = true;
  draft.pack_decided = Boolean(draft.pack_decided);

  const missing: Field | null = !draft.title
    ? "title"
    : !draft.date
    ? "date"
    : !draft.start
    ? "start"
    : !draft.duration_minutes
    ? "duration"
    : !draft.pack_decided
    ? "pack"
    : draft.type_pending
    ? "type"
    : null;

  return { draft, missing, problem };
}

const QUESTIONS: Record<Field, string> = {
  title: "What will you study in this session?",
  date: "What day should it be?",
  start: "What time should it start?",
  duration: "How long should it be?",
  pack: "",
  type: "What kind of session should it be?",
};

/** Novi's question for the next missing detail, with tappable answers. */
export function nextQuestion(
  checked: Checked,
  now: LocalNow,
  packs: Pack[],
  opening: boolean,
  /** Days to offer first, for example the free ones in the student's week. */
  preferDates: string[] | null = null,
): { content: string; options: string[] } {
  const { draft, missing, problem } = checked;
  const lead = [opening ? "Sure, let's plan a study session." : "", problem ?? ""].filter(Boolean).join(" ");
  let question = missing ? QUESTIONS[missing] : "";
  let options: string[] = [];

  switch (missing) {
    case "title":
      options = packs.slice(0, 4).map((p) => p.title);
      break;
    case "date": {
      const dates = preferDates?.length ? preferDates : [0, 1, 2, 3].map((n) => addDays(now.date, n));
      // Late in the evening, today has no room left for a session.
      const late = (minutesOf(now.time) ?? 0) > 22 * 60;
      options = dates.filter((d) => !(late && d === now.date)).slice(0, 4).map((d) => dayChip(d, now));
      break;
    }
    case "start": {
      const after = draft.date === now.date ? (minutesOf(now.time) ?? 0) : -1;
      const room = DAY_MINUTES - (draft.duration_minutes ?? 60);
      options = ["09:00", "13:00", "16:00", "18:00", "20:00"]
        .filter((t) => minutesOf(t)! > after && minutesOf(t)! <= room)
        .map(timeLabel)
        .slice(0, 4);
      break;
    }
    case "duration":
      options = ["30 minutes", "1 hour", "1 hour 30 minutes", "2 hours"];
      break;
    case "type":
      options = ["Focus", "Practice", "Revision", "Break"];
      break;
    case "pack": {
      const pack = packs.find((p) => p.id === draft.suggested_pack_id);
      question = `Should I link it to your study pack **${pack?.title ?? "that pack"}**? Then it also shows on Home when it's time.`;
      options = ["Yes, link it", "No pack"];
      break;
    }
  }
  return { content: [lead, question].filter(Boolean).join(" "), options };
}

/**
 * "Okay, I changed the day to Wednesday, November 25." for details the
 * student had already set and has now changed, so a change of mind is
 * visibly taken. Empty when nothing set before has changed.
 */
export function changeNote(before: Draft, after: Draft, now: LocalNow, packs: Pack[]): string {
  const parts: string[] = [];
  if (before.title && after.title && before.title !== after.title) parts.push(`the title to **${after.title}**`);
  if (before.date && after.date && before.date !== after.date) parts.push(`the day to **${dayLabel(after.date, now)}**`);
  if (before.start && after.start && before.start !== after.start) parts.push(`the time to **${timeLabel(after.start)}**`);
  if (before.type && after.type && before.type !== after.type && !after.type_pending) {
    parts.push(`the type to **${TYPE_LABELS[after.type]}**`);
  }
  if (before.duration_minutes && after.duration_minutes && before.duration_minutes !== after.duration_minutes) {
    parts.push(`the length to **${durationLabel(after.duration_minutes)}**`);
  }
  if (before.pack_decided && after.pack_decided && (before.pack_id ?? null) !== (after.pack_id ?? null)) {
    const pack = packs.find((p) => p.id === after.pack_id);
    parts.push(pack ? `the pack to **${pack.title}**` : "it to have no pack");
  }
  if (!parts.length) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `Okay, I changed ${list}.`;
}

/** One line describing a complete draft, for Novi's replies. */
export function describe(draft: Draft, now: LocalNow, packs: Pack[]): string {
  const pack = packs.find((p) => p.id === draft.pack_id);
  return `**${draft.title}** (${TYPE_LABELS[draft.type ?? "focus"]}), ${dayLabel(draft.date!, now)} at ${timeLabel(draft.start!)} for ${durationLabel(draft.duration_minutes!)}` +
    (pack ? `, linked to **${pack.title}**` : "");
}

// ── Reading the student's answer ───────────────────────────────

export type Plan = {
  title?: string | null;
  date?: string | null;
  start?: string | null;
  duration_minutes?: number | null;
  type?: SessionType | null;
  pack_id?: string | null;
  suggested_pack_id?: string | null;
  /** The student answered the pack question: "link" or "none". */
  pack_answer?: "link" | "none" | null;
  /** Details the student wants to change but didn't give a new value for. */
  clear_fields?: Field[];
  wants_change?: boolean;
  confirm?: boolean;
  cancel?: boolean;
  unrelated?: boolean;
  /** They asked when they're free or what's already planned. */
  asks_availability?: boolean;
  /** They want another, separate session (not a change to this one). */
  new_session?: boolean;
};

const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    date: { type: "STRING" },
    start: { type: "STRING" },
    duration_minutes: { type: "INTEGER" },
    type: { type: "STRING", enum: [...SESSION_TYPES] },
    pack_id: { type: "STRING" },
    suggested_pack_id: { type: "STRING" },
    pack_answer: { type: "STRING", enum: ["link", "none"] },
    clear_fields: { type: "ARRAY", items: { type: "STRING", enum: ["title", "date", "start", "duration", "pack", "type"] } },
    wants_change: { type: "BOOLEAN" },
    confirm: { type: "BOOLEAN" },
    cancel: { type: "BOOLEAN" },
    unrelated: { type: "BOOLEAN" },
    asks_availability: { type: "BOOLEAN" },
    new_session: { type: "BOOLEAN" },
  },
  required: ["unrelated"],
};

/** Reads the student's latest message into changes to the draft (one AI call). */
export async function planSession({ draft, message, history, now, packs, signal }: {
  draft: Draft;
  message: string;
  history: { role: string; content: string }[];
  now: LocalNow;
  packs: Pack[];
  signal: AbortSignal;
}): Promise<Plan> {
  const recent = history.slice(-6)
    .map((m) => `${m.role === "user" ? "Student" : "Novi"}: ${m.content.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  const prompt = [
    "You help a student plan ONE study session in a study app's calendar. Read their NEW MESSAGE and return only what it tells you.",
    "",
    `Today is ${weekdayOf(now.date)} ${now.date}. The time now is ${now.time} (24-hour, the student's local time).`,
    `Session details so far (JSON): ${JSON.stringify(draft)}`,
    packs.length
      ? `The student's study packs (id: title):\n${packs.map((p) => `${p.id}: ${p.title}`).join("\n")}`
      : "The student has no study packs.",
    recent ? `\nRECENT CONVERSATION:\n${recent}` : "",
    "",
    "Rules:",
    "- Return EVERY field in the schema. Fill a field only when the student said it or clearly implied it; set every other field to null (false for yes/no fields, an empty list for clear_fields). Never guess a day or a time.",
    draft.session_id
      ? "- This session is ALREADY SAVED on their calendar. If they change their mind about anything (\"actually make it Friday\", \"move it to 5\", \"make it a revision session\"), return the new value: it will update the saved session."
      : "",
    "- Students often change their mind (\"actually\", \"instead\", \"make it\", \"move it\", \"not Monday\"). Return the NEW value for whatever they changed, even if it was set before.",
    "- title: a short name for what they'll study, like \"Biology: cell division\" or \"Exam revision\" (at most 60 characters). If they only name one of their packs, use that pack's title.",
    "- date: YYYY-MM-DD. Work out words like \"today\", \"tomorrow\", \"Friday\", \"next Monday\" or \"the 25th\" from today's date. A weekday name means the next one after today.",
    "- start: HH:MM, 24-hour (\"4pm\" is 16:00, \"half past 9 in the morning\" is 09:30). \"Evening\" or \"afternoon\" alone is not a time: set start to null.",
    "- duration_minutes: only if they gave a length (\"for 2 hours\" is 120), or a start and end time.",
    "- type: \"practice\" for practice questions or quizzes, \"revision\" for reviewing or revising, \"break\" for a break, \"focus\" for focused study. Set it when they first describe the session or when they change it.",
    "- suggested_pack_id: the id of one of their packs that clearly matches the topic, if any.",
    "- pack_id: only when they ask to link a specific pack. pack_answer: \"link\" if they agree to link the suggested pack (\"yes\", \"link it\"), \"none\" if they don't want a pack.",
    "- If they want to change or drop a detail without giving the new value (\"change the time\", \"not that day\", \"different type\"), list it in clear_fields (title, date, start, duration, pack or type). If they want to change something but don't say what, set wants_change.",
    "- confirm: true if they say the session is right and should be saved (\"yes\", \"looks good\", \"save it\").",
    "- cancel: true if they no longer want this session at all (\"cancel\", \"never mind\", \"forget it\", \"remove it\"). Changing one detail is not cancelling.",
    "- new_session: true if they want to plan another, separate session.",
    "- asks_availability: true if they ask which days or times are free, what is already on their calendar, or when they have time.",
    "- unrelated: true only if the message is about something else entirely (for example a study question) and not about planning this session. Questions about their calendar or free time are not unrelated.",
    "",
    "NEW MESSAGE:",
    message.slice(0, 1_000),
  ].join("\n");

  const { data } = await generateJson<Plan>(prompt, PLAN_SCHEMA, { outputTokens: 500, signal });
  return data ?? { unrelated: false };
}

/** Applies what the student said to the draft. */
export function applyPlan(draft: Draft, plan: Plan): Draft {
  const next: Draft = { ...draft };
  // A new type: the length follows it if it was only the default.
  if (plan.type && plan.type !== draft.type) {
    next.type_pending = false;
    if (draft.duration_default && !plan.duration_minutes) next.duration_minutes = null;
  } else if (plan.type) next.type_pending = false;
  if (plan.duration_minutes) {
    next.duration_default = false;
    next.duration_pending = false;
  }
  for (const key of ["title", "date", "start", "duration_minutes", "type", "suggested_pack_id"] as const) {
    const value = plan[key];
    if (value !== undefined && value !== null && value !== "") (next as Record<string, unknown>)[key] = value;
  }
  if (plan.pack_id) {
    next.pack_id = plan.pack_id;
    next.pack_decided = true;
  }
  if (plan.pack_answer === "link" && next.suggested_pack_id) {
    next.pack_id = next.suggested_pack_id;
    next.pack_decided = true;
  } else if (plan.pack_answer === "none") {
    next.pack_id = null;
    next.pack_decided = true;
  }
  // A detail dropped and given a new value in the same message keeps the new value.
  const given: Record<Field, unknown> = {
    title: plan.title, date: plan.date, start: plan.start, duration: plan.duration_minutes,
    type: plan.type, pack: plan.pack_id ?? plan.pack_answer,
  };
  for (const field of plan.clear_fields ?? []) {
    if (given[field] !== undefined && given[field] !== null && given[field] !== "") continue;
    if (field === "duration") {
      // Asked for again rather than refilled with the default they want to change.
      next.duration_minutes = null;
      next.duration_default = false;
      next.duration_pending = true;
    } else if (field === "type") {
      if (!plan.type) next.type_pending = true;
    } else if (field === "pack") {
      next.pack_id = null;
      next.pack_decided = false;
    } else next[field] = null;
  }
  // A new day, time or length is checked for clashes again; a new type counts for load.
  const moved = next.date !== draft.date || next.start !== draft.start || next.duration_minutes !== draft.duration_minutes;
  if (moved) next.clash_ok = false;
  if (moved || next.type !== draft.type) next.load_ok = false;
  next.clash_shown = false;
  next.strain_shown = false;
  return next;
}

// ── Saving ─────────────────────────────────────────────────────

/** Saves a confirmed session as the student (RLS applies). Returns its id. */
export async function createSession(db: SupabaseClient, userId: string, draft: Draft, startsAt: Date, endsAt: Date): Promise<string> {
  const { data, error } = await db.from("scheduled_sessions").insert({
    user_id: userId,
    title: draft.title,
    session_type: draft.type ?? "focus",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    study_set_id: draft.pack_id ?? null,
  }).select("id").single();
  if (error || !data) throw error ?? new Error("Session not saved");
  return data.id as string;
}

/**
 * Updates a saved session after the student changed their mind. Returns
 * false if it no longer exists (deleted from the Calendar meanwhile).
 */
export async function updateSession(db: SupabaseClient, id: string, draft: Draft, startsAt: Date, endsAt: Date): Promise<boolean> {
  const { data, error } = await db.from("scheduled_sessions").update({
    title: draft.title,
    session_type: draft.type ?? "focus",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    study_set_id: draft.pack_id ?? null,
  }).eq("id", id).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function deleteSession(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from("scheduled_sessions").delete().eq("id", id);
  if (error) throw error;
}

/**
 * The instants the app sent with Confirm, if they match the draft: a valid
 * start, the draft's length, and not already in the past.
 */
export function confirmedTimes(draft: Draft, startsAt: unknown, endsAt: unknown, nowMs = Date.now()): { start: Date; end: Date } | null {
  if (typeof startsAt !== "string" || typeof endsAt !== "string") return null;
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (Math.abs(minutes - (draft.duration_minutes ?? -1)) > 1) return null;
  if (start.getTime() < nowMs - 60_000) return null;
  return { start, end };
}

/** "2026-11-21T14:05" from the app, or the server's UTC clock if missing. */
export function localNowFrom(clientNow: unknown): LocalNow {
  const m = typeof clientNow === "string" ? /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)/.exec(clientNow) : null;
  if (m && dayOf(m[1])) return { date: m[1], time: `${m[2]}:${m[3]}` };
  const iso = new Date().toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Flags that only record which question Novi just asked, not what the session is. */
const TRANSIENT = ["clash_shown", "strain_shown", "pending_delete"] as const;

/** Whether two drafts describe the same session, ignoring which warning was last shown. */
export function sameDraft(a: Draft, b: Draft): boolean {
  const strip = (d: Draft) => {
    const copy: Record<string, unknown> = { ...d };
    for (const key of TRANSIENT) delete copy[key];
    return JSON.stringify(Object.keys(copy).sort().map((k) => [k, copy[k]]));
  };
  return strip(a) === strip(b);
}

// ── One turn of the flow ───────────────────────────────────────

export type TurnResult =
  | { kind: "unrelated" }
  | { kind: "reply"; content: string; metadata: Record<string, unknown> };

type Reply = { kind: "reply"; content: string; metadata: Record<string, unknown> };

const PROCEED = /^(proceed( anyway)?|go ahead|keep it|do it anyway|anyway|yes|yeah|yep|sure|ok(ay)?|that'?s (fine|ok)|it'?s (fine|ok)|fine)\b/i;
const KEEP_BOTH = /^(keep both|keep (them|it)( both)?|both|plan it anyway|anyway|that'?s (fine|ok)|it'?s (fine|ok)|fine|yes|yeah|yep|sure|ok(ay)?|go ahead)\b/i;
const YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|please do|do it|remove( it)?|delete( it)?|cancel( it)?)\b/i;
const NO = /^(no|nope|nah|keep( it)?|don'?t|never ?mind|leave it)\b/i;

/** What Novi says after a session was saved or updated. */
function savedReply(draft: Draft, id: string, times: { start: Date; end: Date }, content: string): Reply {
  return {
    kind: "reply",
    content,
    metadata: {
      guard: "schedule",
      scheduled: {
        id,
        title: draft.title,
        type: draft.type ?? "focus",
        starts_at: times.start.toISOString(),
        ends_at: times.end.toISOString(),
        pack_id: draft.pack_id ?? null,
      },
      // Kept, so a change of mind right after ("actually make it 5pm") edits this session.
      schedule_draft: { ...draft, session_id: id, pending_delete: false },
      follow_ups: ["Move it to another time", "Plan another study session"],
    },
  };
}

/**
 * Handles one message while a session is being planned, or right after one
 * was saved: reads it, updates the draft, and either asks for the next
 * detail, shows the summary to confirm, saves or updates the session (when
 * the app sent Confirm), removes it (after asking), or stops.
 */
export async function scheduleTurn({ db, userId, message, history, draft: previous, opening, force = false, now, timeZone = null, packs, defaults, confirm, signal }: {
  db: SupabaseClient;
  userId: string;
  message: string;
  history: { role: string; content: string }[];
  draft: Draft;
  /** The first message of the flow ("schedule a study session"). */
  opening: boolean;
  /** Answer even if the message looks unrelated (the main check said it is about scheduling). */
  force?: boolean;
  now: LocalNow;
  /** The student's IANA time zone, to place their planned sessions on the right days. */
  timeZone?: string | null;
  packs: Pack[];
  defaults: { session: number; brk: number };
  /** Sent by the app's Confirm button: the session's instants. */
  confirm: { starts_at?: unknown; ends_at?: unknown } | null;
  signal: AbortSignal;
}): Promise<TurnResult> {
  const saved = Boolean(previous.session_id);

  const ask = (checked: Checked, lead = false, note = ""): Reply => {
    const { content, options } = nextQuestion(checked, now, packs, lead);
    return {
      kind: "reply",
      content: [note, content].filter(Boolean).join(" "),
      metadata: { guard: "schedule", schedule_draft: checked.draft, ask_schedule: { field: checked.missing, options }, follow_ups: [] },
    };
  };
  const summary = (checked: Checked, lead = ""): Reply => {
    const pack = packs.find((p) => p.id === checked.draft.pack_id);
    const editing = Boolean(checked.draft.session_id);
    const body = editing
      ? `Here's the updated session: ${describe(checked.draft, now, packs)}. Press **Save changes** to update your calendar, or tell me what else to change.`
      : `Here's your session: ${describe(checked.draft, now, packs)}. Press **Confirm** to add it to your calendar, or tell me what to change.`;
    return {
      kind: "reply",
      content: [lead, body].filter(Boolean).join(" "),
      metadata: {
        guard: "schedule",
        schedule_draft: checked.draft,
        schedule_confirm: { ...checked.draft, pack_title: pack?.title ?? null },
        follow_ups: [],
      },
    };
  };

  /** A warning instead of the card when the session clashes with one already planned. */
  const clashReply = async (checked: Checked, lead = ""): Promise<Reply | null> => {
    if (checked.draft.clash_ok || !checked.draft.date) return null;
    const planned = await fetchPlanned(db, now, timeZone, { from: checked.draft.date, to: checked.draft.date });
    const clashes = findClashes(checked.draft, planned);
    if (!clashes.length) return null;
    return {
      kind: "reply",
      content: [lead, clashWarning(clashes, now)].filter(Boolean).join(" "),
      metadata: {
        guard: "schedule",
        schedule_draft: { ...checked.draft, clash_shown: true },
        ask_schedule: { field: "clash", options: ["Keep both", "Change the time", checked.draft.session_id ? "Remove it" : "Cancel it"] },
        follow_ups: [],
      },
    };
  };
  /** A warning instead of the card when the plan is too much: a heavy week, a long stretch, a crowded day. */
  const strainReply = async (checked: Checked, lead = ""): Promise<Reply | null> => {
    if (checked.draft.load_ok || !checked.draft.date) return null;
    const monday = mondayOf(checked.draft.date);
    const planned = await fetchPlanned(db, now, timeZone, { from: monday, to: addDays(monday, 6) }, true);
    const strain = findStrain(checked.draft, planned);
    if (!strain) return null;
    return {
      kind: "reply",
      content: [lead, strainWarning(strain, checked.draft, now)].filter(Boolean).join(" "),
      metadata: {
        guard: "schedule",
        schedule_draft: { ...checked.draft, strain_shown: true },
        ask_schedule: { field: "strain", options: ["Proceed anyway", "Change it", checked.draft.session_id ? "Remove it" : "Cancel it"] },
        follow_ups: [],
      },
    };
  };
  /** The summary card, unless the session clashes or is too much first. */
  const finish = async (checked: Checked, lead = ""): Promise<Reply> =>
    (await clashReply(checked, lead)) ?? (await strainReply(checked, lead)) ?? summary(checked, lead);

  // ── Confirm pressed: save it, or save the changes ───────────
  if (confirm) {
    const checked = validateDraft(previous, now, packs, defaults);
    if (checked.missing) return ask(checked);
    // Something may have been added to the calendar while the card was open.
    const clash = (await clashReply(checked)) ?? (await strainReply(checked));
    if (clash) return clash;
    const times = confirmedTimes(checked.draft, confirm.starts_at, confirm.ends_at);
    if (!times) {
      // Most likely the start time passed while the card was open.
      return ask({ ...checked, draft: { ...checked.draft, start: null }, missing: "start", problem: "That time has already passed." });
    }
    try {
      if (checked.draft.session_id && await updateSession(db, checked.draft.session_id, checked.draft, times.start, times.end)) {
        return savedReply(checked.draft, checked.draft.session_id, times, `Updated. ${describe(checked.draft, now, packs)} is on your calendar now.`);
      }
      // New, or the saved one was deleted from the Calendar meanwhile: add it.
      const id = await createSession(db, userId, checked.draft, times.start, times.end);
      return savedReply(checked.draft, id, times, `Done. ${describe(checked.draft, now, packs)} is on your calendar.`);
    } catch (err) {
      console.log(JSON.stringify({ schedule_save_failed: err instanceof Error ? err.message : String(err) }));
      return { ...summary(checked), content: "I couldn't save that session just now. Press the button to try again." };
    }
  }

  // ── Answering "Remove it from your calendar?" ───────────────
  if (previous.pending_delete && previous.session_id) {
    const answer = message.trim();
    if (YES.test(answer) && !NO.test(answer)) {
      try {
        await deleteSession(db, previous.session_id);
      } catch (err) {
        console.log(JSON.stringify({ schedule_delete_failed: err instanceof Error ? err.message : String(err) }));
        return {
          kind: "reply",
          content: "I couldn't remove it just now. Try again, or delete it from the Calendar.",
          metadata: { guard: "schedule", schedule_draft: previous, ask_schedule: { field: "remove", options: ["Yes, remove it", "Keep it"] }, follow_ups: [] },
        };
      }
      return {
        kind: "reply",
        content: `Removed **${previous.title}** from your calendar.`,
        metadata: {
          guard: "schedule",
          unscheduled: { id: previous.session_id, title: previous.title },
          follow_ups: ["Plan a study session"],
        },
      };
    }
    if (NO.test(answer)) {
      return {
        kind: "reply",
        content: `Okay, **${previous.title}** stays on your calendar.`,
        metadata: {
          guard: "schedule",
          schedule_draft: { ...previous, pending_delete: false },
          follow_ups: ["Move it to another time", "Plan another study session"],
        },
      };
    }
    // Something else ("actually just move it to Friday"): read it normally.
    previous = { ...previous, pending_delete: false };
  }

  // ── Answering a clash warning: "Keep both" ──────────────────
  if (previous.clash_shown && KEEP_BOTH.test(message.trim())) {
    return await finish(validateDraft({ ...previous, clash_shown: false, clash_ok: true }, now, packs, defaults), "Okay, keeping both.");
  }

  // ── Answering a "that's a lot" warning: "Proceed anyway" ────
  if (previous.strain_shown && PROCEED.test(message.trim())) {
    return await finish(validateDraft({ ...previous, strain_shown: false, load_ok: true }, now, packs, defaults), "Okay, your call.");
  }

  // ── Anything else: read the message ─────────────────────────
  const plan = await planSession({ draft: previous, message, history, now, packs, signal });

  // Another session entirely: start a fresh draft with whatever they said.
  if (plan.new_session && saved) {
    const fresh = validateDraft(applyPlan({}, { ...plan, clear_fields: [] }), now, packs, defaults);
    return fresh.missing ? ask(fresh, true) : await finish(fresh);
  }

  if (plan.unrelated && !plan.asks_availability && !opening && !force) return { kind: "unrelated" };

  if (plan.cancel) {
    if (saved) {
      return {
        kind: "reply",
        content: `Remove **${previous.title}** (${dayLabel(previous.date!, now)} at ${timeLabel(previous.start!)}) from your calendar?`,
        metadata: {
          guard: "schedule",
          schedule_draft: { ...previous, pending_delete: true },
          ask_schedule: { field: "remove", options: ["Yes, remove it", "Keep it"] },
          follow_ups: [],
        },
      };
    }
    return {
      kind: "reply",
      content: "Okay, I won't plan that session. Just ask whenever you want to schedule one.",
      metadata: { guard: "schedule", follow_ups: ["Plan a study session"] },
    };
  }

  const before = validateDraft(previous, now, packs, defaults);
  const checked = validateDraft(applyPlan(previous, plan), now, packs, defaults);
  const changed = !sameDraft(checked.draft, before.draft) || checked.missing !== before.missing;
  const note = changeNote(before.draft, checked.draft, now, packs);

  // Right after saving, a message that changes nothing ("thanks!") is ordinary chat.
  if (saved && !changed && !plan.wants_change && !plan.asks_availability) return { kind: "unrelated" };

  if (plan.wants_change && !changed && !checked.missing) {
    return {
      kind: "reply",
      content: saved
        ? "Sure. What would you like to change: the day, the time, the type or the length? Or should I remove it?"
        : "Sure. What would you like to change: the day, the time, the type, the length or the title?",
      metadata: {
        guard: "schedule",
        schedule_draft: checked.draft,
        ask_schedule: {
          field: "change",
          options: saved
            ? ["Change the day", "Change the time", "Change the type", "Remove it"]
            : ["Change the day", "Change the time", "Change the type", "Cancel it"],
        },
        follow_ups: [],
      },
    };
  }

  // "Which days are free?": show their week, then carry on where they were.
  if (plan.asks_availability) {
    const week = weekOverview(await fetchPlanned(db, now, timeZone), now);
    if (checked.missing) {
      const { content, options } = nextQuestion(checked, now, packs, false, week.freeDates);
      return {
        kind: "reply",
        content: `${week.text}\n\n${content}`,
        metadata: { guard: "schedule", schedule_draft: checked.draft, ask_schedule: { field: checked.missing, options }, follow_ups: [] },
      };
    }
    if (saved && !changed) {
      return {
        kind: "reply",
        content: week.text,
        metadata: { guard: "schedule", schedule_draft: checked.draft, follow_ups: ["Move it to another time", "Plan another study session"] },
      };
    }
    const card = await finish(checked, note);
    return { ...card, content: `${week.text}\n\n${card.content}` };
  }

  if (checked.missing) return ask(checked, opening, note);
  // A typed "yes": the app saves it with the button, which knows the
  // student's time zone.
  return await finish(checked, note || (plan.confirm && !changed ? "Almost there." : ""));
}
