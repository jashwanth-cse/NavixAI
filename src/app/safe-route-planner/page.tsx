"use client";

import Link from "next/link";
import {
  Autocomplete,
  Circle,
  GoogleMap,
  Marker,
  Polyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IncidentEventType,
  IncidentMessageRecord,
  createIncidentMessage,
  ThreatZoneRecord,
  createThreatZone,
  createVehicleNavigation,
  deleteVehicleNavigation,
  subscribeToIncidentMessages,
  subscribeToThreatZones,
  updateVehicleNavigationRoute,
  updateVehicleLiveLocation,
  verifyThreatZone,
} from "@/services/firestore";

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const libraries: "places"[] = ["places"];

type RouteStatus = "idle" | "loading" | "success" | "error";
type VehicleStatus = "Awaiting route" | "In transit" | "Arrived";
type RiskReportType = "suspicious" | "nails" | "unsafe";
type RiskLocationSource = "vehicle" | "map" | "place";
type RiskZoneLevel = "low" | "medium" | "high";
type ThreatZone = {
  id: string;
  center: google.maps.LatLngLiteral;
  radius: number;
  severity: string;
  confidence: number;
  reports: number;
  verifiedBy: string[];
  sourceVehicleId?: string;
  routeKey?: string;
};
type RouteSummary = {
  distanceMeters: number;
  durationSeconds: number;
  distanceText: string;
  durationText: string;
};
type GeneratedRouteOption = {
  label: string;
  path: google.maps.LatLngLiteral[];
  distanceText: string;
  durationSeconds: number;
  durationText: string;
};
type NavigationSnapshot = {
  navigationId: string;
  source: string;
  destination: string;
  routeId: string;
  routeCoordinates: google.maps.LatLngLiteral[];
  routeSummary: RouteSummary | null;
  vehicleIndex: number;
  vehiclePosition: google.maps.LatLngLiteral | null;
};
type CandidateRoute = {
  path: google.maps.LatLngLiteral[];
  waypoint?: google.maps.LatLngLiteral;
  durationSeconds: number;
  distanceMeters: number;
  score: number;
};
type SafeStop = {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  rating?: number;
};
type SafeStopSearchType = "police" | "hospital" | "gas_station" | "parking";

const defaultCenter = { lat: 20.5937, lng: 78.9629 };
const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  fullscreenControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  clickableIcons: false,
  gestureHandling: "greedy",
  styles: [
    { elementType: "geometry", stylers: [{ color: "#151515" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#d6d6d6" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#111111" }] },
    { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#444444" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#2f3740" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c4857" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b2430" }] },
  ],
};

const vehicleMoveIntervalMs = 850;
const vehicleLiveLocationSyncMs = 5000;
const navigationSessionStorageKey = "navix-active-navigation-id";
const navigationStateStorageKey = "navix-active-navigation-state";
const voiceSettingsStorageKey = "navix-voice-settings";
const threatApproachBufferMeters = 0;
const avoidanceBufferMeters = 250;
const candidateBearings = [0, 45, 90, 135, 180, 225, 270, 315];
const maxDecisionLogs = 14;
const routeFields = ["path", "durationMillis", "distanceMeters", "localizedValues"];
const defaultThreatConfidence = 35;
const defaultRiskZoneRadiusMeters = 1000;
const routeRiskScanMeters = 5000;
const safeStopsSearchRadiusMeters = 5000;
const earthRadiusMeters = 6371000;
const safeStopSearchTypes: Array<{ type: SafeStopSearchType; label: string }> = [
  { type: "police", label: "Police" },
  { type: "hospital", label: "Hospital" },
  { type: "gas_station", label: "Fuel" },
  { type: "parking", label: "Truck Parking" },
];
const truckParkingIncludeKeywords = [
  "truck parking",
  "truck lay-by",
  "truck layby",
  "truck rest area",
  "truck stop",
  "freight parking",
  "freight parking area",
  "logistics hub parking",
  "lorry parking",
  "lorry lay-by",
  "lorry layby",
  "hgv parking",
  "heavy vehicle parking",
  "goods vehicle parking",
  "commercial vehicle parking",
  "transport parking",
  "freight terminal parking",
];
const genericParkingExcludeKeywords = [
  "car parking",
  "bike parking",
  "bicycle parking",
  "two wheeler parking",
  "2 wheeler parking",
  "public parking",
  "public parking lot",
  "shopping mall parking",
  "mall parking",
  "parking garage",
  "parking lot",
  "multi level parking",
  "multilevel parking",
  "paid parking",
];
const riskReportTypes: Record<RiskReportType, { label: string; eventType: IncidentEventType }> = {
  suspicious: { label: "Suspicious Activity", eventType: "deviation" },
  nails: { label: "Nails on Road", eventType: "stop" },
  unsafe: { label: "Unsafe Area", eventType: "door" },
};
const riskReportIncrement = 70;

function createRouteId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `route-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createNavigationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `vehicle-${crypto.randomUUID()}`;
  }

  return `vehicle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFutureDepartureTime() {
  return new Date(Date.now() + 2 * 60 * 1000);
}

function getDistanceMeters(start: google.maps.LatLngLiteral, end: google.maps.LatLngLiteral) {
  const startLat = (start.lat * Math.PI) / 180;
  const endLat = (end.lat * Math.PI) / 180;
  const deltaLat = ((end.lat - start.lat) * Math.PI) / 180;
  const deltaLng = ((end.lng - start.lng) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function getBearingRadians(start: google.maps.LatLngLiteral, end: google.maps.LatLngLiteral) {
  const startLat = (start.lat * Math.PI) / 180;
  const endLat = (end.lat * Math.PI) / 180;
  const deltaLng = ((end.lng - start.lng) * Math.PI) / 180;
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);

  return Math.atan2(y, x);
}

function getPointToGeodesicSegmentDistanceMeters(
  point: google.maps.LatLngLiteral,
  segmentStart: google.maps.LatLngLiteral,
  segmentEnd: google.maps.LatLngLiteral
) {
  const segmentLengthMeters = getDistanceMeters(segmentStart, segmentEnd);

  if (segmentLengthMeters === 0) {
    return getDistanceMeters(point, segmentStart);
  }

  const angularDistanceStartToPoint = getDistanceMeters(segmentStart, point) / earthRadiusMeters;
  const bearingStartToPoint = getBearingRadians(segmentStart, point);
  const bearingStartToEnd = getBearingRadians(segmentStart, segmentEnd);
  const crossTrackAngularDistance = Math.asin(
    Math.sin(angularDistanceStartToPoint) * Math.sin(bearingStartToPoint - bearingStartToEnd)
  );
  const alongTrackAngularDistance = Math.acos(
    Math.min(
      1,
      Math.max(
        -1,
        Math.cos(angularDistanceStartToPoint) / Math.cos(crossTrackAngularDistance)
      )
    )
  );
  const alongTrackMeters = alongTrackAngularDistance * earthRadiusMeters;

  if (!Number.isFinite(alongTrackMeters) || alongTrackMeters < 0 || alongTrackMeters > segmentLengthMeters) {
    return Math.min(getDistanceMeters(point, segmentStart), getDistanceMeters(point, segmentEnd));
  }

  return Math.abs(crossTrackAngularDistance) * earthRadiusMeters;
}

function toLatLngLiteral(point: google.maps.LatLngLiteral | google.maps.LatLng | { lat: number; lng: number }) {
  const maybeLat = point.lat;
  const maybeLng = point.lng;

  return {
    lat: typeof maybeLat === "function" ? maybeLat.call(point) : maybeLat,
    lng: typeof maybeLng === "function" ? maybeLng.call(point) : maybeLng,
  };
}

function getPointToSegmentDistanceMeters(
  point: google.maps.LatLngLiteral,
  segmentStart: google.maps.LatLngLiteral,
  segmentEnd: google.maps.LatLngLiteral
) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((point.lat * Math.PI) / 180);
  const px = point.lng * metersPerDegreeLng;
  const py = point.lat * metersPerDegreeLat;
  const ax = segmentStart.lng * metersPerDegreeLng;
  const ay = segmentStart.lat * metersPerDegreeLat;
  const bx = segmentEnd.lng * metersPerDegreeLng;
  const by = segmentEnd.lat * metersPerDegreeLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const closestX = ax + projection * dx;
  const closestY = ay + projection * dy;

  return Math.hypot(px - closestX, py - closestY);
}

function getAvoidanceWaypoint(
  zone: ThreatZone,
  bearingDegrees: number
) {
  const earthRadiusMeters = 6371000;
  const distance = zone.radius + avoidanceBufferMeters;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (zone.center.lat * Math.PI) / 180;
  const lng1 = (zone.center.lng * Math.PI) / 180;
  const angularDistance = distance / earthRadiusMeters;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

function routeTouchesThreatZone(
  path: google.maps.LatLngLiteral[],
  zones: ThreatZone[],
  paddingMeters = 0,
  allowInitialEscape = false
) {
  if (path.length < 2) {
    return false;
  }

  return zones.some((zone) => {
    const limit = zone.radius + paddingMeters;
    let hasExited = !allowInitialEscape || getDistanceMeters(path[0], zone.center) > limit;

    for (let index = 1; index < path.length; index += 1) {
      const point = path[index];
      const previousPoint = path[index - 1];
      const pointDistance = getDistanceMeters(point, zone.center);
      const segmentDistance = getPointToSegmentDistanceMeters(zone.center, previousPoint, point);

      if (!hasExited) {
        if (pointDistance > limit && segmentDistance > limit) {
          hasExited = true;
        }
        continue;
      }

      if (pointDistance <= limit || segmentDistance <= limit) {
        return true;
      }
    }

    return false;
  });
}

function getMinimumZoneClearanceMeters(path: google.maps.LatLngLiteral[], zones: ThreatZone[]) {
  if (!path.length || !zones.length) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(
    ...zones.flatMap((zone) =>
      path.map((point) => getDistanceMeters(point, zone.center) - zone.radius)
    )
  );
}

function getRouteZoneClearanceMeters(path: google.maps.LatLngLiteral[], zone: ThreatZone) {
  if (!path.length) {
    return Number.POSITIVE_INFINITY;
  }

  if (path.length === 1) {
    return getDistanceMeters(path[0], zone.center) - zone.radius;
  }

  let clearanceMeters = Number.POSITIVE_INFINITY;

  for (let index = 1; index < path.length; index += 1) {
    const segmentClearance =
      getPointToGeodesicSegmentDistanceMeters(zone.center, path[index - 1], path[index]) - zone.radius;
    clearanceMeters = Math.min(clearanceMeters, segmentClearance);
  }

  return clearanceMeters;
}

function getThreatExposureWeight(clearanceMeters: number) {
  if (clearanceMeters <= 0) {
    return 1.15;
  }

  if (clearanceMeters <= 500) {
    return 1;
  }

  if (clearanceMeters <= 1000) {
    return 0.65;
  }

  if (clearanceMeters <= routeRiskScanMeters) {
    return 0.65 * (1 - (clearanceMeters - 1000) / (routeRiskScanMeters - 1000));
  }

  return 0;
}

function calculateRouteRiskScore(path: google.maps.LatLngLiteral[], zones: ThreatZone[]) {
  if (!path.length || !zones.length) {
    return 0;
  }

  const exposureScore = zones.reduce((total, zone) => {
    const clearanceMeters = getRouteZoneClearanceMeters(path, zone);
    const exposureWeight = getThreatExposureWeight(clearanceMeters);

    return total + zone.confidence * exposureWeight;
  }, 0);

  return Math.min(100, Math.max(0, Math.round(exposureScore)));
}

function getRouteRiskCategory(risk: number) {
  if (risk <= 30) {
    return {
      label: "Low Risk",
      className: "border-slate-300 bg-slate-50 text-slate-700",
    };
  }

  if (risk <= 70) {
    return {
      label: "Medium Risk",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "High Risk",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  };
}

function getRiskZoneLevel(severity: string): RiskZoneLevel {
  const normalizedSeverity = severity.trim().toLowerCase();

  if (normalizedSeverity === "low") {
    return "low";
  }

  if (normalizedSeverity === "medium" || normalizedSeverity === "moderate") {
    return "medium";
  }

  return "high";
}

function getRiskZoneLevelFromScore(score: number): RiskZoneLevel {
  if (score <= 30) {
    return "low";
  }

  if (score <= 70) {
    return "medium";
  }

  return "high";
}

function getRiskZoneRadiusMeters(level: RiskZoneLevel) {
  switch (level) {
    case "low":
      return 300;
    case "medium":
      return 700;
    case "high":
    default:
      return defaultRiskZoneRadiusMeters;
  }
}

function formatRadiusLabel(radiusMeters: number) {
  if (radiusMeters >= 1000) {
    return `${Number.isInteger(radiusMeters / 1000) ? radiusMeters / 1000 : (radiusMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(radiusMeters)} m`;
}

function formatSafeStopDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.max(1, Math.round(distanceMeters))} m`;
}

function getRiskZoneStyle(level: RiskZoneLevel) {
  switch (level) {
    case "low":
      return {
        label: "Low Risk",
        mapFill: "#9ca3af",
        mapStroke: "#6b7280",
        cardClassName: "border-slate-300 bg-slate-50",
        iconClassName: "border-slate-300 bg-slate-100 text-slate-700",
        badgeClassName: "border-slate-300 bg-white text-slate-700",
        markerFill: "#6b7280",
      };
    case "medium":
      return {
        label: "Medium Risk",
        mapFill: "#facc15",
        mapStroke: "#ca8a04",
        cardClassName: "border-yellow-300 bg-yellow-50",
        iconClassName: "border-yellow-300 bg-yellow-100 text-yellow-700",
        badgeClassName: "border-yellow-300 bg-white text-yellow-700",
        markerFill: "#ca8a04",
      };
    case "high":
    default:
      return {
        label: "High Risk",
        mapFill: "#ef4444",
        mapStroke: "#dc2626",
        cardClassName: "border-red-300 bg-red-50",
        iconClassName: "border-red-200 bg-red-50 text-red-600",
        badgeClassName: "border-red-200 bg-white text-red-700",
        markerFill: "#dc2626",
      };
  }
}

function getRiskZoneMarkerIcon(style: ReturnType<typeof getRiskZoneStyle>): google.maps.Icon {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <path d="M17 41s14-13.2 14-24A14 14 0 1 0 3 17c0 10.8 14 24 14 24Z" fill="${style.markerFill}" stroke="white" stroke-width="3"/>
      <path d="M17 9.5 24.4 23H9.6L17 9.5Z" fill="white" opacity="0.95"/>
      <path d="M17 14.2v4.9" stroke="${style.markerFill}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="17" cy="22.5" r="1.3" fill="${style.markerFill}"/>
    </svg>
  `);

  return {
    url: `data:image/svg+xml;charset=UTF-8,${svg}`,
    scaledSize: new google.maps.Size(34, 42),
    anchor: new google.maps.Point(17, 41),
  };
}

function getSafeStopMarkerIcon(type: string): google.maps.Icon {
  const fill = type === "Hospital" ? "#0f766e" : type === "Police" ? "#2563eb" : type === "Fuel" ? "#16a34a" : "#7c3aed";
  const label = type === "Hospital" ? "H" : type === "Police" ? "P" : type === "Fuel" ? "F" : "S";
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 39s12-11.4 12-23A12 12 0 1 0 4 16c0 11.6 12 23 12 23Z" fill="${fill}" stroke="white" stroke-width="3"/>
      <circle cx="16" cy="16" r="7" fill="white" opacity="0.96"/>
      <text x="16" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="${fill}">${label}</text>
    </svg>
  `);

  return {
    url: `data:image/svg+xml;charset=UTF-8,${svg}`,
    scaledSize: new google.maps.Size(32, 40),
    anchor: new google.maps.Point(16, 39),
  };
}

function getSafeStopSearchText(place: google.maps.places.PlaceResult) {
  return [place.name, ...(place.types ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function isTruckRelevantParking(place: google.maps.places.PlaceResult) {
  const searchText = getSafeStopSearchText(place);
  const hasTruckSignal = truckParkingIncludeKeywords.some((keyword) => searchText.includes(keyword));

  if (!hasTruckSignal) {
    return false;
  }

  return !genericParkingExcludeKeywords.some((keyword) => searchText.includes(keyword));
}

async function fetchSafeStops({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}): Promise<SafeStop[]> {
  const { PlacesService, PlacesServiceStatus } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
  const origin = new google.maps.LatLng(lat, lng);
  const service = new PlacesService(document.createElement("div"));

  const searchByType = ({ type, label }: { type: SafeStopSearchType; label: string }) =>
    new Promise<SafeStop[]>((resolve, reject) => {
      service.nearbySearch(
        {
          location: origin,
          radius: safeStopsSearchRadiusMeters,
          type,
        },
        (results, status) => {
          if (status === PlacesServiceStatus.ZERO_RESULTS) {
            resolve([]);
            return;
          }

          if (status !== PlacesServiceStatus.OK) {
            reject(new Error(`Places Nearby Search failed for ${label.toLowerCase()}.`));
            return;
          }

          resolve(
            (results ?? [])
              .filter((place) => type !== "parking" || isTruckRelevantParking(place))
              .map((place) => {
                const location = place.geometry?.location;

                if (!location || !place.place_id) {
                  return null;
                }

                const position = { lat: location.lat(), lng: location.lng() };

                return {
                  id: place.place_id,
                  name: place.name ?? label,
                  type: label,
                  lat: position.lat,
                  lng: position.lng,
                  distanceMeters: Math.round(getDistanceMeters({ lat, lng }, position)),
                  ...(typeof place.rating === "number" ? { rating: place.rating } : {}),
                };
              })
              .filter((stop): stop is SafeStop => stop !== null)
          );
        }
      );
    });

  const settledResults = await Promise.allSettled(safeStopSearchTypes.map(searchByType));
  const rejectedSearch = settledResults.find((result) => result.status === "rejected");

  if (rejectedSearch?.status === "rejected") {
    throw rejectedSearch.reason instanceof Error
      ? rejectedSearch.reason
      : new Error("Unable to fetch nearby safe stops.");
  }

  const safeStopsById = new Map<string, SafeStop>();

  settledResults.forEach((result) => {
    if (result.status !== "fulfilled") {
      return;
    }

    result.value.forEach((stop) => {
      const currentStop = safeStopsById.get(stop.id);
      if (!currentStop || stop.distanceMeters < currentStop.distanceMeters) {
        safeStopsById.set(stop.id, stop);
      }
    });
  });

  return Array.from(safeStopsById.values())
    .filter((stop) => stop.distanceMeters <= safeStopsSearchRadiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 8);
}

function getRecommendedRouteLabel(
  routes: Array<{ label: string; durationSeconds: number; risk: number }>
) {
  if (!routes.length) {
    return null;
  }

  const fastestDurationSeconds = Math.min(...routes.map((route) => route.durationSeconds));
  const viableRoutes = routes.filter((route) => route.risk < 85);
  const candidateRoutes = viableRoutes.length ? viableRoutes : routes;
  const reasonableEtaLimitSeconds = Math.max(fastestDurationSeconds + 10 * 60, fastestDurationSeconds * 1.15);
  const reasonableEtaRoutes = candidateRoutes.filter(
    (route) => route.durationSeconds <= reasonableEtaLimitSeconds
  );
  const recommendationPool = reasonableEtaRoutes.length ? reasonableEtaRoutes : candidateRoutes;

  return [...recommendationPool].sort((a, b) => a.risk - b.risk || a.durationSeconds - b.durationSeconds)[0].label;
}

function getRouteKey(source: string, destination: string) {
  return `${source.trim().toLowerCase()}__${destination.trim().toLowerCase()}`;
}

function formatThreatLocationLabel(zone: ThreatZone) {
  if (zone.routeKey && !zone.routeKey.includes("__")) {
    return zone.routeKey;
  }

  return `${zone.center.lat.toFixed(4)}, ${zone.center.lng.toFixed(4)}`;
}

function formatThreatDecisionLabel(zone: ThreatZone) {
  if (zone.routeKey) {
    return zone.routeKey.replace(/__/g, " -> ");
  }

  return `lat ${zone.center.lat.toFixed(4)}, lng ${zone.center.lng.toFixed(4)}`;
}

function getConfidenceLabel(confidence: number) {
  if (confidence <= 40) {
    return {
      label: "Low Confidence",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (confidence <= 70) {
    return {
      label: "Medium Confidence",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "High Confidence",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  };
}

function getPrimaryLanguageCode(locale: string) {
  return locale.trim().toLowerCase().split("-")[0] || "en";
}

function getVoiceLanguageLabel(locale: string) {
  const languageCode = getPrimaryLanguageCode(locale);

  switch (languageCode) {
    case "ta":
      return "Tamil";
    case "hi":
      return "Hindi";
    case "te":
      return "Telugu";
    case "ml":
      return "Malayalam";
    case "kn":
      return "Kannada";
    case "mr":
      return "Marathi";
    case "bn":
      return "Bengali";
    case "gu":
      return "Gujarati";
    case "pa":
      return "Punjabi";
    case "ur":
      return "Urdu";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "de":
      return "German";
    case "it":
      return "Italian";
    case "pt":
      return "Portuguese";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "zh":
      return "Chinese";
    case "ar":
      return "Arabic";
    default:
      return "English";
  }
}

function findMatchingVoice(voices: SpeechSynthesisVoice[], locale: string) {
  const normalizedLocale = locale.trim().toLowerCase();
  const primaryLanguageCode = getPrimaryLanguageCode(locale);

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalizedLocale) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(normalizedLocale)) ||
    voices.find((voice) => getPrimaryLanguageCode(voice.lang) === primaryLanguageCode) ||
    null
  );
}

function findClosestCoordinateIndex(
  path: google.maps.LatLngLiteral[],
  target: google.maps.LatLngLiteral | null
) {
  if (!path.length || !target) {
    return 0;
  }

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  path.forEach((point, index) => {
    const distance = getDistanceMeters(point, target);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function formatRouteSummary(distanceMeters: number, durationSeconds: number): RouteSummary {
  return {
    distanceMeters,
    durationSeconds,
    distanceText: distanceMeters ? `${Math.round(distanceMeters / 1000)} km` : "No route",
    durationText: durationSeconds ? `${Math.round(durationSeconds / 60)} min` : "Awaiting route",
  };
}

async function computeRoutes({
  origin,
  destination,
  intermediates,
  computeAlternativeRoutes = false,
}: {
  origin: string | google.maps.LatLngLiteral;
  destination: string | google.maps.LatLngLiteral;
  intermediates?: google.maps.LatLngLiteral[];
  computeAlternativeRoutes?: boolean;
}) {
  const { Route } = (await google.maps.importLibrary("routes")) as unknown as {
    Route: {
      computeRoutes: (request: Record<string, unknown>) => Promise<{ routes?: Array<Record<string, unknown>> }>;
    };
  };
  const response = await Route.computeRoutes({
    origin,
    destination,
    intermediates: intermediates?.map((location) => ({ location, via: true })),
    travelMode: "DRIVING",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    departureTime: getFutureDepartureTime(),
    computeAlternativeRoutes,
    polylineQuality: "HIGH_QUALITY",
    fields: routeFields,
  });
  console.info(`Google Routes API returned ${response.routes?.length ?? 0} route(s).`);

  return (response.routes ?? []).map((route) => {
    const path = ((route.path as Array<google.maps.LatLngLiteral | google.maps.LatLng>) ?? []).map(toLatLngLiteral);
    const distanceMeters = Number(route.distanceMeters ?? 0);
    const durationSeconds = Math.round(Number(route.durationMillis ?? 0) / 1000);

    return {
      path,
      distanceMeters,
      durationSeconds,
      summary: formatRouteSummary(distanceMeters, durationSeconds),
    };
  });
}

function toThreatZone(record: ThreatZoneRecord): ThreatZone {
  return {
    id: record.id,
    center: { lat: record.lat, lng: record.lng },
    radius: record.radius ?? defaultRiskZoneRadiusMeters,
    severity: record.severity,
    confidence: record.confidence ?? defaultThreatConfidence,
    reports: record.reports,
    verifiedBy: record.verifiedBy,
    sourceVehicleId: record.sourceVehicleId,
    routeKey: record.routeKey,
  };
}

function MissingApiKey() {
  return (
    <main className="min-h-screen bg-[#111] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.22),transparent_35%),linear-gradient(135deg,#101820,#151515)]" />
      <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-lg border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20" />
                <path d="m4 10 8-8 8 8" />
              </svg>
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Safe Route Planner</h1>
              <p className="text-sm text-neutral-300">Google Maps is not configured.</p>
            </div>
          </div>
          <p className="text-sm leading-6 text-neutral-300">
            Add <code className="rounded bg-black/40 px-1.5 py-0.5 text-cyan-200">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
            to <code className="rounded bg-black/40 px-1.5 py-0.5 text-cyan-200">.env</code> with Maps JavaScript API,
            Places API, and Directions API enabled.
          </p>
        </div>
      </section>
    </main>
  );
}

function SafeRoutePlanner() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: googleMapsApiKey ?? "",
    libraries,
  });
  const mapRef = useRef<google.maps.Map | null>(null);
  const sourceAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destinationAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const riskLocationAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const threatZoneCreatedRef = useRef(false);
  const reroutedThreatZonesRef = useRef<Set<string>>(new Set());
  const rerouteInFlightRef = useRef(false);
  const restoringNavigationRef = useRef(false);
  const vehicleIndexRef = useRef(0);
  const latestVehiclePositionRef = useRef<google.maps.LatLngLiteral | null>(null);
  const lastSafeStopsRequestKeyRef = useRef("");
  const [navigationId, setNavigationId] = useState("");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [routeCoordinates, setRouteCoordinates] = useState<google.maps.LatLngLiteral[]>([]);
  const [generatedRoutes, setGeneratedRoutes] = useState<GeneratedRouteOption[]>([]);
  const [routeId, setRouteId] = useState("");
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [status, setStatus] = useState<RouteStatus>("idle");
  const [message, setMessage] = useState("");
  const [vehiclePosition, setVehiclePosition] = useState<google.maps.LatLngLiteral | null>(null);
  const [vehicleIndex, setVehicleIndex] = useState(0);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus>("Awaiting route");
  const [syncStatus, setSyncStatus] = useState("Connecting");
  const [syncError, setSyncError] = useState("");
  const [riskScore, setRiskScore] = useState(0);
  const [riskReportOpen, setRiskReportOpen] = useState(false);
  const [riskReportType, setRiskReportType] = useState<RiskReportType>("suspicious");
  const [riskIssueDetails, setRiskIssueDetails] = useState("");
  const [riskLocationSource, setRiskLocationSource] = useState<RiskLocationSource>("vehicle");
  const [riskLocationQuery, setRiskLocationQuery] = useState("");
  const [selectedRiskLocation, setSelectedRiskLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [riskReportMessage, setRiskReportMessage] = useState("");
  const [threatZone, setThreatZone] = useState<ThreatZone | null>(null);
  const [threatZones, setThreatZones] = useState<ThreatZone[]>([]);
  const [incidentMessages, setIncidentMessages] = useState<IncidentMessageRecord[]>([]);
  const [threatZoneStatus, setThreatZoneStatus] = useState("");
  const [threatZoneError, setThreatZoneError] = useState("");
  const [verifyingThreatId, setVerifyingThreatId] = useState("");
  const [threatVerificationMessage, setThreatVerificationMessage] = useState("");
  const [incidentError, setIncidentError] = useState("");
  const [rerouteStatus, setRerouteStatus] = useState("");
  const [driverBriefing, setDriverBriefing] = useState("No active advisories.");
  const [safeStops, setSafeStops] = useState<SafeStop[]>([]);
  const [safeStopsLoading, setSafeStopsLoading] = useState(false);
  const [safeStopsError, setSafeStopsError] = useState("");
  const [safeStopsOpen, setSafeStopsOpen] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [availableVoiceLanguages, setAvailableVoiceLanguages] = useState<string[]>(["en-US"]);
  const [plannerOpen, setPlannerOpen] = useState(true);
  const [advisoryOpen, setAdvisoryOpen] = useState(true);
  const [riskOpen, setRiskOpen] = useState(false);
  const [aiDecisionOpen, setAiDecisionOpen] = useState(false);
  const [aiDecisionLogs, setAiDecisionLogs] = useState<string[]>([
    "Route intelligence standing by. Plan a route to begin monitoring.",
  ]);
  const spokenIncidentIdsRef = useRef<Set<string>>(new Set());
  const spokenThreatZoneIdsRef = useRef<Set<string>>(new Set());

  const routeMeta = useMemo(() => {
    return {
      distance: routeSummary?.distanceText ?? "No route",
      duration: routeSummary?.durationText ?? "Awaiting route",
      coordinateCount: routeCoordinates.length,
    };
  }, [routeCoordinates.length, routeSummary]);
  const routeRiskSummaries = useMemo(
    () =>
      generatedRoutes.map((route) => {
        const risk = calculateRouteRiskScore(route.path, threatZones);

        return {
          label: route.label,
          eta: route.durationText,
          distance: route.distanceText,
          durationSeconds: route.durationSeconds,
          risk,
          riskCategory: getRouteRiskCategory(risk),
        };
      }),
    [generatedRoutes, threatZones]
  );
  const recommendedRouteLabel = useMemo(
    () => getRecommendedRouteLabel(routeRiskSummaries),
    [routeRiskSummaries]
  );
  const selectedRouteLabel = routeRiskSummaries[0]?.label ?? null;

  const routeKey = useMemo(() => getRouteKey(source, destination), [destination, source]);
  const displayedVehiclePosition = vehiclePosition;
  const displayedRouteId = routeId;
  const displayedVehicleStatus = vehicleStatus;
  const relevantThreatZones = useMemo(
    () => threatZones.filter((zone) => zone.sourceVehicleId !== navigationId),
    [navigationId, threatZones]
  );
  const relevantIncident = useMemo(
    () =>
      incidentMessages.find(
        (incident) => incident.routeKey === routeKey && incident.sourceVehicleId !== navigationId
      ) ?? null,
    [incidentMessages, navigationId, routeKey]
  );
  const activeThreatZone = displayedVehiclePosition
    ? relevantThreatZones.find(
        (zone) => getDistanceMeters(displayedVehiclePosition, zone.center) <= zone.radius
      )
    : null;
  const activeThreatConfidence = activeThreatZone ? getConfidenceLabel(activeThreatZone.confidence) : null;
  const activeRiskZoneStyle = activeThreatZone
    ? getRiskZoneStyle(getRiskZoneLevel(activeThreatZone.severity))
    : null;
  const upcomingThreatZone = displayedVehiclePosition
    ? relevantThreatZones
        .map((zone) => ({
          zone,
          distance: getDistanceMeters(displayedVehiclePosition, zone.center),
          routeConflict: routeTouchesThreatZone(
            routeCoordinates.slice(Math.max(vehicleIndex, 0)),
            [zone]
          ),
        }))
        .filter(({ zone, distance, routeConflict }) => routeConflict || distance <= zone.radius + threatApproachBufferMeters)
        .sort((a, b) => a.distance - b.distance)[0]?.zone ?? null
    : null;
  const safeStopTriggerZone = useMemo(() => {
    if (!routeCoordinates.length) {
      return null;
    }

    const routeZoneMatches = relevantThreatZones
      .map((zone) => ({
        zone,
        level: getRiskZoneLevel(zone.severity),
        clearanceMeters: getRouteZoneClearanceMeters(routeCoordinates, zone),
      }))
      .filter(
        ({ level, clearanceMeters }) =>
          (level === "medium" || level === "high") && clearanceMeters <= routeRiskScanMeters
      )
      .sort((a, b) => a.clearanceMeters - b.clearanceMeters);

    return routeZoneMatches[0]?.zone ?? null;
  }, [relevantThreatZones, routeCoordinates]);
  const safeStopsRerouteActive =
    rerouteStatus.startsWith("Evaluating") || rerouteStatus.startsWith("Optimized");
  const safeStopsTriggerId = safeStopTriggerZone?.id ?? (safeStopsRerouteActive ? "reroute" : "");
  const shouldShowSafeStops =
    Boolean(safeStopsTriggerId || safeStops.length || safeStopsLoading || safeStopsError) &&
    Boolean(displayedVehiclePosition || safeStops.length || safeStopsError);
  const currentThreatConfidence = threatZone ? getConfidenceLabel(threatZone.confidence) : null;
  const currentRiskZoneStyle = threatZone
    ? getRiskZoneStyle(getRiskZoneLevel(threatZone.severity))
    : null;
  const riskColor =
    riskScore >= 70
      ? "bg-rose-100 text-rose-700"
    : riskScore >= 40
      ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-700";
  const riskTrackColor =
    riskScore >= 70 ? "bg-red-400" : riskScore >= 40 ? "bg-yellow-300" : "bg-slate-400";

  const vehicleSpeed = useMemo(() => {
    const distanceMeters = routeSummary?.distanceMeters;
    const durationSeconds = routeSummary?.durationSeconds;

    if (!distanceMeters || !durationSeconds) {
      return 0;
    }

    return Math.round((distanceMeters / durationSeconds) * 3.6);
  }, [routeSummary]);

  const truckIcon = useMemo<google.maps.Icon | undefined>(() => {
    if (!isLoaded) {
      return undefined;
    }

    const svg = encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.45"/>
        </filter>
        <g filter="url(#shadow)">
          <rect x="8" y="18" width="22" height="14" rx="3" fill="#22d3ee"/>
          <path d="M30 22h7l5 6v4H30V22Z" fill="#14b8a6"/>
          <path d="M34 24h3.2l2.4 3H34v-3Z" fill="#dcfbff"/>
          <circle cx="15" cy="34" r="4" fill="#081318"/>
          <circle cx="36" cy="34" r="4" fill="#081318"/>
          <circle cx="15" cy="34" r="1.7" fill="#e6fbff"/>
          <circle cx="36" cy="34" r="1.7" fill="#e6fbff"/>
        </g>
      </svg>
    `);

    return {
      url: `data:image/svg+xml;charset=UTF-8,${svg}`,
      scaledSize: new google.maps.Size(42, 42),
      anchor: new google.maps.Point(21, 34),
    };
  }, [isLoaded]);

  const addAiDecisionLog = useCallback((entry: string) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setAiDecisionLogs((currentLogs) => [`${timestamp}  ${entry}`, ...currentLogs].slice(0, maxDecisionLogs));
  }, []);

  const speakText = useCallback(
    (text: string, speechKey: string) => {
      if (!voiceEnabled || spokenThreatZoneIdsRef.current.has(speechKey)) {
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const availableVoices = window.speechSynthesis?.getVoices() ?? [];
      const matchingVoice = findMatchingVoice(availableVoices, voiceLanguage);

      if (matchingVoice) {
        utterance.voice = matchingVoice;
        utterance.lang = matchingVoice.lang;
      } else {
        utterance.lang = getPrimaryLanguageCode(voiceLanguage);
      }

      window.speechSynthesis?.cancel();
      window.speechSynthesis?.speak(utterance);
      spokenThreatZoneIdsRef.current.add(speechKey);
    },
    [voiceEnabled, voiceLanguage]
  );

  const saveNavigationSnapshot = useCallback((snapshot: NavigationSnapshot) => {
    window.sessionStorage.setItem(navigationSessionStorageKey, snapshot.navigationId);
    window.sessionStorage.setItem(navigationStateStorageKey, JSON.stringify(snapshot));
  }, []);

  useEffect(() => {
    if (!relevantIncident) {
      return;
    }

    const incident = relevantIncident;
    let isCancelled = false;

    async function loadBriefing() {
      try {
        const response = await fetch("/api/incident-briefing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: "incident",
            eventType: incident.eventType,
            sourceLabel: incident.sourceLabel,
            destinationLabel: incident.destinationLabel,
            routeKey: incident.routeKey,
            lat: incident.lat,
            lng: incident.lng,
            targetLanguage: voiceLanguage,
          }),
        });
        const payload = (await response.json()) as { narration?: string };

        if (isCancelled) {
          return;
        }

        const nextBriefing =
          payload.narration || "Shared route incident ahead. A safer path is being prepared.";
        setDriverBriefing(nextBriefing);
        addAiDecisionLog(`Driver advisory updated: ${nextBriefing}`);

        if (!voiceEnabled || spokenIncidentIdsRef.current.has(incident.id)) {
          return;
        }

        const utterance = new SpeechSynthesisUtterance(nextBriefing);
        const availableVoices = window.speechSynthesis?.getVoices() ?? [];
        const matchingVoice = findMatchingVoice(availableVoices, voiceLanguage);

        if (matchingVoice) {
          utterance.voice = matchingVoice;
          utterance.lang = matchingVoice.lang;
        } else {
          utterance.lang = getPrimaryLanguageCode(voiceLanguage);
        }

        window.speechSynthesis?.cancel();
        window.speechSynthesis?.speak(utterance);
        spokenIncidentIdsRef.current.add(incident.id);
      } catch {
        if (!isCancelled) {
          setDriverBriefing("Shared route incident ahead. A safer path is being prepared.");
        }
      }
    }

    void loadBriefing();

    return () => {
      isCancelled = true;
    };
  }, [addAiDecisionLog, relevantIncident, voiceEnabled, voiceLanguage]);

  useEffect(() => {
    if (!voiceEnabled) {
      window.speechSynthesis?.cancel();
    }
  }, [voiceEnabled]);

  useEffect(() => {
    try {
      const rawVoiceSettings = window.localStorage.getItem(voiceSettingsStorageKey);

      if (!rawVoiceSettings) {
        return;
      }

      const parsedVoiceSettings = JSON.parse(rawVoiceSettings) as {
        enabled?: boolean;
        language?: string;
      };

      if (typeof parsedVoiceSettings.enabled === "boolean") {
        setVoiceEnabled(parsedVoiceSettings.enabled);
      }

      if (typeof parsedVoiceSettings.language === "string" && parsedVoiceSettings.language.trim()) {
        setVoiceLanguage(parsedVoiceSettings.language);
      }
    } catch {
      window.localStorage.removeItem(voiceSettingsStorageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      voiceSettingsStorageKey,
      JSON.stringify({
        enabled: voiceEnabled,
        language: voiceLanguage,
      })
    );
  }, [voiceEnabled, voiceLanguage]);

  useEffect(() => {
    const storedNavigationId = window.sessionStorage.getItem(navigationSessionStorageKey);
    const storedNavigationState = window.sessionStorage.getItem(navigationStateStorageKey);

    if (!storedNavigationId || !storedNavigationState) {
      setSyncStatus("Waiting");
      return;
    }

    try {
      const snapshot = JSON.parse(storedNavigationState) as NavigationSnapshot;
      restoringNavigationRef.current = true;
      setNavigationId(storedNavigationId);
      setSource(snapshot.source);
      setDestination(snapshot.destination);
      setRouteId(snapshot.routeId);
      setRouteCoordinates(snapshot.routeCoordinates);
      setRouteSummary(snapshot.routeSummary);
      setGeneratedRoutes(
        snapshot.routeCoordinates.length
          ? [
              {
                label: "Route A",
                path: snapshot.routeCoordinates,
                distanceText: snapshot.routeSummary?.distanceText ?? "No route",
                durationSeconds: snapshot.routeSummary?.durationSeconds ?? 0,
                durationText: snapshot.routeSummary?.durationText ?? "Awaiting route",
              },
            ]
          : []
      );
      setVehiclePosition(snapshot.vehiclePosition);
      latestVehiclePositionRef.current = snapshot.vehiclePosition;
      vehicleIndexRef.current = snapshot.vehicleIndex;
      setVehicleIndex(snapshot.vehicleIndex);
      setVehicleStatus("In transit");
      setMessage("Navigation session restored locally.");
      setSyncStatus("Live");
      setAiDecisionLogs(["Navigation restored from browser session. Firestore vehicles contain only lat/lng."]);
    } catch {
      window.sessionStorage.removeItem(navigationSessionStorageKey);
      window.sessionStorage.removeItem(navigationStateStorageKey);
      setSyncStatus("Waiting");
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToThreatZones(
      (zones) => {
        const nextZones = zones.map(toThreatZone);
        setThreatZones(nextZones);
        setThreatZone((currentZone) => {
          if (!currentZone) {
            return null;
          }

          return nextZones.find((zone) => zone.id === currentZone.id) ?? null;
        });
        setThreatZoneError("");
        setThreatVerificationMessage("");
      },
      (error) => {
        setThreatZoneError(error.message);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() ?? [];
      const uniqueLanguagesByCode = new Map<string, string>();

      voices.forEach((voice) => {
        if (!voice.lang) {
          return;
        }

        const languageCode = getPrimaryLanguageCode(voice.lang);

        if (!uniqueLanguagesByCode.has(languageCode)) {
          uniqueLanguagesByCode.set(languageCode, voice.lang);
        }
      });

      const nextLanguages = Array.from(uniqueLanguagesByCode.values());

      if (nextLanguages.length) {
        setAvailableVoiceLanguages(nextLanguages);
        setVoiceLanguage((currentLanguage) =>
          nextLanguages.some(
            (language) =>
              language.toLowerCase() === currentLanguage.toLowerCase() ||
              getPrimaryLanguageCode(language) === getPrimaryLanguageCode(currentLanguage)
          )
            ? currentLanguage
            : nextLanguages[0]
        );
      }
    };

    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToIncidentMessages(
      (messages) => {
        setIncidentMessages(messages);
        setIncidentError("");
      },
      (error) => {
        setIncidentError(error.message);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (riskScore <= 60 || threatZoneCreatedRef.current) {
      return;
    }

    const zoneCenter = selectedRiskLocation ?? displayedVehiclePosition ?? routeCoordinates[0] ?? defaultCenter;
    const riskZoneLevel = getRiskZoneLevelFromScore(riskScore);
    const severity = riskZoneLevel;
    const zoneRadius = getRiskZoneRadiusMeters(riskZoneLevel);
    threatZoneCreatedRef.current = true;
    setThreatZoneStatus("Creating threat zone");

    createThreatZone({
      lat: zoneCenter.lat,
      lng: zoneCenter.lng,
      radius: zoneRadius,
      severity,
      sourceVehicleId: navigationId || undefined,
      routeKey: routeKey || undefined,
    })
      .then((id) => {
        const nextThreatZone = {
          id,
          center: zoneCenter,
          radius: zoneRadius,
          severity,
          confidence: defaultThreatConfidence,
          reports: 1,
          verifiedBy: navigationId ? [navigationId] : [],
          sourceVehicleId: navigationId || undefined,
          routeKey: routeKey || undefined,
        };

        setThreatZone(nextThreatZone);
        setThreatZones((currentZones) =>
          currentZones.some((zone) => zone.id === id) ? currentZones : [...currentZones, nextThreatZone]
        );
        setThreatZoneStatus("Threat zone active");
      })
      .catch((error) => {
        threatZoneCreatedRef.current = false;
        setThreatZoneStatus(error instanceof Error ? error.message : "Unable to create threat zone");
      });
  }, [displayedVehiclePosition, navigationId, riskScore, routeCoordinates, routeKey, selectedRiskLocation]);

  useEffect(() => {
    latestVehiclePositionRef.current = vehiclePosition;
  }, [vehiclePosition]);

  useEffect(() => {
    if (!isLoaded || !safeStopsTriggerId || !displayedVehiclePosition) {
      return;
    }

    const roundedLat = Math.round(displayedVehiclePosition.lat * 100) / 100;
    const roundedLng = Math.round(displayedVehiclePosition.lng * 100) / 100;
    const reroutePhase = safeStopsRerouteActive
      ? rerouteStatus.split(":")[0]
      : "route-risk";
    const requestKey = `${safeStopsTriggerId}:${roundedLat}:${roundedLng}:${reroutePhase}`;

    if (lastSafeStopsRequestKeyRef.current === requestKey) {
      return;
    }

    let isCancelled = false;
    lastSafeStopsRequestKeyRef.current = requestKey;
    setSafeStopsOpen(true);
    setSafeStopsLoading(true);
    setSafeStopsError("");

    fetchSafeStops(displayedVehiclePosition)
      .then((stops) => {
        if (isCancelled) {
          return;
        }

        setSafeStops(stops);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        setSafeStops([]);
        setSafeStopsError(error instanceof Error ? error.message : "Unable to fetch safe stops nearby.");
      })
      .finally(() => {
        if (!isCancelled) {
          setSafeStopsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [displayedVehiclePosition, isLoaded, rerouteStatus, safeStopsRerouteActive, safeStopsTriggerId]);

  useEffect(() => {
    if (!navigationId) {
      return;
    }

    const syncLiveLocation = async () => {
      const latestPosition = latestVehiclePositionRef.current;

      if (!latestPosition) {
        return;
      }

      try {
        await updateVehicleLiveLocation({
          vehicleId: navigationId,
          location: latestPosition,
        });
        setSyncStatus("Live");
        setSyncError("");
      } catch (error) {
        setSyncStatus("Offline");
        setSyncError(error instanceof Error ? error.message : "Unable to sync vehicle location.");
      }
    };

    const timer = window.setInterval(syncLiveLocation, vehicleLiveLocationSyncMs);

    return () => window.clearInterval(timer);
  }, [navigationId]);

  useEffect(() => {
    if (
      !isLoaded ||
      !upcomingThreatZone ||
      !displayedVehiclePosition ||
      !destination.trim() ||
      rerouteInFlightRef.current ||
      reroutedThreatZonesRef.current.has(upcomingThreatZone.id)
    ) {
      return;
    }

    const zoneToAvoid = upcomingThreatZone;
    const vehicleLocation = displayedVehiclePosition;
    const routeStart = routeCoordinates[0] ?? vehicleLocation;
    const startsInsideZone = getDistanceMeters(routeStart, zoneToAvoid.center) <= zoneToAvoid.radius;
    const rerouteOrigin = startsInsideZone && vehicleIndex <= 1 ? routeStart : vehicleLocation;
    const threatDecisionLabel = formatThreatDecisionLabel(zoneToAvoid);
    const threatLocationLabel = formatThreatLocationLabel(zoneToAvoid);
    rerouteInFlightRef.current = true;
    reroutedThreatZonesRef.current.add(zoneToAvoid.id);
    setRerouteStatus("Evaluating safer alternatives");
    setAiDecisionOpen(true);
    addAiDecisionLog(
      startsInsideZone && vehicleIndex <= 1
        ? `High-risk zone at ${threatDecisionLabel} overlaps the route origin. Recomputing from source.`
        : `High-risk zone near ${threatDecisionLabel} detected ahead. Recomputing from the live vehicle position.`
    );

    const zonesToAvoid = relevantThreatZones.length ? relevantThreatZones : [zoneToAvoid];

    const scoreCandidateRoutes = (
      routes: Array<{
        path: google.maps.LatLngLiteral[];
        durationSeconds: number;
        distanceMeters: number;
      }>,
      waypoint?: google.maps.LatLngLiteral
    ) =>
      routes
        .filter((route) => route.path.length > 1)
        .map((route) => ({
          ...route,
          waypoint,
          touchesRisk: routeTouchesThreatZone(route.path, zonesToAvoid, 0, true),
          clearanceMeters: getMinimumZoneClearanceMeters(route.path, zonesToAvoid),
        }))
        .sort((a, b) => {
          if (a.touchesRisk !== b.touchesRisk) {
            return Number(a.touchesRisk) - Number(b.touchesRisk);
          }

          return a.durationSeconds + a.distanceMeters / 25 - (b.durationSeconds + b.distanceMeters / 25);
        });

    async function evaluateRoutes() {
      const directRoutes = scoreCandidateRoutes(
        await computeRoutes({
          origin: rerouteOrigin,
          destination,
          computeAlternativeRoutes: true,
        })
      );
      const directRoute = directRoutes.find((route) => !route.touchesRisk);

      if (directRoute) {
        addAiDecisionLog(
          `Direct alternate found: ${Math.round(directRoute.distanceMeters / 1000)}km, ${Math.round(
            directRoute.durationSeconds / 60
          )}min.`
        );

        return {
          path: directRoute.path,
          durationSeconds: directRoute.durationSeconds,
          distanceMeters: directRoute.distanceMeters,
          score: directRoute.durationSeconds + directRoute.distanceMeters / 25,
        } satisfies CandidateRoute;
      }

      const candidatePromises = candidateBearings.map(async (bearing) => {
        const waypoint = getAvoidanceWaypoint(zoneToAvoid, bearing);
        addAiDecisionLog(
          `Testing ${bearing}deg avoidance corridor outside ${formatRadiusLabel(zoneToAvoid.radius)} zone.`
        );

        const assessedRoutes = scoreCandidateRoutes(
          await computeRoutes({
            origin: rerouteOrigin,
            destination,
            intermediates: [waypoint],
            computeAlternativeRoutes: true,
          }),
          waypoint
        );
        const viableRoute = assessedRoutes.find((route) => !route.touchesRisk) ?? assessedRoutes[0];

        if (!viableRoute) {
          addAiDecisionLog(`Rejected ${bearing}deg corridor: Google returned no usable path.`);
          return null;
        }

        const riskPenalty = viableRoute.touchesRisk ? 100000 - viableRoute.clearanceMeters : 0;
        const score = viableRoute.durationSeconds + viableRoute.distanceMeters / 25 + riskPenalty;

        if (viableRoute.touchesRisk) {
          addAiDecisionLog(
            `Fallback ${bearing}deg corridor: best path still touches the active ${formatRadiusLabel(
              zoneToAvoid.radius
            )} zone, keeping as backup only.`
          );
        } else {
          addAiDecisionLog(
            `Accepted ${bearing}deg corridor: ${Math.round(viableRoute.distanceMeters / 1000)}km, ${Math.round(
              viableRoute.durationSeconds / 60
            )}min traffic ETA.`
          );
        }

        return {
          path: viableRoute.path,
          waypoint,
          durationSeconds: viableRoute.durationSeconds,
          distanceMeters: viableRoute.distanceMeters,
          score,
        } satisfies CandidateRoute;
      });

      const candidates = (await Promise.allSettled(candidatePromises))
        .flatMap((candidate) => (candidate.status === "fulfilled" && candidate.value ? [candidate.value] : []))
        .sort((a, b) => a.score - b.score);

      if (!candidates.length) {
        throw new Error("No safe alternate route found outside current risk zones.");
      }

      return candidates[0];
    }

    evaluateRoutes()
      .then((bestRoute) => {
        const nextRouteId = createRouteId();
        const bounds = new google.maps.LatLngBounds();
        bestRoute.path.forEach((point) => bounds.extend(point));
        const nextVehiclePosition = bestRoute.path[0] ?? rerouteOrigin;

        setRouteCoordinates(bestRoute.path);
        const bestRouteSummary = formatRouteSummary(bestRoute.distanceMeters, bestRoute.durationSeconds);
        setRouteSummary(bestRouteSummary);
        setGeneratedRoutes([
          {
            label: "Route A",
            path: bestRoute.path,
            distanceText: bestRouteSummary.distanceText,
            durationSeconds: bestRouteSummary.durationSeconds,
            durationText: bestRouteSummary.durationText,
          },
        ]);
        setRouteId(nextRouteId);
        setVehiclePosition(nextVehiclePosition);
        latestVehiclePositionRef.current = nextVehiclePosition;
        vehicleIndexRef.current = 0;
        setVehicleIndex(0);
        setVehicleStatus("In transit");
        setStatus("success");
        setMessage("Safer route selected.");
        setRerouteStatus(
          `Optimized reroute: ${Math.round(bestRoute.distanceMeters / 1000)}km / ${Math.round(
            bestRoute.durationSeconds / 60
          )}min`
        );
        addAiDecisionLog(
          `Committed a short traffic-aware reroute around ${threatDecisionLabel}, outside the active ${formatRadiusLabel(
            zoneToAvoid.radius
          )} risk radius.`
        );
        if (navigationId) {
          void updateVehicleNavigationRoute({
            vehicleId: navigationId,
            location: nextVehiclePosition,
          });
          saveNavigationSnapshot({
            navigationId,
            source,
            destination,
            routeId: nextRouteId,
            routeCoordinates: bestRoute.path,
            routeSummary: formatRouteSummary(bestRoute.distanceMeters, bestRoute.durationSeconds),
            vehicleIndex: 0,
            vehiclePosition: nextVehiclePosition,
          });
        }
        void fetch("/api/incident-briefing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: "reroute",
            sourceLabel: source,
            destinationLabel: destination,
            routeKey: zoneToAvoid.routeKey,
            severity: zoneToAvoid.severity,
            radiusKm: Math.round(zoneToAvoid.radius / 1000),
            lat: zoneToAvoid.center.lat,
            lng: zoneToAvoid.center.lng,
            locationLabel: threatLocationLabel,
            targetLanguage: voiceLanguage,
          }),
        })
          .then(async (response) => {
            const payload = (await response.json()) as { narration?: string };
            const rerouteBriefing =
              payload.narration ||
              `Rerouting near ${threatLocationLabel}. ${zoneToAvoid.severity} risk reported within ${formatRadiusLabel(
                zoneToAvoid.radius
              )} ahead.`;
            setDriverBriefing(rerouteBriefing);
            addAiDecisionLog(`Driver reroute advisory: ${rerouteBriefing}`);
            speakText(rerouteBriefing, zoneToAvoid.id);
          })
          .catch(() => {
            const rerouteBriefing = `Rerouting near ${threatLocationLabel}. ${zoneToAvoid.severity} risk reported ahead.`;
            setDriverBriefing(rerouteBriefing);
            speakText(rerouteBriefing, zoneToAvoid.id);
          });
        mapRef.current?.fitBounds(bounds, 72);
      })
      .catch((error) => {
        reroutedThreatZonesRef.current.delete(zoneToAvoid.id);
        const errorMessage = error instanceof Error ? error.message : "Unable to generate alternate route.";
        setRerouteStatus(errorMessage);
        addAiDecisionLog(`Reroute failed: ${errorMessage}`);
      })
      .finally(() => {
        rerouteInFlightRef.current = false;
      });
  }, [
    addAiDecisionLog,
    destination,
    displayedVehiclePosition,
    isLoaded,
    navigationId,
    relevantThreatZones,
    routeCoordinates,
    saveNavigationSnapshot,
    speakText,
    source,
    upcomingThreatZone,
    vehicleIndex,
    voiceLanguage,
  ]);

  useEffect(() => {
    if (!routeCoordinates.length) {
      setVehiclePosition(null);
      vehicleIndexRef.current = 0;
      setVehicleIndex(0);
      setVehicleStatus("Awaiting route");
      return;
    }

    const restoredStartIndex = restoringNavigationRef.current
      ? Math.min(
          findClosestCoordinateIndex(routeCoordinates, latestVehiclePositionRef.current),
          routeCoordinates.length - 1
        )
      : 0;
    restoringNavigationRef.current = false;
    const restoredPosition = latestVehiclePositionRef.current ?? routeCoordinates[restoredStartIndex];

    setVehiclePosition(restoredPosition);
    latestVehiclePositionRef.current = restoredPosition;
    vehicleIndexRef.current = restoredStartIndex;
    setVehicleIndex(restoredStartIndex);
    setVehicleStatus(routeCoordinates.length > 1 ? "In transit" : "Arrived");
    mapRef.current?.panTo(restoredPosition);

    if (routeCoordinates.length < 2 || restoredStartIndex >= routeCoordinates.length - 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setVehicleIndex((currentIndex) => {
        const nextIndex = Math.min(currentIndex + 1, routeCoordinates.length - 1);
        const nextPosition = routeCoordinates[nextIndex];

        setVehiclePosition(nextPosition);
        latestVehiclePositionRef.current = nextPosition;
        vehicleIndexRef.current = nextIndex;
        if (navigationId) {
          saveNavigationSnapshot({
            navigationId,
            source,
            destination,
            routeId,
            routeCoordinates,
            routeSummary,
            vehicleIndex: nextIndex,
            vehiclePosition: nextPosition,
          });
        }

        if (nextIndex === routeCoordinates.length - 1) {
          setVehicleStatus("Arrived");
          window.clearInterval(timer);
        } else {
          setVehicleStatus("In transit");
        }

        return nextIndex;
      });
    }, vehicleMoveIntervalMs);

    return () => window.clearInterval(timer);
  }, [destination, navigationId, routeCoordinates, routeId, routeSummary, saveNavigationSnapshot, source]);

  function handleMapLoad(map: google.maps.Map) {
    mapRef.current = map;

    if (routeCoordinates.length) {
      const bounds = new google.maps.LatLngBounds();
      routeCoordinates.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 72);
    } else if (latestVehiclePositionRef.current) {
      map.panTo(latestVehiclePositionRef.current);
    }
  }

  function handleMapClick(event: google.maps.MapMouseEvent) {
    if (!riskReportOpen || riskLocationSource !== "map" || !event.latLng) {
      return;
    }

    setSelectedRiskLocation({
      lat: event.latLng.lat(),
      lng: event.latLng.lng(),
    });
    setRiskReportMessage("Report location selected.");
  }

  function handlePlaceChanged(kind: "source" | "destination") {
    const autocomplete = kind === "source" ? sourceAutocompleteRef.current : destinationAutocompleteRef.current;
    const place = autocomplete?.getPlace();
    const value = place?.formatted_address || place?.name || "";

    if (kind === "source") {
      setSource(value);
    } else {
      setDestination(value);
    }
  }

  function handleRiskLocationPlaceChanged() {
    const place = riskLocationAutocompleteRef.current?.getPlace();
    const value = place?.formatted_address || place?.name || "";
    const location = place?.geometry?.location;

    setRiskLocationQuery(value);

    if (!location) {
      setSelectedRiskLocation(null);
      setRiskReportMessage("Choose a suggested location.");
      return;
    }

    setSelectedRiskLocation({
      lat: location.lat(),
      lng: location.lng(),
    });
    setRiskReportMessage("Report location selected.");
  }

  async function submitRiskReport() {
    const riskType = riskReportTypes[riskReportType];
    const reportLocation =
      riskLocationSource === "vehicle" ? displayedVehiclePosition : selectedRiskLocation;

    if (riskLocationSource === "map" && !selectedRiskLocation) {
      setRiskReportMessage("Select a location on the map.");
      return;
    }

    if (riskLocationSource === "place" && !selectedRiskLocation) {
      setRiskReportMessage("Choose a suggested location.");
      return;
    }

    if (riskLocationSource === "vehicle" && !displayedVehiclePosition) {
      setRiskReportMessage("Current vehicle location is not available.");
      return;
    }

    if (riskLocationSource === "vehicle") {
      setSelectedRiskLocation(null);
    }

    setRiskScore((currentScore) => Math.min(100, currentScore + riskReportIncrement));
    setRiskReportMessage(`${riskType.label} report submitted.`);
    setRiskReportOpen(false);
    addAiDecisionLog(
      `${riskType.label} risk report submitted${riskIssueDetails.trim() ? `: ${riskIssueDetails.trim()}` : "."}`
    );

    if (!navigationId || !reportLocation || !routeKey) {
      return;
    }

    try {
      await createIncidentMessage({
        sourceVehicleId: navigationId,
        routeKey,
        sourceLabel: source,
        destinationLabel: destination,
        eventType: riskType.eventType,
        lat: reportLocation.lat,
        lng: reportLocation.lng,
      });
    } catch (error) {
      setIncidentError(error instanceof Error ? error.message : "Unable to publish driver advisory.");
    }
  }

  function getVerifiedThreatZone(zone: ThreatZone, vehicleId: string): ThreatZone {
    return {
      ...zone,
      confidence: Math.min(zone.confidence + 25, 100),
      reports: zone.reports + 1,
      verifiedBy: zone.verifiedBy.includes(vehicleId) ? zone.verifiedBy : [...zone.verifiedBy, vehicleId],
    };
  }

  async function handleVerifyThreat(zone: ThreatZone) {
    if (!navigationId) {
      setThreatVerificationMessage("Start navigation to verify");
      return;
    }

    if (zone.verifiedBy.includes(navigationId)) {
      setThreatVerificationMessage("Already verified");
      return;
    }

    const verifiedZone = getVerifiedThreatZone(zone, navigationId);

    setVerifyingThreatId(zone.id);
    setThreatVerificationMessage("");
    setThreatZones((currentZones) =>
      currentZones.map((currentZone) => (currentZone.id === zone.id ? verifiedZone : currentZone))
    );
    setThreatZone((currentZone) => (currentZone?.id === zone.id ? verifiedZone : currentZone));

    try {
      await verifyThreatZone(zone.id, navigationId);
      setThreatZoneError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify threat.";
      setThreatVerificationMessage(message === "Already verified" ? "Already verified" : "");
      setThreatZoneError(message === "Already verified" ? "" : message);
      setThreatZones((currentZones) =>
        currentZones.map((currentZone) => (currentZone.id === zone.id ? zone : currentZone))
      );
      setThreatZone((currentZone) => (currentZone?.id === zone.id ? zone : currentZone));
    } finally {
      setVerifyingThreatId("");
    }
  }

  async function stopNavigation() {
    const currentNavigationId = navigationId;

    threatZoneCreatedRef.current = false;
    reroutedThreatZonesRef.current.clear();
    spokenIncidentIdsRef.current.clear();
    spokenThreatZoneIdsRef.current.clear();
    window.speechSynthesis?.cancel();
    setStatus("idle");
    setMessage("Navigation stopped.");
    setRerouteStatus("");
    setRouteCoordinates([]);
    setGeneratedRoutes([]);
    setRouteSummary(null);
    setRouteId("");
    setVehiclePosition(null);
    latestVehiclePositionRef.current = null;
    vehicleIndexRef.current = 0;
    setVehicleIndex(0);
    setVehicleStatus("Awaiting route");
    setNavigationId("");
    setRiskScore(0);
    setRiskReportOpen(false);
    setRiskReportMessage("");
    setRiskIssueDetails("");
    setRiskLocationQuery("");
    setSelectedRiskLocation(null);
    setRiskLocationSource("vehicle");
    setThreatZone(null);
    setThreatVerificationMessage("");
    setDriverBriefing("No active advisories.");
    setSafeStops([]);
    setSafeStopsError("");
    setSafeStopsLoading(false);
    lastSafeStopsRequestKeyRef.current = "";
    setAiDecisionLogs(["Navigation stopped. Session document removed from Firestore."]);
    window.sessionStorage.removeItem(navigationSessionStorageKey);
    window.sessionStorage.removeItem(navigationStateStorageKey);

    if (currentNavigationId) {
      try {
        await deleteVehicleNavigation(currentNavigationId);
        setSyncStatus("Waiting");
        setSyncError("");
      } catch (error) {
        setSyncStatus("Offline");
        setSyncError(error instanceof Error ? error.message : "Unable to delete navigation session.");
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!source.trim() || !destination.trim()) {
      setStatus("error");
      setMessage("Enter both a source and a destination.");
      return;
    }

    setStatus("loading");
    setMessage("");
    setRerouteStatus("");
    setDriverBriefing("No active advisories.");
    setIncidentError("");
    threatZoneCreatedRef.current = false;
    spokenIncidentIdsRef.current.clear();
    spokenThreatZoneIdsRef.current.clear();
    setRiskScore(0);
    setRiskReportOpen(false);
    setRiskReportMessage("");
    setRiskIssueDetails("");
    setRiskLocationQuery("");
    setSelectedRiskLocation(null);
    setRiskLocationSource("vehicle");
    setThreatZone(null);
    setThreatVerificationMessage("");
    setSafeStops([]);
    setSafeStopsError("");
    setSafeStopsLoading(false);
    lastSafeStopsRequestKeyRef.current = "";
    setAiDecisionLogs(["Route intelligence initialized. Monitoring Firestore threat zones and traffic-aware alternatives."]);
    reroutedThreatZonesRef.current.clear();
    rerouteInFlightRef.current = false;
    setVehiclePosition(null);
    latestVehiclePositionRef.current = null;
    vehicleIndexRef.current = 0;
    setVehicleIndex(0);
    setVehicleStatus("Awaiting route");

    try {
      const routes = await computeRoutes({
        origin: source,
        destination,
        computeAlternativeRoutes: true,
      });
      const primaryRoute = routes[0];
      const path = primaryRoute?.path;

      if (!path?.length) {
        throw new Error("Routes API returned an empty route.");
      }

      const nextRouteId = createRouteId();
      const nextNavigationId = createNavigationId();
      const bounds = new google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));

      if (navigationId) {
        await deleteVehicleNavigation(navigationId).catch(() => undefined);
      }

      await createVehicleNavigation({
        vehicleId: nextNavigationId,
        location: path[0],
      });

      saveNavigationSnapshot({
        navigationId: nextNavigationId,
        source,
        destination,
        routeId: nextRouteId,
        routeCoordinates: path,
        routeSummary: primaryRoute.summary,
        vehicleIndex: 0,
        vehiclePosition: path[0],
      });
      setNavigationId(nextNavigationId);
      setRouteCoordinates(path);
      setRouteSummary(primaryRoute.summary);
      setGeneratedRoutes(
        routes.map((route, index) => ({
          label: `Route ${String.fromCharCode(65 + index)}`,
          path: route.path,
          distanceText: route.summary.distanceText,
          durationSeconds: route.summary.durationSeconds,
          durationText: route.summary.durationText,
        }))
      );
      setRouteId(nextRouteId);
      setStatus("success");
      setMessage("Route rendered correctly.");
      addAiDecisionLog(`Primary route planned with ${path.length} route points. Navigation document ${nextNavigationId.slice(0, 14)} created.`);
      mapRef.current?.fitBounds(bounds, 72);
    } catch (error) {
      setRouteCoordinates([]);
      setGeneratedRoutes([]);
      setRouteSummary(null);
      setRouteId("");
      setVehiclePosition(null);
      setSafeStops([]);
      setSafeStopsError("");
      setSafeStopsLoading(false);
      lastSafeStopsRequestKeyRef.current = "";
      latestVehiclePositionRef.current = null;
      vehicleIndexRef.current = 0;
      setVehicleIndex(0);
      setVehicleStatus("Awaiting route");
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to fetch this route.");
    }
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#101010] text-white">
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#111] text-sm text-neutral-300">
          Loading map...
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#111] px-6 text-center text-sm text-red-200">
          Google Maps could not load. Check the API key, billing, and enabled APIs.
        </div>
      )}

      {isLoaded && (
        <GoogleMap
          mapContainerClassName="h-full w-full"
          center={defaultCenter}
          zoom={routeCoordinates.length ? 11 : 5}
          options={mapOptions}
          onLoad={handleMapLoad}
          onClick={handleMapClick}
        >
          {(generatedRoutes.length > 0 || routeCoordinates.length > 0) && (
            <>
              {(generatedRoutes.length
                ? generatedRoutes
                : [
                    {
                      label: "Route A",
                      path: routeCoordinates,
                      distanceText: routeSummary?.distanceText ?? "No route",
                      durationSeconds: routeSummary?.durationSeconds ?? 0,
                      durationText: routeSummary?.durationText ?? "Awaiting route",
                    },
                  ]
              ).map((route, index) => {
                const isSelected = index === 0;

                return (
                  <Polyline
                    key={route.label}
                    path={route.path}
                    options={{
                      strokeColor: isSelected
                        ? rerouteStatus.includes("Optimized")
                          ? "#22d3ee"
                          : "#14b8a6"
                        : "#64748b",
                      strokeOpacity: isSelected ? 0.95 : 0.48,
                      strokeWeight: isSelected ? 6 : 4,
                      zIndex: isSelected ? 24 : 18,
                    }}
                  />
                );
              })}
              <Marker position={routeCoordinates[0]} label="A" />
              <Marker position={routeCoordinates[routeCoordinates.length - 1]} label="B" />
            </>
          )}

          {displayedVehiclePosition && <Marker position={displayedVehiclePosition} icon={truckIcon} zIndex={40} />}
          {selectedRiskLocation && riskReportOpen && riskLocationSource !== "vehicle" && (
            <Marker position={selectedRiskLocation} label="!" zIndex={45} />
          )}

          {threatZones.map((zone) => {
            const zoneStyle = getRiskZoneStyle(getRiskZoneLevel(zone.severity));

            return (
              <Fragment key={zone.id}>
                <Circle
                  center={zone.center}
                  radius={zone.radius}
                  options={{
                    fillColor: zoneStyle.mapFill,
                    fillOpacity: activeThreatZone?.id === zone.id ? 0.32 : 0.18,
                    strokeColor: zoneStyle.mapStroke,
                    strokeOpacity: activeThreatZone?.id === zone.id ? 1 : 0.75,
                    strokeWeight: activeThreatZone?.id === zone.id ? 3 : 2,
                    zIndex: 30,
                  }}
                />
                <Marker
                  position={zone.center}
                  icon={getRiskZoneMarkerIcon(zoneStyle)}
                  zIndex={activeThreatZone?.id === zone.id ? 46 : 35}
                />
              </Fragment>
            );
          })}

          {safeStops.map((stop) => (
            <Marker
              key={stop.id}
              position={{ lat: stop.lat, lng: stop.lng }}
              icon={getSafeStopMarkerIcon(stop.type)}
              title={`${stop.name} - ${stop.type}`}
              zIndex={38}
            />
          ))}
        </GoogleMap>
      )}

      {activeThreatZone && (
        <section className="pointer-events-none absolute inset-x-0 top-[27rem] z-20 px-4 sm:inset-x-auto sm:left-5 sm:top-[430px] sm:w-[420px] sm:p-0">
          <div
            className={`rounded-lg border p-4 shadow-2xl shadow-slate-900/25 backdrop-blur-2xl ${
              activeRiskZoneStyle?.cardClassName ?? "border-red-300 bg-red-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded border ${
                  activeRiskZoneStyle?.iconClassName ?? "border-red-200 bg-red-50 text-red-600"
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {activeRiskZoneStyle?.label ?? "High Risk"} Zone Ahead
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {activeThreatZone.severity.toUpperCase()} threat within {formatRadiusLabel(activeThreatZone.radius)} radius
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">Confidence: {activeThreatZone.confidence}%</span>
                  <span className={`rounded border px-2 py-0.5 font-semibold ${activeThreatConfidence?.className}`}>
                    {activeThreatConfidence?.label}
                  </span>
                  <span
                    className={`rounded border px-2 py-0.5 font-semibold ${
                      activeRiskZoneStyle?.badgeClassName ?? "border-red-200 bg-white text-red-700"
                    }`}
                  >
                    {activeRiskZoneStyle?.label ?? "High Risk"}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">Verified Reports: {activeThreatZone.reports}</p>
                <button
                  type="button"
                  onClick={() => {
                    void handleVerifyThreat(activeThreatZone);
                  }}
                  disabled={verifyingThreatId === activeThreatZone.id}
                  className="pointer-events-auto mt-3 h-9 rounded border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {verifyingThreatId === activeThreatZone.id ? "Verifying..." : "Verify Threat"}
                </button>
                {threatVerificationMessage && (
                  <p className="mt-2 text-xs font-semibold text-slate-600">{threatVerificationMessage}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-10 px-4 pt-4 pb-24 sm:inset-x-auto sm:left-5 sm:top-5 sm:bottom-5 sm:w-[420px] sm:p-0">
        <div className="pointer-events-auto flex h-full max-h-full flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/78 p-4 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
              >
                Home
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">NavixAI</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Safe Route Planner</h1>
              </div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m16 8-3 8-2-3-3-1 8-4Z" />
              </svg>
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
              <button
                type="button"
                onClick={() => setPlannerOpen((isOpen) => !isOpen)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">
                    Route Planner
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-slate-900">
                    Search and control navigation
                  </span>
                </span>
                <span className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-sky-700">
                  {plannerOpen ? "Hide" : "Open"}
                </span>
              </button>

              {plannerOpen && (
                <div className="mt-3 space-y-4">
                  <form className="space-y-3" onSubmit={handleSubmit}>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-600">Source</span>
                      {isLoaded ? (
                        <Autocomplete
                          onLoad={(autocomplete) => {
                            sourceAutocompleteRef.current = autocomplete;
                          }}
                          onPlaceChanged={() => handlePlaceChanged("source")}
                        >
                          <input
                            value={source}
                            onChange={(event) => setSource(event.target.value)}
                            placeholder="Search pickup location"
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white"
                          />
                        </Autocomplete>
                      ) : (
                        <input
                          disabled
                          placeholder="Loading Places..."
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400"
                        />
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-600">Destination</span>
                      {isLoaded ? (
                        <Autocomplete
                          onLoad={(autocomplete) => {
                            destinationAutocompleteRef.current = autocomplete;
                          }}
                          onPlaceChanged={() => handlePlaceChanged("destination")}
                        >
                          <input
                            value={destination}
                            onChange={(event) => setDestination(event.target.value)}
                            placeholder="Search dropoff location"
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white"
                          />
                        </Autocomplete>
                      ) : (
                        <input
                          disabled
                          placeholder="Loading Places..."
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400"
                        />
                      )}
                    </label>

                    <button
                      type="submit"
                      disabled={!isLoaded || status === "loading"}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {status === "loading" ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                          Fetching route
                        </>
                      ) : (
                        <>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14" />
                            <path d="m13 5 7 7-7 7" />
                          </svg>
                          Plan route
                        </>
                      )}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={stopNavigation}
                    disabled={!navigationId && !routeCoordinates.length}
                    className="flex h-10 w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Stop Navigation
                  </button>

                  {message && (
                    <p className={`text-xs ${status === "error" ? "text-rose-600" : "text-slate-600"}`}>
                      {message}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                      <p className="text-[11px] text-slate-500">Distance</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{routeMeta.distance}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                      <p className="text-[11px] text-slate-500">Duration</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{routeMeta.duration}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                      <p className="text-[11px] text-slate-500">Coords</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{routeMeta.coordinateCount}</p>
                    </div>
                  </div>

                  {routeRiskSummaries.length > 0 && (
                    <div className="space-y-2">
                      {routeRiskSummaries.map((route) => {
                        const isRecommended = route.label === recommendedRouteLabel;
                        const isSelected = route.label === selectedRouteLabel;

                        return (
                          <div
                            key={route.label}
                            className={`rounded-xl border px-3 py-2 text-xs ${
                              isSelected
                                ? "border-teal-300 bg-teal-50 text-slate-700 shadow-sm"
                                : "border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-slate-900">Route ID: {route.label}</span>
                              <span>ETA: {route.eta}</span>
                            </div>
                            <div className="mt-1 font-medium text-slate-600">Distance: {route.distance}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-slate-700">
                              <span>Risk: {route.risk}</span>
                              <span className={`rounded border px-2 py-0.5 ${route.riskCategory.className}`}>
                                {route.riskCategory.label}
                              </span>
                              {isSelected && (
                                <span className="rounded border border-teal-200 bg-white px-2 py-0.5 text-teal-700">
                                  Default Selected
                                </span>
                              )}
                              {isRecommended && (
                                <span className="rounded border border-sky-200 bg-white px-2 py-0.5 text-sky-700">
                                  Recommended Route
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
              <button
                type="button"
                onClick={() => setAdvisoryOpen((isOpen) => !isOpen)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">Driver Advisory</span>
                  <span className="mt-1 block text-sm font-semibold text-slate-900">Shared route intelligence</span>
                </span>
                <span className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-sky-700">
                  {advisoryOpen ? "Hide" : "Open"}
                </span>
              </button>

              {advisoryOpen && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm leading-6 text-slate-700">{driverBriefing}</p>
                    <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={voiceEnabled}
                        onChange={(event) => setVoiceEnabled(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      Voice
                    </label>
                  </div>
                  {voiceEnabled && (
                    <select
                      value={voiceLanguage}
                      onChange={(event) => setVoiceLanguage(event.target.value)}
                      className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
                    >
                      {availableVoiceLanguages.map((language) => (
                        <option key={language} value={language}>
                          {getVoiceLanguageLabel(language)}
                        </option>
                      ))}
                    </select>
                  )}
                  {incidentError && <p className="mt-2 text-xs text-rose-600">{incidentError}</p>}
                </div>
              )}
            </div>

            {shouldShowSafeStops && (
              <div className="rounded-2xl border border-emerald-200 bg-white/85 p-3">
                <button
                  type="button"
                  onClick={() => setSafeStopsOpen((isOpen) => !isOpen)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/80">
                      Safe Stops
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-slate-900">
                      Nearby driver options
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      {safeStopsLoading ? "..." : safeStops.length}
                    </span>
                    <span className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-emerald-700">
                      {safeStopsOpen ? "Hide" : "Open"}
                    </span>
                  </div>
                </button>

                {safeStopsOpen && (
                  <div className="mt-3">
                    {safeStopsLoading && (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Finding safe stops within 5 km
                      </div>
                    )}

                    {!safeStopsLoading && safeStopsError && (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                        {safeStopsError}
                      </p>
                    )}

                    {!safeStopsLoading && !safeStopsError && safeStops.length === 0 && (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                        No safe stops found nearby.
                      </p>
                    )}

                    {!safeStopsLoading && !safeStopsError && safeStops.length > 0 && (
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {safeStops.map((stop) => (
                          <div
                            key={stop.id}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{stop.name}</p>
                                <p className="mt-1 font-medium text-emerald-700">{stop.type}</p>
                              </div>
                              <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                                {formatSafeStopDistance(stop.distanceMeters)}
                              </span>
                            </div>
                            {typeof stop.rating === "number" && (
                              <p className="mt-1 text-slate-500">Rating: {stop.rating.toFixed(1)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
              <button
                type="button"
                onClick={() => setRiskOpen((isOpen) => !isOpen)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">Risk</span>
                  <span className="mt-1 block text-sm font-semibold text-slate-900">Event Report</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${riskColor}`}>{riskScore}/100</span>
                  <span className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-sky-700">
                    {riskOpen ? "Hide" : "Open"}
                  </span>
                </div>
              </button>

              {riskOpen && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${riskTrackColor}`}
                      style={{ width: `${riskScore}%` }}
                    />
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setRiskReportOpen((isOpen) => !isOpen);
                        setRiskReportMessage("");
                      }}
                      className="flex h-10 w-full items-center justify-center rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      + Add Risk Report
                    </button>

                    {riskReportOpen && (
                      <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-medium text-slate-500">Risk Type</span>
                          <select
                            value={riskReportType}
                            onChange={(event) => setRiskReportType(event.target.value as RiskReportType)}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
                          >
                            {(Object.keys(riskReportTypes) as RiskReportType[]).map((type) => (
                              <option key={type} value={type}>
                                {riskReportTypes[type].label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-medium text-slate-500">Issue Details</span>
                          <textarea
                            value={riskIssueDetails}
                            onChange={(event) => setRiskIssueDetails(event.target.value)}
                            placeholder="Type the issue manually"
                            rows={3}
                            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400"
                          />
                        </label>

                        <div>
                          <span className="mb-1.5 block text-[11px] font-medium text-slate-500">Location Source</span>
                          <div className="grid grid-cols-1 gap-2">
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              <input
                                type="radio"
                                name="risk-location-source"
                                checked={riskLocationSource === "vehicle"}
                                onChange={() => {
                                  setRiskLocationSource("vehicle");
                                  setSelectedRiskLocation(null);
                                  setRiskReportMessage("");
                                }}
                                className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                              />
                              Use Current Vehicle Location
                            </label>
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              <input
                                type="radio"
                                name="risk-location-source"
                                checked={riskLocationSource === "map"}
                                onChange={() => {
                                  setRiskLocationSource("map");
                                  setSelectedRiskLocation(null);
                                  setRiskReportMessage("Select a location on the map.");
                                }}
                                className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                              />
                              Select Location On Map
                            </label>
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              <input
                                type="radio"
                                name="risk-location-source"
                                checked={riskLocationSource === "place"}
                                onChange={() => {
                                  setRiskLocationSource("place");
                                  setSelectedRiskLocation(null);
                                  setRiskReportMessage("");
                                }}
                                className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                              />
                              Type Location Name
                            </label>
                          </div>
                        </div>

                        {riskLocationSource === "place" && (
                          <label className="block">
                            <span className="mb-1.5 block text-[11px] font-medium text-slate-500">Location Name</span>
                            {isLoaded ? (
                              <Autocomplete
                                onLoad={(autocomplete) => {
                                  riskLocationAutocompleteRef.current = autocomplete;
                                }}
                                onPlaceChanged={handleRiskLocationPlaceChanged}
                              >
                                <input
                                  value={riskLocationQuery}
                                  onChange={(event) => {
                                    setRiskLocationQuery(event.target.value);
                                    setSelectedRiskLocation(null);
                                  }}
                                  placeholder="Search risk location"
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400"
                                />
                              </Autocomplete>
                            ) : (
                              <input
                                disabled
                                placeholder="Loading Places..."
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400"
                              />
                            )}
                          </label>
                        )}

                        {riskLocationSource === "map" && selectedRiskLocation && (
                          <p className="text-xs text-slate-500">
                            Selected: {selectedRiskLocation.lat.toFixed(4)}, {selectedRiskLocation.lng.toFixed(4)}
                          </p>
                        )}
                        {riskLocationSource === "map" && (
                          <p className="text-xs text-slate-500">
                            {selectedRiskLocation
                              ? "Click another point on the map to change this location."
                              : "Click a point on the map to place the report marker."}
                          </p>
                        )}
                        {riskLocationSource === "place" && selectedRiskLocation && (
                          <p className="text-xs text-slate-500">
                            Selected: {selectedRiskLocation.lat.toFixed(4)}, {selectedRiskLocation.lng.toFixed(4)}
                          </p>
                        )}

                      <button
                        type="button"
                        onClick={() => {
                          void submitRiskReport();
                        }}
                          className="h-10 w-full rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                      >
                          Submit Report
                      </button>
                      </div>
                    )}

                    {riskReportMessage && <p className="mt-2 text-xs text-slate-600">{riskReportMessage}</p>}
                  </div>

                  <div
                    className={`mt-3 rounded-xl border p-3 text-xs text-slate-600 ${
                      currentRiskZoneStyle?.cardClassName ?? "border-slate-200 bg-slate-50"
                    }`}
                  >
                    {threatZone ? (
                      <>
                        <div className="font-semibold text-slate-800">
                          {currentRiskZoneStyle?.label ?? "High Risk"} zone: {formatRadiusLabel(threatZone.radius)} radius
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span>Confidence: {threatZone.confidence}%</span>
                          <span className={`rounded border px-2 py-0.5 font-semibold ${currentThreatConfidence?.className}`}>
                            {currentThreatConfidence?.label}
                          </span>
                          <span
                            className={`rounded border px-2 py-0.5 font-semibold ${
                              currentRiskZoneStyle?.badgeClassName ?? "border-red-200 bg-white text-red-700"
                            }`}
                          >
                            {currentRiskZoneStyle?.label ?? "High Risk"}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-500">Verified Reports: {threatZone.reports}</div>
                      </>
                    ) : (
                      threatZoneStatus || "Risk zone triggers above 60 risk."
                    )}
                    {threatZoneError && <div className="mt-1 break-words text-rose-600">{threatZoneError}</div>}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
              <button
                type="button"
                onClick={() => setAiDecisionOpen((isOpen) => !isOpen)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">
                    AI Decision Center
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-slate-900">
                    Dynamic routing intelligence
                  </span>
                </span>
                <span className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-sky-700">
                  {aiDecisionOpen ? "Hide" : "Open"}
                </span>
              </button>

              {aiDecisionOpen && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <p className="text-slate-500">Route</p>
                      <p className="mt-1 break-all font-mono text-sky-700">{displayedRouteId || "Not assigned"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <p className="text-slate-500">Decision</p>
                      <p className="mt-1 text-slate-700">{rerouteStatus || "Monitoring"}</p>
                    </div>
                  </div>

                  <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {aiDecisionLogs.map((log, index) => (
                      <div key={`${log}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-72 sm:p-0">
        <div className="pointer-events-auto rounded-2xl border border-white/60 bg-white/78 p-4 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">Vehicle</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Truck Unit</h2>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 17h4V5H2v12h3" />
                <path d="M14 17h1" />
                <path d="M14 8h4l4 5v4h-3" />
                <circle cx="7.5" cy="17.5" r="2.5" />
                <circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <p className="text-[11px] text-slate-500">Speed</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{vehicleSpeed ? `${vehicleSpeed} km/h` : "--"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <p className="text-[11px] text-slate-500">Status</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{displayedVehicleStatus}</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {routeCoordinates.length > 0
              ? `Waypoint ${vehicleIndex + 1} of ${routeCoordinates.length}`
              : "Plan a route to start simulation."}
            {rerouteStatus && <div className="mt-1 text-sky-700">{rerouteStatus}</div>}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Firestore</span>
              <span className={syncStatus === "Offline" ? "text-rose-600" : "text-sky-700"}>{syncStatus}</span>
            </div>
            <div className="mt-1 truncate text-slate-500">
              {navigationId ? `Vehicle ${navigationId.slice(0, 18)}` : "Live location only"}
            </div>
            {syncError && <div className="mt-1 break-words text-rose-600">{syncError}</div>}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function SafeRoutePlannerPage() {
  if (!googleMapsApiKey) {
    return <MissingApiKey />;
  }

  return <SafeRoutePlanner />;
}
