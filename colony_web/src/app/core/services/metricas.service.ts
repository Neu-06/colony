import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface KpiGeneralDTO {
  totalInstancias: number;
  enProceso: number;
  finalizadas: number;
}

export interface MetricaRendimientoDTO {
  identificador: string;
  tiempoPromedioSegundos: number;
  cantidadTramites: number;
}

@Injectable({
  providedIn: 'root'
})
export class MetricasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8080/api/metricas';

  getGeneral(): Observable<KpiGeneralDTO> {
    return this.http.get<KpiGeneralDTO>(`${this.apiUrl}/general`);
  }

  getRendimientoUsuarios(): Observable<MetricaRendimientoDTO[]> {
    return this.http.get<MetricaRendimientoDTO[]>(`${this.apiUrl}/rendimiento-usuarios`);
  }

  getCuellosBotella(): Observable<MetricaRendimientoDTO[]> {
    return this.http.get<MetricaRendimientoDTO[]>(`${this.apiUrl}/cuellos-botella`);
  }
}
