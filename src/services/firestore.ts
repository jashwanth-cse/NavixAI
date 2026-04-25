import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
