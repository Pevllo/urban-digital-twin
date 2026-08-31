"""Pytest configuration for water demand tests."""
import sys
from pathlib import Path

# Add project root and model src to path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_SRC = PROJECT_ROOT / "models" / "water-demand-model" / "src"

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(MODEL_SRC) not in sys.path:
    sys.path.insert(0, str(MODEL_SRC))
