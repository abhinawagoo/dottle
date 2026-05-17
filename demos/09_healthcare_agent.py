"""
Demo 9: Healthcare Clinical AI Agent
======================================
Industry: Healthcare / Hospital Systems
Agent: Clinical AI assistant handling patient triage, medication checks,
       note generation, and appointment scheduling.

Features demonstrated:
  ★ Rich tool spans with clinical metadata (patient IDs, vitals, drug names)
  ★ Multi-model: GPT-4o for triage/scheduling, Claude for clinical notes
  ★ Compliance tags (hipaa, phi-handled, audit-trail)
  ★ Error scenario: EHR system timeout during critical lookup
  ★ Loop scenario: lab result polling with retry
  ★ Auto quality scoring + behavioral monitoring
  ★ High session volume across 4 clinical workflows

Semantic monitors to create before running (Settings → Monitors):
  1. "Missing clinical follow-up"
     Pattern: "The agent completes a clinical task but omits
               recommended follow-up actions or patient education"
  2. "Dosing error risk"
     Pattern: "The agent recommends or references a medication dose
               without checking patient weight, renal function, or
               contraindications"

Run: python 09_healthcare_agent.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time, random
import _config
import dottle
from _mock_clients import MockOpenAI, MockAnthropic

BANNER = "=" * 60


# ── Workflow 1: Emergency Triage ───────────────────────────────────────────────

print(BANNER)
print("Workflow 1: Emergency Department Triage")
print("  ESI scoring, vitals capture, specialist alert")
print(BANNER)

cases = [
    ("pt_001", "chest_pain@er.anon",    "chest pain radiating to left arm, diaphoretic, 45min onset",     "ESI-2", "cardiology"),
    ("pt_002", "headache@er.anon",      "sudden-onset worst headache of life, neck stiffness",             "ESI-2", "neurosurgery"),
    ("pt_003", "pediatric_fever@anon",  "5yr child, 39.4°C fever, non-blanching petechial rash spreading", "ESI-1", "picu"),
]

for patient_id, anon_email, chief_complaint, esi_level, specialist in cases:
    client = MockOpenAI("healthcare_triage")
    oai = dottle.wrap_openai(client)

    with dottle.session(
        "clinical-triage-agent",
        user_id=patient_id,
        user_email=anon_email,
        tags=["prod", "emergency", "hipaa", "phi-handled", "v1.2"],
        agent_version="1.2.0",
    ) as sid:
        print(f"  [{esi_level}] {chief_complaint[:55]}… session: {sid}")

        with dottle.span("tool", "capture_vitals") as s:
            time.sleep(0.05)
            s.set_attribute("patient_id", patient_id)
            s.set_attribute("bp_systolic", random.randint(90, 170))
            s.set_attribute("bp_diastolic", random.randint(60, 100))
            s.set_attribute("heart_rate", random.randint(65, 115))
            s.set_attribute("spo2_pct", random.randint(93, 100))
            s.set_attribute("temperature_c", round(random.uniform(36.5, 39.8), 1))

        with dottle.span("tool", "lookup_patient_history") as s:
            time.sleep(0.06)
            s.set_attribute("patient_id", patient_id)
            s.set_attribute("ehr_source", "Epic")
            s.set_attribute("allergies_checked", True)
            s.set_attribute("active_medications", random.randint(1, 7))

        resp = oai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a clinical AI triage assistant. Assess severity, assign ESI level, and recommend immediate actions. Follow clinical guidelines strictly."},
                {"role": "user", "content": f"Chief complaint: {chief_complaint}. Assign ESI level and immediate care plan."},
            ]
        )

        with dottle.span("tool", "assign_esi_level") as s:
            time.sleep(0.03)
            s.set_attribute("esi_assigned", esi_level)
            s.set_attribute("triage_complete", True)
            s.set_attribute("time_to_triage_min", round(random.uniform(1.5, 4.5), 1))

        with dottle.span("tool", "alert_specialist") as s:
            time.sleep(0.04)
            s.set_attribute("specialist", specialist)
            s.set_attribute("alert_method", "secure_pager")
            s.set_attribute("acknowledged", True)

        print(f"    → {resp.choices[0].message.content[:80]}...")

    time.sleep(0.3)

print("  ✓ 3 triage sessions created\n")


# ── Workflow 2: Medication Safety Check ───────────────────────────────────────

print(BANNER)
print("Workflow 2: Medication Interaction & Formulary Check")
print("  Drug interaction screening, formulary lookup, dosing alerts")
print(BANNER)

rx_cases = [
    ("pt_010", "rx_warfarin@pharm.anon",  "Warfarin 5mg daily",         "Amoxicillin 500mg TID x7d",  "interaction"),
    ("pt_011", "rx_ozempic@pharm.anon",   "Metformin 1000mg BID",       "Ozempic 0.5mg weekly",       "formulary"),
    ("pt_012", "rx_metformin@pharm.anon", "Metformin 1000mg BID (eGFR 41)", "No new drug",             "dosing_alert"),
]

for patient_id, anon_email, current_med, new_med, check_type in rx_cases:
    client = MockOpenAI("healthcare_rx")
    oai = dottle.wrap_openai(client)

    with dottle.session(
        "clinical-triage-agent",
        user_id=patient_id,
        user_email=anon_email,
        tags=["prod", "pharmacy", "hipaa", "medication-safety", "v1.2"],
        agent_version="1.2.0",
    ) as sid:
        print(f"  [{check_type}] {current_med[:45]}… session: {sid}")

        with dottle.span("tool", "fetch_patient_medications") as s:
            time.sleep(0.04)
            s.set_attribute("patient_id", patient_id)
            s.set_attribute("active_med_count", random.randint(2, 8))
            s.set_attribute("current_medication", current_med)

        with dottle.span("tool", "run_drug_interaction_check") as s:
            time.sleep(0.07)
            s.set_attribute("drug_a", current_med.split()[0])
            s.set_attribute("drug_b", new_med.split()[0])
            s.set_attribute("interaction_severity", "moderate" if check_type == "interaction" else "none")
            s.set_attribute("database", "Lexicomp")

        with dottle.span("tool", "check_formulary") as s:
            time.sleep(0.05)
            s.set_attribute("insurance_plan", "UnitedHealth Choice Plus")
            s.set_attribute("tier", random.choice(["2", "3"]))
            s.set_attribute("pa_required", check_type == "formulary")

        resp = oai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a clinical pharmacist AI. Check drug interactions, formulary coverage, and dosing safety. Always flag contraindications."},
                {"role": "user", "content": f"Patient on {current_med}. New prescription: {new_med}. Check type: {check_type}. Provide full assessment."},
            ]
        )

        with dottle.span("tool", "log_pharmacy_review") as s:
            time.sleep(0.03)
            s.set_attribute("review_type", check_type)
            s.set_attribute("pharmacist_notified", check_type == "dosing_alert")
            s.set_attribute("prescriber_alerted", check_type in ("dosing_alert", "interaction"))

        print(f"    → {resp.choices[0].message.content[:80]}...")

    time.sleep(0.3)

print("  ✓ 3 medication safety sessions created\n")


# ── Workflow 3: Clinical Note Generation (Claude) ─────────────────────────────

print(BANNER)
print("Workflow 3: AI Clinical Note Generation")
print("  Claude generating SOAP notes, discharge summaries, referrals")
print(BANNER)

note_cases = [
    ("dr_chen_001",  "dr.chen@hospitalx.anon",  "SOAP note — CAP right lower lobe",      "soap_note"),
    ("dr_patel_001", "dr.patel@hospitalx.anon",  "Discharge summary — post-PCI",          "discharge_summary"),
    ("dr_kim_001",   "dr.kim@hospitalx.anon",    "Sepsis screening + care bundle",        "clinical_decision"),
]

for session_id, clinician_email, note_type, doc_type in note_cases:
    client = MockAnthropic("healthcare_notes")
    claude = dottle.wrap_anthropic(client)

    with dottle.session(
        "clinical-triage-agent",
        user_id=session_id,
        user_email=clinician_email,
        tags=["prod", "documentation", "hipaa", "audit-trail", "v1.2"],
        agent_version="1.2.0",
    ) as sid:
        print(f"  [{doc_type}] {note_type}… session: {sid}")

        with dottle.span("tool", "retrieve_encounter_data") as s:
            time.sleep(0.06)
            s.set_attribute("encounter_id", f"ENC-{random.randint(10000,99999)}")
            s.set_attribute("data_sources", "vitals,labs,imaging,medications")
            s.set_attribute("tokens_extracted", random.randint(800, 2400))

        with dottle.span("tool", "run_nlp_extraction") as s:
            time.sleep(0.08)
            s.set_attribute("entities_found", random.randint(12, 38))
            s.set_attribute("icd10_codes_suggested", random.randint(2, 6))
            s.set_attribute("cpt_codes_suggested", random.randint(1, 4))

        resp = claude.messages.create(
            model="claude-sonnet-4-6",
            system="You are a clinical documentation AI. Generate accurate, structured clinical notes following SOAP/discharge summary format. Use standard medical terminology.",
            messages=[
                {"role": "user", "content": f"Generate a {doc_type} for: {note_type}. Include all required sections with specific clinical details."},
            ],
            max_tokens=800,
        )

        with dottle.span("tool", "validate_clinical_content") as s:
            time.sleep(0.04)
            s.set_attribute("required_fields_complete", True)
            s.set_attribute("icd10_validated", True)
            s.set_attribute("quality_score", round(random.uniform(0.88, 0.98), 2))

        with dottle.span("tool", "route_for_attestation") as s:
            time.sleep(0.03)
            s.set_attribute("status", "pending_physician_signature")
            s.set_attribute("ehr_draft_id", f"DRAFT-{random.randint(1000,9999)}")

        content = resp.content[0].text
        print(f"    → {content[:80]}...")

    time.sleep(0.3)

print("  ✓ 3 clinical note sessions created\n")


# ── Workflow 4: Lab Result Polling Loop ───────────────────────────────────────

print(BANNER)
print("Workflow 4: Lab Result Polling [LOOP SCENARIO]")
print("  Agent polls for stat lab results — caught in retry loop")
print(BANNER)

with dottle.session(
    "clinical-triage-agent",
    user_id="pt_099",
    user_email="stat_lab@er.anon",
    tags=["prod", "emergency", "hipaa", "stat-labs", "v1.2"],
    agent_version="1.2.0",
) as sid:
    print(f"  session: {sid}")

    for attempt in range(1, 8):
        with dottle.span("tool", "poll_lab_results") as s:
            time.sleep(0.06)
            s.set_attribute("order_id", "LAB-STAT-88291")
            s.set_attribute("test", "troponin_I")
            s.set_attribute("attempt", attempt)
            s.set_attribute("status", "pending" if attempt < 6 else "resulted")
            s.set_attribute("result_available", attempt >= 6)

        if attempt >= 6:
            with dottle.span("tool", "process_critical_result") as s:
                time.sleep(0.04)
                s.set_attribute("troponin_I_ng_ml", 4.82)
                s.set_attribute("reference_range", "<0.04 ng/mL")
                s.set_attribute("critical_value", True)
                s.set_attribute("physician_notified", True)
            break

        time.sleep(0.15)

    print(f"  Lab resulted after {attempt} poll attempts (loop visible in dashboard)\n")


# ── Workflow 5: EHR System Timeout (Error) ────────────────────────────────────

print(BANNER)
print("Workflow 5: EHR Timeout During Medication Reconciliation [ERROR]")
print(BANNER)

try:
    with dottle.session(
        "clinical-triage-agent",
        user_id="pt_100",
        user_email="admission@hospital.anon",
        tags=["prod", "admission", "hipaa", "v1.2"],
        agent_version="1.2.0",
    ) as sid:
        print(f"  session: {sid}")

        with dottle.span("tool", "fetch_outpatient_medications") as s:
            time.sleep(0.05)
            s.set_attribute("patient_id", "pt_100")
            s.set_attribute("source", "Surescripts")
            s.set_attribute("records_found", 9)

        with dottle.span("tool", "sync_with_ehr") as s:
            time.sleep(0.09)
            s.set_attribute("ehr_system", "Epic_prod")
            s.set_attribute("endpoint", "/api/FHIR/R4/MedicationRequest")
            raise TimeoutError("Epic EHR FHIR API: Connection timeout after 30s (Epic maintenance window 02:00-03:00 UTC)")

except TimeoutError:
    pass

print("  ✓ EHR timeout captured — session marked failed\n")


# ── Summary ───────────────────────────────────────────────────────────────────

print(BANNER)
print("Demo 9 complete — Healthcare Clinical AI Agent")
print()
print("Sessions created:")
print("  3 × Emergency triage        (ESI scoring, specialist alerts)")
print("  3 × Medication safety       (interactions, formulary, dosing)")
print("  3 × Clinical note gen       (Claude, SOAP/discharge/decision support)")
print("  1 × Lab polling loop        (retry loop, critical result)")
print("  1 × EHR timeout             (failed session)")
print()
print("Tags to filter by in dashboard:")
print("  emergency · pharmacy · documentation · hipaa · stat-labs")
print(BANNER)
