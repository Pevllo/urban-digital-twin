"""Run all remaining improvement-experiment stages in one process.

Idempotent: every stage skips work already recorded in results.json, so this
can be relaunched safely after an interruption.
"""
import time
import traceback

import run_experiments as rx

STAGES = ["tune", "twostage", "ensemble", "report"]

for stage in STAGES:
    t0 = time.time()
    rx.log(f"=== ORCHESTRATOR: stage '{stage}' start ===")
    try:
        getattr(rx, f"stage_{stage}")()
    except Exception:
        rx.log(f"stage '{stage}' FAILED after {time.time()-t0:.0f}s:")
        rx.log(traceback.format_exc())
        raise
    rx.log(f"=== ORCHESTRATOR: stage '{stage}' done in {time.time()-t0:.0f}s ===")

rx.log("=== ORCHESTRATOR: all stages complete ===")
