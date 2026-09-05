import {
  ImageryLayer,
  OpenStreetMapImageryProvider,
  UrlTemplateImageryProvider,
  Credit,
} from "cesium";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

let cachedGoogleSession = null;
let googleSessionPromise = null;

/**
 * Obtain an official Google Map Tiles API session token for 2D Roadmap tiles.
 * See: https://developers.google.com/maps/documentation/tile/2d-tiles
 */
async function getGoogleRoadmapSession(apiKey) {
  if (cachedGoogleSession && cachedGoogleSession.expiry > Date.now() + 60000) {
    return cachedGoogleSession.token;
  }

  if (googleSessionPromise) {
    return googleSessionPromise;
  }

  googleSessionPromise = (async () => {
    try {
      const response = await fetch(
        `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mapType: "roadmap",
            language: "en-US",
            region: "EG",
            layerTypes: ["layerRoadmap"],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Google Maps API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const sessionToken = data.session;
      const expiry = Date.now() + Number(data.expiry || 3600) * 1000;
      cachedGoogleSession = { token: sessionToken, expiry };
      return sessionToken;
    } finally {
      googleSessionPromise = null;
    }
  })();

  return googleSessionPromise;
}

/**
 * Creates the official Google Maps Roadmap imagery layer or a standard fallback.
 */
export async function createGoogleRoadmapLayer() {
  if (GOOGLE_MAPS_API_KEY) {
    try {
      const sessionToken = await getGoogleRoadmapSession(GOOGLE_MAPS_API_KEY);
      const provider = new UrlTemplateImageryProvider({
        url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${sessionToken}&key=${GOOGLE_MAPS_API_KEY}`,
        credit: new Credit("Map data © Google Maps Platform Map Tiles API"),
        maximumLevel: 22,
      });
      const layer = new ImageryLayer(provider);
      layer.name = "Google Roadmap";
      return { layer, isConfigured: true };
    } catch (err) {
      console.warn("Failed to initialize Google Maps Platform session token, using fallback roadmap:", err);
    }
  }

  // Graceful fallback when Google Maps API key is not configured or session request fails
  const fallbackProvider = new OpenStreetMapImageryProvider({
    url: "https://tile.openstreetmap.org/",
    credit: new Credit("© OpenStreetMap contributors (Configure VITE_GOOGLE_MAPS_API_KEY for Google Maps Platform)"),
  });
  const fallbackLayer = new ImageryLayer(fallbackProvider);
  fallbackLayer.name = "Standard Roadmap (Fallback)";
  return { layer: fallbackLayer, isConfigured: Boolean(GOOGLE_MAPS_API_KEY) };
}

/**
 * Creates the satellite imagery layer.
 */
export function createSatelliteLayer(hasIonToken) {
  if (hasIonToken) {
    const layer = ImageryLayer.fromWorldImagery();
    layer.name = "Cesium World Imagery";
    return layer;
  }
  const fallbackProvider = new OpenStreetMapImageryProvider({
    url: "https://tile.openstreetmap.org/",
  });
  const layer = new ImageryLayer(fallbackProvider);
  layer.name = "OpenStreetMap Base";
  return layer;
}
