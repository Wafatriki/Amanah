import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { inject } from '@angular/core';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const currentUser = authService.getCurrentUser();

  // If there's no authenticated user, redirect to login
  if (!currentUser) {
    router.navigate(['/login']);
    return false;
  }

  // Require email verification before allowing access
  if (!currentUser.emailVerified) {
    // Sign out to ensure app state is clean and send user to verification notice
    authService.logout().catch(() => {});
    router.navigate(['/verify-email']);
    return false;
  }

  return true;
};
