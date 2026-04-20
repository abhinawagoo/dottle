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


async def send_slack(webhook_url: str, message: str, rule_name: str, metric_value: float) -> bool:
    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"🚨 Dottle Alert: {rule_name}"}
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": message}
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"*Metric value:* `{metric_value}`"},
                    {"type": "mrkdwn", "text": f"Sent by Dottle · <{settings.frontend_url}|Open Dashboard>"}
                ]
            }
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


async def dispatch_alert(channel: str, destination: str, rule_name: str, message: str, metric_value: float) -> tuple[bool, str | None]:
    """
    Returns (delivered, error_message)
    """
    if channel == "slack":
        ok = await send_slack(destination, message, rule_name, metric_value)
        return ok, None if ok else "Slack POST failed"
    elif channel == "email":
        html = f"""
        <h2>Dottle Alert: {rule_name}</h2>
        <p>{message}</p>
        <p><strong>Metric value:</strong> {metric_value}</p>
        <p><a href="{settings.frontend_url}">Open Dashboard</a></p>
        """
        ok = send_email(destination, f"[Dottle] {rule_name}", html)
        return ok, None if ok else "SMTP send failed"
    else:
        return False, f"Unknown channel: {channel}"
