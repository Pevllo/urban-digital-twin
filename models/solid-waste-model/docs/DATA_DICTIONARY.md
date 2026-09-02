# Solid Waste Dataset — Data Dictionary

| Column | Type | Unit | Description | Origin |
|--------|------|------|-------------|--------|
| record_id | string | — | Unique row id | derived |
| development_id | string | — | Synthetic development id | synthetic |
| development_type | string | — | residential_compound / hospital / mall / school / office | synthetic |
| zone_id | string | — | Zone label | synthetic |
| name | string | — | Display name | synthetic |
| date | string | YYYY-MM-DD | Date | derived |
| year / month / day | int | — | Calendar components | derived |
| day_of_week | int | 0–6 | Monday=0 | derived |
| is_weekend | int | 0/1 | Weekend flag | derived |
| num_residents … floors | float/int | various | Activity drivers from Development properties | synthetic |
| waste_generation_kg | float | kg/day | **Primary target** | derived |
| waste_generation_tonnes | float | t/day | Target in tonnes | derived |
| organic_kg … other_kg | float | kg/day | Composition components | derived |
| data_origin | string | — | "derived" | — |
| dow_sin / dow_cos | float | — | Cyclical day-of-week | engineered |
| month_sin / month_cos | float | — | Cyclical month | engineered |
| log1p_* | float | — | log(1+x) of drivers | engineered |
| activity_intensity | float | — | Sum of log drivers | engineered |
