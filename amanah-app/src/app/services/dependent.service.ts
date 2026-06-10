import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { PermissionService } from './permission.service';
import { Dependent } from '../models/dependent.model';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { Observable, from, timeout, catchError, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DependentService {
  private readonly dependentCollectionName = 'dependents';
  private readonly caregiver_dependentsCollectionName = 'caregiver_dependents';
  private readonly permissionService = inject(PermissionService);

  constructor(private readonly firebaseService: FirebaseService) {}

  private convertTimestamps(dependent: any): Dependent {
    if (dependent.createdAt instanceof Timestamp) {
      dependent.createdAt = dependent.createdAt.toDate();
    }
    return dependent as Dependent;
  }

  getDependentsForUser(userId: string): Observable<Dependent[]> {
    console.log('getDependentsForUser called with userId:', userId);
  
    return from(
      (async () => {
        try {
          const dependentIds = new Set<string>();
  
          // Obtener dependientes donde el usuario es cuidador
          console.log('Fetching dependents where user is caregiver...');
          const relationsQuery = query(
            collection(
              this.firebaseService.firestore,
              this.caregiver_dependentsCollectionName
            ),
            where('userId', '==', userId)
          );
  
          const relationsDocs = await getDocs(relationsQuery);
          const caregiverIds = relationsDocs.docs.map(doc => doc.data()['dependentId']);
          console.log('Found caregiver dependent IDs:', caregiverIds);
          caregiverIds.forEach(id => dependentIds.add(id));
  
          console.log('Combined dependent IDs:', Array.from(dependentIds));
  
          if (dependentIds.size === 0) {
            console.log('No dependents found');
            return [];
          }
  
          // Obtener los datos de cada dependiente
          const dependents: Dependent[] = [];
          for (const id of dependentIds) {
            try {
              const dependentRef = doc(
                this.firebaseService.firestore,
                this.dependentCollectionName,
                id
              );
              const dependentSnap = await getDoc(dependentRef);
  
              if (dependentSnap.exists()) {
                console.log('Loading dependent:', id, dependentSnap.data());
                dependents.push(this.convertTimestamps(dependentSnap.data()));
              } else {
                console.warn('Dependent does not exist:', id);
              }
            } catch (error) {
              console.error(`Error loading dependent ${id}:`, error);
            }
          }
  
          return dependents;
        } catch (error) {
          console.error('Error loading dependents:', error);
          return [];
        }
      })()
    ).pipe(
      timeout(20000),
      catchError(err => {
        console.error('Observable error or timeout loading dependents:', err);
        return throwError(() => err);
      })
    );
  }


  //CRUD dependiente
  async createDependent(
    dependent: Omit<Dependent, 'id'>,
    userId: string
  ): Promise<string> {
    // Validar permisos: Solo cuidador primario puede crear dependientes
    if (!this.permissionService.canCreateDependent()) {
      throw new Error('No tienes permisos para crear dependientes');
    }

    if (!dependent.name || dependent.name.trim().length < 2 || dependent.name.length > 50) {
      throw new Error('Nombre inválido: debe tener entre 2 y 50 caracteres');
    }

    if (!/^[a-záéíóúñ\s]*$/i.test(dependent.name)) {
      throw new Error('Nombre inválido: solo se permiten letras y espacios');
    }

    if (dependent.age < 0 || dependent.age > 150) {
      throw new Error('Edad inválida: debe estar entre 0 y 150');
    }

    if (!Number.isInteger(dependent.age)) {
      throw new Error('Edad inválida: debe ser un número entero');
    }

    if (dependent.medicalConditions && dependent.medicalConditions.length > 0) {
      const invalidConditions = dependent.medicalConditions.filter(c => !c || c.trim().length === 0);
      if (invalidConditions.length > 0) {
        throw new Error('Condiciones médicas inválidas: no pueden estar vacías');
      }

      const invalidFormat = dependent.medicalConditions.some(c => !/^[a-záéíóúñ\s]*$/i.test(c));
      if (invalidFormat) {
        throw new Error('Condiciones médicas inválidas: formato no permitido');
      }
    }

    try {
      // Crear documento en la colección 'dependents'
      const newDependent = {
        ...dependent,
        id: doc(collection(this.firebaseService.firestore, this.dependentCollectionName)).id,
        createdAt: new Date(),
        createdBy: userId
      };

      const dependentRef = doc(
        this.firebaseService.firestore,
        this.dependentCollectionName,
        newDependent.id
      );

      await setDoc(dependentRef, newDependent);

      // Crear relación en 'caregiver_dependents'
      await this.createCaregiverDependentRelation(
        userId,
        newDependent.id,
        'primary_caregiver'
      );
      return newDependent.id;
    } catch (error) {
      console.error('Error creating dependent:', error);
      throw error;
    }
  }


  async updateDependent(
    id: string,
    dependent: Partial<Dependent>
  ): Promise<void> {
    // Validar permisos: Solo cuidadores pueden editar dependientes
    if (!this.permissionService.canEditDependent()) {
      throw new Error('No tienes permisos para editar dependientes');
    }

    if(dependent.name && (dependent.name.length < 2 || dependent.name.length > 50)) {
      throw new Error('Nombre inválido: debe tener entre 2 y 50 caracteres');
    }

    if(dependent.age !== undefined && (dependent.age < 0 || dependent.age > 150)) {
      throw new Error('Edad inválida: debe estar entre 0 y 150');
    }

    if (dependent.medicalConditions) {
      const invalidConditions = dependent.medicalConditions.filter(c => !c || c.trim().length === 0);
      if (invalidConditions.length > 0) {
        throw new Error('Condiciones médicas inválidas: no pueden estar vacías');
      }
    }

    try {
      const dependentRef = doc(
        this.firebaseService.firestore,
        this.dependentCollectionName,
        id
      );
      await updateDoc(dependentRef, dependent);
    } catch (error) {
      console.error('Error updating dependent:', error);
      throw error;
    }
  }

  async deleteDependent(id: string): Promise<void> {
    // Validar permisos: Solo cuidador primario puede eliminar dependientes
    if (!this.permissionService.canDeleteDependent()) {
      throw new Error('No tienes permisos para eliminar dependientes');
    }

    if (!id || id.trim().length === 0) {
      throw new Error('ID de dependiente inválido');
    }

    try {
      //existe?
      const dependentRef = doc(
        this.firebaseService.firestore,
        this.dependentCollectionName,
        id
      );

      const dependentSnap = await getDoc(dependentRef);
      if (!dependentSnap.exists()) {
        throw new Error('Dependiente no encontrado');
      }

      await deleteDoc(dependentRef);

      // eliminar relaciones de cuidadores
      const relations = await getDocs(
        query(
          collection(
            this.firebaseService.firestore,
            this.caregiver_dependentsCollectionName
          ),

          where('dependentId', '==', id)
        )
      );

      for (const relationDoc of relations.docs) {
        await deleteDoc(relationDoc.ref);
      }
    } catch (error) {
      console.error('Error eliminando dependiente:', error);
      throw error;
    }
  }

  getDependent(id: string): Observable<Dependent | null> {
    console.log('getDependent called with id:', id);
    return from(
      (async () => {
        try {
          const dependentRef = doc(
            this.firebaseService.firestore,
            this.dependentCollectionName,
            id
          );

          console.log('Fetching dependent doc from:', this.dependentCollectionName, id);
          const dependentSnapshot = await getDoc(dependentRef);

          console.log('Dependent snapshot exists:', dependentSnapshot.exists());

          if (!dependentSnapshot.exists()) {
            console.warn('Dependent document does not exist:', id);
            return null;
          }

          const data = this.convertTimestamps(dependentSnapshot.data());
          console.log('Dependent data loaded:', data);
          return data;
        } catch (error) {
          console.error('Error getting dependent:', error);
          throw error;
        }
      })()
    ).pipe(
      timeout(10000),
      catchError((error) => {
        console.error('Observable error in getDependent:', error);
        throw error;
      })
    );
  }

  private async createCaregiverDependentRelation(
    userId: string,
    dependentId: string,
    role: string
  ): Promise<void> {
    try {
      const relationId = `${userId}_${dependentId}`;
      const relationRef = doc(
        this.firebaseService.firestore,
        this.caregiver_dependentsCollectionName,
        relationId
      );

      await setDoc(relationRef, {
        userId,
        dependentId,
        role,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Error creating caregiver-dependent relation:', error);
      throw error;
    }
  }


  async addCollaborativeCaregiver(
    userId: string,
    dependentId: string
  ): Promise<void> {
    // Validar permisos: Solo cuidador primario puede agregar cuidadores
    if (!this.permissionService.canChangeRole()) {
      throw new Error('No tienes permisos para agregar cuidadores');
    }

    try {
      await this.createCaregiverDependentRelation(
        userId,
        dependentId,
        'collaborative_caregiver'
      );
    } catch (error) {
      console.error('Error adding collaborative caregiver:', error);
      throw error;
    }
  }

  async removeCaregiverFromDependent(
    userId: string,
    dependentId: string
  ): Promise<void> {
    try {
      const relationId = `${userId}_${dependentId}`;
      const relationRef = doc(
        this.firebaseService.firestore,
        this.caregiver_dependentsCollectionName,
        relationId
      );
      await deleteDoc(relationRef);
    } catch (error) {
      console.error('Error removing caregiver:', error);
      throw error;
    }
  }

  async getCaregiversForDependent(dependentId: string): Promise<any[]> {
    console.log('[DEPENDENT-SERVICE] ========== GET CAREGIVERS START ==========');
    console.log('[DEPENDENT-SERVICE] dependentId:', dependentId);
    try {
      const caregivers: any[] = [];
      const processedUserIds = new Set<string>();

      // 1. OBTENER DEPENDIENTE Y AGREGAR AL PROPIETARIO/CREADOR
      console.log('[DEPENDENT-SERVICE] Step 1: Fetching dependent document...');
      const dependentRef = doc(
        this.firebaseService.firestore,
        this.dependentCollectionName,
        dependentId
      );
      const dependentSnap = await getDoc(dependentRef);

      if (dependentSnap.exists()) {
        const dependentData = dependentSnap.data() as any;
        console.log('[DEPENDENT-SERVICE] Dependent found:', dependentData.name);

        // Determinar quién es el propietario (puede estar en ownerId, userId, createdBy o primaryCaregiverId)
        const ownerUserId = dependentData.ownerId || dependentData.userId || dependentData.createdBy || dependentData.primaryCaregiverId;

        if (ownerUserId && !processedUserIds.has(ownerUserId)) {
          try {
            const ownerRef = doc(this.firebaseService.firestore, 'users', ownerUserId);
            const ownerSnap = await getDoc(ownerRef);

            if (ownerSnap.exists()) {
              const ownerData = ownerSnap.data();
              let displayName = ownerData['fullName'] || ownerData['name'];
              if (!displayName && ownerData['email']) {
                displayName = ownerData['email'].split('@')[0];
              }

              caregivers.push({
                userId: ownerUserId,
                name: (displayName || 'Sin nombre') + ' (Propietario)',
                email: ownerData['email'],
                image: ownerData['image'] || null,
                role: 'primary_caregiver'
              });
              processedUserIds.add(ownerUserId);
              console.log('[DEPENDENT-SERVICE] Added owner as caregiver:', ownerUserId);
            }
          } catch (error) {
            console.error(`Error fetching owner user ${ownerUserId}:`, error);
          }
        }
      }

      // 2. OBTENER CUIDADORES DE LA RELACIÓN caregiver_dependents
      console.log('[DEPENDENT-SERVICE] Step 2: Querying caregiver_dependents collection...');
      console.log('[DEPENDENT-SERVICE] Looking for documents with dependentId:', dependentId);
      const relationsQuery = query(
        collection(
          this.firebaseService.firestore,
          this.caregiver_dependentsCollectionName
        ),
        where('dependentId', '==', dependentId)
      );

      const relationsDocs = await getDocs(relationsQuery);
      console.log('[DEPENDENT-SERVICE] Found', relationsDocs.size, 'relations in caregiver_dependents');

      for (const relationDoc of relationsDocs.docs) {
        console.log('[DEPENDENT-SERVICE] Processing relation:', relationDoc.id, 'data:', relationDoc.data());
        const relationData = relationDoc.data() as any;

        // No procesar nuevamente si ya fue agregado como propietario
        if (processedUserIds.has(relationData.userId)) {
          console.log('[DEPENDENT-SERVICE] Skipping duplicate caregiver:', relationData.userId);
          continue;
        }

        try {
          // Obtener datos del usuario de la colección 'users'
          const userRef = doc(
            this.firebaseService.firestore,
            'users',
            relationData.userId
          );
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            let displayName = userData['fullName'] || userData['name'];

            // Si no hay nombre, extraer del email
            if (!displayName && userData['email']) {
              displayName = userData['email'].split('@')[0];
            }

            caregivers.push({
              userId: relationData.userId,
              name: displayName || 'Sin nombre',
              email: userData['email'],
              image: userData['image'] || null,
              role: relationData.role
            });
            processedUserIds.add(relationData.userId);
            console.log('[DEPENDENT-SERVICE] Added caregiver:', relationData.userId);
          }
        } catch (error) {
          console.error(`Error fetching user ${relationData.userId}:`, error);
        }
      }

      console.log('[DEPENDENT-SERVICE] Final caregivers list:');
      caregivers.forEach((c, idx) => {
        console.log(`[DEPENDENT-SERVICE]   [${idx}] ${c.name} (${c.role})`);
      });

      // Filtrar cuidadores 'invited' (solo lectura, no participan en chat)
      const filteredCaregivers = caregivers.filter(c => c.role !== 'invited');
      console.log(`[DEPENDENT-SERVICE] Filtered caregivers (excluding 'invited'): ${filteredCaregivers.length}/${caregivers.length}`);

      console.log('[DEPENDENT-SERVICE] ========== GET CAREGIVERS END (SUCCESS) ==========');
      return filteredCaregivers;
    } catch (error) {
      console.error('[DEPENDENT-SERVICE] ❌ Error fetching caregivers for dependent:', error);
      console.error('[DEPENDENT-SERVICE] ========== GET CAREGIVERS END (ERROR) ==========');
      return [];
    }
  }

  async getUserRoleForDependent(
    userId: string,
    dependentId: string
  ): Promise<string | null> {
    console.log('[DEPENDENT-SERVICE] getUserRoleForDependent called - userId:', userId, 'dependentId:', dependentId);
    try {
      // 1. Verificar si es propietario/creador del dependiente
      const dependentRef = doc(
        this.firebaseService.firestore,
        this.dependentCollectionName,
        dependentId
      );
      const dependentSnap = await getDoc(dependentRef);

      if (dependentSnap.exists()) {
        const dependentData = dependentSnap.data() as any;
        const isOwner = dependentData.ownerId === userId ||
                        dependentData.userId === userId ||
                        dependentData.createdBy === userId ||
                        dependentData.primaryCaregiverId === userId;

        if (isOwner) {
          console.log('[DEPENDENT-SERVICE] User is owner/creator - role: primary_caregiver');
          return 'primary_caregiver';
        }
      }

      // 2. Buscar en caregiver_dependents
      const relationId = `${userId}_${dependentId}`;
      const relationRef = doc(
        this.firebaseService.firestore,
        this.caregiver_dependentsCollectionName,
        relationId
      );
      const relationSnap = await getDoc(relationRef);

      if (relationSnap.exists()) {
        const role = relationSnap.data()?.['role'];
        console.log('[DEPENDENT-SERVICE] Found role in caregiver_dependents:', role);
        return role || null;
      }

      console.log('[DEPENDENT-SERVICE] No role found for user-dependent pair');
      return null;
    } catch (error) {
      console.error('[DEPENDENT-SERVICE] Error getting user role for dependent:', error);
      return null;
    }
  }

  async updateCaregiverRole(
    userId: string,
    dependentId: string,
    newRole: 'primary_caregiver' | 'collaborative_caregiver' | 'invited'
  ): Promise<void> {
    // Validar permisos: Solo cuidador primario puede cambiar roles
    if (!this.permissionService.canChangeRole()) {
      throw new Error('No tienes permisos para cambiar roles de cuidadores');
    }

    try {
      const relationId = `${userId}_${dependentId}`;
      const relationRef = doc(
        this.firebaseService.firestore,
        this.caregiver_dependentsCollectionName,
        relationId
      );
      await updateDoc(relationRef, { role: newRole });
    } catch (error) {
      console.error('Error updating caregiver role:', error);
      throw error;
    }
  }
}

