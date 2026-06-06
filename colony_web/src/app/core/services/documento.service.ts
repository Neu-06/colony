import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PermisoDocumental = 'SIN_ACCESO' | 'SOLO_LECTURA' | 'SUBIR_Y_LEER' | 'ADMINISTRAR';

export interface DocumentoRef {
  documentoId: string;
  nombre: string;
  tipoMime: string;
  s3Key: string;
  subidoPor: string;
  fechaSubida: string;
  tamanoBytes: number;
}

export interface AuditoriaDocumento {
  id: string;
  documentoId: string;
  instanciaId: string;
  accion: 'SUBIDA' | 'VISTA' | 'DESCARGA' | 'EDICION' | 'ELIMINACION';
  usuarioId: string;
  usuarioNombre: string;
  fecha: string;
}

export interface OnlyOfficeConfig {
  documentServerUrl: string;
  documentKey: string;
  documentUrl: string;
  documentTitle: string;
  documentFileType: string;
  callbackUrl: string;
  mode: 'edit' | 'view';
  userId: string;
  userName: string;
  edit: boolean;
  download: boolean;
  print: boolean;
}

@Injectable({ providedIn: 'root' })
export class DocumentoService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.backendBaseUrl}/api/documentos`;

  listarDocumentos(instanciaId: string): Observable<DocumentoRef[]> {
    return this.http.get<DocumentoRef[]>(`${this.api}/${instanciaId}`);
  }

  subirDocumento(instanciaId: string, archivo: File): Observable<DocumentoRef> {
    const form = new FormData();
    form.append('archivo', archivo);
    return this.http.post<DocumentoRef>(`${this.api}/subir/${instanciaId}`, form);
  }

  obtenerUrl(instanciaId: string, documentoId: string): Observable<{ url: string; documentoId: string }> {
    return this.http.get<{ url: string; documentoId: string }>(
      `${this.api}/${instanciaId}/${documentoId}/url`
    );
  }

  eliminarDocumento(instanciaId: string, documentoId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/${instanciaId}/${documentoId}`);
  }

  obtenerAuditoria(instanciaId: string, documentoId: string): Observable<AuditoriaDocumento[]> {
    return this.http.get<AuditoriaDocumento[]>(
      `${this.api}/${instanciaId}/${documentoId}/auditoria`
    );
  }

  obtenerAuditoriaInstancia(instanciaId: string): Observable<AuditoriaDocumento[]> {
    return this.http.get<AuditoriaDocumento[]>(`${this.api}/${instanciaId}/auditoria`);
  }

  registrarEdicion(instanciaId: string, documentoId: string): Observable<void> {
    return this.http.post<void>(`${this.api}/${instanciaId}/${documentoId}/edicion`, {});
  }

  miPermiso(instanciaId: string, nodoId?: string): Observable<{ permiso: PermisoDocumental }> {
    const params = nodoId ? `?nodoId=${encodeURIComponent(nodoId)}` : '';
    return this.http.get<{ permiso: PermisoDocumental }>(`${this.api}/${instanciaId}/mi-permiso${params}`);
  }

  obtenerConfigOnlyOffice(instanciaId: string, documentoId: string, editar = true): Observable<OnlyOfficeConfig> {
    return this.http.get<OnlyOfficeConfig>(
      `${this.api}/${instanciaId}/${documentoId}/onlyoffice-config?editar=${editar}`
    );
  }

  esEditable(tipoMime: string): boolean {
    return (
      tipoMime?.includes('officedocument.wordprocessing') ||
      tipoMime?.includes('officedocument.spreadsheet') ||
      tipoMime?.includes('word') ||
      tipoMime?.includes('excel')
    );
  }

  esPrevisualizableInline(tipoMime: string): boolean {
    return (
      tipoMime?.startsWith('image/') ||
      tipoMime?.includes('pdf') ||
      tipoMime?.startsWith('video/') ||
      tipoMime?.startsWith('audio/')
    );
  }

  formatearTamano(bytes: number): string {
    if (!bytes || bytes < 1024) { return (bytes ?? 0) + ' B'; }
    if (bytes < 1_048_576)      { return (bytes / 1024).toFixed(1) + ' KB'; }
    if (bytes < 1_073_741_824)  { return (bytes / 1_048_576).toFixed(1) + ' MB'; }
    return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  }
}
