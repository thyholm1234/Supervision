"""Runs the browser rule engine (static/js/rules.js) in V8 and checks it against bilag 2 of BEK 247/2026."""
import json
import re
from pathlib import Path

import pytest
from py_mini_racer import MiniRacer

SRC = (Path(__file__).resolve().parent.parent / "static/js/rules.js").read_text()


@pytest.fixture(scope="module")
def js():
    ctx = MiniRacer()
    ctx.eval(re.sub(r"^export\s+(?=(const|function|\{))", "", SRC, flags=re.M).replace("export { round };", ""))
    return ctx


def call(js, expr, **data):
    for k, v in data.items():
        js.eval(f"var {k} = {json.dumps(v)};")
    return json.loads(js.eval(f"JSON.stringify({expr})"))


def snap(**kw):
    base = {"profile": {}, "workplace": [], "supervisor": [], "course": [], "session": [], "konf": [], "therapy": []}
    base.update(kw)
    return base


WP = {"id": "wp1", "name": "Klinik", "periods": [{"from": "2024-01-01", "to": None, "hoursPerWeek": 37}]}


def test_group_factor(js):
    assert call(js, "[1,2,3,5,6,12,13].map(groupFactor)") == [1, 1, 2 / 3, 2 / 3, 0.5, 0.5, 0]


@pytest.mark.parametrize("inp,out", [("1,5", 1.5), ("1.5", 1.5), ("1:30", 1.5), ("90m", 1.5), ("1t30", 1.5), ("2", 2), ("x", None)])
def test_parse_hours(js, inp, out):
    v = call(js, f"parseHours({json.dumps(inp)})")
    assert v == out  # NaN serialises as null


def test_full_compliance(js):
    sups = [
        {"id": "s1", "name": "A", "qualified": True},
        {"id": "s2", "name": "B", "qualified": True},
    ]
    courses = [
        {"id": "c1", "supervisorId": "s1", "workplaceId": "wp1", "external": False},
        {"id": "c2", "supervisorId": "s2", "workplaceId": "wp1", "external": True},
    ]
    sessions = (
        [{"courseId": "c1", "date": "2024-03-01", "hours": 1, "format": "individual"}] * 60
        + [{"courseId": "c1", "date": "2024-04-01", "hours": 3, "format": "group", "groupSize": 4}] * 30  # 60 conv
        + [{"courseId": "c2", "date": "2024-05-01", "hours": 1, "format": "individual"}] * 45
    )
    konf = []
    for act in ("udredning", "intervention"):
        konf += [{"workplaceId": "wp1", "date": "2024-06-01", "hours": 300, "activity": act, "target": "individ"}]
        konf += [{"workplaceId": "wp1", "date": "2024-06-01", "hours": 200, "activity": act, "target": "gruppe"}]
    s = snap(workplace=[WP], supervisor=sups, course=courses, session=sessions, konf=konf)
    r = call(js, "evaluate(s, '2026-02-01')", s=s)
    by = {q["key"]: q for q in r["requirements"]}
    assert by["supInd"]["value"] == 105
    assert abs(by["supGrp"]["value"] - 60) < 1e-9
    assert by["supExt"]["value"] == 45
    assert by["supCount"]["value"] == 2
    assert abs(by["supTotal"]["value"] - 165) < 1e-9
    assert by["konfU"]["value"] == 500 and by["konfInd"]["value"] == 600
    assert by["work"]["value"] > 2
    assert r["done"] is True


def test_course_under_5_hours_not_counted(js):
    s = snap(workplace=[WP], supervisor=[{"id": "s1", "name": "A"}],
             course=[{"id": "c1", "supervisorId": "s1", "workplaceId": "wp1"}],
             session=[{"courseId": "c1", "date": "2024-03-01", "hours": 4, "format": "individual"}])
    r = call(js, "evaluate(s, '2024-04-01')", s=s)
    assert {q["key"]: q["value"] for q in r["requirements"]}["supInd"] == 0
    assert any("pkt. 3.5" in w["text"] for w in r["warnings"])


def test_unqualified_supervisor_excluded(js):
    s = snap(workplace=[WP], supervisor=[{"id": "s1", "name": "A", "qualified": False}],
             course=[{"id": "c1", "supervisorId": "s1", "workplaceId": "wp1"}],
             session=[{"courseId": "c1", "date": "2024-03-01", "hours": 10, "format": "individual"}])
    r = call(js, "supervision(s).totals.total", s=s)
    assert r == 0


def test_video_cap_supervision(js):
    s = snap(workplace=[WP], supervisor=[{"id": "s1", "name": "A"}],
             course=[{"id": "c1", "supervisorId": "s1", "workplaceId": "wp1"}],
             session=[{"courseId": "c1", "date": "2024-03-01", "hours": 100, "format": "individual", "video": True},
                      {"courseId": "c1", "date": "2024-03-02", "hours": 20, "format": "individual"}])
    t = call(js, "supervision(s).totals", s=s)
    assert abs(t["total"] - 100) < 1e-9  # 80 video + 20 in person


def test_konf_video_and_indirect_caps(js):
    konf = [
        {"workplaceId": "wp1", "date": "2024-06-01", "hours": 400, "activity": "udredning", "target": "individ", "video": True},
        {"workplaceId": "wp1", "date": "2024-06-01", "hours": 100, "activity": "intervention", "target": "individ"},
        {"workplaceId": "wp1", "date": "2024-06-01", "hours": 300, "activity": "intervention", "target": "gruppe", "indirect": True},
    ]
    c = call(js, "confrontation(s)", s=snap(workplace=[WP], konf=konf))
    # video udredning capped to 250; direct = 250 + 100 = 350; indirect 300 <= 350 so untouched
    assert abs(c["counted"]["udredning"] - 250) < 1e-9
    assert abs(c["counted"]["intervention"] - 400) < 1e-9
    konf[2]["hours"] = 700  # now indirect exceeds direct -> scaled to 350
    c = call(js, "confrontation(s)", s=snap(workplace=[WP], konf=konf))
    assert abs(c["indirectCounted"] - 350) < 1e-9


def test_work_duration_part_time_and_absence(js):
    wp = {"id": "w", "name": "X", "periods": [
        {"from": "2024-01-01", "to": "2024-12-31", "hoursPerWeek": 15},  # half time
        {"from": "2025-01-01", "to": "2025-12-31", "hoursPerWeek": 10},  # does not count
    ], "absences": [{"from": "2024-01-01", "to": "2024-03-31"}]}  # 13 weeks deducted
    w = call(js, "workDuration(s, '2026-01-01')", s=snap(workplace=[wp]))
    expected = (366 - 91) * 0.5 / 365.25
    assert abs(w["years"] - expected) < 1e-6


def test_concurrent_jobs_capped_at_full_time(js):
    a = {"id": "a", "name": "A", "periods": [{"from": "2024-01-01", "to": "2024-12-31", "hoursPerWeek": 30}]}
    b = {"id": "b", "name": "B", "periods": [{"from": "2024-01-01", "to": "2024-12-31", "hoursPerWeek": 20}]}
    w = call(js, "workDuration(s, '2026-01-01')", s=snap(workplace=[a, b]))
    assert abs(w["years"] - 366 / 365.25) < 1e-6


def test_self_employed(js):
    wp = {"id": "se", "name": "Egen praksis", "selfEmployed": True}
    konf = [{"workplaceId": "se", "date": "2024-06-01", "hours": 900, "activity": "intervention", "target": "individ"}]
    w = call(js, "workDuration(s, '2026-01-01')", s=snap(workplace=[wp], konf=konf))
    assert w["years"] == 1.5


def test_therapy_cap(js):
    th = call(js, "therapy(s)", s=snap(therapy=[{"date": "2024-01-01", "hours": 30}]))
    assert th["counted"] == 25


def test_forecast(js):
    entries = [{"date": "2026-01-%02d" % d, "hours": 1} for d in range(1, 29)]
    f = call(js, "forecast(e, 10, '2026-01-28', 90)", e=entries)
    assert f["eta"] == "2026-02-07"


def agreement(**kw):
    a = {"id": "a1", "scheme": "ppu", "start": "2026-03-01", "expectedEnd": "2027-02-28", "hoursPerWeek": 37,
         "workplaceIds": ["wp1"], "courseIds": [], "respName": "Hanne Leder", "respQualified": True, "respInstruction": True,
         "signedDate": "2026-02-15", "absences": []}
    a.update(kw)
    return a


def texts(st):
    return " | ".join(w["text"] for w in st["warnings"])


def test_work_duration_range_and_subset(js):
    wp2 = {"id": "wp2", "name": "Andet", "periods": [{"from": "2024-01-01", "to": None, "hoursPerWeek": 37}]}
    s = snap(workplace=[WP, wp2])
    r = call(js, "workDuration(s, '2026-12-31', {from: '2026-01-01', to: '2026-12-31', workplaceIds: ['wp1']})", s=s)
    assert abs(r["years"] - 365 / 365.25) < 1e-6
    assert "wp2" not in r["perWorkplace"]


def test_agreement_clean_ppu(js):
    s = snap(workplace=[WP], agreement=[agreement()])
    st = call(js, "agreementStatus(s.agreement[0], s, '2026-09-01')", s=s)
    assert not [w for w in st["warnings"] if w["level"] in ("bad", "warn")], texts(st)
    assert st["years"] > 0.49


def test_agreement_signed_late_overlap_short_absence(js):
    other = agreement(id="a2", title="Gammel", start="2026-01-01", expectedEnd="2026-04-30", signedDate="2025-12-01")
    a = agreement(signedDate="2026-03-10", expectedEnd="2026-04-30", hoursPerWeek=20,
                  absences=[{"from": "2026-03-01", "to": "2026-03-10"}])
    s = snap(workplace=[WP], agreement=[a, other])
    t = texts(call(js, "agreementStatus(s.agreement[0], s, '2026-09-01')", s=s))
    assert "§ 4, stk. 3" in t and "overlapper" in t
    assert "3 måneders fuldtid" in t
    assert "10 %" in t


def test_agreement_responsible_rules(js):
    sup = {"id": "sx", "name": "Hanne Leder"}
    course = {"id": "c1", "supervisorId": "sx", "workplaceId": "wp1", "external": True}
    se = {"id": "wp1", "name": "Egen praksis", "selfEmployed": True}
    a = agreement(respQualified=False, respInstruction=False, courseIds=["c1"])
    s = snap(workplace=[se], supervisor=[sup], course=[course], agreement=[a])
    t = texts(call(js, "agreementStatus(s.agreement[0], s, '2026-09-01')", s=s))
    assert "§ 11, stk. 2" in t and "§ 11, stk. 4" in t and "§ 4, stk. 5" in t


def test_agreement_transition_deadline_and_log(js):
    a = agreement(scheme="overgang", expectedEnd="2029-06-30")
    log = [{"id": "l1", "agreementId": "a1", "type": "activity", "hours": 7, "date": "2026-05-01"},
           {"id": "l2", "agreementId": "a1", "type": "status", "date": "2026-06-01"}]
    s = snap(workplace=[WP], agreement=[a], agreementlog=log)
    st = call(js, "agreementStatus(s.agreement[0], s, '2026-09-01')", s=s)
    assert "2028-12-31" in texts(st)
    assert st["activityHours"] == 7 and len(st["log"]) == 2
