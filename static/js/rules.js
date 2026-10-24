// Rule engine for psychologists' practical training (autorisation / klinisk psykolog), transition scheme:
// Bekendtgørelse nr. 247 af 5. februar 2026 om psykologers praksisuddannelse, bilag 2 (overgangsordning),
// which continues Psykolognævnets requirements until 31 December 2028.
//
// Pure functions: no DOM, no I/O. `s` is a snapshot { profile, workplace[], supervisor[], course[], session[], konf[], therapy[] }.

export const RULES = {
  deadline: "2028-12-31",          // bilag 2: uddannelsen skal være gennemført senest
  fteYears: 2,                     // 1.1: mindst 2 års fuldtidsarbejde
  fullTimeHours: 30,               // 1.1: >= 30 t/uge regnes som fuldtid
  minWeeklyHours: 15,              // 1.2: < 15 t/uge kan ikke medregnes
  absenceDeductWeeks: 8,           // 1.5: fravær > 8 sammenhængende uger fratrækkes
  selfEmployedKonfPerYear: 600,    // 1.4: fuldtid = 600 konfrontationstimer pr. år
  konfAssessment: 500,             // 2.1
  konfIntervention: 500,           // 2.1
  konfIndividual: 200,             // 2.2
  konfGroupOrg: 200,               // 2.2
  konfTotal: 1000,
  supervisionTotal: 160,           // 3.1
  minSupervisors: 2,               // 3.1
  supIndividual: 40,               // 3.2
  supGroup: 40,                    // 3.2 (omregnet)
  supExternalSame: 40,             // 3.2: samme eksterne supervisor
  minCourseHours: 5,               // 3.5: forløb skal være >= 5 omregnede timer
  therapyMax: 25,                  // 4.1
  supVideoMax: 80,                 // 5.1
  konfVideoMaxPerActivity: 250,    // 5.1
};

export const ACTIVITIES = { udredning: "Udredning", intervention: "Intervention" };
export const TARGETS = { individ: "Individ", gruppe: "Gruppe", organisation: "Organisation" };

const DAY = 86400000;
const toDate = (iso) => new Date(iso + "T00:00:00Z");
export const isoDay = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
const num = (x) => (Number.isFinite(+x) ? +x : 0);

/** 3.4: group supervision weighting by number of supervisees. */
export function groupFactor(size) {
  const n = Math.round(num(size));
  if (n <= 2) return 1;
  if (n <= 5) return 2 / 3;
  if (n <= 12) return 1 / 2;
  return 0;
}

export function convertedHours(session) {
  const h = num(session.hours);
  return session.format === "group" ? h * groupFactor(session.groupSize) : h;
}

/** Parse "1,5", "1.5", "1:30", "90m", "1t30" into decimal hours. Returns NaN when invalid. */
export function parseHours(input) {
  const s = String(input ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return NaN;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return +m[1] + +m[2] / 60;
  if ((m = s.match(/^(\d+)(?:t|h)(\d{1,2})?(?:m|min)?$/))) return +m[1] + (m[2] ? +m[2] / 60 : 0);
  if ((m = s.match(/^(\d+)(?:m|min)$/))) return +m[1] / 60;
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

export function inRange(dateIso, from, to) {
  return (!from || dateIso >= from) && (!to || dateIso <= to);
}

// ------------------------------------------------------------------ work duration (1.1–1.5)

/** Weekly hours for a workplace on a given day (latest period starting on/before the day). */
function hoursOn(wp, day) {
  const periods = (wp.periods || []).filter((p) => p.from && p.from <= day && (!p.to || p.to >= day));
  if (periods.length) return num(periods[periods.length - 1].hoursPerWeek);
  return 0;
}

function workplaceRange(wp, today) {
  const starts = (wp.periods || []).map((p) => p.from).filter(Boolean).sort();
  const ends = (wp.periods || []).map((p) => p.to || today).sort();
  return { start: starts[0] || null, end: ends.length ? (ends[ends.length - 1] > today ? today : ends[ends.length - 1]) : null };
}

/** Long absences (> 8 consecutive weeks) are deducted entirely. */
function deductedAbsence(wp) {
  return (wp.absences || []).filter((a) => a.from && a.to && daysBetween(a.from, a.to) + 1 > RULES.absenceDeductWeeks * 7);
}

/** Full-time-equivalent work. Optionally limited to a date range and a subset of workplaces (used per uddannelsesaftale). */
export function workDuration(s, today, { from, to, workplaceIds } = {}) {
  const perDay = new Map(); // day -> fraction of full time (capped at 1 across concurrent jobs)
  const perWorkplace = {};
  const warnings = [];
  for (const wp of s.workplace) {
    if (workplaceIds && !workplaceIds.includes(wp.id)) continue;
    if (wp.selfEmployed) {
      const konf = s.konf.filter((k) => k.workplaceId === wp.id && inRange(k.date, from, to)).reduce((a, k) => a + num(k.hours), 0);
      perWorkplace[wp.id] = { years: konf / RULES.selfEmployedKonfPerYear, selfEmployed: true, konf };
      continue;
    }
    let { start, end } = workplaceRange(wp, today);
    if (from && start && start < from) start = from;
    if (to && end && end > to) end = to;
    let fte = 0;
    let shortDays = 0;
    const absences = deductedAbsence(wp);
    if (start && end && start <= end) {
      for (let t = toDate(start).getTime(); t <= toDate(end).getTime(); t += DAY) {
        const day = isoDay(new Date(t));
        if (absences.some((a) => day >= a.from && day <= a.to)) continue;
        const h = hoursOn(wp, day);
        if (h < RULES.minWeeklyHours) { if (h > 0) shortDays++; continue; }
        const f = Math.min(1, h / RULES.fullTimeHours);
        perDay.set(day, Math.min(1, (perDay.get(day) || 0) + f));
        fte += f;
      }
    }
    if (shortDays) warnings.push({ level: "warn", text: `${wp.name}: perioder under ${RULES.minWeeklyHours} timer/uge tæller ikke med (pkt. 1.2).` });
    if (absences.length) warnings.push({ level: "info", text: `${wp.name}: ${absences.length} fraværsperiode(r) over 8 uger er fratrukket (pkt. 1.5).` });
    perWorkplace[wp.id] = { years: fte / 365.25, start, end, selfEmployed: false };
  }
  let employedDays = 0;
  for (const v of perDay.values()) employedDays += v;
  const selfYears = Object.values(perWorkplace).filter((w) => w.selfEmployed).reduce((a, w) => a + w.years, 0);
  return { years: employedDays / 365.25 + selfYears, perWorkplace, warnings };
}

/** Is a date inside a period where the workplace counts (≥ 15 h/week)? Used to flag misplaced entries. */
function countsOn(wp, day) {
  if (!wp) return false;
  if (wp.selfEmployed) return true;
  return hoursOn(wp, day) >= RULES.minWeeklyHours;
}

// ------------------------------------------------------------------ supervision (3.x, 4.x, 5.1)

export function supervision(s, { from, to } = {}) {
  const supervisors = new Map(s.supervisor.map((x) => [x.id, x]));
  const workplaces = new Map(s.workplace.map((x) => [x.id, x]));
  const courses = new Map(s.course.map((c) => [c.id, c]));
  const warnings = [];
  const perCourse = {};
  for (const c of s.course) {
    perCourse[c.id] = { course: c, sessions: 0, actual: 0, converted: 0, individual: 0, groupActual: 0, groupConverted: 0,
      video: 0, first: null, last: null, outside: 0, eligible: false, counted: 0 };
  }
  const sessions = s.session.filter((x) => inRange(x.date, from, to) && perCourse[x.courseId]);
  for (const x of sessions) {
    const pc = perCourse[x.courseId];
    const conv = convertedHours(x);
    pc.sessions++;
    pc.actual += num(x.hours);
    pc.converted += conv;
    if (x.format === "group") { pc.groupActual += num(x.hours); pc.groupConverted += conv; } else pc.individual += conv;
    if (x.video) pc.video += conv;
    if (!pc.first || x.date < pc.first) pc.first = x.date;
    if (!pc.last || x.date > pc.last) pc.last = x.date;
    const wp = workplaces.get(courses.get(x.courseId).workplaceId);
    if (wp && !countsOn(wp, x.date)) pc.outside++;
    if (x.format === "group" && num(x.groupSize) >= 13) {
      warnings.push({ level: "warn", text: `Supervision ${x.date}: grupper med 13+ supervisander kan ikke medregnes (pkt. 3.4).` });
    }
  }

  // A course must reach 5 converted hours (3.5) and the supervisor must be qualified (3.3).
  for (const pc of Object.values(perCourse)) {
    const sup = supervisors.get(pc.course.supervisorId);
    const qualified = sup ? sup.qualified !== false : false;
    pc.eligible = pc.converted >= RULES.minCourseHours && qualified;
    const label = `${sup?.name || "Ukendt supervisor"}${pc.course.name ? ` (${pc.course.name})` : ""}`;
    if (pc.sessions && pc.converted < RULES.minCourseHours) {
      warnings.push({ level: "warn", text: `Forløbet hos ${label} har kun ${round(pc.converted, 1)} omregnede timer – mindst ${RULES.minCourseHours} kræves for at det tæller (pkt. 3.5).` });
    }
    if (pc.sessions && !qualified) {
      warnings.push({ level: "bad", text: `${label}: supervisor er ikke markeret som kvalificeret (klinisk psykolog med ≥ 3 års erfaring efter kandidateksamen). Timerne tælles ikke med (pkt. 3.3).` });
    }
    if (pc.outside) {
      warnings.push({ level: "warn", text: `${label}: ${pc.outside} session(er) ligger uden for en ansættelsesperiode på mindst ${RULES.minWeeklyHours} t/uge for det tilknyttede arbejdsforhold (pkt. 3.3).` });
    }
    if (pc.course.external && sup?.sameAddress && pc.sessions) {
      warnings.push({ level: "info", text: `${label}: ekstern supervisor med samme arbejdsadresse – vedlæg begrundet dokumentation (fx arbejdsgivererklæring/organisationsdiagram) (pkt. 6.3).` });
    }
  }

  // Video cap (5.1): at most 80 of the hours may be via video link. Excess is removed proportionally
  // from every video session (conservative: also reduces the sub-requirements).
  const eligibleSessions = sessions.filter((x) => perCourse[x.courseId].eligible);
  const videoTotal = eligibleSessions.filter((x) => x.video).reduce((a, x) => a + convertedHours(x), 0);
  const videoFactor = videoTotal > RULES.supVideoMax ? RULES.supVideoMax / videoTotal : 1;
  const t = { individual: 0, group: 0, groupActual: 0, total: 0, video: Math.min(videoTotal, RULES.supVideoMax), videoRaw: videoTotal,
    raw: 0, external: {}, bySupervisor: {} };
  for (const x of sessions) t.raw += convertedHours(x);
  for (const x of eligibleSessions) {
    const c = courses.get(x.courseId);
    const h = convertedHours(x) * (x.video ? videoFactor : 1);
    t.total += h;
    perCourse[x.courseId].counted += h;
    if (x.format === "group") { t.group += h; t.groupActual += num(x.hours); } else t.individual += h;
    t.bySupervisor[c.supervisorId] = (t.bySupervisor[c.supervisorId] || 0) + h;
    if (c.external) t.external[c.supervisorId] = (t.external[c.supervisorId] || 0) + h;
  }
  if (videoTotal > RULES.supVideoMax) {
    warnings.push({ level: "warn", text: `${round(videoTotal, 1)} supervisionstimer via video – kun ${RULES.supVideoMax} kan medregnes (pkt. 5.1).` });
  }
  const ext = Object.entries(t.external).sort((a, b) => b[1] - a[1])[0];
  t.externalBest = ext ? { supervisorId: ext[0], hours: ext[1], name: supervisors.get(ext[0])?.name || "?" } : null;
  t.supervisorCount = Object.values(t.bySupervisor).filter((h) => h > 0).length;
  return { perCourse, totals: t, warnings, sessions };
}

export function therapy(s, { from, to } = {}) {
  const items = s.therapy.filter((x) => inRange(x.date, from, to));
  const total = items.reduce((a, x) => a + num(x.hours), 0);
  const individual = items.filter((x) => x.format !== "group").reduce((a, x) => a + num(x.hours), 0);
  return { total, individual, group: total - individual, counted: Math.min(total, RULES.therapyMax), items };
}

// ------------------------------------------------------------------ confrontation hours (2.x, 5.1)

/**
 * Counted confrontation hours with caps applied per entry:
 *  - video hours: max 250 per activity (5.1) – excess scaled down proportionally,
 *  - indirect work (supervision of others): max half of all counted hours (2.3) – i.e. indirect <= direct.
 */
export function confrontation(s, { from, to, workplaceId } = {}) {
  const entries = s.konf.filter((k) => inRange(k.date, from, to) && (!workplaceId || k.workplaceId === workplaceId));
  const workplaces = new Map(s.workplace.map((x) => [x.id, x]));
  const warnings = [];
  const raw = { total: 0, video: { udredning: 0, intervention: 0 }, indirect: 0, direct: 0 };
  for (const k of entries) {
    const h = num(k.hours);
    raw.total += h;
    if (k.video) raw.video[k.activity] = (raw.video[k.activity] || 0) + h;
    if (k.indirect) raw.indirect += h; else raw.direct += h;
  }
  const videoFactor = {};
  for (const a of Object.keys(ACTIVITIES)) {
    const v = raw.video[a] || 0;
    videoFactor[a] = v > RULES.konfVideoMaxPerActivity ? RULES.konfVideoMaxPerActivity / v : 1;
    if (v > RULES.konfVideoMaxPerActivity) {
      warnings.push({ level: "warn", text: `${round(v, 1)} timers ${ACTIVITIES[a].toLowerCase()} via video – højst ${RULES.konfVideoMaxPerActivity} kan medregnes (pkt. 5.1).` });
    }
  }
  const afterVideo = (k) => num(k.hours) * (k.video ? videoFactor[k.activity] : 1);
  let direct = 0;
  let indirect = 0;
  for (const k of entries) (k.indirect ? (indirect += afterVideo(k)) : (direct += afterVideo(k)));
  const indirectFactor = indirect > direct ? (indirect ? direct / indirect : 0) : 1;
  if (indirect > direct) {
    warnings.push({ level: "warn", text: `Indirekte timer (${round(indirect, 1)}) overstiger de direkte (${round(direct, 1)}) – indirekte arbejde kan højst udgøre halvdelen (pkt. 2.3).` });
  }

  const matrix = {};
  for (const a of Object.keys(ACTIVITIES)) { matrix[a] = {}; for (const t of Object.keys(TARGETS)) matrix[a][t] = 0; }
  const rawMatrix = JSON.parse(JSON.stringify(matrix));
  let outside = 0;
  for (const k of entries) {
    const h = afterVideo(k) * (k.indirect ? indirectFactor : 1);
    if (matrix[k.activity] && k.target in matrix[k.activity]) {
      matrix[k.activity][k.target] += h;
      rawMatrix[k.activity][k.target] += num(k.hours);
    }
    if (!countsOn(workplaces.get(k.workplaceId), k.date)) outside++;
  }
  if (outside) warnings.push({ level: "warn", text: `${outside} konfrontationsregistrering(er) ligger uden for en tællende ansættelsesperiode.` });
  const sumRow = (m, a) => Object.values(m[a]).reduce((x, y) => x + y, 0);
  const sumCol = (m, t) => Object.keys(ACTIVITIES).reduce((x, a) => x + m[a][t], 0);
  const counted = {
    udredning: sumRow(matrix, "udredning"),
    intervention: sumRow(matrix, "intervention"),
    individ: sumCol(matrix, "individ"),
    groupOrg: sumCol(matrix, "gruppe") + sumCol(matrix, "organisation"),
  };
  counted.total = counted.udredning + counted.intervention;
  return { matrix, rawMatrix, counted, raw, warnings, entries, indirectCounted: indirect * indirectFactor };
}

// ------------------------------------------------------------------ requirements overview

function req(key, label, value, target, rule, extra = {}) {
  return { key, label, value, target, ok: value >= target - 1e-9, pct: target ? Math.min(1, value / target) : 1, rule, ...extra };
}

export function evaluate(s, today = isoDay(new Date())) {
  const sup = supervision(s);
  const th = therapy(s);
  const konf = confrontation(s);
  const work = workDuration(s, today);
  const T = sup.totals;
  const supWithTherapy = T.total + th.counted;
  const requirements = [
    req("work", "Arbejdstid (fuldtidsår)", work.years, RULES.fteYears, "pkt. 1.1–1.5", { unit: "år", decimals: 2 }),
    req("konfU", "Konfrontation – udredning", konf.counted.udredning, RULES.konfAssessment, "pkt. 2.1"),
    req("konfI", "Konfrontation – intervention", konf.counted.intervention, RULES.konfIntervention, "pkt. 2.1"),
    req("konfInd", "Konfrontation – individer", konf.counted.individ, RULES.konfIndividual, "pkt. 2.2"),
    req("konfGrp", "Konfrontation – grupper/organisationer", konf.counted.groupOrg, RULES.konfGroupOrg, "pkt. 2.2"),
    req("supTotal", "Supervision i alt (inkl. egenterapi)", supWithTherapy, RULES.supervisionTotal, "pkt. 3.1, 4.2"),
    req("supInd", "Individuel supervision", T.individual, RULES.supIndividual, "pkt. 3.2"),
    req("supGrp", "Gruppesupervision (omregnet)", T.group, RULES.supGroup, "pkt. 3.2, 3.4"),
    req("supExt", "Samme eksterne supervisor", T.externalBest?.hours || 0, RULES.supExternalSame, "pkt. 3.2",
      { note: T.externalBest ? T.externalBest.name : "Ingen ekstern supervision endnu" }),
    req("supCount", "Antal forskellige supervisorer", T.supervisorCount, RULES.minSupervisors, "pkt. 3.1", { unit: "", decimals: 0 }),
  ];
  const warnings = [...work.warnings, ...sup.warnings, ...konf.warnings];
  if (th.total > RULES.therapyMax) warnings.push({ level: "info", text: `Egenterapi: ${round(th.total, 1)} timer registreret – højst ${RULES.therapyMax} kan medregnes (pkt. 4.1).` });
  const daysLeft = daysBetween(today, RULES.deadline);
  if (daysLeft < 365 && requirements.some((r) => !r.ok)) {
    warnings.push({ level: daysLeft < 120 ? "bad" : "warn", text: `Overgangsordningen udløber ${RULES.deadline} (${daysLeft} dage). Uddannelsen skal være gennemført inden da.` });
  }
  return { requirements, warnings, sup, konf, therapy: th, work, daysLeft, done: requirements.every((r) => r.ok) };
}

// ------------------------------------------------------------------ uddannelsesaftaler (BEK 247/2026 §§ 4, 6, 10, 11)

export const PPU = {
  minAgreementFteDays: 365.25 / 4,  // § 6, stk. 2: mindst 3 måneders fuldtid
  maxAbsenceShare: 0.1,             // § 6, stk. 3: fravær ud over ferie > 10 % indgår ikke
  learningHours: 160,               // § 9, stk. 3
  externalHours: 40,                // § 10, stk. 1
  exemptionMonths: 6,               // § 10, stk. 2
};

const overlapDays = (a1, a2, b1, b2) => {
  const s1 = a1 > b1 ? a1 : b1;
  const s2 = a2 < b2 ? a2 : b2;
  return s1 <= s2 ? daysBetween(s1, s2) + 1 : 0;
};

/**
 * Status and rule checks for one uddannelsesaftale `a`.
 * The period runs from a.start to the actual end, else the expected end (`plannedEnd`), and is measured up to today (`end`).
 */
export function agreementStatus(a, s, today = isoDay(new Date())) {
  const warnings = [];
  const add = (level, text) => warnings.push({ level, text });
  const ppu = a.scheme === "ppu";
  const plannedEnd = a.endDate || a.expectedEnd || null;
  const end = plannedEnd && plannedEnd < today ? plannedEnd : today;
  const wpIds = a.workplaceIds || [];
  const started = a.start && a.start <= today;
  const work = a.start ? workDuration(s, today, { from: a.start, to: end, workplaceIds: wpIds }) : { years: 0 };
  const courses = (s.course || []).filter((c) => (a.courseIds || []).includes(c.id));
  const sup = supervision(s, { from: a.start, to: end });
  const supTotals = { individual: 0, groupActual: 0, groupConverted: 0, external: 0, actual: 0 };
  for (const c of courses) {
    const pc = sup.perCourse[c.id];
    if (!pc) continue;
    supTotals.individual += pc.individual;
    supTotals.groupActual += pc.groupActual;
    supTotals.groupConverted += pc.groupConverted;
    supTotals.actual += pc.individual + pc.groupActual;
    if (c.external) supTotals.external += pc.individual + pc.groupActual;
  }
  const log = (s.agreementlog || []).filter((x) => x.agreementId === a.id);
  const activityHours = log.filter((x) => x.type === "activity").reduce((t, x) => t + num(x.hours), 0);
  const plannedDays = a.start && plannedEnd && plannedEnd >= a.start ? daysBetween(a.start, plannedEnd) + 1 : 0;
  const absenceDays = (a.absences || []).filter((x) => x.from && x.to && x.to >= x.from)
    .reduce((t, x) => t + (plannedDays ? overlapDays(x.from, x.to, a.start, plannedEnd) : daysBetween(x.from, x.to) + 1), 0);
  const absenceShare = plannedDays ? absenceDays / plannedDays : 0;
  const h = num(a.hoursPerWeek);
  const selfEmployed = wpIds.some((id) => (s.workplace || []).find((w) => w.id === id)?.selfEmployed);

  if (!a.start) add("bad", "Startdato mangler (§ 4, stk. 2).");
  if (!a.expectedEnd) add("warn", "Forventet slutdato mangler (§ 4, stk. 2).");
  if (a.start && a.expectedEnd && a.expectedEnd < a.start) add("bad", "Den forventede slutdato ligger før startdatoen.");
  if (!a.respName) add("warn", "Uddannelsesansvarlig er ikke angivet (§ 4, stk. 2).");
  if (!wpIds.length) add("warn", "Intet praksissted er knyttet til aftalen (§ 4, stk. 2).");
  if (a.respName && !a.respQualified && !a.respInstruction) {
    add("warn", "Den uddannelsesansvarlige skal opfylde kravene til supervisor eller have instruktionsbeføjelse/tilsvarende fagligt ansvar (§ 11, stk. 2).");
  }
  if (a.respName && !a.respQualified) {
    add("info", "Kompetencer, der forudsætter psykologfaglig vurdering, skal godkendes af en psykolog, der opfylder kravene til supervisor (§ 9, stk. 2).");
  }
  const norm = (x) => String(x || "").trim().toLowerCase();
  for (const c of courses.filter((c) => c.external)) {
    const name = (s.supervisor || []).find((x) => x.id === c.supervisorId)?.name;
    if (name && norm(name) === norm(a.respName)) add("bad", `${name} er uddannelsesansvarlig og kan ikke samtidig være ekstern supervisor (§ 11, stk. 4).`);
  }
  if (selfEmployed && !a.respExternal) add("warn", "Selvstændige indgår uddannelsesaftalen med en ekstern uddannelsesansvarlig (§ 4, stk. 5).");
  if (a.signedDate && a.start && a.signedDate > a.start) {
    add(ppu ? "bad" : "info", `Aftalen er underskrevet ${a.signedDate}, efter periodens start. Den skal være indgået forud for perioden (§ 4, stk. 3).`);
  }
  for (const o of (s.agreement || [])) {
    if (o.id === a.id || !o.start || !a.start) continue;
    const oEnd = o.endDate || o.expectedEnd || "9999-12-31";
    if (overlapDays(a.start, plannedEnd || "9999-12-31", o.start, oEnd)) {
      add(ppu ? "bad" : "info", `Perioden overlapper med en anden uddannelsesaftale${o.title ? ` (${o.title})` : ""}. Man kan ikke være omfattet af flere aftaler samtidig (§ 4, stk. 3).`);
    }
  }
  if (!selfEmployed && h && h < RULES.minWeeklyHours) add("bad", `Under ${RULES.minWeeklyHours} timer om ugen kan ikke medregnes (§ 6, stk. 2 / bilag 2, pkt. 1.2).`);
  if (ppu && !selfEmployed && plannedDays && h >= RULES.minWeeklyHours && plannedDays * Math.min(1, h / RULES.fullTimeHours) < PPU.minAgreementFteDays) {
    add("warn", "Aftalen dækker mindre end 3 måneders fuldtid og kan ikke medregnes (§ 6, stk. 2).");
  }
  if (absenceShare > PPU.maxAbsenceShare) {
    add(ppu ? "warn" : "info", `Fravær ud over ferie udgør ${Math.round(absenceShare * 100)} % af aftaleperioden. Over 10 % indgår ikke i opgørelsen (§ 6, stk. 3).`);
  }
  if (!ppu && plannedEnd && plannedEnd > RULES.deadline) {
    add("warn", `Forventet slutdato ligger efter overgangsordningens udløb ${RULES.deadline}.`);
  }
  if (ppu && started && courses.length && !courses.some((c) => c.external)) {
    add("info", `Der er ikke knyttet ekstern supervision til aftalen. Der kræves ${PPU.externalHours} timer, medmindre undtagelsen i § 10, stk. 2 gælder.`);
  }
  if (started && !courses.length) add("info", "Der er ikke knyttet supervisionsforløb til aftalen.");
  return {
    from: a.start, plannedEnd, end, started, plannedDays, years: work.years, supTotals, activityHours,
    learningHours: supTotals.actual + activityHours, absenceDays, absenceShare, log, courses, selfEmployed, warnings,
  };
}

// ------------------------------------------------------------------ statistics for the dashboard

export function monthKey(iso) { return iso.slice(0, 7); }

export function monthlySeries(s, today = isoDay(new Date()), maxMonths = 24) {
  const dates = [...s.session.map((x) => x.date), ...s.konf.map((x) => x.date)].filter(Boolean).sort();
  if (!dates.length) return [];
  const months = [];
  let [y, m] = dates[0].slice(0, 7).split("-").map(Number);
  const [ey, em] = today.slice(0, 7).split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  const rows = new Map(months.slice(-maxMonths).map((k) => [k, { month: k, supInd: 0, supGrp: 0, udredning: 0, intervention: 0 }]));
  for (const x of s.session) {
    const r = rows.get(monthKey(x.date));
    if (r) r[x.format === "group" ? "supGrp" : "supInd"] += convertedHours(x);
  }
  for (const k of s.konf) {
    const r = rows.get(monthKey(k.date));
    if (r && k.activity in ACTIVITIES) r[k.activity] += num(k.hours);
  }
  return [...rows.values()];
}

/** Pace over the last `days` days and projected completion date for a remaining amount. */
export function forecast(entries, remaining, today = isoDay(new Date()), days = 90, valueFn = (e) => num(e.hours)) {
  if (remaining <= 0) return { perWeek: null, eta: null, done: true };
  const from = isoDay(new Date(toDate(today) - days * DAY));
  const first = entries.map((e) => e.date).filter(Boolean).sort()[0];
  if (!first) return { perWeek: 0, eta: null };
  const span = Math.max(14, Math.min(days, daysBetween(first > from ? first : from, today) + 1));
  const sum = entries.filter((e) => e.date >= from && e.date <= today).reduce((a, e) => a + valueFn(e), 0);
  const perDay = sum / span;
  if (perDay <= 0) return { perWeek: 0, eta: null };
  return { perWeek: perDay * 7, eta: isoDay(new Date(toDate(today).getTime() + Math.ceil(remaining / perDay) * DAY)) };
}

export function recentActivity(s, today = isoDay(new Date()), days = 30) {
  const from = isoDay(new Date(toDate(today) - (days - 1) * DAY));
  const sess = s.session.filter((x) => x.date >= from && x.date <= today);
  const konf = s.konf.filter((x) => x.date >= from && x.date <= today);
  return {
    supHours: sess.reduce((a, x) => a + convertedHours(x), 0),
    supSessions: sess.length,
    konfHours: konf.reduce((a, x) => a + num(x.hours), 0),
    avgSessionLength: s.session.length ? s.session.reduce((a, x) => a + num(x.hours), 0) / s.session.length : 0,
    videoShare: s.session.length ? s.session.filter((x) => x.video).length / s.session.length : 0,
  };
}

export { round };
