import {
  Component, Input, OnInit, OnDestroy, inject, signal, ElementRef, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentoService, OnlyOfficeConfig } from '../../../../core/services/documento.service';

declare const DocsAPI: any;

@Component({
  selector: 'app-editor-colaborativo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './editor-colaborativo.component.html'
})
export class EditorColaborativoComponent implements OnInit, OnDestroy {

  @Input({ required: true }) instanciaId!: string;
  @Input({ required: true }) documentoId!: string;
  @Input() modoEdicion = true;

  // static: false porque el div vive dentro de @if y no está disponible en ngOnInit
  @ViewChild('editorContainer', { static: false }) editorContainer!: ElementRef<HTMLDivElement>;

  private readonly docService = inject(DocumentoService);

  readonly cargando = signal(true);
  readonly error    = signal<string | null>(null);

  private editorInstance: any = null;

  ngOnInit(): void {
    this.docService.obtenerConfigOnlyOffice(this.instanciaId, this.documentoId, this.modoEdicion)
      .subscribe({
        next:  (config) => this.inicializarEditor(config),
        error: ()       => {
          this.cargando.set(false);
          this.error.set('No se pudo obtener la configuración del editor.');
        }
      });
  }

  private inicializarEditor(config: OnlyOfficeConfig): void {
    // El timestamp rompe la caché HTTP del navegador para evitar que use un api.js viejo
    // que busque 'index_loader.html' el cual ya no existe en las nuevas versiones de OnlyOffice
    const apiUrl = `${config.documentServerUrl}/web-apps/apps/api/documents/api.js?v=${new Date().getTime()}`;

    if (typeof DocsAPI !== 'undefined') {
      // SDK ya cargado → sólo necesitamos el tick de renderizado
      this.cargando.set(false);
      setTimeout(() => this.montarEditor(config), 0);
      return;
    }

    const script = document.createElement('script');
    script.src   = apiUrl;
    (script as any).async = true;
    script.addEventListener('load', () => {
      this.cargando.set(false);
      setTimeout(() => this.montarEditor(config), 0);
    });
    script.addEventListener('error', () => {
      this.cargando.set(false);
      this.error.set(
        `No se pudo conectar con OnlyOffice en ${config.documentServerUrl}. ` +
        `Ejecuta: docker run -d -p 8100:80 onlyoffice/documentserver`
      );
    });
    document.head.appendChild(script);
  }

  private montarEditor(config: OnlyOfficeConfig): void {
    const container = this.editorContainer?.nativeElement;
    if (!container) {
      this.error.set('El contenedor del editor no está disponible.');
      return;
    }

    container.innerHTML = '';
    const innerDiv = document.createElement('div');
    innerDiv.id = `oo-editor-${this.documentoId}`;
    container.appendChild(innerDiv);

    this.editorInstance = new DocsAPI.DocEditor(innerDiv.id, {
      document: {
        fileType: config.documentFileType,
        key:      config.documentKey,
        title:    config.documentTitle,
        url:      config.documentUrl,
        permissions: {
          edit:     config.edit,
          download: config.download,
          print:    config.print,
          comment:  true,
        }
      },
      documentType: this.resolverTipoDocumento(config.documentFileType),
      editorConfig: {
        mode:        config.mode,
        callbackUrl: config.callbackUrl,
        lang:        'es',
        user: {
          id:   config.userId,
          name: config.userName,
        },
        customization: {
          autosave:      true,
          forcesave:     false
        }
      },
      height: '100%',
      width:  '100%',
      events: {
        onError: (event: any) => {
          console.error('[OnlyOffice] Error:', event?.data);
        }
      }
    });
  }

  private resolverTipoDocumento(extension: string): string {
    const ext = (extension || '').toLowerCase();
    if (['xlsx', 'xls', 'ods', 'csv'].includes(ext)) return 'cell';
    if (['pptx', 'ppt', 'odp'].includes(ext))         return 'slide';
    return 'word';
  }

  ngOnDestroy(): void {
    if (this.editorInstance) {
      try { this.editorInstance.destroyEditor(); } catch {}
      this.editorInstance = null;
    }
  }
}
