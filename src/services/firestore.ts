import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type VehicleLocation = {
  lat: number;
  lng: number;
};

export type TrackedVehicle = {
  vehicleId: string;
  lat: number;
  lng: number;
};

export type ThreatZoneInput = {
  lat: number;
  lng: number;
  radius: number;
  severity: string;
  sourceVehicleId?: string;
  routeKey?: string;
};

export type ThreatZoneRecord = ThreatZoneInput & {
  id: string;
  timestamp: Timestamp | null;
};

export type IncidentEventType = "door" | "stop" | "deviation";

export type IncidentMessageInput = {
  sourceVehicleId: string;
  routeKey: string;
  sourceLabel: string;
  destinationLabel: string;
  eventType: IncidentEventType;
  lat: number;
  lng: number;
};

export type IncidentMessageRecord = IncidentMessageInput & {
  id: string;
  timestamp: Timestamp | null;
};

/**
 * Writes a test document to the `test` collection in Firestore.
 * Returns the new document ID on success.
 * Throws a descriptive Error on failure.
 */
export async function writeTestDocument(): Promise<string> {
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set. Check your .env.local file."
    );
  }

  const testCollection = collection(db, "test");

  const docRef = await addDoc(testCollection, {
    message: "NavixAI Firestore connection successful",
    platform: "NavixAI — Real-Time Collaborative Threat Intelligence",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    environment: process.env.NODE_ENV,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function updateVehicleLiveLocation({
  vehicleId,
  location,
}: {
  vehicleId: string;
  location: VehicleLocation;
}) {
  await setDoc(
    doc(db, "vehicles", vehicleId),
    {
      lat: location.lat,
      lng: location.lng,
    },
    { merge: true }
  );
}

export async function createVehicleNavigation({
  vehicleId,
  location,
}: {
  vehicleId: string;
  location: VehicleLocation;
}) {
  await setDoc(doc(db, "vehicles", vehicleId), {
    lat: location.lat,
    lng: location.lng,
  });
}

export async function updateVehicleNavigationRoute({
  vehicleId,
  location,
}: {
  vehicleId: string;
  location: VehicleLocation;
}) {
  await setDoc(
    doc(db, "vehicles", vehicleId),
    {
      lat: location.lat,
      lng: location.lng,
    },
    { merge: true }
  );
}

export async function deleteVehicleNavigation(vehicleId: string) {
  await deleteDoc(doc(db, "vehicles", vehicleId));
}

export function subscribeToVehicle(
  vehicleId: string,
  onVehicleChange: (vehicle: TrackedVehicle | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "vehicles", vehicleId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onVehicleChange(null);
        return;
      }

      const data = snapshot.data();
      const lat = typeof data.lat === "number" ? data.lat : data.location?.lat;
      const lng = typeof data.lng === "number" ? data.lng : data.location?.lng;

      if (typeof lat !== "number" || typeof lng !== "number") {
        onVehicleChange(null);
        return;
      }

      onVehicleChange({
        vehicleId: typeof data.vehicleId === "string" ? data.vehicleId : vehicleId,
        lat,
        lng,
      });
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function createThreatZone({
  lat,
  lng,
  radius,
  severity,
  sourceVehicleId,
  routeKey,
}: ThreatZoneInput) {
  const threatZonesCollection = collection(db, "threatZones");

  const docRef = await addDoc(threatZonesCollection, {
    lat,
    lng,
    radius,
    severity,
    sourceVehicleId: sourceVehicleId ?? null,
    routeKey: routeKey ?? null,
    timestamp: serverTimestamp(),
  });

  return docRef.id;
}

export function subscribeToThreatZones(
  onThreatZonesChange: (zones: ThreatZoneRecord[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    collection(db, "threatZones"),
    (snapshot) => {
      const zones = snapshot.docs
        .map((threatZoneDoc) => {
          const data = threatZoneDoc.data();

          if (
            typeof data.lat !== "number" ||
            typeof data.lng !== "number" ||
            typeof data.radius !== "number"
          ) {
            return null;
          }

          return {
            id: threatZoneDoc.id,
            lat: data.lat,
            lng: data.lng,
            radius: data.radius,
            severity: typeof data.severity === "string" ? data.severity : "high",
            ...(typeof data.sourceVehicleId === "string"
              ? { sourceVehicleId: data.sourceVehicleId }
              : {}),
            ...(typeof data.routeKey === "string" ? { routeKey: data.routeKey } : {}),
            timestamp: data.timestamp instanceof Timestamp ? data.timestamp : null,
          };
        })
        .filter((zone): zone is ThreatZoneRecord => zone !== null);

      onThreatZonesChange(zones);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function createIncidentMessage({
  sourceVehicleId,
  routeKey,
  sourceLabel,
  destinationLabel,
  eventType,
  lat,
  lng,
}: IncidentMessageInput) {
  const incidentMessagesCollection = collection(db, "incidentMessages");

  const docRef = await addDoc(incidentMessagesCollection, {
    sourceVehicleId,
    routeKey,
    sourceLabel,
    destinationLabel,
    eventType,
    lat,
    lng,
    timestamp: serverTimestamp(),
  });

  return docRef.id;
}

export function subscribeToIncidentMessages(
  onIncidentMessagesChange: (messages: IncidentMessageRecord[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    query(collection(db, "incidentMessages"), orderBy("timestamp", "desc"), limit(30)),
    (snapshot) => {
      const messages = snapshot.docs
        .map((incidentMessageDoc) => {
          const data = incidentMessageDoc.data();

          if (
            typeof data.sourceVehicleId !== "string" ||
            typeof data.routeKey !== "string" ||
            typeof data.sourceLabel !== "string" ||
            typeof data.destinationLabel !== "string" ||
            typeof data.eventType !== "string" ||
            typeof data.lat !== "number" ||
            typeof data.lng !== "number"
          ) {
            return null;
          }

          return {
            id: incidentMessageDoc.id,
            sourceVehicleId: data.sourceVehicleId,
            routeKey: data.routeKey,
            sourceLabel: data.sourceLabel,
            destinationLabel: data.destinationLabel,
            eventType: data.eventType as IncidentEventType,
            lat: data.lat,
            lng: data.lng,
            timestamp: data.timestamp instanceof Timestamp ? data.timestamp : null,
          };
        })
        .filter((message): message is IncidentMessageRecord => message !== null);

      onIncidentMessagesChange(messages);
    },
    (error) => {
      onError?.(error);
    }
  );
}
