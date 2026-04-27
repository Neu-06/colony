import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root'
})
export class AlertaService {
  mostrarExito(mensaje: string): void {
    const toast = Swal.mixin({
      toast: true,
      position: 'bottom-start',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      iconColor: '#16a34a',
      customClass: {
        popup: 'border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-lg',
        title: 'text-sm font-semibold text-emerald-800'
      }
    });

    void toast.fire({
      icon: 'success',
      title: mensaje
    });
  }

  mostrarError(mensaje: string): void {
    const toast = Swal.mixin({
      toast: true,
      position: 'bottom-start',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      iconColor: '#dc2626',
      customClass: {
        popup: 'border border-rose-200 bg-rose-50 text-rose-800 shadow-lg',
        title: 'text-sm font-semibold text-rose-800'
      }
    });

    void toast.fire({
      icon: 'error',
      title: mensaje
    });
  }

  async confirmarAccion(titulo: string, texto: string): Promise<boolean> {
    const resultado = await Swal.fire({
      title: titulo,
      text: texto,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      cancelButtonText: 'Cancelar',
      buttonsStyling: false,
      customClass: {
        popup: 'rounded-xl border border-slate-200 shadow-xl',
        title: 'text-lg font-semibold text-slate-800',
        htmlContainer: 'text-sm text-slate-600',
        confirmButton: 'rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 mr-2',
        cancelButton: 'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100'
      }
    });

    return !!resultado.isConfirmed;
  }
}
