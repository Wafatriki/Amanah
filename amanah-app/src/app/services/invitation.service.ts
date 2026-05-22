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
    console.log('[INVITATION-SERVICE] Creating invitation for:', invitedEmail, 'dependent:', dependentId);

    if (!this.permissionService.canInviteCaregiver()) {
      throw new Error('No tienes permisos para invitar cuidadores');
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) throw new Error('No hay usuario autenticado');

    const token = this.generateToken();

    const invitation: any = {
      invitationToken: token,
      inviterUserId: currentUser.uid,
      invitedEmail: invitedEmail.toLowerCase().trim(),
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
    console.log('[INVITATION-SERVICE] ========== ACCEPT INVITATION START ==========');
    console.log('[INVITATION-SERVICE] token:', token);
    console.log('[INVITATION-SERVICE] userId:', userId);

    const invitation = await this.getInvitationByToken(token);
    if (!invitation) {
      console.error('[INVITATION-SERVICE] Invitation not found or expired');
      throw new Error('Invitación inválida o expirada');
    }

    console.log('[INVITATION-SERVICE] Invitation found:');
    console.log('[INVITATION-SERVICE]   - id:', invitation.id);
    console.log('[INVITATION-SERVICE]   - dependentId:', invitation.dependentId);
    console.log('[INVITATION-SERVICE]   - role:', invitation.role);
    console.log('[INVITATION-SERVICE]   - invitedEmail:', invitation.invitedEmail);

    const batch = writeBatch(this.firebaseService.firestore);

    // Actualizar invitación como aceptada
    console.log('[INVITATION-SERVICE] Updating invitation document...');
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
    console.log('[INVITATION-SERVICE] Creating caregiver_dependent document:');
    console.log('[INVITATION-SERVICE]   - docId:', caregiverDocId);
    console.log('[INVITATION-SERVICE]   - userId:', userId);
    console.log('[INVITATION-SERVICE]   - dependentId:', invitation.dependentId);
    console.log('[INVITATION-SERVICE]   - role:', invitation.role);

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
        acceptedAt: Timestamp.now(),
      }
    );

    console.log('[INVITATION-SERVICE] Committing batch...');
    try {
      await batch.commit();
      console.log('[INVITATION-SERVICE] ✅ Batch committed successfully');
      console.log('[INVITATION-SERVICE] ========== ACCEPT INVITATION END (SUCCESS) ==========');
    } catch (error) {
      console.error('[INVITATION-SERVICE] ❌ Error committing batch:', error);
      console.error('[INVITATION-SERVICE] ========== ACCEPT INVITATION END (ERROR) ==========');
      throw error;
    }
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
