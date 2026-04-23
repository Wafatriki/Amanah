import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { PermissionService } from './permission.service';
import { Invitation } from '../models/invitation.model';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class InvitationService {
  private readonly invitationCollectionName = 'invitations';
  private readonly caregiver_dependentsCollectionName = 'caregiver_dependents';
  private readonly permissionService = inject(PermissionService);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly authService: AuthService
  ) {}

  // Generar token único
  private generateToken(): string {
    return Math.random().toString(36).substring(2, 11) +
      Date.now().toString(36);
  }

  // PASO 2A: Crear invitación
  async createInvitation(
    invitedEmail: string,
    dependentId: string,
    role: 'primary_caregiver' | 'collaborative_caregiver' | 'invited' = 'collaborative_caregiver'
  ): Promise<{ docId: string; token: string }> {
    // Validar permisos: Solo cuidador primario puede crear invitaciones
    if (!this.permissionService.canInviteCaregiver()) {
      throw new Error('No tienes permisos para invitar cuidadores');
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) throw new Error('No hay usuario autenticado');

    const token = this.generateToken();

    const invitation: any = {
      invitationToken: token,
      inviterUserId: currentUser.uid,
      invitedEmail: invitedEmail.toLowerCase(),
      dependentId: dependentId,
      role: role,
      status: 'pending',
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 días
    };

    console.log('Creating invitation with token:', token);
    console.log('Invitation data:', invitation);

    const docRef = await addDoc(
      collection(this.firebaseService.firestore, this.invitationCollectionName),
      invitation
    );

    console.log('Invitation saved with docId:', docRef.id);

    return { docId: docRef.id, token: token };
  }

  // PASO 2B: Obtener invitación por token (para la página de aceptación)
  async getInvitationByToken(token: string): Promise<Invitation | null> {
    console.log('Looking for invitation with token:', token);

    const q = query(
      collection(this.firebaseService.firestore, this.invitationCollectionName),
      where('invitationToken', '==', token),
      where('status', '==', 'pending')
    );

    const docs = await getDocs(q);

    console.log('Found documents:', docs.size);

    if (docs.empty) {
      console.log('No invitation found for token:', token);
      return null;
    }

    const invDoc = docs.docs[0];
    const data = invDoc.data();

    console.log('Invitation data:', data);

    // Verificar que no haya expirado
    const expiresAtValue = data['expiresAt'];
    const expiresAt = expiresAtValue instanceof Timestamp ?
      expiresAtValue.toDate() : new Date(expiresAtValue);

    if (expiresAt < new Date()) {
      console.log('Invitation expired');
      // Marcar como expirada
      await updateDoc(invDoc.ref, { status: 'expired' });
      return null;
    }

    return { id: invDoc.id, ...data } as Invitation;
  }

  // PASO 2C: Aceptar invitación (vincular cuidador con dependiente)
  async acceptInvitation(token: string, userId: string): Promise<void> {
    console.log('acceptInvitation called with token:', token, 'and userId:', userId);

    const invitation = await this.getInvitationByToken(token);
    if (!invitation) throw new Error('Invitación inválida o expirada');

    console.log('Invitation found:', invitation);

    const batch = writeBatch(this.firebaseService.firestore);

    // Actualizar invitación como aceptada
    batch.update(
      doc(this.firebaseService.firestore, this.invitationCollectionName, invitation.id || ''),
      {
        status: 'accepted',
        acceptedAt: Timestamp.now(),
        acceptedByUserId: userId,
      }
    );

    // Crear relación en caregiver_dependents
    const caregiverDocId = `${userId}_${invitation.dependentId}`;
    console.log('Creating caregiver_dependent with docId:', caregiverDocId);

    batch.set(
      doc(
        this.firebaseService.firestore,
        this.caregiver_dependentsCollectionName,
        caregiverDocId
      ),
      {
        userId: userId,
        dependentId: invitation.dependentId,
        role: invitation.role,
        createdAt: Timestamp.now(),
      }
    );

    console.log('Committing batch...');
    await batch.commit();
    console.log('Batch committed successfully');
  }

  // PASO 2D: Obtener invitaciones pendientes de un usuario (para mostrar en dashboard)
  async getPendingInvitationsForEmail(email: string): Promise<Invitation[]> {
    const q = query(
      collection(this.firebaseService.firestore, this.invitationCollectionName),
      where('invitedEmail', '==', email.toLowerCase()),
      where('status', '==', 'pending')
    );

    const docs = await getDocs(q);
    const invitations: Invitation[] = [];

    for (const doc of docs.docs) {
      const data = doc.data();
      const expiresAtValue = data['expiresAt'];
      const expiresAt = expiresAtValue instanceof Timestamp ?
        expiresAtValue.toDate() : new Date(expiresAtValue);

      if (expiresAt >= new Date()) {
        invitations.push({ id: doc.id, ...data } as Invitation);
      } else {
        // Marcar como expirada si pasó la fecha
        await updateDoc(doc.ref, { status: 'expired' });
      }
    }

    return invitations;
  }
}
