import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  computed,
  effect,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DepartamentoDto, DepartamentoService } from '../../../../core/services/departamento.service';
import { NodoCanvas, TipoNodoHerramienta } from '../../models/canvas.models';
import { NodoVisualComponent } from '../nodo-visual/nodo-visual.component';
import { DiagramadorEstadoService } from '../../services/diagramador-estado.service';
import { JsplumbWrapperService } from '../../services/jsplumb-wrapper.service';
import Swal from 'sweetalert2';

interface NodeSize {
  width: number;
  height: number;
}

@Component({
  selector: 'app-lienzo-carriles',
  standalone: true,
  imports: [CommonModule, FormsModule, NodoVisualComponent],
  templateUrl: './lienzo-carriles.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LienzoCarrilesComponent implements AfterViewInit {
  @Input() isReadOnly = false;
  private static readonly ALTO_CARRIL_PX = 250;
  private static readonly ANCHO_CABECERA_CARRIL_PX = 80;
  @Output() diagramChanged = new EventEmitter<void>();

  private readonly estado = inject(DiagramadorEstadoService);
  private readonly jsplumb = inject(JsplumbWrapperService);
  private readonly departamentoService = inject(DepartamentoService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('boardSurface', { static: true })
  private boardSurfaceRef!: ElementRef<HTMLElement>;

  @ViewChild('jsplumbContainer', { static: true })
  private jsplumbContainerRef!: ElementRef<HTMLElement>;

  readonly carriles = this.estado.carriles;
  readonly nodos = this.estado.nodos;
  readonly aristas = this.estado.aristas;
  readonly nodoSeleccionado = this.estado.nodoSeleccionado;
  readonly aristaSeleccionada = this.estado.aristaSeleccionada;
  readonly zoomNivel = this.estado.zoomNivel;
  readonly altoCarrilPx = LienzoCarrilesComponent.ALTO_CARRIL_PX;
  readonly altoTotalCanvasPx = computed(() => {
    const total = this.carriles().reduce((sum, c) => sum + (c.alto || c.altoPx || this.altoCarrilPx), 0);
    return Math.max(total, this.altoCarrilPx);
  });

  private readonly dragMimeType = 'application/x-diagramador-node';
  private readonly legacyDragMimeType = 'application/x-canvas-node';

  private vistaLista = false;
  private redrawHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  departamentos: DepartamentoDto[] = [];
  carrilEditandoId: string | null = null;

  constructor() {
    effect(() => {
      this.carriles();
      this.nodos();
      this.aristas();
      this.aristaSeleccionada();
      this.zoomNivel();
      this.scheduleBoardSync();
    });

    this.destroyRef.onDestroy(() => {
      this.destruirRecursos();
      if (this.redrawHandle !== null) {
        cancelAnimationFrame(this.redrawHandle);
        this.redrawHandle = null;
      }
    });

    this.cargarDepartamentos();
  }

  ngAfterViewInit(): void {
    this.jsplumb.inicializar(this.jsplumbContainerRef.nativeElement, {
      onConnection: (origenNodoId, destinoNodoId, connection) => {
        const nodoOrigen = this.nodos().find((n) => n.idNodo === origenNodoId);
        const esCompuertaCondicional = nodoOrigen && (nodoOrigen.tipo === 'compuerta' || nodoOrigen.tipo === 'gateway' || nodoOrigen.tipo === 'salida_condicional');

        if (esCompuertaCondicional) {
          void Swal.fire({
            title: 'Condición de la Decisión',
            text: 'Esta arista sale de una compuerta. Define su condición exacta:',
            icon: 'question',
            input: 'select',
            inputOptions: {
              'Aceptado': 'Aceptado',
              'Rechazado': 'Rechazado'
            },
            inputPlaceholder: 'Selecciona una opción',
            showCancelButton: true,
            confirmButtonText: 'Guardar Conexión',
            cancelButtonText: 'Cancelar',
            allowOutsideClick: false,
            inputValidator: (value) => {
              if (!value) {
                return '¡Debes seleccionar una opción estricta!';
              }
              return null;
            }
                    }).then((result) => {
            if (result.isConfirmed && result.value) {
              const creada = this.estado.conectarNodos(origenNodoId, destinoNodoId);
              if (creada) {
                // 1. Configuración local de jsPlumb (Overlay visual)
                connection.setParameter('condicion', result.value);
                connection.setParameter('etiqueta', `[${result.value}]`);
                connection.addOverlay(["Label", { 
                  label: result.value, 
                  location: 0.5, 
                  id: "condicion-label",
                  cssClass: "bg-white p-1 text-xs border rounded text-blue-600" 
                }]);

                // 2. FORZAR SINCRONIZACIÓN Y BROADCAST (PASO ÚNICO)
                this.estado.actualizarCondicionArista(origenNodoId, destinoNodoId, result.value);
                this.estado.actualizarEtiquetaArista(origenNodoId, destinoNodoId, `[${result.value}]`);
                
                // Actualizar el modelo local extrayendo datos frescos del lienzo
                const aristasActualizadas = this.jsplumb.obtenerAristasDesdeLienzo();
                this.estado.setAristas(aristasActualizadas); 
                
                // Emitir cambio para que el componente padre realice el broadcast inmediato
                this.diagramChanged.emit(); 
              }
            }
            this.scheduleBoardSync();
          });

          return;
        }

        const creada = this.estado.conectarNodos(origenNodoId, destinoNodoId);
        if (creada) {
          this.estado.actualizarCondicionArista(origenNodoId, destinoNodoId, '');
          this.diagramChanged.emit();
        }
        this.scheduleBoardSync();
      },
      onConnectionClick: (origenNodoId, destinoNodoId) => {
        this.estado.seleccionarArista(origenNodoId, destinoNodoId);
        this.scheduleBoardSync();
      },
      onNodeDragStop: (nodeId, posicion) => {
        this.actualizarNodoTrasDrag(nodeId, posicion);
      }
    }, this.isReadOnly);

    this.initializeResizeObserver();
    this.vistaLista = true;
    this.scheduleBoardSync();
  }

  nodeElementId(nodeId: string): string {
    return `node-${nodeId}`;
  }

  isSelected(nodeId: string): boolean {
    return this.nodoSeleccionado()?.idNodo === nodeId;
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    const dropzone = this.jsplumbContainerRef.nativeElement;
    if (!dropzone) {
      return;
    }

    const dragType = dataTransfer.getData(this.dragMimeType) || dataTransfer.getData(this.legacyDragMimeType) || dataTransfer.getData('text/plain');
    const toolType = this.mapDragTypeToNodeType(dragType);
    if (!toolType) {
      return;
    }

    const nodeSize = this.resolveNodeSize(toolType);
    const posicion = this.resolveDropPositionByOffset(event, dropzone, nodeSize);
    const carrilId = this.resolverCarrilIdPorY(posicion.y);

    this.estado.agregarNodo(toolType, carrilId, posicion);
    this.diagramChanged.emit();
    this.scheduleBoardSync();
  }

  onNodeClick(nodo: NodoCanvas, event: MouseEvent): void {
    event.stopPropagation();
    this.estado.seleccionarNodo(nodo.idNodo);
  }

  clearSelection(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.closest('[data-node-card], button, input, textarea, select')) {
      return;
    }

    this.estado.seleccionarNodo(null);
    this.estado.limpiarSeleccionArista();
  }

  actualizarNombreCarril(carrilId: string, nombre: string): void {
    this.estado.actualizarNombreCarril(carrilId, nombre);
  }

  actualizarCarrilConDepartamento(carrilId: string, departamentoId: string): void {
    const departamento = this.departamentos.find((item) => item.id === departamentoId);
    if (!departamento) {
      return;
    }

    this.estado.actualizarDepartamentoEnCarril(carrilId, departamento.id, departamento.nombre);
    this.finalizarEdicionCarril();
  }

  iniciarEdicionCarril(carrilId: string): void {
    this.carrilEditandoId = carrilId;

    requestAnimationFrame(() => {
      const selector = `[data-lane-input-for="${carrilId}"]`;
      const control = this.boardSurfaceRef.nativeElement.querySelector<HTMLElement>(selector);
      control?.focus();
    });
  }

  finalizarEdicionCarril(): void {
    this.carrilEditandoId = null;
  }

  iniciarRedimensionadoCarril(event: MouseEvent, carrilId: string): void {
    // Deprecated in favor of iniciarResizeAlto
  }

  async eliminarCarril(index: number): Promise<void> {
    const carril = this.carriles()[index];
    if (!carril) return;

    const result = await Swal.fire({
      title: '¿Eliminar carril?',
      text: `Se eliminarán todos los nodos dentro de "${carril.nombre}". Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      this.estado.eliminarCarril(carril.id);
      this.diagramChanged.emit();
    }
  }

  // FASE 3: Redimensionado de Alto Dinámico
  private resizingIndex: number | null = null;

  iniciarResizeAlto(event: MouseEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingIndex = index;
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (this.resizingIndex === null) return;

    const carril = this.carriles()[this.resizingIndex];
    if (carril) {
      const nuevoAlto = (carril.alto || 250) + event.movementY;
      this.estado.actualizarCarril(carril.id, { alto: Math.max(100, nuevoAlto) });
      this.jsplumb.repintarTodo();
    }
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.resizingIndex = null;
  }

  trackByDepartamentoId(_index: number, departamento: DepartamentoDto): string {
    return departamento.id;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleBoardSync();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
      return;
    }

    event.preventDefault();

    const nodo = this.nodoSeleccionado();
    if (nodo) {
      this.estado.eliminarNodo(nodo.idNodo);
      this.scheduleBoardSync();
      return;
    }

    const arista = this.aristaSeleccionada();
    if (arista) {
      this.estado.eliminarArista(arista.origenNodoId, arista.destinoNodoId);
      this.scheduleBoardSync();
    }
  }

  private mapDragTypeToNodeType(dragType: unknown): TipoNodoHerramienta | null {
    switch (dragType) {
      case 'INICIO':
        return 'inicio';
      case 'TAREA':
        return 'tarea';
      case 'COMPUERTA':
        return 'compuerta';
      case 'FORK':
        return 'fork';
      case 'JOIN':
        return 'join';
      case 'FIN':
        return 'fin';
      default:
        return null;
    }
  }

  private resolveNodeSize(type: TipoNodoHerramienta): NodeSize {
    if (type === 'compuerta' || type === 'fork' || type === 'join') {
      return { width: 80, height: 80 };
    }

    if (type === 'inicio' || type === 'fin') {
      return { width: 48, height: 48 };
    }

    return { width: 128, height: 64 };
  }

  private resolveDropPositionByOffset(event: DragEvent, dropzone: HTMLElement, nodeSize: NodeSize): { x: number; y: number } {
    const rect = dropzone.getBoundingClientRect();
    const zoom = this.zoomNivel();
    const localX = (event.clientX - rect.left) / zoom;
    const localY = (event.clientY - rect.top) / zoom;

    const minX = 180; // Frontera estricta: Ancho de cabecera
    const rawX = localX - nodeSize.width / 2;
    const rawY = localY - nodeSize.height / 2;

    const maxX = Math.max(minX, dropzone.clientWidth - nodeSize.width);
    const maxY = Math.max(0, this.altoTotalCanvasPx() - nodeSize.height);

    return {
      x: Math.min(Math.max(rawX, minX), maxX),
      y: Math.min(Math.max(rawY, 0), maxY)
    };
  }

  private actualizarNodoTrasDrag(nodeId: string, posicion?: { x: number; y: number }): void {
    const elementoNodo = document.getElementById(this.nodeElementId(nodeId));
    if (!elementoNodo) {
      return;
    }

    const contenedor = this.jsplumbContainerRef.nativeElement;
    const minX = 180; // Frontera estricta
    let x = posicion?.x;
    let y = posicion?.y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const contenedorRect = contenedor.getBoundingClientRect();
      const zoom = this.zoomNivel();
      const nodoRect = elementoNodo.getBoundingClientRect();
      x = (nodoRect.left - contenedorRect.left) / zoom;
      y = (nodoRect.top - contenedorRect.top) / zoom;
    }

    const maxX = Math.max(minX, contenedor.clientWidth - elementoNodo.offsetWidth);
    const maxY = Math.max(0, this.altoTotalCanvasPx() - elementoNodo.offsetHeight);
    const xAcotado = Math.min(Math.max(Number(x), minX), maxX);
    const yAcotado = Math.min(Math.max(Number(y), 0), maxY);
    const carrilId = this.resolverCarrilIdPorY(yAcotado);

    this.estado.actualizarNodo(nodeId, {
      carrilId,
      posicion: {
        x: xAcotado,
        y: yAcotado
      }
    });

    this.estado.seleccionarNodo(nodeId);
    this.diagramChanged.emit();
    this.scheduleBoardSync();
  }

  private resolverCarrilIdPorY(y: number): string {
    const carriles = this.carriles();
    if (!carriles.length) {
      return 'carril-1';
    }

    const indiceCrudo = Math.floor(y / this.altoCarrilPx);
    const indice = Math.min(Math.max(indiceCrudo, 0), carriles.length - 1);
    return carriles[indice].id;
  }

  /**
   * FASE 1: EL ESCUDO SANITIZADOR
   * Fuerza que los nodos no invadan la zona de cabeceras (X < 180)
   */
  private sanitizarPosicionesNodos(nodos: NodoCanvas[]): NodoCanvas[] {
    const MIN_X = 180;
    const MIN_Y = 20;

    return nodos.map(nodo => ({
      ...nodo,
      posicion: {
        x: Math.max(MIN_X, Number(nodo.posicion?.x || 0)),
        y: Math.max(MIN_Y, Number(nodo.posicion?.y || 0))
      }
    }));
  }

  private scheduleBoardSync(): void {
    if (!this.vistaLista) {
      return;
    }

    if (this.redrawHandle !== null) {
      cancelAnimationFrame(this.redrawHandle);
    }

    this.redrawHandle = requestAnimationFrame(() => {
      this.redrawHandle = null;
      const nodosSanitizados = this.sanitizarPosicionesNodos(this.nodos());
      this.jsplumb.sincronizarNodos(nodosSanitizados, (idNodo) => this.nodeElementId(idNodo));
      this.jsplumb.dibujarAristas(this.aristas(), (idNodo) => this.nodeElementId(idNodo), this.aristaSeleccionada(), this.zoomNivel());
      this.refreshResizeObserverTargets();
    });
  }

  private initializeResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.jsplumb.repintarTodo();
    });

    this.refreshResizeObserverTargets();
  }

  private refreshResizeObserverTargets(): void {
    if (!this.resizeObserver) {
      return;
    }

    this.resizeObserver.disconnect();
    this.resizeObserver.observe(this.boardSurfaceRef.nativeElement);
    this.resizeObserver.observe(this.jsplumbContainerRef.nativeElement);

    this.boardSurfaceRef.nativeElement
      .querySelectorAll<HTMLElement>('[data-lane-visual], [data-node-card], #jsplumb-container')
      .forEach((element) => this.resizeObserver?.observe(element));
  }

  private destruirRecursos(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.jsplumb.destruir();
  }

  private cargarDepartamentos(): void {
    this.departamentoService.listar().subscribe({
      next: (departamentos) => {
        this.departamentos = departamentos;
      },
      error: () => {
        this.departamentos = [];
      }
    });
  }
}
