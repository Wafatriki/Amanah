import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ActiveDependentService } from '../services/active-dependent.service';
import { DependentService } from '../services/dependent.service';
import { AuthService } from '../services/auth.service';
import { InvitationService } from '../services/invitation.service';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-caregivers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './caregivers.component.html',
  styleUrls: ['./caregivers.component.scss']
})
export class CaregiversComponent implements OnInit, OnDestroy {
  dependentId: string | null = null;
  dependentName: string = '';
  caregivers: any[] = [];
  loading = true;
  error = '';
  currentUserId: string | null = null;
  showInviteForm = false;
  invitedEmail = '';
  inviteRole: 'primary_caregiver' | 'collaborative_caregiver' = 'collaborative_caregiver';
  inviteLoading = false;
  inviteError = '';
  inviteSuccess = '';
  invitationLink: string = '';
  showInvitationLink = false;
  activeMenuId: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly activeDependentService: ActiveDependentService,
    private readonly dependentService: DependentService,
    private readonly authService: AuthService,
    private readonly invitationService: InvitationService,
    private readonly uiFeedbackService: UiFeedbackService,
    private readonly notificationService: NotificationService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Monitorear cambios de usuario en tiempo real
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUserId = user?.uid || null;
        this.cdr.markForCheck();
      });

    // Obtener el dependiente activo una vez
    const activeDependentId = this.activeDependentService.getActiveDependentId();

    if (activeDependentId?.trim()) {
      this.dependentId = activeDependentId;
      this.loadCaregivers();
    } else {
      this.loading = false;
    }

    // También suscribirse para cambios futuros
    this.activeDependentService.getActiveDependentId$()
      .pipe(takeUntil(this.destroy$))
      .subscribe(dependentId => {
        if (dependentId?.trim()) {
          this.dependentId = dependentId;
          this.loadCaregivers();
        } else {
          this.loading = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadCaregivers(): Promise<void> {
    if (!this.dependentId) {
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      this.caregivers = await this.dependentService.getCaregiversForDependent(this.dependentId);

      // Poner loading en false AHORA (no esperar al subscribe)
      this.loading = false;
      this.cdr.markForCheck();

      // Cargar nombre del dependiente en paralelo (no bloquea)
      this.dependentService.getDependent(this.dependentId).subscribe({
        next: (dependent) => {
          if (dependent) {
            this.dependentName = dependent.name;
            this.cdr.markForCheck();
          }
        },
        error: (err) => {
          console.error('Error loading dependent:', err);
          this.dependentName = 'Dependiente';
        }
      });
    } catch (error) {
      console.error('Error in loadCaregivers:', error);
      this.error = 'Error cargando cuidadores';
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  toggleInviteForm(): void {
    this.showInviteForm = !this.showInviteForm;
    this.inviteError = '';
    this.inviteSuccess = '';
    this.invitedEmail = '';
  }

  async sendInvitation(): Promise<void> {
    if (!this.invitedEmail.trim()) {
      this.inviteError = 'Por favor ingresa un email';
      return;
    }

    if (!this.dependentId) {
      this.inviteError = 'No hay dependiente seleccionado';
      return;
    }

    this.inviteLoading = true;
    this.inviteError = '';
    this.inviteSuccess = '';
    this.showInvitationLink = false;

    try {
      const result = await this.invitationService.createInvitation(
        this.invitedEmail,
        this.dependentId,
        this.inviteRole
      );

      const baseUrl = globalThis.location.origin;
      this.invitationLink = `${baseUrl}/accept-invitation?token=${result.token}`;
      this.showInvitationLink = true;

      this.inviteSuccess = `Invitación creada para ${this.invitedEmail}`;
      this.invitedEmail = '';
      this.inviteRole = 'collaborative_caregiver';

      // Recargar cuidadores después de 2 segundos
      setTimeout(() => {
        this.loadCaregivers();
      }, 2000);
    } catch (error) {
      this.inviteError = 'Error al crear invitación';
      console.error(error);
    } finally {
      this.inviteLoading = false;
    }
  }

  async removeCaregiver(userId: string): Promise<void> {
    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar cuidador',
      message: 'Este cuidador se desvinculará del dependiente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (!confirmed) {
      return;
    }

    if (!this.dependentId) {
      this.error = 'No hay dependiente seleccionado';
      return;
    }

    try {
      await this.dependentService.removeCaregiverFromDependent(userId, this.dependentId);
      this.caregivers = this.caregivers.filter(c => c.userId !== userId);
      this.cdr.markForCheck();
      this.notificationService.notifySuccess('Cuidador eliminado', 'El cuidador se eliminó correctamente');

      // Recargar después de 1 segundo
      setTimeout(() => {
        this.loadCaregivers();
      }, 1000);
    } catch (error) {
      console.error('Error removing caregiver:', error);
      this.error = 'Error al eliminar cuidador: ' + String(error);
      this.cdr.markForCheck();
      this.notificationService.notifyError('Error', 'No se pudo eliminar el cuidador');
    }
  }

  async changeRole(caregiver: any, newRole: 'primary_caregiver' | 'collaborative_caregiver' | 'invited'): Promise<void> {
    this.closeMenu();

    if (!this.dependentId) {
      this.error = 'No hay dependiente seleccionado';
      return;
    }

    const roleLabels: Record<string, string> = {
      'primary_caregiver': 'Cuidador Principal',
      'collaborative_caregiver': 'Cuidador Colaborativo',
      'invited': 'Invitado'
    };

    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Cambiar rol',
      message: `¿Cambiar a ${caregiver.name} a ${roleLabels[newRole]}?`,
      confirmText: 'Cambiar',
      cancelText: 'Cancelar'
    });

    if (!confirmed) {
      return;
    }

    try {
      await this.dependentService.updateCaregiverRole(
        caregiver.userId,
        this.dependentId,
        newRole
      );
      caregiver.role = newRole;
      this.cdr.markForCheck();
      this.notificationService.notifySuccess('Rol actualizado', 'El rol del cuidador se actualizó correctamente');
    } catch (error) {
      console.error('Error changing role:', error);
      this.error = 'Error al cambiar el rol del cuidador';
      this.cdr.markForCheck();
      this.notificationService.notifyError('Error', 'No se pudo cambiar el rol del cuidador');
    }
  }

  goToDependentSelector(): void {
    this.router.navigate(['/dependent-selector']);
  }

  copyInvitationLink(): void {
    navigator.clipboard.writeText(this.invitationLink);
  }

  isPrimaryCaregiver(userId: string): boolean {
    const result = this.caregivers.some(c => c.userId === userId && c.role === 'primary_caregiver');
    return result;
  }

  toggleMenu(caregiverId: string): void {
    this.activeMenuId = this.activeMenuId === caregiverId ? null : caregiverId;
  }

  closeMenu(): void {
    this.activeMenuId = null;
  }

  viewCaregiverProfile(caregiverId: string, currentUserId: string | null): void {
    console.log('Viewing profile - caregiverId:', caregiverId, 'currentUserId:', currentUserId);

    // Only allow viewing profile of other caregivers, not yourself
    if (currentUserId && caregiverId === currentUserId) {
      console.log('Same user, navigating to own profile');
      this.router.navigate(['/profile']);
      return;
    }

    if (!this.dependentId) {
      console.warn('No dependent selected');
      return;
    }

    // Save the dependent ID so the profile component can verify access
    localStorage.setItem('activeDependentId', this.dependentId);
    console.log('Navigating to /profile/' + caregiverId);

    // Navigate to the caregiver's profile
    this.router.navigate(['/profile', caregiverId]);
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
