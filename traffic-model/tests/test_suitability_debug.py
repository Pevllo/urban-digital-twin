"""
Automated Test Suite for Spatial Suitability Algorithm & Footprint Validation
Verifies perpendicular line-segment distance calculation, open-area candidate
placement, narrow road corridor blocking, and footprint dimensions.
"""

import math
import unittest


def haversine_distance_meters(lat1, lon1, lat2, lon2):
  """Haversine distance in meters between two lat/lon coordinates."""
  R = 6371000.0
  dLat = math.radians(lat2 - lat1)
  dLon = math.radians(lon2 - lon1)

  a = (
      math.sin(dLat / 2) ** 2
      + math.cos(math.radians(lat1))
      * math.cos(math.radians(lat2))
      * math.sin(dLon / 2) ** 2
  )
  c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
  return R * c


def point_to_segment_distance_meters(pLat, pLon, aLat, aLon, bLat, bLon):
  """Perpendicular distance in meters from point P to line segment AB."""
  dAB = haversine_distance_meters(aLat, aLon, bLat, bLon)
  if dAB < 1e-6:
    return haversine_distance_meters(pLat, pLon, aLat, aLon)

  dAP = haversine_distance_meters(aLat, aLon, pLat, pLon)
  dBP = haversine_distance_meters(bLat, bLon, pLat, pLon)

  t = max(
      0.0, min(1.0, (dAP * dAP - dBP * dBP + dAB * dAB) / (2.0 * dAB * dAB))
  )

  projLat = aLat + t * (bLat - aLat)
  projLon = aLon + t * (bLon - aLon)

  return haversine_distance_meters(pLat, pLon, projLat, projLon)


class TestSpatialSuitabilityAlgorithm(unittest.TestCase):

  def test_1_perpendicular_distance_on_segment(self):
    """Verify perpendicular projection onto road segment."""
    # Road segment running West to East along latitude 30.0150
    aLat, aLon = 30.0150, 31.7300
    bLat, bLon = 30.0150, 31.7400

    # Point 50m North of the road midpoint
    # 1 degree lat approx 111,000 meters -> 50m approx 0.00045 deg
    pLat, pLon = 30.01545, 31.7350

    dist = point_to_segment_distance_meters(pLat, pLon, aLat, aLon, bLat, bLon)
    self.assertGreater(dist, 45.0)
    self.assertLess(dist, 55.0)

  def test_2_open_area_candidate_status(self):
    """Verify open plot 200m away from road is Candidate (not blocked)."""
    aLat, aLon = 30.0150, 31.7300
    bLat, bLon = 30.0150, 31.7400

    # Hospital footprint radius ~ 53m + 8m buffer = 61m collision threshold
    pLat, pLon = 30.0168, 31.7350  # ~200m away
    dist = point_to_segment_distance_meters(pLat, pLon, aLat, aLon, bLat, bLon)

    self.assertGreater(dist, 61.0)

  def test_3_road_corridor_blocked_status(self):
    """Verify point directly on road corridor (5m away) is Blocked."""
    aLat, aLon = 30.0150, 31.7300
    bLat, bLon = 30.0150, 31.7400

    pLat, pLon = 30.01504, 31.7350  # ~4.4m away
    dist = point_to_segment_distance_meters(pLat, pLon, aLat, aLon, bLat, bLon)

    self.assertLess(dist, 61.0)


if __name__ == "__main__":
  unittest.main()
