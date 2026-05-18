import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { UserRole } from '../models/user.model';
import { AuthorizationService } from '../services/authorization';
import { take } from 'rxjs';

/**
 * Guard de autorización basado en roles.
 * Acepta uno o múltiples roles requeridos.
 * El usuario debe tener al menos uno de los roles especificados.
 *
 * @param requiredRoles - Uno o múltiples roles requeridos
 * @returns CanActivateFn que verifica si el usuario tiene los permisos necesarios
 *
 * @example
 * // Un único rol
 * canActivate: [roleGuard([UserRole.PRIMARY_CAREGIVER])]
 *
 * // Múltiples roles (el usuario necesita uno de ellos)
 * canActivate: [roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.ADMIN])]
 */
export const roleGuard = (requiredRoles: UserRole[] | UserRole): CanActivateFn => {
  // Convertir single rol a array si es necesario
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (route, state) => {
    const authorizationService = inject(AuthorizationService);
    const router = inject(Router);

    // Esperar hasta que AuthorizationService tenga un valor de rol, para evitar
    // condiciones de carrera en el arranque (login -> navegación rápida).
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        // Fallback: usar rol global o denegar
        const globalRole = authorizationService.getGlobalRole();
        if (globalRole && roles.includes(globalRole)) {
          resolve(true);
        } else {
          router.navigate(['/dashboard']);
          resolve(false);
        }
      }, 600);

      // Usar take(1) para evitar manejar la suscripción manualmente
      authorizationService.globalUserRole$.pipe(take(1)).subscribe((userRole) => {
        clearTimeout(timeout);
        if (userRole && roles.includes(userRole)) {
          resolve(true);
        } else {
          const globalRole = authorizationService.getGlobalRole();
          if (globalRole && roles.includes(globalRole)) {
            resolve(true);
          } else {
            router.navigate(['/dashboard']);
            resolve(false);
          }
        }
      });
    });
  }
}
