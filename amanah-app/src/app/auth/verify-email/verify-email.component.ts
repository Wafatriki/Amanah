import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule],
  templateUrl: 'verify-email.component.html',
  styleUrls: ['verify-email.component.scss']
})
export class VerifyEmailComponent {
  message: string | null = null;
  error: string | null = null;
  isResending = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async onResend() {
    this.message = null;
    this.error = null;
    this.isResending = true;
    try {
      await this.auth.resendVerificationEmail();
      this.message = 'Email de verificación reenviado. Revisa tu bandeja de entrada.';
    } catch (err: any) {
      this.error = err?.message || 'No se pudo reenviar el email. Intenta más tarde.';
    }
    this.isResending = false;
    this.cdr.markForCheck();
  }

  async onSignOut() {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
