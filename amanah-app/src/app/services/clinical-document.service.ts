import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { FirebaseService } from './firebase.service';
import { PermissionService } from './permission.service';
import { ClinicalDocument, DocumentAccessLog, MAX_FILE_SIZE } from '../models/clinical-document.model';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  Timestamp,
  arrayUnion
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class ClinicalDocumentService {
  private readonly MAX_FILE_SIZE = MAX_FILE_SIZE;
  private readonly BACKEND_URL = 'http://localhost:3000'; // Cambiar en producción
  private readonly permissionService = inject(PermissionService);

  constructor(
    private firebaseService: FirebaseService,
    private http: HttpClient
  ) {}

  /**
   * Subir documento clínico al backend
   */
  uploadDocument(
    dependentId: string,
    file: File,
    metadata: Omit<ClinicalDocument, 'id' | 'storagePath' | 'uploadDate' | 'createdAt' | 'updatedAt' | 'fileSize' | 'fileType'>
  ): Observable<ClinicalDocument> {
    return new Observable(observer => {
      // Validar permisos: Solo cuidadores pueden cargar documentos
      if (!this.permissionService.canUploadDocument()) {
        observer.error(new Error('No tienes permisos para cargar documentos'));
        return;
      }

      // Validar tamaño
      if (file.size > this.MAX_FILE_SIZE) {
        observer.error(new Error(`El archivo excede el tamaño máximo de 10 MB. Tamaño actual: ${(file.size / 1024 / 1024).toFixed(2)} MB`));
        return;
      }

      // Crear FormData para enviar al backend
      const formData = new FormData();
      formData.append('file', file);

      // Subir archivo al backend
      this.http.post<any>(`${this.BACKEND_URL}/upload`, formData)
        .subscribe({
          next: (response) => {
            console.log(`Archivo subido al backend:`, response);

            const docData: ClinicalDocument = {
              ...metadata,
              dependentId,
              fileName: response.originalName,
              fileType: response.mimetype,
              fileSize: response.size,
              storagePath: response.fileId, // Usamos fileId como storagePath
              uploadDate: new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            };

            // Guardar metadata en Firestore
            const docRef = collection(
              this.firebaseService.firestore,
              `dependents/${dependentId}/documents`
            );

            console.log(`Guardando en Firestore:`, docData);

            addDoc(docRef, {
              ...docData,
              uploadDate: Timestamp.fromDate(docData.uploadDate),
              createdAt: Timestamp.fromDate(docData.createdAt),
              updatedAt: Timestamp.fromDate(docData.updatedAt)
            })
              .then((ref) => {
                docData.id = ref.id;
                console.log(`Documento guardado en Firestore con ID:`, ref.id);
                observer.next(docData);
                observer.complete();
              })
              .catch(err => {
                console.error(`Error guardando en Firestore:`, err);
                observer.error(err);
              });
          },
          error: (err) => {
            console.error('Error subiendo archivo:', err);
            observer.error(err);
          }
        });
    });
  }

  /**
   * Obtener documentos de un dependiente
   */
  getDocumentsByDependent(dependentId: string, userId?: string, userRole?: string): Observable<ClinicalDocument[]> {
    return new Observable(observer => {
      try {
        console.log(`Escuchando documentos en: dependents/${dependentId}/documents`);

        const q = query(
          collection(this.firebaseService.firestore, `dependents/${dependentId}/documents`),
          orderBy('uploadDate', 'desc')
        );

        const unsubscribe = onSnapshot(
          q,
          snapshot => {
            console.log(`Snapshot recibido: ${snapshot.docs.length} documentos`);

            const docs = snapshot.docs
              .map(doc => {
                const data = doc.data() as any;
                return {
                  id: doc.id,
                  ...data,
                  uploadDate: data['uploadDate']?.toDate() || new Date(),
                  createdAt: data['createdAt']?.toDate() || new Date(),
                  updatedAt: data['updatedAt']?.toDate() || new Date()
                } as ClinicalDocument;
              })
              .filter(doc => {
                // Filtrar por acceso
                if (userRole === 'admin') return true; // Admins ven todo
                if (doc.isPrivate && userId !== doc.uploadedBy && userId !== dependentId) return false;
                if (doc.accessibleBy && doc.accessibleBy.length > 0 && !doc.accessibleBy.includes(userId || '')) return false;
                return true;
              });

            console.log(`Documentos después de filtrar: ${docs.length}`);
            observer.next(docs);
          },
          err => {
            console.error('Error en onSnapshot:', err);
            // Si hay error, devolver array vacío en lugar de fallar
            observer.next([]);
          }
        );

        return () => unsubscribe();
      } catch (err) {
        console.error('Error creando query:', err);
        // Si hay error de sintaxis, devolver array vacío
        observer.next([]);
        return () => {};
      }
    });
  }

  /**
   * Obtener documentos asociados a una cita
   */
  getDocumentsByAppointment(dependentId: string, appointmentId: string): Observable<ClinicalDocument[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/documents`),
        where('appointmentId', '==', appointmentId)
      );

      const unsubscribe = onSnapshot(q, snapshot => {
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          uploadDate: doc.data()['uploadDate']?.toDate(),
          createdAt: doc.data()['createdAt']?.toDate(),
          updatedAt: doc.data()['updatedAt']?.toDate()
        } as ClinicalDocument));

        observer.next(docs);
      }, err => observer.error(err));

      return () => unsubscribe();
    });
  }

  /**
   * Obtener documentos asociados a una medicación
   */
  getDocumentsByMedication(dependentId: string, medicationId: string): Observable<ClinicalDocument[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/documents`),
        where('medicationId', '==', medicationId)
      );

      const unsubscribe = onSnapshot(q, snapshot => {
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          uploadDate: doc.data()['uploadDate']?.toDate(),
          createdAt: doc.data()['createdAt']?.toDate(),
          updatedAt: doc.data()['updatedAt']?.toDate()
        } as ClinicalDocument));

        observer.next(docs);
      }, err => observer.error(err));

      return () => unsubscribe();
    });
  }

  /**
   * Obtener URL de descarga del archivo
   */
  downloadDocument(fileId: string): Observable<string> {
    return new Observable(observer => {
      const downloadUrl = `${this.BACKEND_URL}/download/${fileId}`;
      observer.next(downloadUrl);
      observer.complete();
    });
  }

  /**
   * Actualizar documento
   */
  updateDocument(dependentId: string, documentId: string, updates: Partial<ClinicalDocument>): Observable<void> {
    const docRef = doc(
      this.firebaseService.firestore,
      `dependents/${dependentId}/documents/${documentId}`
    );

    return from(
      updateDoc(docRef, {
        ...updates,
        updatedAt: Timestamp.now()
      })
    );
  }

  /**
   * Eliminar documento
   */
  deleteDocument(dependentId: string, documentId: string, storagePath: string): Observable<void> {
    return new Observable(observer => {
      // Validar permisos: Solo cuidadores pueden eliminar documentos
      if (!this.permissionService.canDeleteDocument()) {
        observer.error(new Error('No tienes permisos para eliminar documentos'));
        return;
      }

      const batch = writeBatch(this.firebaseService.firestore);

      // Eliminar de Firestore
      const docRef = doc(
        this.firebaseService.firestore,
        `dependents/${dependentId}/documents/${documentId}`
      );
      batch.delete(docRef);

      // Eliminar del backend
      this.http.delete<any>(`${this.BACKEND_URL}/delete/${storagePath}`)
        .subscribe({
          next: () => {
            batch.commit()
              .then(() => {
                observer.next();
                observer.complete();
              })
              .catch(err => observer.error(err));
          },
          error: (err) => {
            console.error('Error eliminando archivo:', err);
            observer.error(err);
          }
        });
    });
  }

  /**
   * Compartir documento con usuario
   */
  shareDocument(dependentId: string, documentId: string, userIds: string[]): Observable<void> {
    const docRef = doc(
      this.firebaseService.firestore,
      `dependents/${dependentId}/documents/${documentId}`
    );

    return from(
      updateDoc(docRef, {
        accessibleBy: arrayUnion(...userIds),
        updatedAt: Timestamp.now()
      })
    );
  }

  /**
   * Registrar acceso a documento
   */
  logDocumentAccess(
    dependentId: string,
    documentId: string,
    userId: string,
    userName: string,
    userRole: string,
    action: 'view' | 'download' | 'share'
  ): Observable<void> {
    const logRef = collection(
      this.firebaseService.firestore,
      `dependents/${dependentId}/documents/${documentId}/accessLog`
    );

    const accessLog: DocumentAccessLog = {
      documentId,
      userId,
      userName,
      userRole,
      accessDate: new Date(),
      action
    };

    return from(
      addDoc(logRef, {
        ...accessLog,
        accessDate: Timestamp.fromDate(accessLog.accessDate)
      })
    ).pipe(map(() => void 0));
  }

  /**
   * Obtener log de acceso
   */
  getAccessLog(dependentId: string, documentId: string): Observable<DocumentAccessLog[]> {
    return new Observable(observer => {
      const q = query(
        collection(
          this.firebaseService.firestore,
          `dependents/${dependentId}/documents/${documentId}/accessLog`
        ),
        orderBy('accessDate', 'desc')
      );

      const unsubscribe = onSnapshot(q, snapshot => {
        const logs = snapshot.docs.map(doc => ({
          ...doc.data(),
          accessDate: doc.data()['accessDate']?.toDate()
        } as DocumentAccessLog));

        observer.next(logs);
      }, err => observer.error(err));

      return () => unsubscribe();
    });
  }
}
