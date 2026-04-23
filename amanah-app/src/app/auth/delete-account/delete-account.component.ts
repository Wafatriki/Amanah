import { Component, Output, EventEmitter, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-delete-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './delete-account.component.html',
  styleUrl: './delete-account.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteAccountComponent {
  @Output() closeModal = new EventEmitter<void>();
  @Output() success = new EventEmitter<void>();

  password = '';
  confirmPassword = '';
  isLoading = signal(false);
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  errorMessage = '';
  step: 'confirmation' | 'password' = 'confirmation';

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  onConfirmDeletion(): void {
    this.step = 'password';
  }

  async onSubmit(): Promise<void> {
    if (!this.password || !this.confirmPassword) {
      this.errorMessage = 'Por favor ingresa tu contraseña en ambos campos';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Las contraseñas no coinciden';
      return;
    }

    this.isLoading.set(true);
    this.errorMessage = '';

    try {
      await this.authService.deleteAccount(this.password);
      // Redirigir al login después de la eliminación exitosa
      await this.router.navigate(['/login']);
      this.success.emit();
    } catch (error: any) {
      console.error('Delete account error:', error);

      // Manejar errores específicos
      if (error.code === 'auth/invalid-credential' || error.message?.includes('invalid')) {
        this.errorMessage = 'Contraseña incorrecta. Verifica tu contraseña e intenta nuevamente.';
      } else if (error.code === 'auth/user-token-expired') {
        this.errorMessage = 'Tu sesión ha expirado. Por favor vuelve a iniciar sesión.';
      } else if (error.code === 'auth/too-many-requests') {
        this.errorMessage = 'Demasiados intentos fallidos. Intenta más tarde.';
      } else if (error.code === 'auth/network-request-failed') {
        this.errorMessage = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
      } else {
        this.errorMessage = error.message || 'Error al eliminar la cuenta. Intenta nuevamente.';
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.set(!this.showConfirmPassword());
  }

  goBack(): void {
    this.step = 'confirmation';
    this.password = '';
    this.confirmPassword = '';
    this.errorMessage = '';
  }

  onCloseModal(): void {
    this.closeModal.emit();
  }

  get isFormValid(): boolean {
    return this.password.length > 0 && this.confirmPassword.length > 0 && this.password === this.confirmPassword;
  }
}
