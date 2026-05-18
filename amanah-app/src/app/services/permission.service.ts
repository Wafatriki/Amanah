import { Injectable } from '@angular/core';
import { AuthorizationService } from './authorization';
import { ActiveDependentService } from './active-dependent.service';
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
    private readonly activeDependentService: ActiveDependentService,
    private readonly firebaseService: FirebaseService,
    private readonly authService: AuthService
  ) {}

  private getActiveDependentRole(): 'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null {
    return this.activeDependentService.getActiveDependentRole();
  }

  private isGlobalManager(role: UserRole | null): boolean {
    return role === UserRole.ADMIN || role === UserRole.PRIMARY_CAREGIVER;
  }

  private isDependentWriter(role: 'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null): boolean {
    return role === 'primary_caregiver' || role === 'collaborative_caregiver';
  }

  /**
   * Verificar si el usuario actual puede crear dependientes
   * Primary Caregiver, Collaborative Caregiver, y Admin
   * Usa el rol GLOBAL, no el rol del dependiente activo
   */
  canCreateDependent(): boolean {
    const role = this.authorizationService.getGlobalRole();
    return this.isGlobalManager(role);
  }

  /**
   * Verificar si el usuario actual puede editar un dependiente
   * Primary Caregiver, Collaborative Caregiver, y Admin
   * También pueden ver a otros cuidadores del dependiente
   */
  canEditDependent(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    const dependentRole = this.getActiveDependentRole();
    return this.isDependentWriter(dependentRole);
  }

  /**
   * Verificar si el usuario actual puede eliminar un dependiente
   * Solo Primary Caregiver y Admin
   */
  canDeleteDependent(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (globalRole === UserRole.ADMIN) return true;

    const dependentRole = this.getActiveDependentRole();
    return dependentRole === 'primary_caregiver';
  }

  /**
   * Verificar si el usuario actual puede invitar cuidadores
   * Solo Primary Caregiver y Admin
   */
  canInviteCaregiver(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (globalRole === UserRole.ADMIN) return true;

    const dependentRole = this.getActiveDependentRole();
    return dependentRole === 'primary_caregiver';
  }

  /**
   * Verificar si el usuario actual puede cambiar roles de otros cuidadores
   * Solo Primary Caregiver y Admin
   */
  canChangeRole(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (globalRole === UserRole.ADMIN) return true;

    const dependentRole = this.getActiveDependentRole();
    return dependentRole === 'primary_caregiver';
  }

  /**
   * Verificar si el usuario actual puede ver un dependiente
   * Todos excepto Invited (invitados solo leen, no ven todo)
   */
  canViewDependent(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (globalRole === UserRole.ADMIN) return true;

    const dependentRole = this.getActiveDependentRole();
    return dependentRole !== null && dependentRole !== 'invited';
  }

  /**
   * Verificar si el usuario actual es solo lectura (Invited)
   */
  isReadOnly(): boolean {
    return this.getActiveDependentRole() === 'invited';
  }

  /**
   * Verificar si el usuario actual puede crear citas
   */
  canCreateAppointment(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede editar citas
   */
  canEditAppointment(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede eliminar citas
   */
  canDeleteAppointment(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede crear tareas
   */
  canCreateTask(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede editar tareas
   */
  canEditTask(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede eliminar tareas
   */
  canDeleteTask(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede crear medicamentos
   */
  canCreateMedication(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede editar medicamentos
   */
  canEditMedication(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede eliminar medicamentos
   */
  canDeleteMedication(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede cargar documentos
   */
  canUploadDocument(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede editar documentos
   */
  canEditDocument(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede ver documentos
   */
  canViewDocument(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (globalRole === UserRole.ADMIN) return true;

    return this.getActiveDependentRole() !== null;
  }

  /**
   * Verificar si el usuario actual puede eliminar documentos
   */
  canDeleteDocument(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede acceder al chat
   * Solo cuidadores, no invitados
   */
  canAccessChat(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario actual puede enviar mensajes
   * Solo cuidadores, no invitados
   */
  canSendMessage(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (this.isGlobalManager(globalRole)) return true;

    return this.isDependentWriter(this.getActiveDependentRole());
  }

  /**
   * Verificar si el usuario es admin
   */
  isAdmin(): boolean {
    return this.authorizationService.getGlobalRole() === UserRole.ADMIN;
  }

  /**
   * Verificar si el usuario es dependiente
   */
  isDependent(): boolean {
    return this.authorizationService.getGlobalRole() === UserRole.DEPENDENT;
  }

  /**
   * Verificar si el usuario es cuidador (principal o colaborativo)
   */
  isCaregiver(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (globalRole === UserRole.ADMIN || globalRole === UserRole.PRIMARY_CAREGIVER) return true;

    const dependentRole = this.getActiveDependentRole();
    return dependentRole === 'primary_caregiver' || dependentRole === 'collaborative_caregiver';
  }

  /**
   * Verificar si el usuario es cuidador principal
   */
  isPrimaryCaregiver(): boolean {
    const globalRole = this.authorizationService.getGlobalRole();
    if (globalRole === UserRole.ADMIN || globalRole === UserRole.PRIMARY_CAREGIVER) return true;

    return this.getActiveDependentRole() === 'primary_caregiver';
  }

  /**
   * Verificar si el usuario es cuidador colaborativo
   */
  isCollaborativeCaregiver(): boolean {
    return this.getActiveDependentRole() === 'collaborative_caregiver';
  }

  /**
   * Verificar si el usuario es invitado (solo lectura)
   */
  isInvited(): boolean {
    return this.getActiveDependentRole() === 'invited';
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

      // Si no existe en caregiver_dependents, usa el rol global de la cuenta solo como fallback
      const globalRole = this.authorizationService.getGlobalRole();
      if (globalRole === UserRole.ADMIN || globalRole === UserRole.PRIMARY_CAREGIVER) {
        return 'primary_caregiver';
      }

      return null;
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
