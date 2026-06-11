import { APP_INITIALIZER, ApplicationConfig, inject, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { offlineInterceptor } from './core/interceptors/offline.interceptor';
import { NetworkStatusService } from './core/services/network-status.service';

import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, offlineInterceptor])),
    provideCharts(withDefaultRegisterables()),
    // Eagerly instantiate NetworkStatusService so it listens from the start
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        inject(NetworkStatusService);
        return () => Promise.resolve();
      },
      multi: true,
    },
  ]
};
