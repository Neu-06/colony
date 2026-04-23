import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DepartamentoDto {
  id: string;
  nombre: string;
  activo?: string;
}

export interface DepartamentoPayload {
  nombre: string;
}

@Injectable({
  providedIn: 'root'
})
export class DepartamentoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8080/api/departamentos';

  listar(): Observable<DepartamentoDto[]> {
    return this.http.get<DepartamentoDto[]>(this.apiUrl);
  }

  crear(payload: DepartamentoPayload): Observable<DepartamentoDto> {
    return this.http.post<DepartamentoDto>(this.apiUrl, payload);
  }

  actualizar(id: string, payload: DepartamentoPayload): Observable<DepartamentoDto> {
    return this.http.put<DepartamentoDto>(`${this.apiUrl}/${id}`, payload);
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
