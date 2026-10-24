// Templates for uddannelsesaftaler (BEK nr. 247 af 5. februar 2026, § 4) per typical practice area.
// The texts are starting points: everything is editable before the agreement is printed and signed.
// Tokens: {sted} = praksissted(er), {psykolog} = the psychologist's name, {ansvarlig} = uddannelsesansvarlig.

export const SECTIONS = [
  { key: "tasks", label: "Arbejdsopgaver og målgruppe" },
  { key: "foundation", label: "Praksisstedets psykologfaglige grundlag", hint: "Indgår i uddannelsesprogrammet (§ 7, stk. 2)" },
  { key: "learning", label: "Læringsmuligheder" },
  { key: "konfPlan", label: "Plan for konfrontationstimer", hint: "Overgangsordningen: 500 t udredning, 500 t intervention, mindst 200 t individer og 200 t grupper/organisationer", scheme: "overgang" },
  { key: "supervision", label: "Intern supervision" },
  { key: "external", label: "Ekstern supervision", hint: "Supervisor uden organisatorisk tilknytning til praksisstedet – ikke den uddannelsesansvarlige (§ 2, nr. 4 og § 11, stk. 4)" },
  { key: "activities", label: "Øvrige læringsaktiviteter", hint: "Metode- og færdighedstræning, kurser m.m. (§ 2, nr. 5)" },
  { key: "followup", label: "Opfølgning og dokumentation" },
  { key: "changes", label: "Ændring og ophør" },
];

export const DOC_TYPES = [
  "Underskrevet uddannelsesaftale",
  "Uddannelsesprogram",
  "Statusreferat",
  "Ansættelseskontrakt",
  "Arbejdsgivererklæring",
  "Supervisorerklæring",
  "Organisationsdiagram",
  "Revisorerklæring",
  "Kursusbevis",
  "Merit-afgørelse",
  "Andet",
];

const COMMON = {
  followup: "Der afholdes statussamtale mellem {psykolog} og den uddannelsesansvarlige mindst hver 3. måned. Samtalen tager udgangspunkt i "
    + "uddannelsesprogrammet og den løbende registrering af timer, og der skrives et kort referat, som begge parter godkender.\n"
    + "Den uddannelsesansvarlige vurderer progressionen løbende, dokumenterer ændringer i forløbet (§ 11, stk. 3) og leverer ved "
    + "aftalens afslutning dokumentation for varighed og forløb (§ 6, stk. 4).\n"
    + "{psykolog} fører løbende logbog over supervision, konfrontationstimer og læringsaktiviteter.",
  changes: "Ændringer i aftalen, herunder ændret arbejdstid, skift af supervisor eller længerevarende fravær, aftales skriftligt og vedlægges aftalen.\n"
    + "Ophører ansættelsen eller samarbejdet, udarbejder den uddannelsesansvarlige en dateret opgørelse over den gennemførte del af forløbet.\n"
    + "Aftalen ændrer ikke i sig selv ansættelsesforholdet (§ 4, stk. 4).",
};

export const TEMPLATES = {
  ppr: {
    label: "PPR",
    long: "Pædagogisk Psykologisk Rådgivning",
    description: "Kommunal PPR: udredning af børn og unge, konsultation til dagtilbud og skoler, forældre- og netværksarbejde.",
    hoursPerWeek: 37,
    responsible: "Ledende psykolog eller PPR-leder",
    docs: ["Underskrevet uddannelsesaftale", "Uddannelsesprogram", "Statusreferat", "Ansættelseskontrakt", "Arbejdsgivererklæring", "Supervisorerklæring"],
    tips: [
      "Konsultation til pædagoger og lærere og deltagelse i netværksmøder kan registreres som arbejde med grupper/organisationer.",
      "Skriftligt arbejde (PPV, journal) og forberedelse er ikke konfrontationstid.",
      "Overvej ekstern supervision i et andet PPR eller hos en privatpraktiserende børnepsykolog for at opfylde kravet om 40 timer hos samme eksterne supervisor.",
    ],
    sections: {
      tasks: "{psykolog} ansættes som psykolog i {sted} og varetager psykologfaglige opgaver for børn og unge 0–18 år, deres familier og de "
        + "dagtilbud og skoler, der arbejder med dem. Opgaverne omfatter bl.a.:\n"
        + "• Pædagogisk-psykologisk vurdering (PPV) og udredning af børn med kognitive, sociale, emotionelle eller adfærdsmæssige vanskeligheder\n"
        + "• Konsultation og vejledning til pædagoger, lærere og ledere\n"
        + "• Samtaleforløb med børn, unge og forældre\n"
        + "• Deltagelse i tværfaglige netværks- og sagsmøder\n"
        + "• Gruppeforløb og kompetenceudvikling i dagtilbud og skoler",
      foundation: "{sted} arbejder ud fra en systemisk og udviklingspsykologisk forståelse med fokus på barnets samspil med de nære voksne og "
        + "læringsmiljøet. Udredning bygger på standardiserede test (fx WISC-V, WPPSI-IV, NEPSY-II, BRIEF) kombineret med observation og samtale. "
        + "Interventioner tager udgangspunkt i evidensinformerede metoder (fx konsultativ praksis, LP-modellen, kognitiv adfærdsterapi, mentaliseringsbaseret arbejde).",
      learning: "{psykolog} indgår i PPR's faglige fællesskab med fælles sagskonferencer, testkalibrering og deltagelse i interne temadage. "
        + "Der gives mulighed for gradvis større selvstændighed i sagsbehandlingen, startende med sager i samarbejde med en erfaren kollega.",
      konfPlan: "Udredning: test, observation og udredningssamtaler med børn og forældre.\n"
        + "Intervention: samtaleforløb, forældrevejledning og konsultation.\n"
        + "Individer: direkte arbejde med barn/forælder.\n"
        + "Grupper/organisationer: konsultation til personalegrupper, netværksmøder og gruppeforløb.\n"
        + "Der sigtes mod ca. 12–14 konfrontationstimer om ugen fordelt nogenlunde ligeligt på udredning og intervention.",
      supervision: "Der gives intern supervision ved ledende psykolog/erfaren psykolog i PPR, fx 1,5 time individuelt hver 14. dag samt "
        + "deltagelse i gruppesupervision med 3–5 psykologer en gang om måneden.",
      external: "{psykolog} modtager ekstern supervision hos en autoriseret psykolog uden tilknytning til kommunen, fx 10 sessioner á 2 timer årligt. "
        + "Udgiften afholdes af arbejdsgiver, og supervisionen foregår i arbejdstiden.",
      activities: "Testkurser (fx WISC-V-certificering), kommunale temadage, fagligt netværk for nyuddannede psykologer.",
    },
  },
  psykiatri: {
    label: "Psykiatri",
    long: "Voksen- eller børne- og ungdomspsykiatri",
    description: "Regional psykiatri: diagnostisk udredning, psykoterapeutisk behandling individuelt og i grupper, tværfagligt samarbejde.",
    hoursPerWeek: 37,
    responsible: "Ledende psykolog eller specialpsykolog i psykiatri",
    docs: ["Underskrevet uddannelsesaftale", "Uddannelsesprogram", "Statusreferat", "Ansættelseskontrakt", "Arbejdsgivererklæring", "Supervisorerklæring"],
    tips: [
      "Kravet om 200 timer med grupper/organisationer nås typisk gennem psykoedukative grupper og gruppeterapi. Planlæg det fra start.",
      "Tværfaglige konferencer, hvor du superviserer andre faggrupper, er indirekte arbejde og kan højst udgøre halvdelen af timerne.",
      "Hvis afdelingen har en specialpsykologuddannelse, kan den uddannelsesansvarlige ofte være den samme som specialpsykologens vejleder.",
    ],
    sections: {
      tasks: "{psykolog} ansættes som psykolog i {sted} og varetager psykologfaglig udredning og behandling af patienter i ambulant og/eller "
        + "stationært regi. Opgaverne omfatter bl.a.:\n"
        + "• Diagnostisk og neuropsykologisk udredning, herunder strukturerede interviews og testning\n"
        + "• Individuel psykoterapeutisk behandling\n"
        + "• Gruppebehandling og psykoedukation\n"
        + "• Pårørendesamtaler\n"
        + "• Deltagelse i tværfaglige konferencer og behandlingsplanlægning",
      foundation: "Afdelingen arbejder efter de nationale kliniske retningslinjer og pakkeforløb. Udredning sker med validerede instrumenter "
        + "(fx SCID-5, MINI, PSE, WAIS-IV, neuropsykologiske batterier). Behandlingen er primært kognitiv adfærdsterapi, suppleret med fx "
        + "mentaliseringsbaseret terapi, DAT/DBT og psykoedukation efter afsnittets profil.",
      learning: "{psykolog} deltager i afsnittets konferencer, interne undervisningsforløb og journal clubs og får mulighed for at følge "
        + "erfarne psykologers udredninger og behandlingsforløb, før opgaverne varetages selvstændigt.",
      konfPlan: "Udredning: diagnostiske interviews, testning og tilbagemeldinger.\n"
        + "Intervention: individuelle behandlingsforløb, gruppebehandling og pårørendesamtaler.\n"
        + "Individer: individuelle samtaler og udredninger.\n"
        + "Grupper/organisationer: psykoedukative grupper og gruppeterapi (planlæg mindst 2 grupper om året).\n"
        + "Der sigtes mod ca. 12–14 konfrontationstimer om ugen.",
      supervision: "Intern supervision ved ledende psykolog eller specialpsykolog i psykiatri, fx 1 time individuelt om ugen, samt deltagelse "
        + "i afsnittets gruppesupervision for psykologer.",
      external: "Ekstern supervision hos en specialist i psykoterapi eller psykiatri uden ansættelse i regionens psykiatri, fx 10 x 2 timer årligt. "
        + "Udgiften og tidsforbruget aftales med afdelingsledelsen.",
      activities: "Regionens introduktionsuddannelse for psykologer, kurser i udredningsinstrumenter og behandlingsmetoder, deltagelse i forskningsseminarer.",
    },
  },
  arbejde: {
    label: "Arbejds- og organisation",
    long: "Arbejds- og organisationspsykologi",
    description: "Konsulenthus, BST/arbejdsmiljørådgivning eller intern konsulentfunktion: organisationsanalyser, team- og lederudvikling, krisehjælp.",
    hoursPerWeek: 37,
    responsible: "Ledende psykolog/partner med klinisk psykolog-titel",
    docs: ["Underskrevet uddannelsesaftale", "Uddannelsesprogram", "Statusreferat", "Ansættelseskontrakt", "Arbejdsgivererklæring", "Supervisorerklæring", "Organisationsdiagram"],
    tips: [
      "Kravet om 200 timer med individer kan være svært i rent organisationsarbejde. Planlæg coaching, krisesamtaler og personvurderinger.",
      "Kun direkte psykologfagligt arbejde med klienter tæller som konfrontationstid. Salg, tilbud og rapportskrivning tæller ikke.",
      "Ved ekstern supervision skal det dokumenteres, at supervisor ikke er tilknyttet virksomheden. Et organisationsdiagram er en enkel måde at gøre det på.",
    ],
    sections: {
      tasks: "{psykolog} ansættes som psykolog/konsulent i {sted} og løser psykologfaglige opgaver for kundeorganisationer, ledere, teams og medarbejdere. "
        + "Opgaverne omfatter bl.a.:\n"
        + "• Organisations- og arbejdsmiljøanalyser (APV, trivselsmålinger, fokusgrupper)\n"
        + "• Udviklingsforløb for teams og ledergrupper\n"
        + "• Konflikthåndtering og mægling\n"
        + "• Individuel coaching og samtaleforløb ved stress og belastning\n"
        + "• Akut krisehjælp og debriefing",
      foundation: "{sted} arbejder med en systemisk og organisationspsykologisk tilgang, der kobler individ, gruppe og organisation. Metoderne bygger på "
        + "evidensinformeret arbejdsmiljøpsykologi, procesledelse, gruppedynamik og kognitive og narrative samtaleformer.",
      learning: "{psykolog} deltager i opgaver sammen med erfarne konsulenter (co-facilitering), herefter med gradvis større selvstændigt ansvar. "
        + "Der er faste faglige møder med sagsdrøftelser og fælles kvalitetssikring af analyser og rapporter.",
      konfPlan: "Udredning: interviews, fokusgrupper, organisationsanalyser og personvurderinger.\n"
        + "Intervention: team- og lederudvikling, konfliktmægling, coaching og krisehjælp.\n"
        + "Individer: coaching, stresssamtaler og individuelle krisesamtaler (mindst 200 timer i alt – planlæg aktivt).\n"
        + "Grupper/organisationer: teamforløb, workshops og organisationsinterventioner.",
      supervision: "Intern supervision ved ledende psykolog med klinisk psykolog-titel, fx 1,5 time hver 14. dag, samt deltagelse i husets gruppesupervision.",
      external: "Ekstern supervision hos en specialist i arbejds- og organisationspsykologi uden tilknytning til {sted}, fx 10 x 2 timer årligt. "
        + "Udgiften afholdes af arbejdsgiver.",
      activities: "Kurser i procesledelse, konfliktmægling, krisepsykologi og testcertificering (fx personlighedstest), deltagelse i faglige netværk.",
    },
  },
  hr: {
    label: "HR",
    long: "HR-funktion i virksomhed eller offentlig organisation",
    description: "Psykolog i HR: rekruttering og personvurdering, lederudvikling, trivsel, stress og omstilling.",
    hoursPerWeek: 37,
    responsible: "HR-chef med instruktionsbeføjelse og en ekstern psykolog som fagligt ansvarlig",
    docs: ["Underskrevet uddannelsesaftale", "Uddannelsesprogram", "Statusreferat", "Ansættelseskontrakt", "Arbejdsgivererklæring", "Supervisorerklæring", "Organisationsdiagram"],
    tips: [
      "I HR vil en stor del af arbejdet ofte være generel HR-administration, der ikke er psykologfagligt. Aftal konkret, hvilke opgaver der tæller.",
      "Er den uddannelsesansvarlige ikke psykolog, skal kompetencer, der forudsætter psykologfaglig vurdering, godkendes af en supervisor-kvalificeret psykolog (§ 9, stk. 2).",
      "Der er ofte ingen intern psykolog. Planlæg derfor supervision hos mindst to forskellige eksterne supervisorer.",
    ],
    sections: {
      tasks: "{psykolog} ansættes som psykolog/HR-konsulent i {sted}. Mindst [X] timer om ugen er afsat til psykologfagligt arbejde, herunder:\n"
        + "• Rekruttering og personvurdering med psykologiske test og interviews\n"
        + "• Leder- og talentudvikling, herunder individuel coaching\n"
        + "• Trivsels- og stressindsatser, samtaler med sygemeldte og forebyggende forløb\n"
        + "• Facilitering af teams i omstilling og konflikt\n"
        + "Øvrige HR-opgaver (administration, jura, løn) indgår ikke i praksisuddannelsen.",
      foundation: "Det psykologfaglige arbejde bygger på arbejds- og organisationspsykologi, evidensbaseret personvurdering (strukturerede interviews, "
        + "validerede test) og kognitive og systemiske samtale- og interventionsformer.",
      learning: "{psykolog} får adgang til organisationens leder- og udviklingsprogrammer og deltager i testcertificering. Den psykologfaglige sparring "
        + "sikres gennem ekstern supervision og et fagligt netværk af psykologer i HR.",
      konfPlan: "Udredning: personvurderinger, testning og interviews.\n"
        + "Intervention: coaching, stress- og trivselsforløb, teamforløb.\n"
        + "Individer: personvurdering og individuel coaching.\n"
        + "Grupper/organisationer: teamforløb, ledergrupper og organisationsindsatser.\n"
        + "Den psykologfaglige andel af arbejdstiden aftales konkret og følges op ved statussamtalerne.",
      supervision: "Der er ikke intern psykolog i organisationen. Supervisionen gives af to forskellige eksterne supervisorer, så kravet om mindst to "
        + "supervisorer opfyldes.",
      external: "Ekstern supervision hos en specialist i arbejds- og organisationspsykologi, fx 1,5 time hver 3. uge, samt et gruppesupervisionsforløb "
        + "hos en anden supervisor. Udgiften afholdes af arbejdsgiver.",
      activities: "Testcertificering, kurser i coaching og konfliktløsning, deltagelse i faglige netværk for psykologer i HR.",
    },
  },
  selvstaendig: {
    label: "Selvstændig",
    long: "Selvstændig praksis",
    description: "Egen praksis: arbejdstiden opgøres ud fra konfrontationstimer, og aftalen indgås med en ekstern uddannelsesansvarlig.",
    hoursPerWeek: null,
    selfEmployed: true,
    responsible: "Ekstern psykolog, der opfylder kravene til supervisor",
    docs: ["Underskrevet uddannelsesaftale", "Uddannelsesprogram", "Statusreferat", "Revisorerklæring", "Supervisorerklæring"],
    tips: [
      "Efter overgangsordningen svarer 1 konfrontationstime til 2 arbejdstimer. Fuldtid er 600 konfrontationstimer om året, og der kræves en revisorerklæring (bilag 2, pkt. 1.4 og 6.2).",
      "Sundhedsstyrelsen har endnu ikke fastsat de nærmere regler for den eksterne uddannelsesansvarlige (§ 4, stk. 5). Hold øje med vejledningen.",
      "Kravet om 200 timer med grupper/organisationer kræver planlægning, fx i form af gruppeforløb eller opgaver for organisationer.",
    ],
    sections: {
      tasks: "{psykolog} driver selvstændig praksis ({sted}) og varetager udredning og behandling af klienter, der henvender sig selv eller "
        + "henvises via sygesikring, forsikringsselskaber, kommuner eller virksomheder. Opgaverne omfatter:\n"
        + "• Indledende vurdering og udredning\n"
        + "• Individuelle behandlingsforløb\n"
        + "• Par-, familie- eller gruppeforløb\n"
        + "• Opgaver for organisationer (fx krisehjælp, oplæg, supervision af andre faggrupper)",
      foundation: "Praksis arbejder ud fra [beskriv teoretisk ståsted, fx kognitiv adfærdsterapi/ACT/psykodynamisk], med validerede screenings- og "
        + "udredningsredskaber og systematisk effektmåling (fx ORS/SRS, PHQ-9, GAD-7).",
      learning: "Faglig udvikling sikres gennem den eksterne uddannelsesansvarlige, supervision hos mindst to supervisorer, deltagelse i "
        + "intervisionsgruppe og relevante kurser.",
      konfPlan: "Fuldtid svarer til 600 konfrontationstimer om året (30 arbejdstimer x 40 uger), og deltid til 300 om året.\n"
        + "Konfrontationstimerne dokumenteres via kalender/journal og en revisorerklæring, der bekræfter, at timerne svarer til virksomhedens omsætning.\n"
        + "Udredning/intervention og individ/gruppe/organisation registreres løbende.",
      supervision: "Da praksis ikke har intern supervisor, gives al supervision eksternt. Der aftales et individuelt forløb og et gruppesupervisionsforløb "
        + "hos to forskellige supervisorer.",
      external: "Ekstern supervision hos [navn], specialist i psykoterapi, fx 1,5 time hver 3. uge. Den uddannelsesansvarlige kan ikke samtidig "
        + "fungere som ekstern supervisor (§ 11, stk. 4).",
      activities: "Kurser og efteruddannelse, intervisionsgruppe og faglige netværk.",
    },
  },
};

/** Build a new agreement draft from a template and the user's existing data. */
export function generateAgreement(key, { profile = {}, workplaces = [], courses = [], scheme = "overgang", respName = "" } = {}) {
  const t = TEMPLATES[key];
  const sted = workplaces.map((w) => w.name).filter(Boolean).join(" og ") || "[praksissted]";
  const fill = (txt) => txt.replace(/\{sted\}/g, sted).replace(/\{psykolog\}/g, profile.name || "Psykologen")
    .replace(/\{ansvarlig\}/g, respName || "den uddannelsesansvarlige");
  const sections = {};
  for (const { key: k } of SECTIONS) sections[k] = fill(t.sections[k] ?? COMMON[k] ?? "");
  const wpIds = workplaces.map((w) => w.id);
  const firstPeriod = workplaces.flatMap((w) => w.periods || []).map((p) => p.from).filter(Boolean).sort()[0];
  return {
    template: key,
    scheme,
    title: `Uddannelsesaftale – ${sted}`,
    workplaceIds: wpIds,
    courseIds: courses.filter((c) => wpIds.includes(c.workplaceId)).map((c) => c.id),
    start: firstPeriod || "",
    expectedEnd: "",
    hoursPerWeek: t.hoursPerWeek,
    respName,
    respExternal: !!t.selfEmployed,
    employerSigner: workplaces[0]?.employer || "",
    status: "draft",
    sections,
    absences: [],
  };
}
