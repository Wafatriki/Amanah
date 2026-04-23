import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { inject } from '@angular/core';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // TEMPORALMENTE DESACTIVADO PARA DESARROLLO - QUITAR EN PRODUCCIÓN
  return true;

  // const currentUser = authService.getCurrentUser();

  // if (currentUser) {
  //   return true;
  // } else {
  //   router.navigate(['/login']);
  //   return false;
  // }
};
