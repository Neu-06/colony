import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.parseUrl('/auth');
  }

  const role = authService.getCurrentRole();
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return true;
  }

  return router.parseUrl('/app');
};
