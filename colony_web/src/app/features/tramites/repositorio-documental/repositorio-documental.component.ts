import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
  signal,
  computed
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AlertaService } from '../../../core/services/alerta.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  DocumentoService,
  DocumentoRef,
  AuditoriaDocumento,
  PermisoDocumental
} from '../../../core/services/documento.service';
import { EditorColaborativoComponent } from './editor-colaborativo/editor-colaborativo.component';

type Vista = 'repositorio' | 'auditoria' | 'visor' | 'editor';
interface AccionPendiente { tipo: 'url'; documentoId: string; }

@Component({
  selector: 'app-repositorio-documental',
  standalone: true,
  imports: [CommonModule, DatePipe, EditorColaborativoComponent],
  templateUrl: './repositorio-documental.component.html'
})
export class RepositorioDocumentalComponent implements OnInit, OnChanges {

  @Input({ required: true }) instanciaId!: string;
  @Input() nodoId?: string;
  /** Permiso calculado externamente (para cuando el padre ya lo conoce sin necesidad de llamada extra) */
  @Input() permisoExterno?: PermisoDocumental;

  private readonly docService    = inject(DocumentoService);
  private readonly alertaService = inject(AlertaService);
  private readonly authService   = inject(AuthService);
  private readonly sanitizer     = inject(DomSanitizer);

  readonly documentos         = signal<DocumentoRef[]>([]);
  readonly auditoria          = signal<AuditoriaDocumento[]>([]);
  readonly vistaActiva        = signal<Vista>('repositorio');
  readonly cargando           = signal(false);
  readonly subiendoId         = signal<string | null>(null);
  readonly urlVisorSafe       = signal<SafeResourceUrl | null>(null);
  readonly urlVisorRaw        = signal<string | null>(null);
  readonly docVisorActual     = signal<DocumentoRef | null>(null);
  readonly accionEnProgreso   = signal<AccionPendiente | null>(null);
  readonly docAuditoriaActual = signal<DocumentoRef | null>(null);
  readonly permisoActual      = signal<PermisoDocumental>('SUBIR_Y_LEER');
  readonly documentosSesionIds = signal<Set<string>>(new Set());
  readonly docEditorActual    = signal<DocumentoRef | null>(null);
  readonly modoEdicion        = signal(true);

  readonly totalDocumentos = computed(() => this.documentos().length);
  readonly tieneDocumentos = computed(() => this.documentos().length > 0);

  readonly puedeSubir    = computed(() => {
    const p = this.permisoActual();
    return p === 'SUBIR_Y_LEER' || p === 'ADMINISTRAR';
  });
  readonly puedeEliminar = computed(() => this.permisoActual() === 'ADMINISTRAR');
  readonly puedeVer      = computed(() => this.permisoActual() !== 'SIN_ACCESO');

  ngOnInit(): void {
    if (this.instanciaId) {
      this.resolverPermiso();
      this.cargarDocumentos();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['instanciaId']?.currentValue) {
      this.resolverPermiso();
      this.cargarDocumentos();
    }
  }

  private resolverPermiso(): void {
    if (this.permisoExterno) {
      this.permisoActual.set(this.permisoExterno);
      return;
    }
    this.docService.miPermiso(this.instanciaId, this.nodoId).subscribe({
      next: ({ permiso }) => this.permisoActual.set(permiso),
      error: () => this.permisoActual.set('SUBIR_Y_LEER')
    });
  }

  cargarDocumentos(): void {
    this.cargando.set(true);
    this.docService.listarDocumentos(this.instanciaId).subscribe({
      next: (docs) => { this.documentos.set(docs); this.cargando.set(false); },
      error: (err: any) => {
        this.cargando.set(false);
        this.alertaService.mostrarError('No se pudieron cargar los documentos.');
      }
    });
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) { return; }
    const archivo = input.files[0];
    input.value = '';
    this.subirArchivo(archivo);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) { this.subirArchivo(file); }
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); }

  private subirArchivo(archivo: File): void {
    this.subiendoId.set(crypto.randomUUID());
    this.docService.subirDocumento(this.instanciaId, archivo).subscribe({
      next: (ref) => {
        this.documentos.update(docs => [...docs, ref]);
        this.documentosSesionIds.update(set => {
          const newSet = new Set(set);
          newSet.add(ref.documentoId);
          return newSet;
        });
        this.subiendoId.set(null);
        this.alertaService.mostrarExito(`"${ref.nombre}" subido correctamente.`);
      },
      error: (err: any) => {
        this.subiendoId.set(null);
        this.alertaService.mostrarError('Error al subir el archivo.');
      }
    });
  }

  abrirDocumento(doc: DocumentoRef): void {
    this.accionEnProgreso.set({ tipo: 'url', documentoId: doc.documentoId });
    this.docService.obtenerUrl(this.instanciaId, doc.documentoId).subscribe({
      next: ({ url }) => {
        this.accionEnProgreso.set(null);
        if (this.docService.esEditable(doc.tipoMime)) {
          // Microsoft Office Online Viewer acepta URLs presignadas de S3 y muestra el archivo en modo lectura.
          // La URL presignada caduca, por lo que el colaborativo real se logra descargando, editando y volviendo a subir.
          // Se registra la apertura como auditoría de edición.
          const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
          const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(officeUrl);
          this.urlVisorSafe.set(safeUrl);
          this.urlVisorRaw.set(url);
          this.docVisorActual.set(doc);
          this.vistaActiva.set('visor');
          this.docService.registrarEdicion(this.instanciaId, doc.documentoId).subscribe();
        } else if (this.docService.esPrevisualizableInline(doc.tipoMime)) {
          const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
          this.urlVisorSafe.set(safeUrl);
          this.urlVisorRaw.set(url);
          this.docVisorActual.set(doc);
          this.vistaActiva.set('visor');
        } else {
          window.open(url, '_blank');
        }
      },
      error: (err: any) => {
        this.accionEnProgreso.set(null);
        this.alertaService.mostrarError('No se pudo obtener el acceso al documento.');
      }
    });
  }

  descargarDocumento(doc: DocumentoRef): void {
    this.accionEnProgreso.set({ tipo: 'url', documentoId: doc.documentoId });
    this.docService.obtenerUrl(this.instanciaId, doc.documentoId).subscribe({
      next: ({ url }) => {
        this.accionEnProgreso.set(null);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.nombre;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
      },
      error: (err: any) => {
        this.accionEnProgreso.set(null);
        this.alertaService.mostrarError('No se pudo descargar el documento.');
      }
    });
  }

  cerrarVisor(): void {
    this.vistaActiva.set('repositorio');
    this.urlVisorSafe.set(null);
    this.urlVisorRaw.set(null);
    this.docVisorActual.set(null);
  }

  async eliminarDocumento(doc: DocumentoRef): Promise<void> {
    const confirmado = await this.alertaService.confirmarAccion(
      'Eliminar documento',
      `¿Eliminar "${doc.nombre}"? Esta acción no se puede deshacer.`
    );
    if (!confirmado) { return; }
    this.docService.eliminarDocumento(this.instanciaId, doc.documentoId).subscribe({
      next: () => {
        this.documentos.update(docs => docs.filter(d => d.documentoId !== doc.documentoId));
        this.documentosSesionIds.update(set => {
          const newSet = new Set(set);
          newSet.delete(doc.documentoId);
          return newSet;
        });
        if (this.docVisorActual()?.documentoId === doc.documentoId) { this.cerrarVisor(); }
        this.alertaService.mostrarExito(`"${doc.nombre}" eliminado.`);
      },
      error: (err: any) => this.alertaService.mostrarError('Error al eliminar el documento.')
    });
  }

  verAuditoria(doc: DocumentoRef): void {
    this.docAuditoriaActual.set(doc);
    this.docService.obtenerAuditoria(this.instanciaId, doc.documentoId).subscribe({
      next: (logs) => { this.auditoria.set(logs); this.vistaActiva.set('auditoria'); },
      error: (err: any) => this.alertaService.mostrarError('No se pudo cargar la auditoría.')
    });
  }

  volverARepositorio(): void {
    this.vistaActiva.set('repositorio');
    this.docAuditoriaActual.set(null);
    this.auditoria.set([]);
    this.urlVisorSafe.set(null);
    this.urlVisorRaw.set(null);
    this.docVisorActual.set(null);
    this.docEditorActual.set(null);
  }

  abrirEditorColaborativo(doc: DocumentoRef, editar: boolean): void {
    this.docEditorActual.set(doc);
    this.modoEdicion.set(editar);
    this.vistaActiva.set('editor');
    this.docService.registrarEdicion(this.instanciaId, doc.documentoId).subscribe();
  }

  formatearTamano(bytes: number): string { return this.docService.formatearTamano(bytes); }
  esEditable(mime: string): boolean      { return this.docService.esEditable(mime); }
  esPdf(mime: string): boolean           { return mime?.includes('pdf'); }
  esVideo(mime: string): boolean         { return mime?.startsWith('video/'); }
  esAudio(mime: string): boolean         { return mime?.startsWith('audio/'); }
  esImagen(mime: string): boolean        { return mime?.startsWith('image/'); }
  esOffice(mime: string): boolean        { return this.docService.esEditable(mime); }

  estaCargandoDoc(documentoId: string): boolean {
    const acc = this.accionEnProgreso();
    return acc?.tipo === 'url' && acc.documentoId === documentoId;
  }

  getEtiquetaAccion(accion: string): string {
    const map: Record<string, string> = {
      SUBIDA: 'Subió', VISTA: 'Visualizó', DESCARGA: 'Descargó',
      EDICION: 'Editó', ELIMINACION: 'Eliminó'
    };
    return map[accion] ?? accion;
  }

  getColorAccion(accion: string): string {
    const map: Record<string, string> = {
      SUBIDA: '#22c55e', VISTA: '#3b82f6', DESCARGA: '#a855f7',
      EDICION: '#f59e0b', ELIMINACION: '#ef4444'
    };
    return map[accion] ?? '#64748b';
  }

  getIconoAccion(accion: string): string {
    const map: Record<string, string> = {
      SUBIDA: '↑', VISTA: '👁', DESCARGA: '↓', EDICION: '✏', ELIMINACION: '🗑'
    };
    return map[accion] ?? '·';
  }
}
