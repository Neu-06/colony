import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NetworkStatusService } from '../services/network-status.service';
import { OfflineSyncService } from '../services/offline-sync.service';

/**
 * Interceptor that catches network failures on mutating requests (POST, PUT, PATCH)
 * and queues them in IndexedDB for later replay when connectivity is restored.
 * GET requests fail immediately (they are queries, not side effects).
 */
export const offlineInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const network = inject(NetworkStatusService);
  const syncService = inject(OfflineSyncService);

  const isMutating = ['POST', 'PUT', 'PATCH'].includes(req.method);

  return next(req).pipe(
    catchError((error) => {
      // status 0 = network error (no internet)
      if (isMutating && (error.status === 0 || !network.isOnline)) {
        // Extract current auth header to replay later with correct token
        const headers: Record<string, string> = {};
        req.headers.keys().forEach(key => {
          headers[key] = req.headers.get(key) ?? '';
        });

        syncService.enqueue({
          url: req.urlWithParams,
          method: req.method,
          body: req.body,
          headers,
        }).then(() => {
          console.info(`[OfflineInterceptor] Petición encolada offline: ${req.method} ${req.url}`);
        });

        // Return a resolved-like observable so the UI doesn't crash
        return throwError(() => ({
          ...error,
          offlineQueued: true,
          message: 'Sin conexión. Tu solicitud se guardó y se enviará cuando vuelva el internet.',
        }));
      }
      return throwError(() => error);
    })
  );
};
