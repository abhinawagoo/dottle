"""
Production startup wrapper — catches all errors and prints to stdout
so Railway logs can show them (Railway may only show stdout, not stderr).
"""
import sys
import os
import traceback

print("=== start.py running", flush=True)
print(f"=== PORT={os.environ.get('PORT', 'NOT SET')}", flush=True)
print(f"=== DATABASE_URL prefix={os.environ.get('DATABASE_URL', 'NOT SET')[:30]}", flush=True)
print(f"=== ENVIRONMENT={os.environ.get('ENVIRONMENT', 'NOT SET')}", flush=True)

try:
    print("=== importing uvicorn", flush=True)
    import uvicorn
    print("=== importing app", flush=True)
    from app.main import app
    print("=== app imported, starting uvicorn", flush=True)
    sys.stdout.flush()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        log_level="info",
        access_log=True,
    )
except Exception as e:
    print(f"=== STARTUP CRASHED: {type(e).__name__}: {e}", flush=True)
    traceback.print_exc(file=sys.stdout)
    sys.stdout.flush()
    sys.exit(1)
