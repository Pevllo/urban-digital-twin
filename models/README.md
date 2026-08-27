# AI & Mobility Simulation Models

This directory contains the computational models powering the AI Urban Digital Twin.

## Sub-components

- **`traffic-model/`**: Unified 4-Stage What-If Simulator & Network Assignment Engine.
  - Stage 2: Traffic Assignment Engine over OSM Graph
  - Stage 3: Total Traffic Volume Aggregator ($V_{\text{total}} = V_{\text{base}} + \Delta V_{\text{assigned}}$)
  - Stage 4: Congestion & Capacity Impact Assessment ($V/C$, Level of Service, Bottleneck Scoring)
- **`trip-demand-model/`**: Land-use Trip Generation & Baseline Demand Model.
  - Stage 1: Deterministic Land-Use Trip Generation Module & Gravity Model Distribution Matrix.
  - Baseline XGBoost road volume regressor.
