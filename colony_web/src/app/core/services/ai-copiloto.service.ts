import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AiCopilotoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8000/api/v1/canvas';

  recomendar(canvasData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/recommend`, { data: canvasData });
  }

  autocorregir(canvasData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/fix`, { data: canvasData });
  }

  enviarComandoChat(canvasData: any, comando: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/chat`, { 
      canvas_data: canvasData, 
      comando_usuario: comando 
    });
  }
}
