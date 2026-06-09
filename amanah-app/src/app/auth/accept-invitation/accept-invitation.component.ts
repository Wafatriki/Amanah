import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { InvitationService } from '../../services/invitation.service';
import { AuthService } from '../../services/auth.service';
import { DependentService } from '../../services/dependent.service';
import { Invitation } from '../../models/invitation.model';
import { NotificationService } from '../../services/notification.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accept-invitation.component.html',
  styleUrls: ['./accept-invitation.component.scss']
})
export class AcceptInvitationComponent implements OnInit, OnDestroy {
  token: string = '';
  invitation: Invitation | null = null;
  currentUser: any = null;
  dependentName = '';
  loading = true;
  error = '';
  accepting = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly invitationService: InvitationService,
    private readonly authService: AuthService,
    private readonly dependentService: DependentService,
    private readonly notificationService: NotificationService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Cargar token de invitación primero
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.token = params['token'];
        if (this.token) {
          // Esperar a que el usuario esté logueado antes de cargar la invitación
          this.authService.currentUser$
            .pipe(takeUntil(this.destroy$))
            .subscribe(user => {
              console.log('Current user updated:', user);
              this.currentUser = user;

              if (user) {
                // Usuario logueado: cargar invitación
                this.loadInvitation();
              } else {
                // No hay usuario: mostrar estado de espera para que se logue
                this.loading = false;
                this.error = '';
                console.log('Esperando al usuario para loguear...');
              }
              this.cdr.markForCheck();
            });
        } else {
          this.error = 'No se encontró token de invitación';
          this.loading = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadInvitation(): Promise<void> {
    try {
      console.log('loadInvitation called with token:', this.token);

      const invitation = await this.invitationService.getInvitationByToken(this.token);

      console.log('Invitation result:', invitation);

      if (!invitation) {
        this.error = 'Invitación inválida o expirada';
        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      // Validar que el usuario logueado sea la persona invitada
      const userEmail = this.currentUser?.email?.toLowerCase() ?? '';
      if (userEmail) {
        const invitedEmail = invitation.invitedEmail?.toLowerCase() ?? '';

        if (userEmail !== invitedEmail) {
          this.error = 'No eres la persona invitada para esta invitación.';
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }
      }

      this.invitation = invitation;
      this.cdr.markForCheck();

      // Cargar nombre del dependiente
      this.dependentService.getDependent(invitation.dependentId).subscribe({
        next: (dependent) => {
          console.log('Dependent loaded:', dependent);
          if (dependent) {
            this.dependentName = dependent.name;
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading dependent:', err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      });



      setTimeout(() => {
        if (this.loading) {
          console.log('Timeout reached, setting loading to false');
          this.loading = false;
          this.cdr.markForCheck();
        }
      }, 5000);
    } catch (error) {
      console.error('Error in loadInvitation:', error);
      this.error = 'Error cargando invitación: ' + String(error);
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async acceptInvitation(): Promise<void> {
    console.log('acceptInvitation called');
    console.log('currentUser:', this.currentUser);
    console.log('invitation:', this.invitation);

    if (!this.currentUser || !this.invitation) {
      console.error('Cannot accept invitation: missing user or invitation');
      this.error = 'No hay usuario autenticado o invitación válida';
      return;
    }

    this.accepting = true;
    this.cdr.markForCheck();

    try {
      console.log('Calling invitationService.acceptInvitation...');
      await this.invitationService.acceptInvitation(
        this.token,
        this.currentUser.uid
      );

      console.log('Invitation accepted successfully');
      this.notificationService.notifySuccess('Invitación aceptada', 'Ya eres cuidador de este dependiente');
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      this.error = 'Error aceptando invitación: ' + String(error);
      this.accepting = false;
      this.cdr.markForCheck();
    }
  }

  logout(): Promise<void> {
    return this.authService.logout();
  }

  goToLogin(): void {
    //Guardar el token en sessionStorage para recuperarlo después del login
    sessionStorage.setItem('invitationToken', this.token);
    this.router.navigate(['/login']);
  }
}
