import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Writes a test document to the `test` collection in Firestore.
 * Returns the new document ID on success.
 */
export async function writeTestDocument(): Promise<string> {
  const testCollection = collection(db, "test");

  const docRef = await addDoc(testCollection, {
    message: "NavixAI Firestore connection successful ✅",
    platform: "NavixAI — Real-Time Collaborative Threat Intelligence",
    environment: process.env.NODE_ENV,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}
