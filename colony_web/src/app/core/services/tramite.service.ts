import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CampoForm } from '../models/canvas.models';

export interface TramiteCatalogoDto {
  id: string;
  nombre: string;
  descripcion: string;
}

export interface PrimerFormularioDto {
  politicaId: string;
  primeraTareaId: string;
  esquemaFormulario: CampoForm[];
}

export interface IniciarInstanciaResponse {
  codigoRastreo: string;
}

interface IniciarInstanciaRequest {
  politicaId: string;
  usuarioIniciadorId: string;
  datosIniciales: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class TramiteService {
  private readonly http = inject(HttpClient);
  private readonly tramitesApi = 'http://localhost:8080/api/tramites';
  private readonly motorApi = 'http://localhost:8080/api/motor';

  listarPublicados(departamentoId: string): Observable<TramiteCatalogoDto[]> {
    return this.http.get<TramiteCatalogoDto[]>(`${this.tramitesApi}/publicados/${departamentoId}`);
  }

  obtenerPrimerFormulario(politicaId: string): Observable<PrimerFormularioDto> {
    return this.http.get<PrimerFormularioDto>(`${this.tramitesApi}/${politicaId}/primer-formulario`);
  }

  iniciarInstancia(
    politicaId: string,
    usuarioIniciadorId: string,
    datosIniciales: Record<string, unknown>
  ): Observable<IniciarInstanciaResponse> {
    const payload: IniciarInstanciaRequest = { politicaId, usuarioIniciadorId, datosIniciales };
    return this.http.post<IniciarInstanciaResponse>(`${this.motorApi}/iniciar`, payload);
  }
}
