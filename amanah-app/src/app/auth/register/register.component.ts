import { Component, ChangeDetectorRef } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
  registerForm: FormGroup;
  isLoading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  passwordStrength = 0;
  passwordErrors: string[] = [];
  showPassword = false;
  showConfirmPassword = false;
  registrationSuccess = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.registerForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2), this.nameValidator()]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        this.passwordStrengthValidator()
      ]],
      confirmPassword: ['', Validators.required],
      acceptTerms: [false, Validators.requiredTrue]
    }, {
      validators: [this.passwordMatchValidator()]
    });
  }

  /**
   * Validador de nombre (solo letras, espacios y acentos)
   */
  nameValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      const nameRegex = /^[a-záéíóúñA-ZÁÉÍÓÚÑ\s'-]+$/;
      return nameRegex.test(control.value) ? null : { invalidName: true };
    };
  }

  /**
   * Validador de fortaleza de contraseña
   */
  passwordStrengthValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;

      const password = control.value;
      const validation = this.authService.validatePasswordStrength(password);

      // Actualizar el indicador visual
      this.passwordStrength = this.authService.calculatePasswordStrength(password);
      this.passwordErrors = validation.errors;
      this.cdr.markForCheck();

      return validation.isValid ? null : { weakPassword: true };
    };
  }

  /**
   * Validador de coincidencia de contraseña
   */
  passwordMatchValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const password = group.get('password')?.value;
      const confirmPassword = group.get('confirmPassword')?.value;

      if (!password || !confirmPassword) return null;

      return password === confirmPassword ? null : { passwordMismatch: true };
    };
  }

  getFullNameError(): string {
    const control = this.registerForm.get('fullName');
    if (control?.hasError('required')) {
      return 'El nombre es requerido';
    }
    if (control?.hasError('minlength')) {
      return 'Mínimo 2 caracteres';
    }
    if (control?.hasError('invalidName')) {
      return 'Solo letras, espacios y acentos permitidos';
    }
    return '';
  }

  getEmailError(): string {
    const control = this.registerForm.get('email');
    if (control?.hasError('required')) {
      return 'El email es requerido';
    }
    if (control?.hasError('email')) {
      return 'Email inválido';
    }
    return '';
  }

  getPasswordError(): string {
    const control = this.registerForm.get('password');
    if (control?.hasError('required')) {
      return 'La contraseña es requerida';
    }
    if (control?.hasError('minlength')) {
      return 'Mínimo 8 caracteres';
    }
    if (control?.hasError('weakPassword')) {
      return 'Contraseña no cumple los requisitos';
    }
    return '';
  }

  getConfirmPasswordError(): string {
    const control = this.registerForm.get('confirmPassword');
    if (control?.hasError('required')) {
      return 'Confirma tu contraseña';
    }
    if (this.registerForm.hasError('passwordMismatch') && control?.touched) {
      return 'Las contraseñas no coinciden';
    }
    return '';
  }

  getPasswordStrengthColor(): string {
    if (this.passwordStrength === 0) return '#cccccc';
    if (this.passwordStrength < 25) return '#dc3545';
    if (this.passwordStrength < 50) return '#fd7e14';
    if (this.passwordStrength < 75) return '#ffc107';
    return '#28a745';
  }

  getPasswordStrengthLabel(): string {
    if (this.passwordStrength === 0) return 'Sin evaluar';
    if (this.passwordStrength < 25) return 'Muy débil';
    if (this.passwordStrength < 50) return 'Débil';
    if (this.passwordStrength < 75) return 'Moderada';
    return 'Fuerte';
  }

  // Métodos para verificar requisitos de contraseña
  hasMinLength(): boolean {
    const password = this.registerForm.get('password')?.value || '';
    return password.length >= 8;
  }

  hasUpperCase(): boolean {
    const password = this.registerForm.get('password')?.value || '';
    return /[A-Z]/.test(password);
  }

  hasLowerCase(): boolean {
    const password = this.registerForm.get('password')?.value || '';
    return /[a-z]/.test(password);
  }

  hasNumber(): boolean {
    const password = this.registerForm.get('password')?.value || '';
    return /[0-9]/.test(password);
  }

  hasSpecialChar(): boolean {
    const password = this.registerForm.get('password')?.value || '';
    return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  onRegister(): void {
    if (this.registerForm.invalid) {
      this.errorMessage = 'Por favor completa todos los campos correctamente';
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    const { fullName, email, password } = this.registerForm.value;

    this.authService.register(email, password, fullName)
      .then(() => {
        this.registrationSuccess = true;
        this.successMessage = 'Registro exitoso. Se ha enviado un email de verificación. Revisa tu bandeja de entrada.';
        this.isLoading = false;
        this.cdr.markForCheck();

        // Redirigir después de 3 segundos
        setTimeout(() => {
          const invitationToken = sessionStorage.getItem('invitationToken');
          if (invitationToken) {
            sessionStorage.removeItem('invitationToken');
            this.router.navigate(['/accept-invitation'], { queryParams: { token: invitationToken } });
          } else {
            this.router.navigate(['/login']);
          }
        }, 3000);
      })
      .catch((err: any) => {
        const errorCode = err.code || '';

        if (errorCode === 'auth/email-already-in-use') {
          this.errorMessage = 'Este email ya está registrado';
        } else if (errorCode === 'auth/invalid-email') {
          this.errorMessage = 'Email inválido';
        } else if (errorCode === 'auth/weak-password') {
          this.errorMessage = 'La contraseña es demasiado débil';
        } else if (errorCode === 'auth/operation-not-allowed') {
          this.errorMessage = 'El registro está deshabilitado en este momento';
        } else if (err.message) {
          this.errorMessage = err.message;
        } else {
          this.errorMessage = 'Error al registrar. Por favor intenta nuevamente.';
        }

        this.isLoading = false;
        this.cdr.markForCheck();
      });
  }
}
