import { Component, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-forgot-password',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  forgotForm: FormGroup;
  isLoading = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  onSendReset(): void {
    if (this.forgotForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    const email = this.forgotForm.get('email')?.value;

    this.authService.sendPasswordReset(email).then(() => {
      this.successMessage = 'Revisa tu email para restablecer la contraseña';
      this.forgotForm.reset();
      this.isLoading = false;
      this.cdr.detectChanges();
    }).catch((err: any) => {
      const errorCode = err.code || '';

      if (errorCode === 'auth/user-not-found') {
        this.errorMessage = 'Este email no está registrado';
      } else if (errorCode === 'auth/invalid-email') {
        this.errorMessage = 'Email inválido';
      } else {
        this.errorMessage = err.message;
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  getEmailError(): string {
    const emailControl = this.forgotForm.get('email');
    if (emailControl?.hasError('required')) {
      return 'El email es requerido';
    }
    if (emailControl?.hasError('email')) {
      return 'Email inválido';
    }
    return '';
  }
}
