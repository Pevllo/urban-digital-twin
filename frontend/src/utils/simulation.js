// Simulation pipeline stage descriptions (8-stage unified What-If engine).
export const SIMULATION_PIPELINE = [
  { key: "trip_demand", label: "Trip Demand" },
  { key: "traffic_assignment", label: "Traffic Assignment" },
  { key: "scenario_traffic", label: "Scenario Traffic" },
  { key: "traffic_impact", label: "Traffic Impact" },
  { key: "electricity", label: "Electricity" },
  { key: "water", label: "Water" },
  { key: "waste", label: "Solid Waste" },
];

export const IMPACT_DOMAINS = ["TRAFFIC", "ELECTRICITY", "WATER", "SOLID WASTE"];
