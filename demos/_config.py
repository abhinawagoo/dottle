"""
Shared configuration for all demos.

Usage:
    DOTTLE_API_KEY=dtl_live_... python3 01_customer_support.py

Or export once in your shell session:
    export DOTTLE_API_KEY=dtl_live_...
    python3 run_all.py
"""

import os, sys

sys.path.insert(0, "../sdk")
import dottle

DOTTLE_API_KEY = os.environ.get("DOTTLE_API_KEY", "dtl_live_P6aMoyfqWR1WadGgPTzbeDA_bsI_uVb_ZF44gpZlRNE")

dottle.configure(
    api_key=DOTTLE_API_KEY,
    api_url="https://api.dottle.dev/api/v1",
    debug=True,
)
