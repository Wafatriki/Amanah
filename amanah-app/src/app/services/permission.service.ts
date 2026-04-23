import { Injectable } from '@angular/core';
import { AuthorizationService } from './authorization';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import { UserRole } from '../models/user.model';
import { doc, getDoc } from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class PermissionService {

  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly firebaseService: FirebaseService,
    private readonly authService: AuthService
  ) {}

  /**
   * Verificar si el usuario actual puede crear dependientes
   * Primary Caregiver, Collaborative Caregiver, y Admin
   * Usa el rol GLOBAL, no el rol del dependiente activo
   */
  canCreateDependent(): boolean {
    const role = this.authorizationService.getGlobalRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede editar un dependiente
   * Primary Caregiver, Collaborative Caregiver, y Admin
   * También pueden ver a otros cuidadores del dependiente
   */
  canEditDependent(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede eliminar un dependiente
   * Solo Primary Caregiver y Admin
   */
  canDeleteDependent(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return role === UserRole.PRIMARY_CAREGIVER || role === UserRole.ADMIN;
  }

  /**
   * Verificar si el usuario actual puede invitar cuidadores
   * Solo Primary Caregiver y Admin
   */
  canInviteCaregiver(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return role === UserRole.PRIMARY_CAREGIVER || role === UserRole.ADMIN;
  }

  /**
   * Verificar si el usuario actual puede cambiar roles de otros cuidadores
   * Solo Primary Caregiver y Admin
   */
  canChangeRole(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return role === UserRole.PRIMARY_CAREGIVER || role === UserRole.ADMIN;
  }

  /**
   * Verificar si el usuario actual puede ver un dependiente
   * Todos excepto Invited (invitados solo leen, no ven todo)
   */
  canViewDependent(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return role !== null && role !== UserRole.INVITED;
  }

  /**
   * Verificar si el usuario actual es solo lectura (Invited)
   */
  isReadOnly(): boolean {
    return this.authorizationService.getCurrentRole() === UserRole.INVITED;
  }

  /**
   * Verificar si el usuario actual puede crear citas
   */
  canCreateAppointment(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede editar citas
   */
  canEditAppointment(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede eliminar citas
   */
  canDeleteAppointment(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede crear tareas
   */
  canCreateTask(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede editar tareas
   */
  canEditTask(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede eliminar tareas
   */
  canDeleteTask(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede crear medicamentos
   */
  canCreateMedication(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede editar medicamentos
   */
  canEditMedication(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede eliminar medicamentos
   */
  canDeleteMedication(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede cargar documentos
   */
  canUploadDocument(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede editar documentos
   */
  canEditDocument(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede ver documentos
   */
  canViewDocument(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return role !== null;
  }

  /**
   * Verificar si el usuario actual puede eliminar documentos
   */
  canDeleteDocument(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede acceder al chat
   * Solo cuidadores, no invitados
   */
  canAccessChat(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario actual puede enviar mensajes
   * Solo cuidadores, no invitados
   */
  canSendMessage(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return [UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN].includes(role!);
  }

  /**
   * Verificar si el usuario es admin
   */
  isAdmin(): boolean {
    return this.authorizationService.getCurrentRole() === UserRole.ADMIN;
  }

  /**
   * Verificar si el usuario es dependiente
   */
  isDependent(): boolean {
    return this.authorizationService.getCurrentRole() === UserRole.DEPENDENT;
  }

  /**
   * Verificar si el usuario es cuidador (principal o colaborativo)
   */
  isCaregiver(): boolean {
    const role = this.authorizationService.getCurrentRole();
    return role === UserRole.PRIMARY_CAREGIVER || role === UserRole.COLLABORATIVE_CAREGIVER;
  }

  /**
   * Verificar si el usuario es cuidador principal
   */
  isPrimaryCaregiver(): boolean {
    return this.authorizationService.getCurrentRole() === UserRole.PRIMARY_CAREGIVER;
  }

  /**
   * Verificar si el usuario es cuidador colaborativo
   */
  isCollaborativeCaregiver(): boolean {
    return this.authorizationService.getCurrentRole() === UserRole.COLLABORATIVE_CAREGIVER;
  }

  /**
   * Verificar si el usuario es invitado (solo lectura)
   */
  isInvited(): boolean {
    return this.authorizationService.getCurrentRole() === UserRole.INVITED;
  }

  /**
   * Obtener el rol del usuario para un dependiente específico
   * Lee de caregiver_dependents si existe, si no usa el rol global
   */
  async getRoleForDependent(dependentId: string): Promise<'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null> {
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) return null;

      // Buscar en caregiver_dependents
      const caregiverDocId = `${currentUser.uid}_${dependentId}`;
      const caregiverDoc = await getDoc(
        doc(this.firebaseService.firestore, 'caregiver_dependents', caregiverDocId)
      );

      if (caregiverDoc.exists()) {
        return caregiverDoc.data()['role'] as 'primary_caregiver' | 'collaborative_caregiver' | 'invited';
      }

      // Si no existe en caregiver_dependents, retorna el rol global del usuario
      return this.authorizationService.getCurrentRole() as 'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null;
    } catch (error) {
      console.error('Error obteniendo rol para dependiente:', error);
      return null;
    }
  }

  /**
   * Verificar si el usuario es invitado (solo lectura) para un dependiente específico
   */
  async isReadOnlyForDependent(dependentId: string): Promise<boolean> {
    const role = await this.getRoleForDependent(dependentId);
    return role === UserRole.INVITED;
  }

  /**
   * Verificar si el usuario puede editar documentos para un dependiente específico
   */
  async canEditDocumentForDependent(dependentId: string): Promise<boolean> {
    const role = await this.getRoleForDependent(dependentId);
    return role !== UserRole.INVITED && role !== null;
  }

  /**
   * Verificar si el usuario puede subir documentos para un dependiente específico
   */
  async canUploadDocumentForDependent(dependentId: string): Promise<boolean> {
    const role = await this.getRoleForDependent(dependentId);
    return role !== UserRole.INVITED && role !== null;
  }
}
