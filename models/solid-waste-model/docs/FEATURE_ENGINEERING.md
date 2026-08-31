# Feature Engineering — Solid Waste

Implemented in `src/generate_waste_dataset.py::add_engineered_features`.

1. **Cyclical time**  
   - `dow_sin`, `dow_cos`  
   - `month_sin`, `month_cos`

2. **Log activity drivers**  
   - `log1p_*` for residents, beds, students, employees, GLA, GFA

3. **Activity intensity**  
   - Sum of the log1p drivers (single scalar proxy for overall size/occupancy)

No temperature features are included by default (waste generation is less temperature-sensitive than water at daily resolution); they can be joined later if climate covariates become available.
