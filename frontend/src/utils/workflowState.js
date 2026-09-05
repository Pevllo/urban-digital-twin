// Derive the current workflow step from actual application state so the
// workflow panel always reflects reality (requirement: "workflow state must
// reflect the actual application state").
export function computeActiveStep(state) {
  const sim = state.simulation;
  const dev = state.development;
  const location = state.map.selectedLocation;

  if (sim.result) return 5; // View Results
  if (sim.running) return 4; // Run What-If
  if (dev.placed) return 3; // Place Development
  if (location) return 2; // Configure Development (location selected)
  return 0; // Explore City
}