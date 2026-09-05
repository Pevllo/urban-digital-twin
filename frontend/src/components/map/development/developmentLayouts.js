// Procedural 3D architectural layout generator for developments.
// Produces physical 3D multi-building complexes, landscaped courtyards,
// rooftop structures, and access zones scaled by development properties.

import {
  translateAndRotatePoly,
  findDominantRoadAngle,
} from "./developmentGeometry.js";
import {
  getNearbyRoads,
  getNearbyBuildings,
  validateBuildingCandidate,
  findNearestValidPosition,
} from "./spatialValidation.js";
import { SPATIAL_FEATURES } from "../../../config/mapConfig.js";

// Visual architectural palettes for proposed developments
// (Clean, distinct, modern architectural materials contrasting with dark OSM context)
export const DEV_THEMES = {
  residential_compound: {
    wallColor: "#e2d9cc",
    wallOutline: "#a39889",
    accentColor: "#c98a58",
    roofColor: "#9c9488",
    plinthColor: "#616870",
    greenColor: "#2e7039",
    plazaColor: "#7c8796",
    roadColor: "#2d3540",
    parkingColor: "#222834",
    waterColor: "#0284c7",
    boundaryColor: "#38bdf8",
  },
  hospital: {
    wallColor: "#e6edf2",
    wallOutline: "#9bb0c1",
    accentColor: "#0284c7",
    roofColor: "#869aa8",
    plinthColor: "#57636e",
    greenColor: "#2e7039",
    plazaColor: "#7e8998",
    roadColor: "#2d3540",
    parkingColor: "#222834",
    waterColor: "#0ea5e9",
    boundaryColor: "#0284c7",
  },
  school: {
    wallColor: "#eeddc5",
    wallOutline: "#ba9f79",
    accentColor: "#d97706",
    roofColor: "#a39079",
    plinthColor: "#5c5c63",
    greenColor: "#2e7039",
    plazaColor: "#7c8796",
    roadColor: "#2d3540",
    parkingColor: "#222834",
    sportsTrackColor: "#c25736",
    boundaryColor: "#f59e0b",
  },
  mall: {
    wallColor: "#dedae2",
    wallOutline: "#948e9c",
    accentColor: "#8b5cf6",
    roofColor: "#807887",
    plinthColor: "#4f515c",
    greenColor: "#2e7039",
    plazaColor: "#7e8998",
    roadColor: "#2d3540",
    parkingColor: "#222834",
    waterColor: "#0ea5e9",
    boundaryColor: "#a855f7",
  },
  office: {
    wallColor: "#d5e2ec",
    wallOutline: "#7d9bb3",
    accentColor: "#0284c7",
    roofColor: "#6b8396",
    plinthColor: "#404c57",
    greenColor: "#2e7039",
    plazaColor: "#7c8796",
    roadColor: "#2d3540",
    parkingColor: "#222834",
    waterColor: "#0284c7",
    boundaryColor: "#38bdf8",
  },
  mixed_use: {
    wallColor: "#e8ded2",
    wallOutline: "#a69581",
    accentColor: "#ec4899",
    roofColor: "#918274",
    plinthColor: "#52545e",
    greenColor: "#2e7039",
    plazaColor: "#7e8998",
    roadColor: "#2d3540",
    parkingColor: "#222834",
    waterColor: "#0ea5e9",
    boundaryColor: "#f43f5e",
  },
};

// Create a local rectangle centered at (0, 0)
function makeRect(width, length) {
  const hw = width / 2;
  const hl = length / 2;
  return [
    { x: -hw, y: -hl },
    { x: hw, y: -hl },
    { x: hw, y: hl },
    { x: -hw, y: hl },
  ];
}

// Compute compound plot dimension in meters based on properties
function computePlotSize(dev) {
  const type = dev.development_type || dev.type || "residential_compound";
  const props = dev.properties || {};
  const floors = Number(dev.floors) || 5;

  let baseArea = 4900; // default 70m x 70m

  if (props.gross_floor_area_sqm) {
    baseArea = Number(props.gross_floor_area_sqm) / Math.max(2, floors * 0.4);
  } else if (props.gross_leasable_area_sqm) {
    baseArea = Number(props.gross_leasable_area_sqm) / Math.max(1.5, floors * 0.5);
  } else if (props.num_units) {
    baseArea = Number(props.num_units) * 65;
  } else if (props.num_residents) {
    baseArea = Number(props.num_residents) * 22;
  } else if (props.num_beds) {
    baseArea = Number(props.num_beds) * 80;
  } else if (props.num_students) {
    baseArea = Number(props.num_students) * 25;
  } else if (props.num_employees) {
    baseArea = Number(props.num_employees) * 35;
  }

  // Type specific scale bounds
  let minSide = 65;
  let maxSide = 125;
  if (type === "mall") {
    minSide = 80;
    maxSide = 140;
  } else if (type === "hospital") {
    minSide = 75;
    maxSide = 130;
  } else if (type === "school") {
    minSide = 75;
    maxSide = 135;
  }

  const side = Math.max(minSide, Math.min(maxSide, Math.sqrt(baseArea * 1.6)));
  return { width: side, length: side };
}

// ==========================================
// 1. RESIDENTIAL COMPOUND LAYOUT
// ==========================================
function layoutResidentialCompound(plotW, plotL, baseHeight, theme) {
  const buildings = [];
  const landscaping = [];
  const halfW = plotW / 2;
  const halfL = plotL / 2;

  // Perimeter residential apartment blocks
  const bldgW = Math.max(16, Math.min(26, plotW * 0.22));
  const bldgL = Math.max(22, Math.min(36, plotL * 0.32));
  const marginX = halfW - bldgW / 2 - 8;
  const marginY = halfL - bldgL / 2 - 8;

  // 4 Corner/Perimeter Residential Blocks
  const blockOffsets = [
    { x: -marginX, y: -marginY, h: baseHeight, rot: 0 },
    { x: marginX, y: -marginY, h: baseHeight * 1.05, rot: 0 },
    { x: -marginX, y: marginY, h: baseHeight * 0.95, rot: 0 },
    { x: marginX, y: marginY, h: baseHeight, rot: 0 },
  ];

  // Optional mid blocks for larger plots
  if (plotW >= 95) {
    blockOffsets.push(
      { x: 0, y: -marginY - 2, h: baseHeight * 0.9, rot: Math.PI / 2, w: bldgW * 0.9, l: bldgL * 0.8 },
      { x: 0, y: marginY + 2, h: baseHeight * 0.9, rot: Math.PI / 2, w: bldgW * 0.9, l: bldgL * 0.8 }
    );
  }

  blockOffsets.forEach((b, idx) => {
    const w = b.w || bldgW;
    const l = b.l || bldgL;
    const rect = makeRect(w, l);
    const footprint = translateAndRotatePoly(rect, b.x, b.y, b.rot);

    // Rooftop mechanical penthouse
    const roofBox = makeRect(w * 0.35, l * 0.35);
    const rooftop = {
      footprint: translateAndRotatePoly(roofBox, b.x, b.y, b.rot),
      minHeight: b.h,
      height: b.h + 2.4,
      color: theme.roofColor,
    };

    buildings.push({
      id: `res_bldg_${idx + 1}`,
      name: `Apartment Block ${String.fromCharCode(65 + idx)}`,
      type: "building",
      footprint,
      minHeight: 0,
      height: b.h,
      color: theme.wallColor,
      roofColor: theme.roofColor,
      outlineColor: theme.wallOutline,
      rooftops: [rooftop],
    });
  });

  // 1. Internal Circulation Road / Perimeter Access
  const roadWidth = Math.max(6, plotW * 0.08);
  landscaping.push({
    type: "internal_road",
    semanticCategory: "Internal Roads",
    name: "Perimeter Access Driveway",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.88, roadWidth), 0, -plotL * 0.44),
    color: theme.roadColor,
  });

  // 2. Resident & Visitor Parking Area
  const parkW = plotW * 0.35;
  const parkL = plotL * 0.14;
  landscaping.push({
    type: "parking",
    semanticCategory: "Parking",
    name: "Resident & Visitor Parking",
    footprint: translateAndRotatePoly(makeRect(parkW, parkL), -plotW * 0.25, -plotL * 0.38),
    color: theme.parkingColor,
  });

  // 3. Central Landscaped Garden & Courtyard
  const gardenW = plotW * 0.44;
  const gardenL = plotL * 0.44;
  landscaping.push({
    type: "landscaping",
    semanticCategory: "Landscaping",
    name: "Central Park Courtyard",
    footprint: makeRect(gardenW, gardenL),
    color: theme.greenColor,
  });

  // 4. Central Water Pool / Fountain Accent
  const poolSide = Math.min(gardenW, gardenL) * 0.32;
  landscaping.push({
    type: "water",
    semanticCategory: "Water Features",
    name: "Central Fountain Pool",
    footprint: makeRect(poolSide, poolSide),
    color: theme.waterColor,
  });

  // 5. Surrounding Paved Promenade Walkway
  landscaping.push({
    type: "pedestrian_plaza",
    semanticCategory: "Pedestrian Areas",
    name: "Pedestrian Promenade",
    footprint: makeRect(gardenW + 8, gardenL + 8),
    color: theme.plazaColor,
  });

  return { buildings, landscaping };
}

// ==========================================
// 2. HOSPITAL MEDICAL COMPLEX LAYOUT
// ==========================================
function layoutHospital(plotW, plotL, baseHeight, theme) {
  const buildings = [];
  const landscaping = [];

  const mainH = Math.max(18, baseHeight * 1.15);
  const wingH = Math.max(12, baseHeight * 0.85);

  // Main Central Clinical Pavilion
  const mainW = plotW * 0.38;
  const mainL = plotL * 0.32;
  const mainFootprint = translateAndRotatePoly(makeRect(mainW, mainL), 0, 4);

  const mainRoof = {
    footprint: translateAndRotatePoly(makeRect(mainW * 0.35, mainL * 0.4), 0, 4),
    minHeight: mainH,
    height: mainH + 2.8,
    color: theme.roofColor,
  };

  buildings.push({
    id: "hosp_main",
    name: "Main Hospital Pavilion",
    type: "building",
    footprint: mainFootprint,
    minHeight: 0,
    height: mainH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [mainRoof],
  });

  // East Inpatient Wing
  const wingW = plotW * 0.22;
  const wingL = plotL * 0.36;
  const eastWingFootprint = translateAndRotatePoly(makeRect(wingW, wingL), plotW * 0.3, 0);
  buildings.push({
    id: "hosp_east_wing",
    name: "East Inpatient Wing",
    type: "building",
    footprint: eastWingFootprint,
    minHeight: 0,
    height: wingH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // West Diagnostic & Emergency Wing
  const westWingFootprint = translateAndRotatePoly(makeRect(wingW, wingL), -plotW * 0.3, 0);
  buildings.push({
    id: "hosp_west_wing",
    name: "Diagnostic & Emergency Wing",
    type: "building",
    footprint: westWingFootprint,
    minHeight: 0,
    height: wingH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // 1. Ambulance & Emergency Access Road
  landscaping.push({
    type: "internal_road",
    semanticCategory: "Internal Roads",
    name: "Ambulance & Emergency Access Lane",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.85, plotL * 0.1), 0, -plotL * 0.42),
    color: theme.roadColor,
  });

  // 2. Emergency & Visitor Parking
  landscaping.push({
    type: "parking",
    semanticCategory: "Parking",
    name: "Emergency & Visitor Parking",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.32, plotL * 0.16), -plotW * 0.28, -plotL * 0.28),
    color: theme.parkingColor,
  });

  // 3. Outpatient & Main Entrance Plaza
  landscaping.push({
    type: "pedestrian_plaza",
    semanticCategory: "Pedestrian Areas",
    name: "Main Entrance & Ambulatory Plaza",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.44, plotL * 0.2), 0, -plotL * 0.25),
    color: theme.plazaColor,
  });

  // 4. Healing Garden & Green Buffer
  landscaping.push({
    type: "landscaping",
    semanticCategory: "Landscaping",
    name: "Healing Garden & Buffer",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.42, plotL * 0.22), 0, plotL * 0.32),
    color: theme.greenColor,
  });

  return { buildings, landscaping };
}

// ==========================================
// 3. SCHOOL / EDUCATIONAL CAMPUS LAYOUT
// ==========================================
function layoutSchool(plotW, plotL, baseHeight, theme) {
  const buildings = [];
  const landscaping = [];

  const schoolH = Math.max(10, Math.min(22, baseHeight));

  // Main Academic Building
  const acadW = plotW * 0.42;
  const acadL = plotL * 0.24;
  buildings.push({
    id: "school_acad",
    name: "Academic Building",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(acadW, acadL), 0, plotL * 0.25),
    minHeight: 0,
    height: schoolH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // Science & Arts Wing
  const wingW = plotW * 0.22;
  const wingL = plotL * 0.32;
  buildings.push({
    id: "school_sci_wing",
    name: "Science & Labs Wing",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(wingW, wingL), -plotW * 0.3, 0),
    minHeight: 0,
    height: schoolH * 0.9,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // Gymnasium / Multi-Purpose Auditorium Block
  const gymW = plotW * 0.24;
  const gymL = plotL * 0.26;
  buildings.push({
    id: "school_gym",
    name: "Gymnasium & Auditorium",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(gymW, gymL), plotW * 0.28, plotL * 0.05),
    minHeight: 0,
    height: schoolH * 0.85,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // 1. Internal Campus Bus / Drop-off Access Lane
  landscaping.push({
    type: "internal_road",
    semanticCategory: "Internal Roads",
    name: "Campus Bus & Drop-Off Lane",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.85, plotL * 0.08), 0, -plotL * 0.44),
    color: theme.roadColor,
  });

  // 2. Faculty & Staff Parking Lot
  landscaping.push({
    type: "parking",
    semanticCategory: "Parking",
    name: "Faculty & Staff Parking",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.28, plotL * 0.14), -plotW * 0.3, -plotL * 0.32),
    color: theme.parkingColor,
  });

  // 3. Sports Field & Running Track
  const trackW = plotW * 0.46;
  const trackL = plotL * 0.3;
  landscaping.push({
    type: "sports_field",
    semanticCategory: "Athletic Track & Sports",
    name: "Athletic Field & Track",
    footprint: translateAndRotatePoly(makeRect(trackW, trackL), plotW * 0.12, -plotL * 0.24),
    color: theme.sportsTrackColor || "#c25736",
  });

  // 4. Central Quad Courtyard (Greenery)
  landscaping.push({
    type: "landscaping",
    semanticCategory: "Landscaping",
    name: "School Quadrangle",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.28, plotL * 0.24), -plotW * 0.05, 0),
    color: theme.greenColor,
  });

  // 5. Gathering Plaza Walkway
  landscaping.push({
    type: "pedestrian_plaza",
    semanticCategory: "Pedestrian Areas",
    name: "Campus Assembly Plaza",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.32, plotL * 0.1), 0, plotL * 0.08),
    color: theme.plazaColor,
  });

  return { buildings, landscaping };
}

// ==========================================
// 4. COMMERCIAL SHOPPING MALL LAYOUT
// ==========================================
function layoutMall(plotW, plotL, baseHeight, theme) {
  const buildings = [];
  const landscaping = [];

  const mallH = Math.max(12, Math.min(26, baseHeight));

  // Grand Central Retail Anchor & Atrium
  const centerW = plotW * 0.52;
  const centerL = plotL * 0.48;
  const atriumRoof = {
    footprint: translateAndRotatePoly(makeRect(centerW * 0.4, centerL * 0.4), 0, 0),
    minHeight: mallH,
    height: mallH + 3.2,
    color: theme.waterColor, // Glass skylight aesthetic
  };

  buildings.push({
    id: "mall_center",
    name: "Main Retail Complex & Atrium",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(centerW, centerL), 0, plotL * 0.08),
    minHeight: 0,
    height: mallH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [atriumRoof],
  });

  // Department Store Anchor East
  const anchorW = plotW * 0.22;
  const anchorL = plotL * 0.38;
  buildings.push({
    id: "mall_east_anchor",
    name: "East Department Store",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(anchorW, anchorL), plotW * 0.32, plotL * 0.08),
    minHeight: 0,
    height: mallH * 0.95,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // Cinema & Entertainment West Wing
  buildings.push({
    id: "mall_west_cinema",
    name: "Cinema & Entertainment Wing",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(anchorW, anchorL), -plotW * 0.32, plotL * 0.08),
    minHeight: 0,
    height: mallH * 1.1,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // 1. Commercial Service & Delivery Ring Road
  landscaping.push({
    type: "internal_road",
    semanticCategory: "Internal Roads",
    name: "Commercial Access Ring",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.9, plotL * 0.08), 0, -plotL * 0.44),
    color: theme.roadColor,
  });

  // 2. Customer Surface Parking Lots
  landscaping.push({
    type: "parking",
    semanticCategory: "Parking",
    name: "Customer Parking Lot",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.35, plotL * 0.16), -plotW * 0.25, -plotL * 0.34),
    color: theme.parkingColor,
  });

  // 3. Entrance Promenade & Grand Plaza
  landscaping.push({
    type: "pedestrian_plaza",
    semanticCategory: "Pedestrian Areas",
    name: "Grand Entrance Plaza",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.5, plotL * 0.18), plotW * 0.12, -plotL * 0.3),
    color: theme.plazaColor,
  });

  // 4. Decorative Entrance Water Feature
  landscaping.push({
    type: "water",
    semanticCategory: "Water Features",
    name: "Atrium Water Feature",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.18, plotL * 0.08), plotW * 0.12, -plotL * 0.28),
    color: theme.waterColor,
  });

  // 5. Perimeter Landscape Buffers
  landscaping.push({
    type: "landscaping",
    semanticCategory: "Landscaping",
    name: "Perimeter Green Buffer",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.88, plotL * 0.06), 0, plotL * 0.44),
    color: theme.greenColor,
  });

  return { buildings, landscaping };
}

// ==========================================
// 5. OFFICE PARK / BUSINESS TOWER LAYOUT
// ==========================================
function layoutOffice(plotW, plotL, baseHeight, theme) {
  const buildings = [];
  const landscaping = [];

  const towerH = Math.max(22, baseHeight * 1.3);
  const midH = Math.max(16, baseHeight * 0.9);

  // Tower Alpha (Primary High-Rise)
  const t1W = plotW * 0.28;
  const t1L = plotL * 0.28;
  const roof1 = {
    footprint: translateAndRotatePoly(makeRect(t1W * 0.4, t1L * 0.4), -plotW * 0.22, plotL * 0.2),
    minHeight: towerH,
    height: towerH + 3.5,
    color: theme.accentColor,
  };
  buildings.push({
    id: "office_tower_alpha",
    name: "Corporate Tower Alpha",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(t1W, t1L), -plotW * 0.22, plotL * 0.2),
    minHeight: 0,
    height: towerH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [roof1],
  });

  // Tower Beta (Secondary Mid-Rise)
  const roof2 = {
    footprint: translateAndRotatePoly(makeRect(t1W * 0.4, t1L * 0.4), plotW * 0.22, plotL * 0.2),
    minHeight: towerH * 0.8,
    height: towerH * 0.8 + 2.8,
    color: theme.roofColor,
  };
  buildings.push({
    id: "office_tower_beta",
    name: "Corporate Tower Beta",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(t1W, t1L), plotW * 0.22, plotL * 0.2),
    minHeight: 0,
    height: towerH * 0.8,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [roof2],
  });

  // Business Center & Conference Block
  const confW = plotW * 0.52;
  const confL = plotL * 0.22;
  buildings.push({
    id: "office_conf_center",
    name: "Innovation & Conference Center",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(confW, confL), 0, -plotL * 0.22),
    minHeight: 0,
    height: midH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // 1. Internal Drop-off & Circulation Road
  landscaping.push({
    type: "internal_road",
    semanticCategory: "Internal Roads",
    name: "Executive Circulation Loop",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.88, plotL * 0.08), 0, -plotL * 0.44),
    color: theme.roadColor,
  });

  // 2. Executive & Visitor Surface Parking
  landscaping.push({
    type: "parking",
    semanticCategory: "Parking",
    name: "Executive Surface Parking",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.32, plotL * 0.14), -plotW * 0.28, -plotL * 0.34),
    color: theme.parkingColor,
  });

  // 3. Central Corporate Plaza
  landscaping.push({
    type: "pedestrian_plaza",
    semanticCategory: "Pedestrian Areas",
    name: "Executive Plaza",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.44, plotL * 0.3), 0, 0),
    color: theme.plazaColor,
  });

  // 4. Plaza Water Mirror Feature
  landscaping.push({
    type: "water",
    semanticCategory: "Water Features",
    name: "Plaza Water Feature",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.18, plotL * 0.14), 0, 0),
    color: theme.waterColor,
  });

  // 5. Corporate Green Lawns
  landscaping.push({
    type: "landscaping",
    semanticCategory: "Landscaping",
    name: "Corporate Green Buffer",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.88, plotL * 0.06), 0, plotL * 0.44),
    color: theme.greenColor,
  });

  return { buildings, landscaping };
}

// ==========================================
// 6. MIXED-USE URBAN COMPLEX
// ==========================================
function layoutMixedUse(plotW, plotL, baseHeight, theme) {
  const buildings = [];
  const landscaping = [];

  const towerH = Math.max(20, baseHeight * 1.2);
  const podiumH = Math.max(8, baseHeight * 0.4);

  // Ground Commercial Podium
  const podW = plotW * 0.72;
  const podL = plotL * 0.44;
  buildings.push({
    id: "mixed_podium",
    name: "Commercial & Retail Podium",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(podW, podL), 0, -plotL * 0.1),
    minHeight: 0,
    height: podiumH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // Residential Tower 1
  const tW = plotW * 0.24;
  const tL = plotL * 0.24;
  buildings.push({
    id: "mixed_res_tower",
    name: "Skyline Residential Tower",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(tW, tL), -plotW * 0.2, plotL * 0.2),
    minHeight: 0,
    height: towerH,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // Office Tower 2
  buildings.push({
    id: "mixed_office_tower",
    name: "Skyline Commercial Tower",
    type: "building",
    footprint: translateAndRotatePoly(makeRect(tW, tL), plotW * 0.2, plotL * 0.2),
    minHeight: 0,
    height: towerH * 0.85,
    color: theme.wallColor,
    roofColor: theme.roofColor,
    outlineColor: theme.wallOutline,
    rooftops: [],
  });

  // 1. Internal Delivery & Service Lane
  landscaping.push({
    type: "internal_road",
    semanticCategory: "Internal Roads",
    name: "Delivery & Service Access",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.88, plotL * 0.08), 0, -plotL * 0.44),
    color: theme.roadColor,
  });

  // 2. Retail Surface Parking
  landscaping.push({
    type: "parking",
    semanticCategory: "Parking",
    name: "Retail & Visitor Parking",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.3, plotL * 0.14), -plotW * 0.28, -plotL * 0.32),
    color: theme.parkingColor,
  });

  // 3. Public Urban Piazza
  landscaping.push({
    type: "pedestrian_plaza",
    semanticCategory: "Pedestrian Areas",
    name: "Urban Public Piazza",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.45, plotL * 0.18), plotW * 0.12, -plotL * 0.3),
    color: theme.plazaColor,
  });

  // 4. Pocket Park Green Space
  landscaping.push({
    type: "landscaping",
    semanticCategory: "Landscaping",
    name: "Pocket Park Courtyard",
    footprint: translateAndRotatePoly(makeRect(plotW * 0.24, plotL * 0.16), 0, plotL * 0.25),
    color: theme.greenColor,
  });

  return { buildings, landscaping };
}

// Master Layout Generator
export function generateDevelopmentLayout(dev, anchorLat, anchorLon, spatialData = SPATIAL_FEATURES) {
  const type = dev.development_type || dev.type || "residential_compound";
  const theme = DEV_THEMES[type] || DEV_THEMES.residential_compound;

  const floors = Number(dev.floors) || 5;
  const baseHeight = Math.max(10, Math.min(120, floors * 3.4));

  // Determine plot bounds in meters
  const { width: plotW, length: plotL } = computePlotSize(dev);

  // Align grid to dominant road angle
  const roads = spatialData?.roads || [];
  const roadAngle = findDominantRoadAngle(roads, anchorLat, anchorLon, 160);

  // Generate prototype local layout
  let rawLayout;
  switch (type) {
    case "hospital":
      rawLayout = layoutHospital(plotW, plotL, baseHeight, theme);
      break;
    case "school":
      rawLayout = layoutSchool(plotW, plotL, baseHeight, theme);
      break;
    case "mall":
      rawLayout = layoutMall(plotW, plotL, baseHeight, theme);
      break;
    case "office":
      rawLayout = layoutOffice(plotW, plotL, baseHeight, theme);
      break;
    case "mixed_use":
      rawLayout = layoutMixedUse(plotW, plotL, baseHeight, theme);
      break;
    case "residential_compound":
    default:
      rawLayout = layoutResidentialCompound(plotW, plotL, baseHeight, theme);
      break;
  }

  // Rotate entire development to match street angle
  const plotRect = makeRect(plotW + 6, plotL + 6);
  const plotPoly = translateAndRotatePoly(plotRect, 0, 0, roadAngle);

  // Nearby OSM features for collision validation
  const nearbyRoads = getNearbyRoads(anchorLat, anchorLon, 220, spatialData);
  const nearbyBuildings = getNearbyBuildings(anchorLat, anchorLon, 220, spatialData);

  // Rotate and validate every single building footprint
  const validatedBuildings = [];
  for (let i = 0; i < rawLayout.buildings.length; i++) {
    const bldg = rawLayout.buildings[i];
    const rotatedFootprint = translateAndRotatePoly(bldg.footprint, 0, 0, roadAngle);

    // Validate against roads, setbacks, existing buildings, and plot bounds
    const valResult = validateBuildingCandidate(
      rotatedFootprint,
      anchorLat,
      anchorLon,
      nearbyRoads,
      nearbyBuildings,
      plotPoly
    );

    if (valResult.valid) {
      // Also rotate rooftop structures
      const rotatedRooftops = (bldg.rooftops || []).map((roof) => ({
        ...roof,
        footprint: translateAndRotatePoly(roof.footprint, 0, 0, roadAngle),
      }));

      validatedBuildings.push({
        ...bldg,
        footprint: rotatedFootprint,
        rooftops: rotatedRooftops,
      });
    }
  }

  // Rotate landscaping elements
  const validatedLandscaping = rawLayout.landscaping.map((item) => ({
    ...item,
    footprint: translateAndRotatePoly(item.footprint, 0, 0, roadAngle),
  }));

  return {
    developmentId: dev.development_id || dev.id,
    type,
    theme,
    anchorLat,
    anchorLon,
    plotWidth: plotW,
    plotLength: plotL,
    plotPolygon: plotPoly,
    buildings: validatedBuildings,
    landscaping: validatedLandscaping,
    totalGenerated: rawLayout.buildings.length,
    validCount: validatedBuildings.length,
  };
}

// Full placement resolution with nearest valid position adjustment if needed
export function resolveDevelopmentPlacement(dev, targetLat, targetLon, spatialData = SPATIAL_FEATURES) {
  // 1. Check if anchor needs adjustment from road / building
  const validAnchor = findNearestValidPosition(targetLat, targetLon, spatialData, 75, 6);

  if (!validAnchor) {
    return {
      success: false,
      error: "Selected location is occupied by existing infrastructure. Please select an open buildable area.",
    };
  }

  // 2. Generate layout at valid anchor
  const layout = generateDevelopmentLayout(dev, validAnchor.lat, validAnchor.lon, spatialData);

  // If collision filtered out all buildings, try expanding search slightly or reject cleanly
  if (layout.validCount === 0) {
    // Try finding another nearby open spot
    const secondAnchor = findNearestValidPosition(targetLat, targetLon, spatialData, 100, 12);
    if (secondAnchor) {
      const retryLayout = generateDevelopmentLayout(dev, secondAnchor.lat, secondAnchor.lon, spatialData);
      if (retryLayout.validCount > 0) {
        return {
          success: true,
          anchorLat: secondAnchor.lat,
          anchorLon: secondAnchor.lon,
          adjusted: secondAnchor.adjusted,
          layout: retryLayout,
        };
      }
    }

    return {
      success: false,
      error: "Not enough buildable space at this location due to surrounding roads or existing buildings.",
    };
  }

  return {
    success: true,
    anchorLat: validAnchor.lat,
    anchorLon: validAnchor.lon,
    adjusted: validAnchor.adjusted,
    layout,
  };
}
