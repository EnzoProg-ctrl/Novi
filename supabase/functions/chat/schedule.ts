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
};

export type Field = "title" | "date" | "start" | "duration" | "pack";
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
  if (!h) return `${m} minutes`;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return m ? `${hours} ${m} minutes` : hours;
}

/** "Today", "Tomorrow", or the weekday name for the days after (within a week). */
export function dayChip(date: string, now: LocalNow): string {
  if (date === now.date) return "Today";
  if (date === addDays(now.date, 1)) return "Tomorrow";
  return weekdayOf(date);
}

// ── The student's week ─────────────────────────────────────────

/** A planned session in the student's own wall-clock time. */
export type Planned = { date: string; start: string; end: string; title: string };

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
export async function fetchPlanned(db: SupabaseClient, now: LocalNow, timeZone: string | null): Promise<Planned[]> {
  // A generous window in UTC; each session is then placed on its local day.
  const from = new Date(`${addDays(now.date, -1)}T00:00:00Z`).toISOString();
  const to = new Date(`${addDays(now.date, 9)}T00:00:00Z`).toISOString();
  const { data } = await db.from("scheduled_sessions").select("title, starts_at, ends_at")
    .is("completed_at", null).gte("starts_at", from).lt("starts_at", to).order("starts_at");
  return (data ?? []).map((row) => {
    const start = localParts(row.starts_at as string, timeZone);
    const end = localParts(row.ends_at as string, timeZone);
    return { date: start.date, start: start.time, end: end.time, title: row.title as string };
  });
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

  if (draft.duration_minutes == null) {
    draft.duration_minutes = draft.type === "break" ? defaults.brk : defaults.session;
  } else {
    const minutes = Math.round(Number(draft.duration_minutes));
    if (!Number.isFinite(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      problem = "Sessions can be from 5 minutes to 12 hours long.";
      draft.duration_minutes = null;
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
    : null;

  return { draft, missing, problem };
}

const QUESTIONS: Record<Field, string> = {
  title: "What will you study in this session?",
  date: "What day should it be?",
  start: "What time should it start?",
  duration: "How long should it be?",
  pack: "",
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
    case "pack": {
      const pack = packs.find((p) => p.id === draft.suggested_pack_id);
      question = `Should I link it to your study pack **${pack?.title ?? "that pack"}**? Then it also shows on Home when it's time.`;
      options = ["Yes, link it", "No pack"];
      break;
    }
  }
  return { content: [lead, question].filter(Boolean).join(" "), options };
}

/** One line describing a complete draft, for Novi's replies. */
export function describe(draft: Draft, now: LocalNow, packs: Pack[]): string {
  const pack = packs.find((p) => p.id === draft.pack_id);
  return `**${draft.title}**, ${dayLabel(draft.date!, now)} at ${timeLabel(draft.start!)} for ${durationLabel(draft.duration_minutes!)}` +
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
    clear_fields: { type: "ARRAY", items: { type: "STRING", enum: ["title", "date", "start", "duration", "pack"] } },
    wants_change: { type: "BOOLEAN" },
    confirm: { type: "BOOLEAN" },
    cancel: { type: "BOOLEAN" },
    unrelated: { type: "BOOLEAN" },
    asks_availability: { type: "BOOLEAN" },
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
    "- Fill a field only when the student said it or clearly implied it. Leave everything else out. Never guess a day or a time.",
    "- title: a short name for what they'll study, like \"Biology: cell division\" or \"Exam revision\" (at most 60 characters). If they only name one of their packs, use that pack's title.",
    "- date: YYYY-MM-DD. Work out words like \"today\", \"tomorrow\", \"Friday\", \"next Monday\" or \"the 25th\" from today's date. A weekday name means the next one after today.",
    "- start: HH:MM, 24-hour (\"4pm\" is 16:00, \"half past 9 in the morning\" is 09:30). \"Evening\" or \"afternoon\" alone is not a time: leave it out.",
    "- duration_minutes: only if they gave a length (\"for 2 hours\" is 120), or a start and end time.",
    "- type: \"practice\" for practice questions or quizzes, \"revision\" for reviewing or revising, \"break\" for a break, otherwise \"focus\".",
    "- suggested_pack_id: the id of one of their packs that clearly matches the topic, if any.",
    "- pack_id: only when they ask to link a specific pack. pack_answer: \"link\" if they agree to link the suggested pack (\"yes\", \"link it\"), \"none\" if they don't want a pack.",
    "- If they want to change a detail without giving the new value (\"change the time\"), list it in clear_fields. If they want to change something but don't say what, set wants_change.",
    "- confirm: true if they say the session is right and should be saved (\"yes\", \"looks good\", \"save it\").",
    "- cancel: true if they no longer want to plan this session.",
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
  for (const field of plan.clear_fields ?? []) {
    if (field === "duration") next.duration_minutes = null;
    else if (field === "pack") {
      next.pack_id = null;
      next.pack_decided = false;
    } else next[field] = null;
  }
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

// ── One turn of the flow ───────────────────────────────────────

export type TurnResult =
  | { kind: "unrelated" }
  | { kind: "reply"; content: string; metadata: Record<string, unknown> };

/**
 * Handles one message while a session is being planned: reads it, updates the
 * draft, and either asks for the next detail, shows the summary to confirm,
 * saves the session (when the app sent Confirm), or stops.
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
  const ask = (checked: Checked, lead = false): TurnResult => {
    const { content, options } = nextQuestion(checked, now, packs, lead);
    return {
      kind: "reply",
      content,
      metadata: { guard: "schedule", schedule_draft: checked.draft, ask_schedule: { field: checked.missing, options }, follow_ups: [] },
    };
  };
  const summary = (checked: Checked, lead = ""): { kind: "reply"; content: string; metadata: Record<string, unknown> } => {
    const pack = packs.find((p) => p.id === checked.draft.pack_id);
    return {
      kind: "reply",
      content: `${lead ? `${lead} ` : ""}Here's your session: ${describe(checked.draft, now, packs)}. Press **Confirm** to add it to your calendar, or tell me what to change.`,
      metadata: {
        guard: "schedule",
        schedule_draft: checked.draft,
        schedule_confirm: { ...checked.draft, pack_title: pack?.title ?? null },
        follow_ups: [],
      },
    };
  };

  // ── Confirm pressed: save it ────────────────────────────────
  if (confirm) {
    const checked = validateDraft(previous, now, packs, defaults);
    if (checked.missing) return ask(checked);
    const times = confirmedTimes(checked.draft, confirm.starts_at, confirm.ends_at);
    if (!times) {
      // Most likely the start time passed while the card was open.
      return ask({ ...checked, draft: { ...checked.draft, start: null }, missing: "start", problem: "That time has already passed." });
    }
    try {
      const id = await createSession(db, userId, checked.draft, times.start, times.end);
      return {
        kind: "reply",
        content: `Done. ${describe(checked.draft, now, packs)} is on your calendar.`,
        metadata: {
          guard: "schedule",
          scheduled: {
            id,
            title: checked.draft.title,
            starts_at: times.start.toISOString(),
            ends_at: times.end.toISOString(),
            pack_id: checked.draft.pack_id ?? null,
          },
          follow_ups: ["Plan another study session", "Quiz me on this topic"],
        },
      };
    } catch (err) {
      console.log(JSON.stringify({ schedule_save_failed: err instanceof Error ? err.message : String(err) }));
      return { ...summary(checked), content: "I couldn't save that session just now. Press **Confirm** to try again." };
    }
  }

  // ── Anything else: read the message ─────────────────────────
  const plan = await planSession({ draft: previous, message, history, now, packs, signal });
  if (plan.unrelated && !plan.asks_availability && !opening && !force) return { kind: "unrelated" };
  if (plan.cancel) {
    return {
      kind: "reply",
      content: "Okay, I won't plan that session. Just ask whenever you want to schedule one.",
      metadata: { guard: "schedule", follow_ups: ["Plan a study session"] },
    };
  }

  const checked = validateDraft(applyPlan(previous, plan), now, packs, defaults);
  const changed = JSON.stringify(checked.draft) !== JSON.stringify(validateDraft(previous, now, packs, defaults).draft);

  if (plan.wants_change && !changed && !checked.missing) {
    return {
      kind: "reply",
      content: "Sure. What would you like to change: the day, the time, the length, the title or the pack?",
      metadata: {
        guard: "schedule",
        schedule_draft: checked.draft,
        ask_schedule: { field: "change", options: ["Change the day", "Change the time", "Change the length", "Change the title"] },
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
    const card = summary(checked);
    return { ...card, content: `${week.text}\n\n${card.content}` };
  }

  if (checked.missing) return ask(checked, opening);
  // A typed "yes": the app saves it with the Confirm button, which knows the
  // student's time zone.
  return summary(checked, plan.confirm && !changed ? "Almost there." : "");
}
