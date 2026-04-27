import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TareaItemAI {
  instanciaId: string;
  codigoTramite: string;
  nombrePolitica: string;
  nombreNodoActual: string;
  fecha?: string;
  semaforo?: string;
}

export interface CampoFormularioAI {
  nombre: string;
  tipo: string;
  requerido: boolean;
  opciones?: string;
}

export interface ResultadoComandoBandeja {
  accion: 'abrir_tarea' | 'informar' | 'sin_accion';
  instanciaId: string | null;
  mensaje: string;
  datos_extra?: Record<string, unknown>;
}

export interface ResultadoRellenarFormulario {
  camposRellenos: Record<string, unknown>;
  camposNoInterpretados: string[];
  mensaje: string;
}

export interface ResultadoValidarEnvio {
  puedeEnviar: boolean;
  camposFaltantes: string[];
  mensaje: string;
}

@Injectable({ providedIn: 'root' })
export class FuncionarioAiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8000/api/v1/funcionario';

  /**
   * Interpreta un comando sobre la bandeja (ej: "abre la tarea más urgente")
   * y devuelve la acción a ejecutar y qué tarea abrir si aplica.
   */
  comandoBandeja(comando: string, tareas: TareaItemAI[]): Observable<ResultadoComandoBandeja> {
    return this.http.post<ResultadoComandoBandeja>(`${this.baseUrl}/comando-bandeja`, {
      comando,
      tareas
    });
  }

  /**
   * Interpreta dictado de voz y mapea el texto a los campos del formulario activo.
   */
  rellenarFormulario(
    comando: string,
    esquemaFormulario: CampoFormularioAI[],
    valoresActuales: Record<string, unknown>
  ): Observable<ResultadoRellenarFormulario> {
    return this.http.post<ResultadoRellenarFormulario>(`${this.baseUrl}/rellenar-formulario`, {
      comando,
      esquemaFormulario,
      valoresActuales
    });
  }

  /**
   * Valida si el formulario está completo y listo para enviar.
   */
  validarEnvio(
    esquemaFormulario: CampoFormularioAI[],
    valoresActuales: Record<string, unknown>
  ): Observable<ResultadoValidarEnvio> {
    return this.http.post<ResultadoValidarEnvio>(`${this.baseUrl}/validar-envio`, {
      esquemaFormulario,
      valoresActuales
    });
  }
}
