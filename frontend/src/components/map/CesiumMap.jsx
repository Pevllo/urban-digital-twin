import { useEffect, useRef } from "react";
import {
  Viewer,
  OpenStreetMapImageryProvider,
  ImageryLayer,
  Cartesian3,
  Math as CesiumMath,
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "./CesiumMap.css";

function CesiumMap() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      baseLayer: new ImageryLayer(
        new OpenStreetMapImageryProvider({
          url: "https://tile.openstreetmap.org/",
        })
      ),

      baseLayerPicker: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    viewerRef.current = viewer;

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        31.2357,
        30.0444,
        12000
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
    });

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }

      viewerRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="cesium-map" />;
}

export default CesiumMap;
