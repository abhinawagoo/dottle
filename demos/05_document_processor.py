"""
Demo 5: Intelligent Document Processing Agent
===============================================
Industry: Finance / Accounting / Legal
Agent: Extracts structured data from invoices, validates, routes for approval

Features demonstrated:
  - Manual span("llm", ...) with record_tokens() + record_prompt()
  - Multi-step pipeline with tool spans at each stage
  - Data enrichment via external API calls
  - Validation failure scenario (duplicate invoice detection)
  - High-volume batch processing feel

Run: python 05_document_processor.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time
import _config  # loads DOTTLE_API_KEY from env, configures dottle → production
import dottle

BANNER = "=" * 60

INVOICES = [
    {
        "id": "INV-2026-0441",
        "vendor": "AWS",
        "amount": 18420.50,
        "currency": "USD",
        "date": "2026-05-01",
        "po": "PO-2026-0099",
        "pages": 4,
        "outcome": "approved",
        "submitted_by": "ap@fintech.io",
    },
    {
        "id": "INV-2026-0442",
        "vendor": "Stripe",
        "amount": 3291.00,
        "currency": "USD",
        "date": "2026-04-30",
        "po": "PO-2026-0088",
        "pages": 2,
        "outcome": "duplicate",  # already processed
        "submitted_by": "ap@fintech.io",
    },
    {
        "id": "INV-2026-0443",
        "vendor": "Snowflake",
        "amount": 42190.00,
        "currency": "USD",
        "date": "2026-05-01",
        "po": "PO-2026-0101",
        "pages": 6,
        "outcome": "escalated",  # above auto-approval threshold
        "submitted_by": "finance@fintech.io",
    },
]


for inv in INVOICES:
    print(BANNER)
    print(f"Invoice {inv['id']} — {inv['vendor']} ${inv['amount']:,.2f}")
    print(f"Outcome: {inv['outcome'].upper()}")
    print(BANNER)

    with dottle.session(
        "ap-automation-agent",
        user_email=inv["submitted_by"],
        tags=["finance", "ap", "invoice-processing"],
        agent_version="1.8.2",
        metadata={
            "invoice_id": inv["id"],
            "vendor": inv["vendor"],
            "amount_usd": inv["amount"],
        },
    ) as sid:
        print(f"  session: {sid}")

        # ── Stage 1: Document ingestion ───────────────────────────────────────
        with dottle.span("tool", "ingest_pdf") as s:
            time.sleep(0.08)
            s.set_attribute("invoice_id", inv["id"])
            s.set_attribute("pages", inv["pages"])
            s.set_attribute("size_kb", inv["pages"] * 180)
            s.set_attribute("source", "email_attachment")

        with dottle.span("tool", "run_ocr") as s:
            time.sleep(0.14)
            s.set_attribute("engine", "AWS Textract")
            s.set_attribute("confidence_score", 0.987)
            s.set_attribute("blocks_extracted", inv["pages"] * 42)

        # ── Stage 2: AI extraction ────────────────────────────────────────────
        with dottle.span("llm", "gpt-4o: extract invoice fields") as s:
            time.sleep(0.28)
            s.record_tokens(1240, 380, "gpt-4o")
            s.record_prompt(
                input_text=f"Extract structured data from invoice. Vendor: {inv['vendor']}, Amount: {inv['amount']}, Date: {inv['date']}. Return JSON with: vendor_name, invoice_number, amount, currency, date, line_items, po_number, tax, total.",
                output_text=f'{{"vendor_name": "{inv["vendor"]}", "invoice_number": "{inv["id"]}", "amount": {inv["amount"]}, "currency": "{inv["currency"]}", "date": "{inv["date"]}", "po_number": "{inv["po"]}", "confidence": 0.99}}'
            )
            s.set_attribute("fields_extracted", 11)
            s.set_attribute("confidence", 0.99)

        # ── Stage 3: Validation ───────────────────────────────────────────────
        with dottle.span("tool", "validate_fields") as s:
            time.sleep(0.04)
            s.set_attribute("required_fields_present", True)
            s.set_attribute("amount_format_valid", True)
            s.set_attribute("date_format_valid", True)

        with dottle.span("tool", "match_purchase_order") as s:
            time.sleep(0.06)
            s.set_attribute("po_number", inv["po"])
            s.set_attribute("po_found", True)
            s.set_attribute("amount_matches_po", inv["outcome"] != "duplicate")
            s.set_attribute("vendor_matches_po", True)

        with dottle.span("tool", "check_duplicate") as s:
            time.sleep(0.05)
            s.set_attribute("invoice_id", inv["id"])
            s.set_attribute("duplicate_found", inv["outcome"] == "duplicate")
            if inv["outcome"] == "duplicate":
                s.set_attribute("original_invoice_processed_at", "2026-04-28T09:14:22Z")

        if inv["outcome"] == "duplicate":
            with dottle.span("tool", "reject_invoice") as s:
                time.sleep(0.03)
                s.set_attribute("reason", "duplicate_detected")
                s.set_attribute("notification_sent", inv["submitted_by"])
            print(f"  Rejected: duplicate of already-processed invoice\n")
            continue

        # ── Stage 4: Enrichment ───────────────────────────────────────────────
        with dottle.span("tool", "lookup_vendor_master") as s:
            time.sleep(0.05)
            s.set_attribute("vendor", inv["vendor"])
            s.set_attribute("vendor_id", f"VND-{hash(inv['vendor']) % 9000 + 1000}")
            s.set_attribute("payment_terms", "Net 30")
            s.set_attribute("bank_details_on_file", True)

        with dottle.span("tool", "map_gl_account") as s:
            time.sleep(0.03)
            gl_map = {"AWS": "6100-IT-Infra", "Stripe": "6200-Payment", "Snowflake": "6100-IT-Data"}
            s.set_attribute("gl_account", gl_map.get(inv["vendor"], "6900-Other"))
            s.set_attribute("cost_center", "Engineering")
            s.set_attribute("budget_remaining_usd", 120000 - inv["amount"])

        # ── Stage 5: Approval routing ──────────────────────────────────────────
        with dottle.span("llm", "gpt-4o: determine approval routing") as s:
            time.sleep(0.18)
            s.record_tokens(380, 120, "gpt-4o")
            threshold = 25000
            needs_cfo = inv["amount"] > threshold
            s.record_prompt(
                input_text=f"Determine approval chain for invoice from {inv['vendor']} for ${inv['amount']:,.2f}. Approval policy: <$5k auto-approve, $5k-$25k manager approval, >$25k CFO required.",
                output_text=f"{'CFO approval required (>$25k threshold). Route to: CFO → Finance Controller → AP.' if needs_cfo else 'Manager approval sufficient. Route to: Engineering Manager → AP.'}"
            )
            s.set_attribute("approval_level", "cfo" if needs_cfo else "manager")
            s.set_attribute("auto_approved", not needs_cfo and inv["amount"] < 5000)

        with dottle.span("tool", "create_approval_workflow") as s:
            time.sleep(0.06)
            s.set_attribute("workflow_id", f"WF-{inv['id']}")
            s.set_attribute("approvers", "CFO, Finance Controller" if inv["outcome"] == "escalated" else "Eng Manager")
            s.set_attribute("due_date", "2026-05-15")
            s.set_attribute("slack_notification_sent", True)

        print(f"  ✓ Routed for {'CFO' if inv['outcome'] == 'escalated' else 'manager'} approval\n")


print(BANNER)
print("Document processing agent run complete.")
print("Open https://app.dottle.dev/sessions to see invoice processing sessions.")
print(BANNER)
