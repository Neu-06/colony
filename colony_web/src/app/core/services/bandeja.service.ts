import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CampoForm } from '../models/canvas.models';

export interface BandejaItemDto {
  instanciaId: string;
  codigoTramite: string;
  fecha?: string;
  semaforo: 'ROJO' | 'AMARILLO';
}

export interface AtencionTramiteDto {
  instanciaId: string;
  codigoTramite: string;
  nodoActualId: string;
  datosDinamicos: Record<string, unknown>;
  esquemaFormulario: CampoForm[];
}

interface AvanzarInstanciaRequest {
  instanciaId: string;
  datos: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class BandejaService {
  private readonly http = inject(HttpClient);
  private readonly bandejaApi = 'http://localhost:8080/api/bandeja';
  private readonly motorApi = 'http://localhost:8080/api/motor';

  listarPorDepartamento(departamentoId: string): Observable<BandejaItemDto[]> {
    return this.http.get<BandejaItemDto[]>(`${this.bandejaApi}/${departamentoId}`);
  }

  tomarTramite(instanciaId: string, usuarioId: string): Observable<void> {
    return this.http.put<void>(`${this.bandejaApi}/tomar/${instanciaId}/${usuarioId}`, {});
  }

  obtenerAtencion(instanciaId: string): Observable<AtencionTramiteDto> {
    return this.http.get<AtencionTramiteDto>(`${this.motorApi}/atencion/${instanciaId}`);
  }

  avanzarTramite(instanciaId: string, datos: Record<string, unknown>): Observable<unknown> {
    const payload: AvanzarInstanciaRequest = { instanciaId, datos };
    return this.http.post(`${this.motorApi}/avanzar`, payload);
  }
}
