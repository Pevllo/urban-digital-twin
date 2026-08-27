"""
End-to-end synthetic-data pipeline:

  REAL OSM  -> road features -> network topology
            -> SYNTHETIC traffic observations (labelled as such)
            -> validation tables, figures, reports

Run:  python src/run_synthetic_pipeline.py
"""

import pandas as pd

import config
import osm_loader
import osm_features
import road_network
import traffic_generator
import traffic_validation


def main():
    print("=== 1. Loading REAL OSM data ===")
    roads, nodes, stats = osm_loader.load_osm()
    inspection = osm_loader.inspect_osm(roads, stats)
    inspection.to_csv(config.PROCESSED_DIR / "osm_inspection_report.csv",
                      index=False)

    print("=== 2. Road features + capacity proxy ===")
    roads = osm_features.compute_base_features(roads)
    roads = road_network.add_topology_features(roads)

    drivable_n = int(roads["is_drivable"].sum())
    print(f"    {len(roads)} segments total, {drivable_n} drivable "
          f"(non-drivable flagged, kept in gpkg)")

    print("=== 3. Saving data/processed/osm_roads.gpkg ===")
    if config.OSM_ROADS_GPKG.exists():
        config.OSM_ROADS_GPKG.unlink()
    roads.to_file(config.OSM_ROADS_GPKG, layer="osm_roads", driver="GPKG")

    print("=== 4. Generating SYNTHETIC traffic ===")
    adjacency = road_network.build_road_adjacency(
        roads[roads["is_drivable"]].reset_index(drop=True))
    traffic_gdf = traffic_generator.generate(roads, verbose=True)

    print("=== 5. Saving processed outputs ===")
    tabular = pd.DataFrame(traffic_gdf.drop(columns="geometry"))
    tabular.to_csv(config.SYNTHETIC_TRAFFIC_CSV, index=False)
    if config.SYNTHETIC_TRAFFIC_GPKG.exists():
        config.SYNTHETIC_TRAFFIC_GPKG.unlink()
    for day in sorted(traffic_gdf["timestamp"].dt.date.unique()):
        chunk = traffic_gdf[traffic_gdf["timestamp"].dt.date == day]
        mode = "w" if day == sorted(traffic_gdf["timestamp"].dt.date.unique())[0] else "a"
        chunk.to_file(config.SYNTHETIC_TRAFFIC_GPKG, layer="synthetic_traffic",
                      driver="GPKG", mode=mode, engine="pyogrio")
    print(f"    {config.SYNTHETIC_TRAFFIC_CSV.name}: {tabular.shape}")
    print(f"    {config.SYNTHETIC_TRAFFIC_GPKG.name} written")

    print("=== 6. Validation, figures, report ===")
    params = {
        "formula": (
            "static_level_i = BASE_DEMAND x ROAD_CLASS_FACTOR x LANE_FACTOR\n"
            "                x CONNECTIVITY_FACTOR x SPEED_FACTOR x lognormal_heterogeneity\n"
            "levels smoothed across OSM graph (w=0.35, 2 passes)   [spatial correlation]\n"
            "volume(i,t) = static_level_i x daily_factor(day) x event_factor(day)\n"
            "              x HOURLY_PROFILE[h][weekday/weekend] x HIERARCHY_PEAK_BOOST\n"
            "              x lognormal_noise(sigma=0.12)\n"
            "clip(volume, 0, min(12000, capacity_proxy x 1.15))"),
        "config": {
            "RANDOM_SEED": config.RANDOM_SEED,
            "START_DATE": config.START_DATE,
            "NUM_DAYS": config.NUM_DAYS,
            "BASE_DEMAND": config.BASE_DEMAND,
            "MORNING_PEAK_HOURS": config.MORNING_PEAK_HOURS,
            "EVENING_PEAK_HOURS": config.EVENING_PEAK_HOURS,
            "WEEKEND_DAYS(Fri,Sat)": config.WEEKEND_DAYS,
            "WEEKEND_DEMAND_FACTOR": config.WEEKEND_DEMAND_FACTOR,
            "NOISE_SIGMA": config.NOISE_SIGMA,
            "DAILY_VARIATION_SCALE": config.DAILY_VARIATION_SCALE,
            "SPECIAL_EVENT_DAY_PROBABILITY": config.SPECIAL_EVENT_DAY_PROBABILITY,
            "SPATIAL_INFLUENCE_STRENGTH": config.SPATIAL_INFLUENCE_STRENGTH,
            "MAX_TRAFFIC_PER_ROAD": config.MAX_TRAFFIC_PER_ROAD,
        },
    }
    traffic_validation.validate_and_report(roads, traffic_gdf, adjacency, params)

    print("=== DONE ===")
    return roads, traffic_gdf


if __name__ == "__main__":
    main()
