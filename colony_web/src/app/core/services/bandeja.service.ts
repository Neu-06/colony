import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CampoForm } from '../models/canvas.models';
import { environment } from '../../../environments/environment';

export interface BandejaItemDto {
  instanciaId: string;
  codigoTramite: string;
  fecha?: string;
  semaforo: 'ROJO' | 'AMARILLO';
  nombrePolitica: string;
  nombreNodoActual: string;
  nodoActualId: string;
  scoreRiesgo?: number;
  prioridadAnalitica?: number;
  tiempoEstimadoMinutos?: number;
}

export interface AtencionTramiteDto {
  instanciaId: string;
  codigoTramite: string;
  nodoActualId: string;
  tipoNodo: string | null;
  datosDinamicos: Record<string, unknown>;
  esquemaFormulario: CampoForm[];
}

interface AvanzarInstanciaRequest {
  instanciaId: string;
  usuarioId: string;
  nodoId?: string;
  datosNuevos: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class BandejaService {
  private readonly http = inject(HttpClient);
  private readonly bandejaApi = `${environment.backendBaseUrl}/api/bandeja`;
  private readonly motorApi = `${environment.backendBaseUrl}/api/motor`;

  listarPorDepartamento(departamentoId: string): Observable<BandejaItemDto[]> {
    return this.http.get<BandejaItemDto[]>(`${this.bandejaApi}/${departamentoId}`);
  }

  tomarTramite(instanciaId: string, usuarioId: string): Observable<void> {
    return this.http.put<void>(`${this.bandejaApi}/tomar/${instanciaId}/${usuarioId}`, {});
  }

  obtenerAtencion(instanciaId: string, tareaId?: string): Observable<AtencionTramiteDto> {
    let url = `${this.motorApi}/atencion/${instanciaId}`;
    if (tareaId) url += `?tareaId=${tareaId}`;
    return this.http.get<AtencionTramiteDto>(url);
  }

  avanzarTramite(instanciaId: string, usuarioId: string, datosNuevos: Record<string, unknown>, nodoId?: string): Observable<unknown> {
    const payload: AvanzarInstanciaRequest = { instanciaId, usuarioId, datosNuevos, nodoId };
    return this.http.post(`${this.motorApi}/avanzar`, payload);
  }
}
