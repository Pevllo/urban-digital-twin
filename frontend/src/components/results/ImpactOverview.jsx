import { TrafficImpactCard } from "./TrafficImpactCard.jsx";
import { ElectricityCard } from "./ElectricityCard.jsx";
import { WaterCard } from "./WaterCard.jsx";
import { WasteCard } from "./WasteCard.jsx";

export function ImpactOverview({ data }) {
  return (
    <div className="impact-overview">
      <TrafficImpactCard
        stage1={data.stage1_od_demand}
        stage3={data.stage3_scenario_traffic}
        stage4={data.stage4_impact_assessment}
      />
      <ElectricityCard stage={data.stage5_electricity} />
      <WaterCard stage={data.stage6_water} />
      <WasteCard stage={data.stage7_waste} />
    </div>
  );
}
