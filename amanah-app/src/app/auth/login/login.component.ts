import { Component, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DependentService } from '../../services/dependent.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage: string | null = null;
  isRegisterMode = false;
  unverifiedUser: any = null;
  isResendingEmail = false;
  resendMessage: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly dependentService: DependentService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  onLogin(): void {
    if (this.loginForm.invalid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).then(async () => {
      // Get current user
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        this.errorMessage = 'Error al obtener usuario';
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }

      // Check if there's an invitation token
      const invitationToken = sessionStorage.getItem('invitationToken');
      if (invitationToken) {
        sessionStorage.removeItem('invitationToken');
        this.router.navigate(['/accept-invitation'], { queryParams: { token: invitationToken } });
        return;
      }

      // Check number of dependents
      try {
        const dependents = await this.dependentService.getDependentsForUser(currentUser.uid).toPromise() || [];

        if (!dependents || dependents.length === 0) {
          // No dependents - redirect to create dependent
          this.router.navigate(['/create-dependent']);
        } else if (dependents.length === 1) {
          // One dependent - go to dashboard with that dependent
          this.router.navigate(['/dashboard']);
        } else {
          // Multiple dependents - go to selector
          this.router.navigate(['/dependent-selector']);
        }
      } catch (err) {
        console.error('Error loading dependents:', err);
        // Default to dashboard if error
        this.router.navigate(['/dashboard']);
      }
    }).catch((error: any) => {
      const errorCode = error.code || '';
      if (errorCode === 'auth/invalid-credential') {
        this.errorMessage = 'Email o contraseña incorrectos';
      } else if (errorCode === 'auth/user-not-found') {
        this.errorMessage = 'Este email no está registrado';
      } else if (errorCode === 'auth/wrong-password') {
        this.errorMessage = 'Contraseña incorrecta';
      } else if (errorCode === 'auth/invalid-email') {
        this.errorMessage = 'Email inválido';
      } else if (errorCode === 'auth/too-many-requests') {
        this.errorMessage = 'Demasiados intentos. Intenta más tarde';
      } else if (errorCode === 'auth/email-not-verified') {
        this.errorMessage = error.message;
        this.unverifiedUser = error.user; // Guardar el usuario para poder reenviar el email
      } else if (error.message) {
        this.errorMessage = error.message;
      } else {
        this.errorMessage = 'Error en el inicio de sesión';
      }
      this.isLoading = false;
      this.cdr.detectChanges(); // Forzar detección de cambios
    });
  }

  getEmailError(): string {
    const emailControl = this.loginForm.get('email');
    if (emailControl?.hasError('required')) {
      return 'El email es requerido';
    }
    if (emailControl?.hasError('email')) {
      return 'Email inválido';
    }
    return '';
  }

  getPasswordError(): string {
    const passwordControl = this.loginForm.get('password');
    if (passwordControl?.hasError('required')) {
      return 'La contraseña es requerida';
    }
    if (passwordControl?.hasError('minlength')) {
      return 'Mínimo 6 caracteres';
    }
    return '';
  }

  onRegisterClick(): void {
    this.router.navigate(['/register']);
  }

  onForgotPasswordClick(): void {
    this.router.navigate(['/forgot-password']);
  }

  async onResendEmail(): Promise<void> {
    if (!this.unverifiedUser) return;

    this.isResendingEmail = true;
    this.resendMessage = null;

    try {
      await this.authService.resendEmailVerification(this.unverifiedUser);
      this.resendMessage = '✓ Email de verificación reenviado. Revisa tu bandeja de entrada.';
      this.cdr.detectChanges();
    } catch (error: any) {
      this.resendMessage = error.message || 'Error al reenviar el email';
      this.cdr.detectChanges();
    } finally {
      this.isResendingEmail = false;
    }
  }
}


