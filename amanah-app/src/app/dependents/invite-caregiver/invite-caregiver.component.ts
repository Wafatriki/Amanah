import { Component, Input, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InvitationService } from '../../services/invitation.service';
import { DependentService } from '../../services/dependent.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-invite-caregiver',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invite-caregiver.component.html',
  styleUrls: ['./invite-caregiver.component.scss']
})
export class InviteCaregiverComponent implements OnInit {
  @Input() dependentId!: string;
  @Input() dependentName!: string;

  invitedEmail = '';
  role: 'primary_caregiver' | 'collaborative_caregiver' = 'collaborative_caregiver';
  loading = false;
  successMessage = '';
  errorMessage = '';
  currentUserId: string | null = null;
  isLoadingDependent = true;

  constructor(
    private readonly invitationService: InvitationService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly dependentService: DependentService,
    private readonly authService: AuthService,
    private readonly location: Location
  ) {}

  ngOnInit(): void {
    // Check if dependentId comes from @Input or route params
    if (!this.dependentId) {
      this.route.params.subscribe(params => {
        this.dependentId = params['id'];
        this.currentUserId = this.authService.getCurrentUser()?.uid || null;
        this.verifyOwnershipAndLoad();
      });
    } else {
      this.isLoadingDependent = false;
    }
  }

  async verifyOwnershipAndLoad(): Promise<void> {
    try {
      // Verify that the current user is either the owner or a caregiver of this dependent
      const dependent = await this.dependentService.getDependent(this.dependentId).toPromise();

      if (!dependent) {
        console.warn('Dependent not found');
        this.errorMessage = 'Dependiente no encontrado';
        this.isLoadingDependent = false;
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
        this.errorMessage = 'No tienes permiso para invitar cuidadores a este dependiente';
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 1500);
        return;
      }

      this.dependentName = dependent.name;
      this.isLoadingDependent = false;
    } catch (error) {
      console.error('Error verifying ownership:', error);
      this.errorMessage = 'Error al verificar permiso';
      this.isLoadingDependent = false;
    }
  }

  async sendInvitation(): Promise<void> {
    if (!this.invitedEmail.trim()) {
      this.errorMessage = 'Por favor ingresa un email';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await this.invitationService.createInvitation(
        this.invitedEmail,
        this.dependentId,
        this.role
      );

      this.successMessage = `Invitación enviada a ${this.invitedEmail}`;
      this.invitedEmail = '';

      // Llamar Cloud Function para enviar email real (PASO 6)
    } catch (error) {
      this.errorMessage = 'Error al crear invitación';
      console.error(error);
    } finally {
      this.loading = false;
    }
  }

  goBack(): void {
    this.location.back();
  }
}
