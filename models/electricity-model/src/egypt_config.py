"""
Egypt Calibration Configuration — Real Egyptian Data Sources.

All constants sourced from authoritative Egyptian and international sources.
No synthetic data is used for calibration.

Adapted from electricity_model/src/egypt_config.py for Urban Digital Twin integration.
"""

from dataclasses import dataclass, field


# ============================================================================
# MODEL VERSION
# ============================================================================

MODEL_VERSION = "1.0.0"
MODEL_TYPE = "Linear Regression"
TRAINING_DATA = "Real BDG2 (26,183,113 rows, 1,576 buildings)"
TRAINING_PERIOD = "2016-2017"
CALIBRATION_VERSION = "CAL-3"
SYNTHETIC_EGYPTIAN_DATA = "NOT USED"

# ============================================================================
# BDG2 TO EGYPT SECTOR MAPPING
# ============================================================================

BDG2_TO_EGYPT_SECTOR = {
    "Education": "government_and_utilities",
    "Office": "commercial_and_others",
    "Entertainment/public assembly": "commercial_and_others",
    "Lodging/residential": "residential",
    "Public services": "government_and_utilities",
    "Healthcare": "government_and_utilities",
    "Other": "commercial_and_others",
    "Manufacturing/industrial": "industrial",
    "Warehouse/storage": "industrial",
    "Parking": "commercial_and_others",
    "Services": "commercial_and_others",
}

SECTOR_ADJUSTMENT = {
    "Education": 1.0,
    "Office": 0.85,
    "Entertainment/public assembly": 0.90,
    "Lodging/residential": 0.75,
    "Public services": 0.95,
    "Healthcare": 1.10,
    "Other": 0.90,
    "Manufacturing/industrial": 1.20,
    "Warehouse/storage": 0.60,
    "Parking": 0.50,
    "Services": 0.85,
}


# ============================================================================
# BUILDING TYPE MAPPING — Main Digital Twin → Electricity Model
# ============================================================================

DEVELOPMENT_TYPE_TO_BDG2 = {
    "school": "Education",
    "office": "Office",
    "hospital": "Healthcare",
    "hotel": "Lodging/residential",
    "mall": "Entertainment/public assembly",
    "residential_compound": "Lodging/residential",
}

SUPPORTED_BDG2_TYPES = [
    "Education",
    "Office",
    "Entertainment/public assembly",
    "Lodging/residential",
    "Public services",
    "Healthcare",
    "Other",
    "Manufacturing/industrial",
    "Warehouse/storage",
    "Parking",
    "Services",
]

CANONICAL_FLOOR_AREA_FIELD = "gross_floor_area_sqm"


# ============================================================================
# CLIMATE DATA — NASA POWER / WeatherSpark Averages
# ============================================================================

@dataclass
class CityClimate:
    """Real climate data for an Egyptian city."""
    name: str
    latitude: float
    longitude: float
    elevation_m: float
    monthly_temp_mean: list = field(default_factory=list)
    monthly_temp_max: list = field(default_factory=list)
    monthly_temp_min: list = field(default_factory=list)
    monthly_humidity: list = field(default_factory=list)
    monthly_wind: list = field(default_factory=list)
    annual_temp_mean: float = 0.0
    annual_humidity: float = 0.0
    cdd_base18: float = 0.0
    hdd_base18: float = 0.0


CAIRO = CityClimate(
    name="Cairo",
    latitude=30.0444,
    longitude=31.2357,
    elevation_m=75,
    monthly_temp_mean=[14.4, 15.6, 18.3, 21.8, 25.6, 28.2, 29.1, 29.2, 27.6, 24.6, 20.0, 15.9],
    monthly_temp_max=[18.9, 20.5, 23.8, 28.1, 32.2, 34.6, 35.0, 34.9, 33.4, 30.0, 24.9, 20.5],
    monthly_temp_min=[10.1, 11.0, 13.2, 15.9, 19.3, 22.2, 23.8, 24.3, 22.7, 20.0, 15.6, 11.7],
    monthly_humidity=[57, 54, 51, 44, 40, 43, 52, 55, 54, 55, 56, 58],
    monthly_wind=[3.8, 4.2, 4.5, 4.6, 4.4, 5.0, 5.1, 4.8, 4.2, 3.8, 3.6, 3.6],
    annual_temp_mean=22.5,
    annual_humidity=51,
    cdd_base18=2869,
    hdd_base18=50,
)

ALEXANDRIA = CityClimate(
    name="Alexandria",
    latitude=31.2001,
    longitude=29.9187,
    elevation_m=5,
    monthly_temp_mean=[13.4, 13.9, 15.6, 18.5, 21.6, 25.0, 26.7, 27.1, 25.9, 23.5, 19.6, 15.1],
    monthly_temp_max=[17.5, 18.1, 20.1, 23.4, 26.7, 29.8, 30.9, 31.3, 30.0, 27.7, 23.7, 19.2],
    monthly_temp_min=[9.4, 9.6, 11.2, 13.8, 17.0, 20.8, 23.0, 23.5, 21.9, 19.5, 15.5, 11.1],
    monthly_humidity=[69, 68, 67, 65, 68, 71, 73, 73, 71, 70, 69, 69],
    monthly_wind=[5.2, 5.3, 5.1, 4.8, 4.6, 5.2, 5.6, 5.4, 4.8, 4.6, 4.8, 5.2],
    annual_temp_mean=22.6,
    annual_humidity=70,
    cdd_base18=2718,
    hdd_base18=80,
)

LUXOR = CityClimate(
    name="Luxor",
    latitude=25.6872,
    longitude=32.6396,
    elevation_m=89,
    monthly_temp_mean=[13.5, 15.3, 19.0, 23.8, 28.1, 31.0, 32.1, 32.0, 29.9, 25.7, 20.2, 15.2],
    monthly_temp_max=[21.0, 23.3, 27.5, 32.7, 36.7, 39.4, 40.1, 39.7, 37.4, 33.2, 27.3, 22.3],
    monthly_temp_min=[6.0, 7.4, 10.6, 14.9, 19.5, 22.6, 24.1, 24.3, 22.4, 18.3, 13.1, 8.1],
    monthly_humidity=[48, 42, 37, 30, 27, 29, 32, 33, 34, 38, 44, 48],
    monthly_wind=[3.2, 3.6, 4.0, 4.2, 4.4, 4.8, 4.6, 4.2, 3.8, 3.4, 3.2, 3.0],
    annual_temp_mean=27.6,
    annual_humidity=37,
    cdd_base18=3044,
    hdd_base18=20,
)

ASWAN = CityClimate(
    name="Aswan",
    latitude=24.0889,
    longitude=32.8998,
    elevation_m=194,
    monthly_temp_mean=[15.3, 17.2, 21.0, 25.7, 29.8, 32.2, 33.1, 33.0, 30.9, 26.8, 21.5, 16.7],
    monthly_temp_max=[23.5, 25.8, 30.0, 35.0, 38.8, 41.0, 41.7, 41.5, 39.4, 35.2, 29.5, 24.8],
    monthly_temp_min=[7.2, 8.7, 12.0, 16.4, 20.8, 23.4, 24.5, 24.5, 22.4, 18.5, 13.6, 8.7],
    monthly_humidity=[44, 38, 33, 27, 25, 27, 30, 31, 30, 34, 40, 44],
    monthly_wind=[3.4, 3.8, 4.2, 4.4, 4.6, 5.0, 4.8, 4.4, 4.0, 3.6, 3.4, 3.2],
    annual_temp_mean=28.8,
    annual_humidity=34,
    cdd_base18=3564,
    hdd_base18=10,
)

EGYPTIAN_CITIES = {
    "Cairo": CAIRO,
    "Alexandria": ALEXANDRIA,
    "Luxor": LUXOR,
    "Aswan": ASWAN,
}


# ============================================================================
# CALIBRATION FACTORS
# ============================================================================

CALIBRATION_FACTOR_GLOBAL = 0.90
HEAT_CORRECTION_THRESHOLD = 35.0
HEAT_CORRECTION_FACTOR = 1.05

BDG2_MODEL_MAE = 86.55
BDG2_MODEL_RMSE = 153.30
BDG2_MODEL_R2 = 0.4542
BDG2_MODEL_WAPE = 0.6657
