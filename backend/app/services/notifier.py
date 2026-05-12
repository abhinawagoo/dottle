"""
Dispatch alert notifications via Slack webhook or SMTP email.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

METRIC_LABELS = {
    "loop_detected":       "Agent Loops",
    "tool_failure_rate":   "Tool Failure Rate",
    "cost_per_session":    "Cost per Session",
    "session_duration_ms": "Session Duration",
    "iteration_count":     "Max Iterations",
    "error_rate":          "Error Rate",
}

METRIC_UNITS = {
    "loop_detected":       "loops",
    "tool_failure_rate":   "%",
    "cost_per_session":    "USD",
    "session_duration_ms": "ms",
    "iteration_count":     "iterations",
    "error_rate":          "%",
}

OPERATOR_LABELS = {
    "gt":  ">",
    "gte": "≥",
    "lt":  "<",
    "lte": "≤",
    "eq":  "=",
}

METRIC_EMOJIS = {
    "loop_detected":       "🔁",
    "tool_failure_rate":   "🔧",
    "cost_per_session":    "💰",
    "session_duration_ms": "🐌",
    "iteration_count":     "🔄",
    "error_rate":          "🚨",
}


def _format_value(metric: str, value: float) -> str:
    unit = METRIC_UNITS.get(metric, "")
    if metric == "cost_per_session":
        return f"${value:.4f}"
    if metric in ("tool_failure_rate", "error_rate"):
        return f"{value:.1f}%"
    if metric == "session_duration_ms":
        return f"{value:,.0f} ms ({value/1000:.1f}s)"
    return f"{value:,.1f} {unit}".strip()


async def send_slack(
    webhook_url: str,
    rule_name: str,
    metric: str,
    metric_value: float,
    operator: str,
    threshold: float,
    window_minutes: int,
    frontend_url: str,
) -> bool:
    metric_label = METRIC_LABELS.get(metric, metric)
    metric_emoji = METRIC_EMOJIS.get(metric, "🚨")
    op_label = OPERATOR_LABELS.get(operator, operator)
    unit = METRIC_UNITS.get(metric, "")
    threshold_fmt = f"${threshold:.2f}" if metric == "cost_per_session" else f"{threshold}{unit}"
    value_fmt = _format_value(metric, metric_value)

    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{metric_emoji} {rule_name}",
                    "emoji": True,
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Metric:*\n{metric_label}"},
                    {"type": "mrkdwn", "text": f"*Current Value:*\n`{value_fmt}`"},
                    {"type": "mrkdwn", "text": f"*Threshold:*\n{op_label} {threshold_fmt}"},
                    {"type": "mrkdwn", "text": f"*Window:*\nLast {window_minutes} min"},
                ]
            },
            {"type": "divider"},
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View Sessions", "emoji": True},
                        "url": f"{frontend_url}/sessions",
                        "style": "primary",
                    },
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View Alerts", "emoji": True},
                        "url": f"{frontend_url}/alerts",
                    },
                ]
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"Sent by *Dottle* · <{frontend_url}|Open Dashboard>"}
                ]
            },
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
            return True
    except Exception as exc:
        logger.error(f"Slack notification failed: {exc}")
        return False


def send_email(to_address: str, subject: str, body_html: str) -> bool:
    if not settings.smtp_user:
        logger.warning("SMTP not configured — skipping email alert")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.alert_from_email
        msg["To"] = to_address
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.alert_from_email, to_address, msg.as_string())
        return True
    except Exception as exc:
        logger.error(f"Email notification failed: {exc}")
        return False


async def dispatch_alert(
    channel: str,
    destination: str,
    rule_name: str,
    message: str,
    metric_value: float,
    metric: str = "error_rate",
    operator: str = "gt",
    threshold: float = 0,
    window_minutes: int = 60,
) -> tuple[bool, str | None]:
    """Returns (delivered, error_message)"""
    if channel == "slack":
        ok = await send_slack(
            webhook_url=destination,
            rule_name=rule_name,
            metric=metric,
            metric_value=metric_value,
            operator=operator,
            threshold=threshold,
            window_minutes=window_minutes,
            frontend_url=settings.frontend_url,
        )
        return ok, None if ok else "Slack POST failed"

    elif channel == "email":
        metric_label = METRIC_LABELS.get(metric, metric)
        value_fmt = _format_value(metric, metric_value)
        op_label = OPERATOR_LABELS.get(operator, operator)
        html = f"""
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
          <h2 style="color:#e53e3e">🚨 {rule_name}</h2>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr><td style="padding:8px 0;color:#666">Metric</td><td style="padding:8px 0;font-weight:600">{metric_label}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Value</td><td style="padding:8px 0;font-family:monospace;background:#f5f5f5;padding:4px 8px;border-radius:4px">{value_fmt}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Threshold</td><td style="padding:8px 0">{op_label} {threshold}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Window</td><td style="padding:8px 0">Last {window_minutes} minutes</td></tr>
          </table>
          <a href="{settings.frontend_url}/sessions"
             style="display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
            View Dashboard →
          </a>
          <p style="color:#999;font-size:12px;margin-top:24px">Sent by Dottle · <a href="{settings.frontend_url}">{settings.frontend_url}</a></p>
        </div>
        """
        ok = send_email(destination, f"🚨 {rule_name}", html)
        return ok, None if ok else "SMTP send failed"

    else:
        return False, f"Unknown channel: {channel}"
