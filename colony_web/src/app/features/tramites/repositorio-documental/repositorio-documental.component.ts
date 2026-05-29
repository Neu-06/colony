import { CommonModule } from '@angular/common';
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
import { AlertaService } from '../../../core/services/alerta.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  DocumentoService,
  DocumentoRef,
  AuditoriaDocumento
} from '../../../core/services/documento.service';

type Vista = 'repositorio' | 'auditoria' | 'visor';
interface AccionPendiente { tipo: 'url'; documentoId: string; }


@Component({
  selector: 'app-repositorio-documental',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './repositorio-documental.component.html'
})
export class RepositorioDocumentalComponent implements OnInit, OnChanges {

  @Input({ required: true }) instanciaId!: string;
  @Input() puedeSubir = true;
  @Input() puedeEliminar = false;

  private readonly docService  = inject(DocumentoService);
  private readonly alertaService = inject(AlertaService);
  private readonly authService   = inject(AuthService);

  readonly documentos        = signal<DocumentoRef[]>([]);
  readonly auditoria         = signal<AuditoriaDocumento[]>([]);
  readonly vistaActiva       = signal<Vista>('repositorio');
  readonly cargando          = signal(false);
  readonly subiendoId        = signal<string | null>(null);
  readonly urlVisor          = signal<string | null>(null);
  readonly docVisorActual    = signal<DocumentoRef | null>(null);
  readonly accionEnProgreso  = signal<AccionPendiente | null>(null);
  readonly docAuditoriaActual = signal<DocumentoRef | null>(null);

  readonly totalDocumentos = computed(() => this.documentos().length);
  readonly tieneDocumentos = computed(() => this.documentos().length > 0);

  ngOnInit(): void {
    if (this.instanciaId) { this.cargarDocumentos(); }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['instanciaId']?.currentValue) { this.cargarDocumentos(); }
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
          const googleUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=false`;
          window.open(googleUrl, '_blank');
          this.docService.registrarEdicion(this.instanciaId, doc.documentoId).subscribe();
        } else if (this.docService.esPrevisualizableInline(doc.tipoMime)) {
          this.urlVisor.set(url);
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

  cerrarVisor(): void {
    this.vistaActiva.set('repositorio');
    this.urlVisor.set(null);
    this.docVisorActual.set(null);
  }


  eliminarDocumento(doc: DocumentoRef): void {
    if (!confirm(`¿Eliminar "${doc.nombre}"? Esta acción no se puede deshacer.`)) { return; }
    this.docService.eliminarDocumento(this.instanciaId, doc.documentoId).subscribe({
      next: () => {
        this.documentos.update(docs => docs.filter(d => d.documentoId !== doc.documentoId));
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
  }


  formatearTamano(bytes: number): string { return this.docService.formatearTamano(bytes); }
  esEditable(mime: string): boolean      { return this.docService.esEditable(mime); }
  esPdf(mime: string): boolean           { return mime?.includes('pdf'); }
  esVideo(mime: string): boolean         { return mime?.startsWith('video/'); }
  esAudio(mime: string): boolean         { return mime?.startsWith('audio/'); }
  esImagen(mime: string): boolean        { return mime?.startsWith('image/'); }

  estaCargandoDoc(documentoId: string): boolean {
    const acc = this.accionEnProgreso();
    return acc?.tipo === 'url' && acc.documentoId === documentoId;
  }

  getEtiquetaAccion(accion: string): string {
    const map: Record<string, string> = {
      SUBIDA: 'Subió', VISTA: 'Vio', DESCARGA: 'Descargó',
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
}
