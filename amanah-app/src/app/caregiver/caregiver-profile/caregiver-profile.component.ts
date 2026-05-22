import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { User } from '../../models/user.model';
import { Dependent } from '../../models/dependent.model';
import { AuthService } from '../../services/auth.service';
import { DependentService } from '../../services/dependent.service';
import { PermissionService } from '../../services/permission.service';
import { NotificationService } from '../../services/notification.service';
import { ChangePasswordComponent } from '../../auth/change-password/change-password.component';
import { DeleteAccountComponent } from '../../auth/delete-account/delete-account.component';

@Component({
  selector: 'app-caregiver-profile',
  standalone: true,
  imports: [CommonModule, ChangePasswordComponent, DeleteAccountComponent],
  templateUrl: './caregiver-profile.component.html',
  styleUrl: './caregiver-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaregiverProfileComponent implements OnInit, OnDestroy {
  readonly emojiAvatarDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="58" text-anchor="middle" dominant-baseline="middle" font-size="56">👤</text></svg>'
  )}`;
  caregiver: User | null = null;
  dependents: Dependent[] = [];
  loading = true;
  isOwnProfile = true;
  currentUserId: string | null = null;
  viewingUserId: string | null = null;
  showChangePasswordModal = false;
  showDeleteAccountModal = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly dependentService: DependentService,
    private readonly permissionService: PermissionService,
    private readonly notificationService: NotificationService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.viewingUserId = params['id'] || null;
      this.loadCaregiverProfile();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadCaregiverProfile(): Promise<void> {
    console.log('Loading caregiver profile');
    this.loading = true;

    try {
      // SECURITY: Verify current user existence
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        console.warn('No current user found, redirecting to login');
        this.router.navigate(['/login']);
        return;
      }

      this.currentUserId = currentUser.uid;
      const userIdToLoad = this.viewingUserId || currentUser.uid;
      const isViewingOtherProfile = !!this.viewingUserId && this.viewingUserId !== currentUser.uid;

      // If viewing another caregiver's profile, verify access
      if (isViewingOtherProfile) {
        const hasAccess = await this.verifyAccessToProfile(userIdToLoad);
        if (!hasAccess) {
          console.warn('Access denied to this profile');
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }
        this.isOwnProfile = false;
      } else {
        this.isOwnProfile = true;
      }

      // Load the caregiver data
      this.authService
        .getUserData(userIdToLoad)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (userData) => {
            console.log('Caregiver data loaded:', userData);
            if (!userData) {
              console.warn('User data is null');
              if (isViewingOtherProfile) {
                this.router.navigate(['/profile']);
              } else {
                this.router.navigate(['/login']);
              }
              return;
            }

            // Convert Firestore Timestamp to Date if needed
            if (userData.createdAt?.toDate) {
              userData.createdAt = userData.createdAt.toDate();
            }
            this.caregiver = userData;

            // Only load dependents if viewing own profile
            if (this.isOwnProfile) {
              this.loadDependents(userIdToLoad);
            } else {
              this.loading = false;
              this.cdr.markForCheck();
            }
          },
          error: (err) => {
            console.error('Error loading caregiver profile:', err);
            this.loading = false;
            this.cdr.markForCheck();
          },
        });
    } catch (error) {
      console.error('Error in loadCaregiverProfile:', error);
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async verifyAccessToProfile(userIdToView: string): Promise<boolean> {
    try {
      // Get the active dependent to check if both users are caregivers of the same dependent
      const activeDependentId = localStorage.getItem('activeDependentId');

      if (!activeDependentId) {
        console.warn('No active dependent set');
        return false;
      }

      // Get caregivers of the dependent
      const caregivers = await this.dependentService.getCaregiversForDependent(activeDependentId);

      // Check if current user is a caregiver
      const currentUserIsCaregiverOfDependent = caregivers.some(c => c.userId === this.currentUserId);

      // Check if the user being viewed is also a caregiver
      const viewedUserIsCaregiverOfDependent = caregivers.some(c => c.userId === userIdToView);

      // Both must be caregivers of the same dependent
      return currentUserIsCaregiverOfDependent && viewedUserIsCaregiverOfDependent;
    } catch (error) {
      console.error('Error verifying access:', error);
      return false;
    }
  }

  loadDependents(userId: string): void {
    this.dependentService
      .getDependentsForUser(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (dependents) => {
          console.log('Dependents loaded:', dependents);
          this.dependents = dependents || [];
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading dependents:', err);
          this.dependents = [];
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }

  editProfile(): void {
    this.router.navigate(['/edit-profile']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  openChangePasswordModal(): void {
    this.showChangePasswordModal = true;
    this.cdr.markForCheck();
  }

  closeChangePasswordModal(): void {
    this.showChangePasswordModal = false;
    this.cdr.markForCheck();
  }

  onPasswordChanged(): void {
    this.notificationService.notifyInfo(
      'Contraseña actualizada',
      'Se cerrará tu sesión para que inicies con la nueva contraseña.'
    );
    this.closeChangePasswordModal();
    setTimeout(() => {
      this.authService.logout();
      this.router.navigate(['/login']);
    }, 1200);
  }

  openDeleteAccountModal(): void {
    this.showDeleteAccountModal = true;
    this.cdr.markForCheck();
  }

  closeDeleteAccountModal(): void {
    this.showDeleteAccountModal = false;
    this.cdr.markForCheck();
  }

  getRoleLabel(role: string): string {
    const roleLabels: Record<string, string> = {
      'primary_caregiver': 'Cuidador Principal',
      'collaborative_caregiver': 'Cuidador Colaborativo',
      'admin': 'Administrador',
      'invited': 'Invitado'
    };
    return roleLabels[role] || role;
  }

  canEditOwnProfile(): boolean {
    return true;
  }

  canDeleteOwnProfile(): boolean {
    return true;
  }

  replaceWithEmojiAvatar(event: Event): void {
    const target = event.target as HTMLImageElement | null;
    if (!target) {
      return;
    }

    target.onerror = null;
    target.src = this.emojiAvatarDataUrl;
  }
}
