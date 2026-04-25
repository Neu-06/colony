import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const funcionarioGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.parseUrl('/auth');
  }

  const role = authService.getCurrentRole();
  if (role === 'FUNCIONARIO') {
    return true;
  }

  return router.parseUrl('/app');
};
