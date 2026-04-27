import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface KpiGeneralDTO {
  totalInstancias: number;
  enProceso: number;
  finalizadas: number;
  totalDepartamentos: number;
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
  private readonly apiUrl = '/api/metricas';

  getGeneral(): Observable<KpiGeneralDTO> {
    return this.http.get<KpiGeneralDTO>('http://localhost:8080/api/metricas/general');
  }

  getRendimientoUsuarios(): Observable<MetricaRendimientoDTO[]> {
    return this.http.get<MetricaRendimientoDTO[]>('http://localhost:8080/api/metricas/rendimiento-usuarios');
  }

  getCuellosBotella(): Observable<MetricaRendimientoDTO[]> {
    return this.http.get<MetricaRendimientoDTO[]>('http://localhost:8080/api/metricas/cuellos-botella');
  }
}
