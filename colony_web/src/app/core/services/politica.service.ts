import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PoliticaNegocio } from '../models/canvas.models';

export interface PoliticaPublicadaResumen {
  id: string;
  nombre: string;
  version: number;
  fechaCreacion?: string;
  publicadoPorNombre: string;
}

@Injectable({
  providedIn: 'root'
})
export class PoliticaService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8080/api/politicas';

  guardarPolitica(politica: PoliticaNegocio): Observable<PoliticaNegocio> {
    return this.http.post<PoliticaNegocio>(this.apiUrl, politica);
  }

  obtenerMisBorradores(): Observable<PoliticaNegocio[]> {
    return this.http.get<PoliticaNegocio[]>(`${this.apiUrl}/mis-borradores`);
  }

  obtenerPoliticaPorId(id: string): Observable<PoliticaNegocio> {
    return this.http.get<PoliticaNegocio>(`${this.apiUrl}/${id}`);
  }

  obtenerPoliticasPublicadas(): Observable<PoliticaPublicadaResumen[]> {
    return this.http.get<PoliticaPublicadaResumen[]>(`${this.apiUrl}/publicadas`);
  }

  obtenerPoliticaPublicadaPorId(id: string): Observable<PoliticaNegocio> {
    return this.http.get<PoliticaNegocio>(`${this.apiUrl}/publicadas/${id}`);
  }

  eliminarPolitica(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
