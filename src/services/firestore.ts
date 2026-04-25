import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
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
  location: VehicleLocation;
  routeId: string;
  timestamp: Timestamp | null;
};

export type ThreatZoneInput = {
  lat: number;
  lng: number;
  radius: number;
  severity: string;
};

export type ThreatZoneRecord = ThreatZoneInput & {
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

export async function updateVehicleTracking({
  vehicleId,
  location,
  routeId,
}: {
  vehicleId: string;
  location: VehicleLocation;
  routeId: string;
}) {
  await setDoc(
    doc(db, "vehicles", vehicleId),
    {
      vehicleId,
      location,
      routeId,
      timestamp: serverTimestamp(),
    },
    { merge: true }
  );
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
      const location = data.location as VehicleLocation | undefined;

      if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
        onVehicleChange(null);
        return;
      }

      onVehicleChange({
        vehicleId: typeof data.vehicleId === "string" ? data.vehicleId : vehicleId,
        location,
        routeId: typeof data.routeId === "string" ? data.routeId : "",
        timestamp: data.timestamp instanceof Timestamp ? data.timestamp : null,
      });
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function createThreatZone({ lat, lng, radius, severity }: ThreatZoneInput) {
  const threatZonesCollection = collection(db, "threatZones");

  const docRef = await addDoc(threatZonesCollection, {
    lat,
    lng,
    radius,
    severity,
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
