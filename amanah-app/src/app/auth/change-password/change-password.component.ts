import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();
  @Output() success = new EventEmitter<void>();

  changePasswordForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
  passwordStrength = 0;
  hasUpperCase = false;
  hasLowerCase = false;
  hasNumber = false;
  hasSpecialChar = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.updatePasswordRequirements();
    this.changePasswordForm
      .get('newPassword')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((password) => {
        this.passwordStrength = this.authService.calculatePasswordStrength(password || '');
        this.updatePasswordRequirements();
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.changePasswordForm = this.fb.group(
      {
        currentPassword: ['', [Validators.required]],
        newPassword: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordsMatchValidator }
    );
  }

  private passwordsMatchValidator(group: FormGroup): { [key: string]: any } | null {
    const newPassword = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;

    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      group.get('confirmPassword')?.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    } else if (group.get('confirmPassword')?.errors?.['passwordMismatch']) {
      group.get('confirmPassword')?.setErrors(null);
    }

    return null;
  }

  async onSubmit(): Promise<void> {
    if (!this.changePasswordForm.valid) {
      this.errorMessage = 'Por favor completa todos los campos correctamente';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const { currentPassword, newPassword } = this.changePasswordForm.value;

      // Validar fortaleza de la nueva contraseña
      const strengthCheck = this.authService.validatePasswordStrength(newPassword);
      if (!strengthCheck.isValid) {
        this.errorMessage = 'La contraseña no cumple los requisitos: ' + strengthCheck.errors.join(', ');
        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      // Cambiar contraseña
      await this.authService.changePassword(currentPassword, newPassword);
      this.successMessage = 'Contraseña cambiada. Se cerrará la sesión para que vuelvas a entrar con la nueva contraseña.';

      //cerrar el modal después de 1.5 segundos
      setTimeout(() => {
        this.success.emit();
        this.onClose();
      }, 1800);
    } catch (error: any) {
      this.errorMessage = error.message || 'Error al cambiar la contraseña';
      console.error('Error changing password:', error);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current') {
      this.showCurrentPassword = !this.showCurrentPassword;
    } else if (field === 'new') {
      this.showNewPassword = !this.showNewPassword;
    } else if (field === 'confirm') {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  getPasswordStrengthColor(): string {
    if (this.passwordStrength < 30) return '#ef4444'; // red
    if (this.passwordStrength < 60) return '#f97316'; // orange
    if (this.passwordStrength < 80) return '#eab308'; // yellow
    return '#22c55e'; // green
  }

  getPasswordStrengthText(): string {
    if (this.passwordStrength < 30) return 'Débil';
    if (this.passwordStrength < 60) return 'Regular';
    if (this.passwordStrength < 80) return 'Buena';
    return 'Fuerte';
  }

  onClose(): void {
    this.close.emit();
  }

  private updatePasswordRequirements(): void {
    const password = this.changePasswordForm.get('newPassword')?.value || '';
    this.hasUpperCase = /[A-Z]/.test(password);
    this.hasLowerCase = /[a-z]/.test(password);
    this.hasNumber = /[0-9]/.test(password);
    this.hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};'"\\|,.<>\/?]/.test(password);
  }
}
