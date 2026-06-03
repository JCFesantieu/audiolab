/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, handleFirestoreError, OperationType } from "./firebase";
import { 
  collection, 
  doc, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot,
  setDoc,
  serverTimestamp
} from "firebase/firestore";
import { AudioAnalysis } from "../types";

export interface SavedAnalysisRecord {
  id: string;
  ownerId: string;
  fileName: string;
  fileSize: number;
  createdAt: Date;
  turns: any[];
  overallQuality: any;
}

/**
 * Saves a new completed audio analysis to Firestore under the current authenticated user identity.
 */
export async function saveAnalysisToFirestore(
  userId: string, 
  fileName: string, 
  fileSize: number, 
  analysis: AudioAnalysis,
  customDocId?: string
): Promise<string | undefined> {
  const path = "analyses";
  try {
    const data = {
      ownerId: userId,
      fileName: fileName || "enregistrement_sans_titre.wav",
      fileSize: fileSize || 0,
      createdAt: serverTimestamp(),
      turns: analysis.turns,
      overallQuality: analysis.overallQuality
    };

    if (customDocId) {
      await setDoc(doc(db, path, customDocId), data);
      return customDocId;
    } else {
      const docRef = await addDoc(collection(db, path), data);
      return docRef.id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Subscribe in real-time to changes in the active user's saved list of analyses.
 */
export function subscribeToUserAnalyses(
  userId: string,
  onUpdate: (analyses: SavedAnalysisRecord[]) => void,
  onError: (error: any) => void
) {
  const path = "analyses";
  try {
    const q = query(
      collection(db, path),
      where("ownerId", "==", userId)
    );
    
    return onSnapshot(q, (snapshot) => {
      const results: SavedAnalysisRecord[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        results.push({
          id: doc.id,
          ownerId: data.ownerId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          createdAt: data.createdAt?.toDate() || new Date(),
          turns: data.turns,
          overallQuality: data.overallQuality
        });
      });
      
      // Sort client-side by custom Date descending to bypass custom composite index requirement
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      onUpdate(results);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (err) {
        onError(err);
      }
    });
  } catch (error) {
    onError(error);
  }
}

/**
 * Delete a specific analysis document from Firestore.
 */
export async function deleteAnalysisFromFirestore(docId: string): Promise<void> {
  const path = `analyses/${docId}`;
  try {
    await deleteDoc(doc(db, "analyses", docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Creates/Syncs user profiles on Firebase.
 */
export async function saveUserProfile(userId: string, displayName: string, photoURL: string | null): Promise<void> {
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, "users", userId), {
      displayName: displayName || "Utilisateur Audiolab",
      photoURL: photoURL || "",
      createdAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
