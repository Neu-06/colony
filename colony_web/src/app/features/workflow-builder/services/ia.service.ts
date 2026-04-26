import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface IAAnalisisResponse {
  faltaInicio: boolean;
  faltaFin: boolean;
  nodosSinConexion: string[];
  sugerencias: string[];
}

/**
 * Servicio para comunicarse con el proxy de IA en Spring Boot.
 * Spring Boot reenvía la petición al microservicio Python (colony_ai).
 */
@Injectable({ providedIn: 'root' })
export class IAService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/api/ia';

  /**
   * Envía el JSON del canvas a Spring Boot para análisis con Gemini.
   * @param canvasData El estado actual del workflow (nodos, aristas, carriles, etc.)
   */
  analizarCanvas(canvasData: object): Observable<IAAnalisisResponse> {
    return this.http.post<IAAnalisisResponse>(`${this.baseUrl}/analizar-canvas`, canvasData);
  }

  /**
   * Envía el JSON del canvas para ser reparado por la IA.
   * @param canvasData El estado actual del workflow.
   * @return El JSON del workflow reparado.
   */
  corregirCanvas(canvasData: object): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/corregir-canvas`, canvasData);
  }
}
