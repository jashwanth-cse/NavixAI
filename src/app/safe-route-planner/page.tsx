"use client";

import {
  Autocomplete,
  Circle,
  DirectionsRenderer,
  GoogleMap,
  Marker,
  Polyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ThreatZoneRecord,
  TrackedVehicle,
  createThreatZone,
  subscribeToThreatZones,
  subscribeToVehicle,
  updateVehicleTracking,
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
};
type CandidateRoute = {
  result: google.maps.DirectionsResult;
  path: google.maps.LatLngLiteral[];
  waypoint: google.maps.LatLngLiteral;
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

const vehicleMoveIntervalMs = 2500;
const vehicleId = "truck-unit-1";
const threatApproachBufferMeters = 3000;
const threatClearanceBufferMeters = 900;
const candidateBearings = [0, 45, 90, 135, 180, 225, 270, 315];
const maxDecisionLogs = 14;
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

function getAvoidanceWaypoint(
  zone: ThreatZone,
  bearingDegrees: number
) {
  const earthRadiusMeters = 6371000;
  const distance = zone.radius + threatClearanceBufferMeters;
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

function routeTouchesThreatZone(path: google.maps.LatLngLiteral[], zones: ThreatZone[], paddingMeters = 0) {
  return path.some((point) =>
    zones.some((zone) => getDistanceMeters(point, zone.center) <= zone.radius + paddingMeters)
  );
}

function getRouteMetrics(result: google.maps.DirectionsResult) {
  return result.routes[0]?.legs.reduce(
    (totals, leg) => ({
      durationSeconds:
        totals.durationSeconds + (leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0),
      distanceMeters: totals.distanceMeters + (leg.distance?.value ?? 0),
    }),
    { durationSeconds: 0, distanceMeters: 0 }
  ) ?? { durationSeconds: 0, distanceMeters: 0 };
}

function toThreatZone(record: ThreatZoneRecord): ThreatZone {
  return {
    id: record.id,
    center: { lat: record.lat, lng: record.lng },
    radius: record.radius,
    severity: record.severity,
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
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [routeCoordinates, setRouteCoordinates] = useState<google.maps.LatLngLiteral[]>([]);
  const [routeId, setRouteId] = useState("");
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [status, setStatus] = useState<RouteStatus>("idle");
  const [message, setMessage] = useState("");
  const [vehiclePosition, setVehiclePosition] = useState<google.maps.LatLngLiteral | null>(null);
  const [vehicleIndex, setVehicleIndex] = useState(0);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus>("Awaiting route");
  const [syncedVehicle, setSyncedVehicle] = useState<TrackedVehicle | null>(null);
  const [syncStatus, setSyncStatus] = useState("Connecting");
  const [syncError, setSyncError] = useState("");
  const [riskScore, setRiskScore] = useState(0);
  const [threatZone, setThreatZone] = useState<ThreatZone | null>(null);
  const [threatZones, setThreatZones] = useState<ThreatZone[]>([]);
  const [threatZoneStatus, setThreatZoneStatus] = useState("");
  const [threatZoneError, setThreatZoneError] = useState("");
  const [rerouteStatus, setRerouteStatus] = useState("");
  const [aiDecisionOpen, setAiDecisionOpen] = useState(false);
  const [aiDecisionLogs, setAiDecisionLogs] = useState<string[]>([
    "Route intelligence standing by. Plan a route to begin monitoring.",
  ]);

  const routeMeta = useMemo(() => {
    const leg = directions?.routes[0]?.legs[0];

    return {
      distance: leg?.distance?.text ?? "No route",
      duration: leg?.duration?.text ?? "Awaiting route",
      coordinateCount: routeCoordinates.length,
    };
  }, [directions, routeCoordinates.length]);

  const displayedVehiclePosition = vehiclePosition ?? syncedVehicle?.location ?? null;
  const displayedRouteId = routeId || syncedVehicle?.routeId || "";
  const displayedVehicleStatus = vehiclePosition ? vehicleStatus : syncedVehicle ? "In transit" : vehicleStatus;
  const activeThreatZone = displayedVehiclePosition
    ? threatZones.find(
        (zone) => getDistanceMeters(displayedVehiclePosition, zone.center) <= zone.radius
      )
    : null;
  const upcomingThreatZone = displayedVehiclePosition
    ? threatZones
        .map((zone) => ({
          zone,
          distance: getDistanceMeters(displayedVehiclePosition, zone.center),
          routeConflict: routeTouchesThreatZone(
            routeCoordinates.slice(Math.max(vehicleIndex, 0)),
            [zone],
            threatClearanceBufferMeters
          ),
        }))
        .filter(
          ({ zone, distance, routeConflict }) =>
            routeConflict || distance <= zone.radius + threatApproachBufferMeters
        )
        .sort((a, b) => a.distance - b.distance)[0]?.zone ?? null
    : null;
  const lastSyncedAt = syncedVehicle?.timestamp?.toDate().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const riskColor =
    riskScore >= 70
      ? "bg-red-400 text-red-100"
      : riskScore >= 40
        ? "bg-yellow-300 text-yellow-100"
        : "bg-emerald-300 text-emerald-100";
  const riskTrackColor =
    riskScore >= 70 ? "bg-red-400" : riskScore >= 40 ? "bg-yellow-300" : "bg-emerald-300";

  const vehicleSpeed = useMemo(() => {
    const leg = directions?.routes[0]?.legs[0];
    const distanceMeters = leg?.distance?.value;
    const durationSeconds = leg?.duration?.value;

    if (!distanceMeters || !durationSeconds) {
      return 0;
    }

    return Math.round((distanceMeters / durationSeconds) * 3.6);
  }, [directions]);

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

  useEffect(() => {
    const unsubscribe = subscribeToVehicle(
      vehicleId,
      (vehicle) => {
        setSyncedVehicle(vehicle);
        setSyncStatus(vehicle ? "Live" : "Waiting");
        setSyncError("");
      },
      (error) => {
        setSyncStatus("Offline");
        setSyncError(error.message);
      }
    );

    return unsubscribe;
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
    if (!vehiclePosition && syncedVehicle?.location) {
      mapRef.current?.panTo(syncedVehicle.location);
    }
  }, [syncedVehicle, vehiclePosition]);

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
    })
      .then((id) => {
        const nextThreatZone = {
          id,
          center: zoneCenter,
          radius: 2000,
          severity,
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
  }, [displayedVehiclePosition, riskScore, routeCoordinates]);

  async function syncVehicleLocation(location: google.maps.LatLngLiteral, activeRouteId: string) {
    if (!activeRouteId) {
      return;
    }

    try {
      await updateVehicleTracking({
        vehicleId,
        location,
        routeId: activeRouteId,
      });
      setSyncStatus("Live");
      setSyncError("");
    } catch (error) {
      setSyncStatus("Offline");
      setSyncError(error instanceof Error ? error.message : "Unable to sync vehicle location.");
    }
  }

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
    rerouteInFlightRef.current = true;
    reroutedThreatZonesRef.current.add(zoneToAvoid.id);
    setRerouteStatus("Evaluating alternate corridors");
    addAiDecisionLog(
      `Threat ${zoneToAvoid.id.slice(0, 6)} detected ahead. Evaluating traffic-aware routes from live vehicle coordinates.`
    );

    const service = new google.maps.DirectionsService();
    const zonesToAvoid = threatZones.length ? threatZones : [zoneToAvoid];

    async function evaluateRoutes() {
      const candidatePromises = candidateBearings.map(async (bearing) => {
        const waypoint = getAvoidanceWaypoint(zoneToAvoid, bearing);
        addAiDecisionLog(`Testing ${bearing}deg avoidance corridor outside ${Math.round(zoneToAvoid.radius)}m zone.`);

        const result = await service.route({
          origin: vehicleLocation,
          destination,
          travelMode: google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: true,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS,
          },
          waypoints: [
            {
              location: waypoint,
              stopover: false,
            },
          ],
        });

        const path = result.routes[0]?.overview_path.map((point) => ({
          lat: point.lat(),
          lng: point.lng(),
        })) ?? [];
        const metrics = getRouteMetrics(result);
        const touchesRisk = routeTouchesThreatZone(path, zonesToAvoid, threatClearanceBufferMeters);

        if (!path.length || touchesRisk) {
          addAiDecisionLog(`Rejected ${bearing}deg corridor: route still intersects a high-risk radius.`);
          return null;
        }

        const score = metrics.durationSeconds + metrics.distanceMeters / 25;
        addAiDecisionLog(
          `Accepted ${bearing}deg corridor: ${Math.round(metrics.distanceMeters / 1000)}km, ${Math.round(
            metrics.durationSeconds / 60
          )}min traffic ETA.`
        );

        return {
          result,
          path,
          waypoint,
          durationSeconds: metrics.durationSeconds,
          distanceMeters: metrics.distanceMeters,
          score,
        } satisfies CandidateRoute;
      });

      const candidates = (await Promise.allSettled(candidatePromises))
        .flatMap((candidate) => (candidate.status === "fulfilled" && candidate.value ? [candidate.value] : []))
        .sort((a, b) => a.score - b.score);

      if (!candidates.length) {
        throw new Error("No safe alternate route found outside current threat zones.");
      }

      return candidates[0];
    }

    evaluateRoutes()
      .then((bestRoute) => {
        const nextRouteId = createRouteId();
        const bounds = new google.maps.LatLngBounds();
        bestRoute.path.forEach((point) => bounds.extend(point));

        setDirections(bestRoute.result);
        setRouteCoordinates(bestRoute.path);
        setRouteId(nextRouteId);
        setVehiclePosition(bestRoute.path[0] ?? vehicleLocation);
        setVehicleIndex(0);
        setVehicleStatus("In transit");
        setStatus("success");
        setMessage("Optimized alternate route selected.");
        setRerouteStatus(
          `Optimized route: ${Math.round(bestRoute.distanceMeters / 1000)}km / ${Math.round(
            bestRoute.durationSeconds / 60
          )}min`
        );
        addAiDecisionLog(
          `Committed optimized safe route. Route avoids known zones and optimizes traffic ETA plus distance.`
        );
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
  }, [addAiDecisionLog, destination, displayedVehiclePosition, isLoaded, threatZones, upcomingThreatZone]);

  useEffect(() => {
    if (!routeCoordinates.length) {
      setVehiclePosition(null);
      setVehicleIndex(0);
      setVehicleStatus("Awaiting route");
      return;
    }

    setVehiclePosition(routeCoordinates[0]);
    setVehicleIndex(0);
    setVehicleStatus(routeCoordinates.length > 1 ? "In transit" : "Arrived");
    void syncVehicleLocation(routeCoordinates[0], routeId);

    if (routeCoordinates.length < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setVehicleIndex((currentIndex) => {
        const nextIndex = Math.min(currentIndex + 1, routeCoordinates.length - 1);
        const nextPosition = routeCoordinates[nextIndex];

        setVehiclePosition(nextPosition);
        mapRef.current?.panTo(nextPosition);
        void syncVehicleLocation(nextPosition, routeId);

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
  }, [routeCoordinates, routeId]);

  function handleMapLoad(map: google.maps.Map) {
    mapRef.current = map;
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

  function triggerRiskEvent(eventType: RiskEvent) {
    setRiskScore((currentScore) => Math.min(100, currentScore + riskEvents[eventType].increment));
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
    setAiDecisionLogs(["Route intelligence initialized. Monitoring Firestore threat zones and traffic-aware alternatives."]);
    reroutedThreatZonesRef.current.clear();
    setVehiclePosition(null);
    setVehicleIndex(0);
    setVehicleStatus("Awaiting route");

    const service = new google.maps.DirectionsService();

    try {
      const result = await service.route({
        origin: source,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      });

      const path = result.routes[0]?.overview_path.map((point) => ({
        lat: point.lat(),
        lng: point.lng(),
      }));

      if (!path?.length) {
        throw new Error("Directions API returned an empty route.");
      }

      const nextRouteId = createRouteId();
      const bounds = new google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));

      setDirections(result);
      setRouteCoordinates(path);
      setRouteId(nextRouteId);
      setStatus("success");
      setMessage("Route rendered correctly.");
      mapRef.current?.fitBounds(bounds, 72);
    } catch (error) {
      setDirections(null);
      setRouteCoordinates([]);
      setRouteId("");
      setVehiclePosition(null);
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
          center={routeCoordinates[0] ?? defaultCenter}
          zoom={routeCoordinates.length ? 11 : 5}
          options={mapOptions}
          onLoad={handleMapLoad}
        >
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: "#22d3ee",
                  strokeOpacity: 0.92,
                  strokeWeight: 6,
                },
              }}
            />
          )}

          {routeCoordinates.length > 0 && (
            <>
              <Polyline
                path={routeCoordinates}
                options={{
                  strokeColor: "#14b8a6",
                  strokeOpacity: 0.55,
                  strokeWeight: 3,
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
        <div className="pointer-events-auto rounded-lg border border-white/20 bg-[#101820]/60 p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">NavixAI</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Safe Route Planner</h1>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m16 8-3 8-2-3-3-1 8-4Z" />
              </svg>
            </span>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-300">Source</span>
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
                    className="h-11 w-full rounded border border-white/15 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-cyan-300/70 focus:bg-black/50"
                  />
                </Autocomplete>
              ) : (
                <input
                  disabled
                  placeholder="Loading Places..."
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-neutral-500"
                />
              )}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-300">Destination</span>
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
                    className="h-11 w-full rounded border border-white/15 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-cyan-300/70 focus:bg-black/50"
                  />
                </Autocomplete>
              ) : (
                <input
                  disabled
                  placeholder="Loading Places..."
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-neutral-500"
                />
              )}
            </label>

            <button
              type="submit"
              disabled={!isLoaded || status === "loading"}
              className="flex h-11 w-full items-center justify-center gap-2 rounded bg-cyan-300 px-4 text-sm font-semibold text-[#071112] shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-neutral-400"
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

          {message && (
            <p className={`mt-3 text-xs ${status === "error" ? "text-red-100" : "text-neutral-300"}`}>
              {message}
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded border border-white/10 bg-black/25 px-2 py-2">
              <p className="text-[11px] text-neutral-400">Distance</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{routeMeta.distance}</p>
            </div>
            <div className="rounded border border-white/10 bg-black/25 px-2 py-2">
              <p className="text-[11px] text-neutral-400">Duration</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{routeMeta.duration}</p>
            </div>
            <div className="rounded border border-white/10 bg-black/25 px-2 py-2">
              <p className="text-[11px] text-neutral-400">Coords</p>
              <p className="mt-1 text-sm font-semibold text-white">{routeMeta.coordinateCount}</p>
            </div>
          </div>

          <div className="mt-4 rounded border border-white/10 bg-black/30 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Risk</p>
                <p className="mt-1 text-sm font-semibold text-white">Event Monitor</p>
              </div>
              <span className={`rounded px-2 py-1 text-xs font-semibold ${riskColor}`}>{riskScore}/100</span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-white/10">
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
                  onClick={() => triggerRiskEvent(eventType)}
                  className="min-h-9 rounded border border-white/10 bg-white/[0.06] px-2 py-2 text-xs font-medium text-neutral-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
                >
                  {riskEvents[eventType].label}
                </button>
              ))}
            </div>

            <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
              {threatZone
                ? `${threatZone.severity.toUpperCase()} zone: 2km radius`
                : threatZoneStatus || "Threat zone triggers above 60 risk."}
              {threatZoneError && <div className="mt-1 break-words text-red-200">{threatZoneError}</div>}
            </div>
          </div>

          <div className="mt-4 rounded border border-white/10 bg-black/30 p-3">
            <button
              type="button"
              onClick={() => setAiDecisionOpen((isOpen) => !isOpen)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                  AI Decision Center
                </span>
                <span className="mt-1 block text-sm font-semibold text-white">
                  Dynamic routing intelligence
                </span>
              </span>
              <span className="rounded border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-cyan-100">
                {aiDecisionOpen ? "Hide" : "Open"}
              </span>
            </button>

            {aiDecisionOpen && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-white/10 bg-black/30 p-2">
                    <p className="text-neutral-500">Route</p>
                    <p className="mt-1 break-all font-mono text-cyan-200">{displayedRouteId || "Not assigned"}</p>
                  </div>
                  <div className="rounded border border-white/10 bg-black/30 p-2">
                    <p className="text-neutral-500">Decision</p>
                    <p className="mt-1 text-neutral-200">{rerouteStatus || "Monitoring"}</p>
                  </div>
                </div>

                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {aiDecisionLogs.map((log, index) => (
                    <div key={`${log}-${index}`} className="rounded border border-white/10 bg-black/30 p-2 text-xs leading-5 text-neutral-300">
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
        <div className="pointer-events-auto rounded-lg border border-white/20 bg-[#101820]/60 p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Vehicle</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Truck Unit</h2>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
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
            <div className="rounded border border-white/10 bg-black/25 px-3 py-2">
              <p className="text-[11px] text-neutral-400">Speed</p>
              <p className="mt-1 text-sm font-semibold text-white">{vehicleSpeed ? `${vehicleSpeed} km/h` : "--"}</p>
            </div>
            <div className="rounded border border-white/10 bg-black/25 px-3 py-2">
              <p className="text-[11px] text-neutral-400">Status</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{displayedVehicleStatus}</p>
            </div>
          </div>

          <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
            {routeCoordinates.length > 0
              ? `Waypoint ${vehicleIndex + 1} of ${routeCoordinates.length}`
              : syncedVehicle
                ? `Following ${syncedVehicle.vehicleId}`
                : "Plan a route to start simulation."}
            {rerouteStatus && <div className="mt-1 text-cyan-200">{rerouteStatus}</div>}
          </div>

          <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-xs leading-5 text-neutral-300">
            <div className="flex items-center justify-between gap-3">
              <span>Firestore</span>
              <span className={syncStatus === "Offline" ? "text-red-200" : "text-cyan-200"}>{syncStatus}</span>
            </div>
            <div className="mt-1 truncate text-neutral-400">
              {lastSyncedAt ? `Last update ${lastSyncedAt}` : "No vehicle update yet"}
            </div>
            {syncError && <div className="mt-1 break-words text-red-200">{syncError}</div>}
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
