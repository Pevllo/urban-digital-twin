# Solid Waste Model — Dataset & Documentation

## Purpose
Supports the What-If Simulator by predicting daily solid-waste generation (kg) and composition for proposed developments of types:
`residential_compound`, `hospital`, `mall`, `school`, `office`.

Compatible with existing DevelopmentSchema / DevelopmentInput.

## Final Dataset
| Item | Value |
|------|-------|
| **Path** | `models/solid-waste-model/data/processed/solid_waste_dataset.csv` |
| **Rows** | 8,400 |
| **Columns** | 41 |
| **Target** | `waste_generation_kg` (also `waste_generation_tonnes` + composition columns) |
| **Resolution** | Daily |
| **Developments** | 150 synthetic scenario instances |
| **Days per development** | 56 |

## Feature Columns
**Identifiers / context**  
`record_id`, `development_id`, `development_type`, `zone_id`, `name`, `date`, `year`, `month`, `day`, `day_of_week`, `is_weekend`

**Activity / size drivers**  
`num_residents`, `num_units`, `num_beds`, `staff_count`, `num_students`, `num_employees`,  
`gross_leasable_area_sqm`, `visitor_capacity`, `gross_floor_area_sqm`, `floors`

**Composition (kg)**  
`organic_kg`, `paper_cardboard_kg`, `plastic_kg`, `glass_kg`, `metal_kg`, `other_kg`

**Engineered**  
`dow_sin`, `dow_cos`, `month_sin`, `month_cos`, `log1p_*`, `activity_intensity`

**Target & origin**  
`waste_generation_kg`, `waste_generation_tonnes`, `data_origin` (= `"derived"`)

## Units
- Waste: kilograms (kg) per day; also tonnes/day
- Areas: m²
- Counts: persons / units / beds / students / employees

## Data Origin Classification
| Category | Description |
|----------|-------------|
| **Real (rates)** | Base kg/capita/day (or per-bed / per-sqm) taken from World Bank What a Waste series (Egypt / MENA urban ~0.7–1.1 kg/c/d) and published land-use-specific generation factors. Composition fractions are typical published averages for each building class. |
| **Derived** | Every row. Daily generation = (activity driver × published base rate) × day-of-week factor × bounded noise. Composition columns = total × published fraction. |
| **Synthetic** | Development property values sampled from plausible ranges matching DevelopmentPropertiesSchema. No real collection or weighbridge records of named facilities. |

## Missing-Value Handling
- No missing values in the generated CSV.
- Future real data: median by development_type + month; composition renormalized to sum to total.

## Feature Engineering
See `src/generate_waste_dataset.py` → `add_engineered_features` (cyclical time, log1p drivers, activity intensity).

## Train / Validation / Test Recommendation
- Group by `development_id` (or stratified by `development_type`).
- 70 / 15 / 15 split by groups, or last 20 % of days as test.
- Metrics: MAE, RMSE, WAPE, R² on `waste_generation_kg`; optional multi-output for composition.

## Generation & Validation Commands
```bash
python models/solid-waste-model/src/generate_waste_dataset.py
python models/solid-waste-model/src/validate_waste_dataset.py
```

## Config
- `config/solid_waste_rates.json`

## Documentation
- `docs/DATA_DICTIONARY.md`
- `docs/PROVENANCE.md`
- `docs/FEATURE_ENGINEERING.md`
