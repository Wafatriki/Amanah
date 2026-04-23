import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DependentService } from '../../services/dependent.service';
import { AuthService } from '../../services/auth.service';
import { UiFeedbackService } from '../../services/ui-feedback.service';

@Component({
  selector: 'app-caregiver-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './caregiver-list.component.html',
  styleUrls: ['./caregiver-list.component.scss']
})
export class CaregiverListComponent implements OnInit {
  dependentId: string = '';
  dependentName: string = '';
  caregivers: any[] = [];
  loading = true;
  error = '';
  currentUserId: string | null = null;
  openMenuId: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly dependentService: DependentService,
    private readonly authService: AuthService,
    private readonly uiFeedbackService: UiFeedbackService,
    private readonly router: Router,
    private readonly location: Location
  ) {}



  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.dependentId = params['id'];
      this.currentUserId = this.authService.getCurrentUser()?.uid || null;
      this.verifyOwnershipAndLoad();
    });
  }

  async verifyOwnershipAndLoad(): Promise<void> {
    try {
      // Verify that the current user is either the owner or a caregiver of this dependent
      const dependent = await this.dependentService.getDependent(this.dependentId).toPromise();

      if (!dependent) {
        console.warn('Dependent not found');
        this.error = 'Dependiente no encontrado';
        this.loading = false;
        return;
      }

      // Check if the current user is the owner (createdBy field)
      const isOwner = dependent.createdBy === this.currentUserId;

      // Check if the current user is a caregiver of this dependent
      let isCaregiver = false;
      if (!isOwner) {
        const caregivers = await this.dependentService.getCaregiversForDependent(this.dependentId);
        isCaregiver = caregivers.some(c => c.userId === this.currentUserId);
      }

      // Allow access if user is owner OR caregiver
      if (!isOwner && !isCaregiver) {
        console.warn('User is neither owner nor caregiver of this dependent. Redirecting to dashboard.');
        this.error = 'No tienes permiso para ver los cuidadores de este dependiente';
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 1500);
        return;
      }

      this.loadCaregivers();
    } catch (error) {
      console.error('Error verifying ownership:', error);
      this.error = 'Error al verificar permiso';
      this.loading = false;
    }
  }

  async loadCaregivers(): Promise<void> {
    try {
      this.caregivers = await this.dependentService.getCaregiversForDependent(this.dependentId);
    } catch (error) {
      this.error = 'Error al cargar cuidadores';
      console.error('Error al cargar cuidadores:', error);
    } finally {
      this.loading = false;
    }
  }

  openInviteForm(): void {
    this.router.navigate(['/dependent', this.dependentId, 'invite']);
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

    try {
      await this.dependentService.removeCaregiverFromDependent(userId, this.dependentId);
      this.caregivers = this.caregivers.filter(c => c.userId !== userId);
    } catch (error) {
      this.error = 'Error al eliminar cuidador';
      console.error('Error al eliminar cuidador:', error);
    }
  }

  async changeRole(caregiver: any, newRole: 'primary_caregiver' | 'collaborative_caregiver' | 'invited'): Promise<void> {
    this.openMenuId = null; // Cerrar menú

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
      // Actualizar el rol localmente
      caregiver.role = newRole;
    } catch (error) {
      this.error = 'Error al cambiar el rol del cuidador';
      console.error('Error al cambiar rol:', error);
    }
  }

  toggleMenu(caregiverId: string): void {
    this.openMenuId = this.openMenuId === caregiverId ? null : caregiverId;
  }

  closeMenu(): void {
    this.openMenuId = null;
  }

  goBack(): void {
    this.location.back();
  }

  viewCaregiverProfile(caregiverId: string, currentUserId: string | null): void {
    console.log('Viewing profile - caregiverId:', caregiverId, 'currentUserId:', currentUserId);

    // Only allow viewing profile of other caregivers, not yourself
    if (currentUserId && caregiverId === currentUserId) {
      console.log('Same user, navigating to own profile');
      this.router.navigate(['/profile']);
      return;
    }

    // Save the dependent ID so the profile component can verify access
    localStorage.setItem('activeDependentId', this.dependentId);
    console.log('Navigating to /profile/' + caregiverId);

    // Navigate to the caregiver's profile
    this.router.navigate(['/profile', caregiverId]);
  }
}
