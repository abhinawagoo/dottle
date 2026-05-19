"""
Alert + monitor pure functions.

Previously this module also ran an APScheduler instance inside the web process.
That has been replaced by ARQ cron jobs in app/worker.py.

The functions below are still called by the ARQ worker tasks:
  task_alert_check   → evaluate_all_rules()
  task_monitor_check → evaluate_all_monitors()
"""
from app.services.alert_service import evaluate_all_rules
from app.services.semantic_monitor_service import evaluate_all_monitors

__all__ = ["evaluate_all_rules", "evaluate_all_monitors"]
