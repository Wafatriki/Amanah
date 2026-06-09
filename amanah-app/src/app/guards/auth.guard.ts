import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { inject } from '@angular/core';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const currentUser = authService.getCurrentUser();

  if (!currentUser) {
    return router.parseUrl('/login');
  }

  const isVerified = await authService.isAccountEmailVerifiedForGuard(currentUser);
  if (!isVerified) {
    authService.logout().catch(() => {});
    return router.parseUrl('/verify-email');
  }

  return true;
};
