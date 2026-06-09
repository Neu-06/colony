import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface KpiGeneralDTO {
  totalInstancias: number;
  enProceso: number;
  finalizadas: number;
  totalDepartamentos: number;
}

export interface MetricaRendimientoDTO {
  identificador: string;
  nombrePolitica?: string;
  tipoNodo?: string;
  tiempoPromedioSegundos: number;
  cantidadTramites: number;
}

@Injectable({
  providedIn: 'root'
})
export class MetricasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.backendBaseUrl}/api/metricas`;

  getGeneral(): Observable<KpiGeneralDTO> {
    return this.http.get<KpiGeneralDTO>(`${this.apiUrl}/general`);
  }

  getRendimientoUsuarios(): Observable<MetricaRendimientoDTO[]> {
    return this.http.get<MetricaRendimientoDTO[]>(`${this.apiUrl}/rendimiento-usuarios`);
  }

  getCuellosBotella(): Observable<MetricaRendimientoDTO[]> {
    return this.http.get<MetricaRendimientoDTO[]>(`${this.apiUrl}/cuellos-botella`);
  }

  getAnomalias(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/anomalias`);
  }

  sendChatMessage(message: string): Observable<any> {
    const aiUrl = environment.backendBaseUrl.replace('8080', '8000'); // Assuming AI is on port 8000
    return this.http.post<any>(`${aiUrl}/api/v1/chat/nlu`, { message });
  }
}
