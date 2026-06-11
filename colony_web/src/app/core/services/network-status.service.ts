import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, fromEvent, merge, Observable } from 'rxjs';
import Swal from 'sweetalert2';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService implements OnDestroy {
  private readonly _isOnline$ = new BehaviorSubject<boolean>(navigator.onLine);
  readonly isOnline$: Observable<boolean> = this._isOnline$.asObservable();

  private readonly onlineSub = fromEvent(window, 'online').subscribe(() => this._handleOnline());
  private readonly offlineSub = fromEvent(window, 'offline').subscribe(() => this._handleOffline());

  get isOnline(): boolean {
    return this._isOnline$.value;
  }

  private _handleOnline(): void {
    this._isOnline$.next(true);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Conexión restaurada',
      text: 'Sincronizando datos pendientes...',
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
    });
  }

  private _handleOffline(): void {
    this._isOnline$.next(false);
    Swal.fire({
      toast: false,
      icon: 'warning',
      title: 'Sin conexión a internet',
      text: 'Los formularios enviados se guardarán localmente y se sincronizarán automáticamente cuando vuelva la conexión.',
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#1D4ED8',
    });
  }

  ngOnDestroy(): void {
    this.onlineSub.unsubscribe();
    this.offlineSub.unsubscribe();
  }
}
