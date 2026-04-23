import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { UserRole } from '../models/user.model';
import { AuthorizationService } from '../services/authorization';

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

    // Verificar si el usuario tiene al menos uno de los roles requeridos
    const userRole = authorizationService.getCurrentRole();
    if (userRole && roles.includes(userRole)) {
      return true;
    } else {
      router.navigate(['/dashboard']);
      return false;
    }
  }
}
