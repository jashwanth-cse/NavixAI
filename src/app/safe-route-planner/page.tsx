"use client";

import {
  Autocomplete,
  Circle,
  GoogleMap,
  Marker,
  Polyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "@/services/firestore";

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const libraries: "places"[] = ["places"];

type RouteStatus = "idle" | "loading" | "success" | "error";
type VehicleStatus = "Awaiting route" | "In transit" | "Arrived";
type RiskEvent = "door" | "stop" | "deviation";
type ThreatZone = {
  id: string;
  center: google.maps.LatLngLiteral;
  radius: number;
  severity: string;
  sourceVehicleId?: string;
  routeKey?: string;
};
type RouteSummary = {
  distanceMeters: number;
  durationSeconds: number;
  distanceText: string;
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
const threatApproachBufferMeters = 0;
const avoidanceBufferMeters = 250;
const candidateBearings = [0, 45, 90, 135, 180, 225, 270, 315];
const maxDecisionLogs = 14;
const routeFields = ["path", "durationMillis", "distanceMeters", "localizedValues"];
const riskEvents: Record<RiskEvent, { label: string; increment: number }> = {
  door: { label: "Trigger Door Open", increment: 18 },
  stop: { label: "Trigger Stop", increment: 24 },
  deviation: { label: "Trigger Deviation", increment: 35 },
};

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
  const earthRadiusMeters = 6371000;
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

function getRouteKey(source: string, destination: string) {
  return `${source.trim().toLowerCase()}__${destination.trim().toLowerCase()}`;
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
    radius: record.radius,
    severity: record.severity,
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
  const threatZoneCreatedRef = useRef(false);
  const reroutedThreatZonesRef = useRef<Set<string>>(new Set());
  const rerouteInFlightRef = useRef(false);
  const restoringNavigationRef = useRef(false);
  const vehicleIndexRef = useRef(0);
  const latestVehiclePositionRef = useRef<google.maps.LatLngLiteral | null>(null);
  const [navigationId, setNavigationId] = useState("");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [routeCoordinates, setRouteCoordinates] = useState<google.maps.LatLngLiteral[]>([]);
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
  const [threatZone, setThreatZone] = useState<ThreatZone | null>(null);
  const [threatZones, setThreatZones] = useState<ThreatZone[]>([]);
  const [incidentMessages, setIncidentMessages] = useState<IncidentMessageRecord[]>([]);
  const [threatZoneStatus, setThreatZoneStatus] = useState("");
  const [threatZoneError, setThreatZoneError] = useState("");
  const [incidentError, setIncidentError] = useState("");
  const [rerouteStatus, setRerouteStatus] = useState("");
  const [driverBriefing, setDriverBriefing] = useState("No active advisories.");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [availableVoiceLanguages, setAvailableVoiceLanguages] = useState<string[]>(["en-US"]);
  const [aiDecisionOpen, setAiDecisionOpen] = useState(false);
  const [aiDecisionLogs, setAiDecisionLogs] = useState<string[]>([
    "Route intelligence standing by. Plan a route to begin monitoring.",
  ]);
  const spokenIncidentIdsRef = useRef<Set<string>>(new Set());

  const routeMeta = useMemo(() => {
    return {
      distance: routeSummary?.distanceText ?? "No route",
      duration: routeSummary?.durationText ?? "Awaiting route",
      coordinateCount: routeCoordinates.length,
    };
  }, [routeCoordinates.length, routeSummary]);

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
  const riskColor =
    riskScore >= 70
      ? "bg-rose-100 text-rose-700"
      : riskScore >= 40
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";
  const riskTrackColor =
    riskScore >= 70 ? "bg-red-400" : riskScore >= 40 ? "bg-yellow-300" : "bg-emerald-300";

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

  const saveNavigationSnapshot = useCallback((snapshot: NavigationSnapshot) => {
    window.sessionStorage.setItem(navigationSessionStorageKey, snapshot.navigationId);
    window.sessionStorage.setItem(navigationStateStorageKey, JSON.stringify(snapshot));
  }, []);

  useEffect(() => {
    if (!relevantIncident) {
      setDriverBriefing("No active advisories.");
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
            eventType: incident.eventType,
            sourceLabel: incident.sourceLabel,
            destinationLabel: incident.destinationLabel,
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
        const matchingVoice = window.speechSynthesis
          ?.getVoices()
          .find((voice) => voice.lang.toLowerCase().startsWith(voiceLanguage.toLowerCase()));

        if (matchingVoice) {
          utterance.voice = matchingVoice;
          utterance.lang = matchingVoice.lang;
        } else {
          utterance.lang = voiceLanguage;
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

          return nextZones.some((zone) => zone.id === currentZone.id) ? currentZone : null;
        });
        setThreatZoneError("");
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
      const nextLanguages = Array.from(
        new Set(voices.map((voice) => voice.lang).filter((lang) => Boolean(lang)))
      );

      if (nextLanguages.length) {
        setAvailableVoiceLanguages(nextLanguages);
        setVoiceLanguage((currentLanguage) =>
          nextLanguages.includes(currentLanguage) ? currentLanguage : nextLanguages[0]
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

    const zoneCenter = displayedVehiclePosition ?? routeCoordinates[0] ?? defaultCenter;
    const severity = riskScore >= 80 ? "critical" : "high";
    threatZoneCreatedRef.current = true;
    setThreatZoneStatus("Creating threat zone");

    createThreatZone({
      lat: zoneCenter.lat,
      lng: zoneCenter.lng,
      radius: 2000,
      severity,
      sourceVehicleId: navigationId || undefined,
      routeKey: routeKey || undefined,
    })
      .then((id) => {
        const nextThreatZone = {
          id,
          center: zoneCenter,
          radius: 2000,
          severity,
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
  }, [displayedVehiclePosition, navigationId, riskScore, routeCoordinates, routeKey]);

  useEffect(() => {
    latestVehiclePositionRef.current = vehiclePosition;
  }, [vehiclePosition]);

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
    rerouteInFlightRef.current = true;
    reroutedThreatZonesRef.current.add(zoneToAvoid.id);
    setRerouteStatus("Evaluating safer alternatives");
    setAiDecisionOpen(true);
    addAiDecisionLog(
      startsInsideZone && vehicleIndex <= 1
        ? `Threat ${zoneToAvoid.id.slice(0, 6)} overlaps the route origin. Recomputing from source.`
        : `Threat ${zoneToAvoid.id.slice(0, 6)} detected ahead. Recomputing from the live vehicle position.`
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
        addAiDecisionLog(`Testing ${bearing}deg avoidance corridor outside ${Math.round(zoneToAvoid.radius)}m zone.`);

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
            `Fallback ${bearing}deg corridor: best path still touches the active 2km zone, keeping as backup only.`
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
        throw new Error("No safe alternate route found outside current 2km threat zones.");
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
        setRouteSummary(formatRouteSummary(bestRoute.distanceMeters, bestRoute.durationSeconds));
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
          `Committed a short traffic-aware reroute that stays outside the active 2km risk radius.`
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
    source,
    upcomingThreatZone,
    vehicleIndex,
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

  async function triggerRiskEvent(eventType: RiskEvent) {
    setRiskScore((currentScore) => Math.min(100, currentScore + riskEvents[eventType].increment));
    addAiDecisionLog(`${riskEvents[eventType].label} captured for this vehicle.`);

    if (!navigationId || !displayedVehiclePosition || !routeKey) {
      return;
    }

    try {
      await createIncidentMessage({
        sourceVehicleId: navigationId,
        routeKey,
        sourceLabel: source,
        destinationLabel: destination,
        eventType: eventType as IncidentEventType,
        lat: displayedVehiclePosition.lat,
        lng: displayedVehiclePosition.lng,
      });
    } catch (error) {
      setIncidentError(error instanceof Error ? error.message : "Unable to publish driver advisory.");
    }
  }

  async function stopNavigation() {
    const currentNavigationId = navigationId;

    threatZoneCreatedRef.current = false;
    reroutedThreatZonesRef.current.clear();
    spokenIncidentIdsRef.current.clear();
    window.speechSynthesis?.cancel();
    setStatus("idle");
    setMessage("Navigation stopped.");
    setRerouteStatus("");
    setRouteCoordinates([]);
    setRouteSummary(null);
    setRouteId("");
    setVehiclePosition(null);
    latestVehiclePositionRef.current = null;
    vehicleIndexRef.current = 0;
    setVehicleIndex(0);
    setVehicleStatus("Awaiting route");
    setNavigationId("");
    setRiskScore(0);
    setThreatZone(null);
    setDriverBriefing("No active advisories.");
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
    setRiskScore(0);
    setThreatZone(null);
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
        computeAlternativeRoutes: false,
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
      setRouteId(nextRouteId);
      setStatus("success");
      setMessage("Route rendered correctly.");
      addAiDecisionLog(`Primary route planned with ${path.length} route points. Navigation document ${nextNavigationId.slice(0, 14)} created.`);
      mapRef.current?.fitBounds(bounds, 72);
    } catch (error) {
      setRouteCoordinates([]);
      setRouteSummary(null);
      setRouteId("");
      setVehiclePosition(null);
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
        >
          {routeCoordinates.length > 0 && (
            <>
              <Polyline
                path={routeCoordinates}
                options={{
                  strokeColor: rerouteStatus.includes("Optimized") ? "#22d3ee" : "#14b8a6",
                  strokeOpacity: 0.92,
                  strokeWeight: 6,
                  zIndex: 20,
                }}
              />
              <Marker position={routeCoordinates[0]} label="A" />
              <Marker position={routeCoordinates[routeCoordinates.length - 1]} label="B" />
            </>
          )}

          {displayedVehiclePosition && <Marker position={displayedVehiclePosition} icon={truckIcon} zIndex={40} />}

          {threatZones.map((zone) => (
            <Circle
              key={zone.id}
              center={zone.center}
              radius={zone.radius}
              options={{
                fillColor: "#ef4444",
                fillOpacity: activeThreatZone?.id === zone.id ? 0.32 : 0.18,
                strokeColor: "#f87171",
                strokeOpacity: activeThreatZone?.id === zone.id ? 1 : 0.75,
                strokeWeight: activeThreatZone?.id === zone.id ? 3 : 2,
                zIndex: 30,
              }}
            />
          ))}
        </GoogleMap>
      )}

      {activeThreatZone && (
        <section className="pointer-events-none absolute inset-x-0 top-[27rem] z-20 px-4 sm:inset-x-auto sm:left-5 sm:top-[430px] sm:w-[420px] sm:p-0">
          <div className="animate-pulse rounded-lg border border-red-300/50 bg-red-500/20 p-4 shadow-2xl shadow-red-950/40 backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded border border-red-200/40 bg-red-300/20 text-red-100">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-red-50">High Risk Zone Ahead</p>
                <p className="mt-1 text-xs text-red-100/80">
                  {activeThreatZone.severity.toUpperCase()} threat within {Math.round(activeThreatZone.radius / 1000)}km radius
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-4 sm:inset-x-auto sm:left-5 sm:top-5 sm:w-[420px] sm:p-0">
        <div className="pointer-events-auto rounded-2xl border border-white/60 bg-white/72 p-4 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">NavixAI</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Safe Route Planner</h1>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m16 8-3 8-2-3-3-1 8-4Z" />
              </svg>
            </span>
          </div>

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
            className="mt-3 flex h-10 w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Stop Navigation
          </button>

          {message && (
            <p className={`mt-3 text-xs ${status === "error" ? "text-rose-600" : "text-slate-600"}`}>
              {message}
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-slate-200 bg-white/80 px-2 py-2">
              <p className="text-[11px] text-slate-500">Distance</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{routeMeta.distance}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 px-2 py-2">
              <p className="text-[11px] text-slate-500">Duration</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{routeMeta.duration}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 px-2 py-2">
              <p className="text-[11px] text-slate-500">Coords</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{routeMeta.coordinateCount}</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">Driver Advisory</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Shared route intelligence</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={voiceEnabled}
                  onChange={(event) => setVoiceEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Voice
              </label>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{driverBriefing}</p>
            {voiceEnabled && (
              <select
                value={voiceLanguage}
                onChange={(event) => setVoiceLanguage(event.target.value)}
                className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
              >
                {availableVoiceLanguages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            )}
            {incidentError && <p className="mt-2 text-xs text-rose-600">{incidentError}</p>}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700/80">Risk</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Event Monitor</p>
              </div>
              <span className={`rounded px-2 py-1 text-xs font-semibold ${riskColor}`}>{riskScore}/100</span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ${riskTrackColor}`}
                style={{ width: `${riskScore}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(Object.keys(riskEvents) as RiskEvent[]).map((eventType) => (
                <button
                  key={eventType}
                  type="button"
                  onClick={() => {
                    void triggerRiskEvent(eventType);
                  }}
                  className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                >
                  {riskEvents[eventType].label}
                </button>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              {threatZone
                ? `${threatZone.severity.toUpperCase()} zone: 2km radius`
                : threatZoneStatus || "Threat zone triggers above 60 risk."}
              {threatZoneError && <div className="mt-1 break-words text-rose-600">{threatZoneError}</div>}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-3">
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

                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
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
