import { Injectable, computed, signal } from '@angular/core';
import {
  Arista,
  CampoFormulario,
  Carril,
  NodoActividad,
  NodoBase,
  NodoCanvas,
  NodoCompuerta,
  PoliticaNegocio,
  TipoNodoHerramienta
} from '../models/canvas.models';
import {
  MetaPolitica,
  SnapshotWorkflow,
  fromPoliticaToSnapshot,
  toPoliticaFromSnapshot
} from './politica-workflow.adapter';

@Injectable({
  providedIn: 'root'
})
export class DiagramadorEstadoService {
  private static readonly MIN_ZOOM = 0.5;
  private static readonly MAX_ZOOM = 2;
  private static readonly ALTO_CARRIL_PX = 250;

  private readonly secuenciaNodos = signal(0);
  private readonly secuenciaCarriles = signal(1);
  private readonly _politicaActivaId = signal<string | null>(null);

  private readonly _carriles = signal<Carril[]>([
    { id: 'carril-1', nombre: 'Departamento 1', departamentoId: undefined, orden: 1 }
  ]);
  private readonly _nodos = signal<NodoCanvas[]>([]);
  private readonly _aristas = signal<Arista[]>([]);
  private readonly _nodoSeleccionadoId = signal<string | null>(null);
  private readonly _aristaSeleccionadaKey = signal<string | null>(null);
  private readonly _zoomNivel = signal(1);

  readonly carriles = this._carriles.asReadonly();
  readonly nodos = this._nodos.asReadonly();
  readonly aristas = this._aristas.asReadonly();
  readonly politicaActivaId = this._politicaActivaId.asReadonly();
  readonly zoomNivel = this._zoomNivel.asReadonly();

  readonly nodoSeleccionado = computed(() => {
    const id = this._nodoSeleccionadoId();
    if (!id) {
      return null;
    }
    return this._nodos().find((nodo) => nodo.idNodo === id) ?? null;
  });

  readonly aristaSeleccionada = computed(() => {
    const key = this._aristaSeleccionadaKey();
    if (!key) {
      return null;
    }
    return this._aristas().find((arista) => this.keyArista(arista.origenNodoId, arista.destinoNodoId) === key) ?? null;
  });

  agregarCarril(): void {
    const siguienteOrden = this._carriles().length + 1;
    const nuevoId = this.siguienteCarrilId();

    this._carriles.update((actual) => [
      ...actual,
      {
        id: nuevoId,
        nombre: `Departamento ${siguienteOrden}`,
        departamentoId: undefined,
        orden: siguienteOrden
      }
    ]);
  }

  actualizarCarril(carrilId: string, patch: Partial<Carril>): void {
    this._carriles.update((actual) =>
      actual.map((carril) => (carril.id === carrilId ? { ...carril, ...patch } : carril))
    );
  }

  eliminarCarril(carrilId: string): void {
    const carriles = this._carriles();
    if (carriles.length <= 1) {
      return;
    }

    const idsEliminados = new Set(
      this._nodos()
        .filter((nodo) => nodo.carrilId === carrilId)
        .map((nodo) => nodo.idNodo)
    );

    this._carriles.set(
      carriles
        .filter((carril) => carril.id !== carrilId)
        .map((carril, index) => ({ ...carril, orden: index + 1 }))
    );

    this._nodos.update((actual) => actual.filter((nodo) => nodo.carrilId !== carrilId));
    this._aristas.update((actual) =>
      actual.filter((arista) => !idsEliminados.has(arista.origenNodoId) && !idsEliminados.has(arista.destinoNodoId))
    );

    if (this._nodoSeleccionadoId() && idsEliminados.has(this._nodoSeleccionadoId() as string)) {
      this._nodoSeleccionadoId.set(null);
    }

    this.limpiarAristaInexistente();
    this.recalcularSecuencias();
  }

  actualizarNombreCarril(carrilId: string, nombre: string): void {
    this.actualizarCarril(carrilId, { nombre: nombre.trim() || 'Departamento' });
  }

  actualizarDepartamentoEnCarril(carrilId: string, departamentoId: string, nombreDepartamento: string): void {
    this.actualizarCarril(carrilId, {
      departamentoId,
      nombre: nombreDepartamento
    });
  }

  agregarNodo(tipo: TipoNodoHerramienta, carrilId: string, posicion: { x: number; y: number }): NodoCanvas {
    const idNodo = this.siguienteNodoId(tipo);
    const nodo = this.construirNodo(tipo, idNodo, carrilId, posicion);

    this._nodos.update((actual) => [...actual, nodo]);
    this._nodoSeleccionadoId.set(nodo.idNodo);
    this._aristaSeleccionadaKey.set(null);

    return nodo;
  }

  actualizarNodo(nodeId: string, patch: Partial<NodoActividad & NodoCompuerta & NodoBase>): void {
    this._nodos.update((actual) =>
      actual.map((nodo) =>
        nodo.idNodo === nodeId
          ? {
              ...nodo,
              ...patch,
              posicion: patch.posicion
                ? {
                    x: patch.posicion.x,
                    y: patch.posicion.y
                  }
                : nodo.posicion
            }
          : nodo
      )
    );
  }

  eliminarNodo(nodeId: string): void {
    this._nodos.update((actual) => actual.filter((nodo) => nodo.idNodo !== nodeId));
    this._aristas.update((actual) => actual.filter((arista) => arista.origenNodoId !== nodeId && arista.destinoNodoId !== nodeId));

    if (this._nodoSeleccionadoId() === nodeId) {
      this._nodoSeleccionadoId.set(null);
    }

    this.limpiarAristaInexistente();
  }

  conectarNodos(origenNodoId: string, destinoNodoId: string): Arista | null {
    if (origenNodoId === destinoNodoId) {
      return null;
    }

    const yaExiste = this._aristas().some(
      (arista) => arista.origenNodoId === origenNodoId && arista.destinoNodoId === destinoNodoId
    );

    if (yaExiste) {
      return null;
    }

    const aristaNueva: Arista = {
      origenNodoId,
      destinoNodoId
    };

    this._aristas.update((actual) => [...actual, aristaNueva]);
    this.seleccionarArista(origenNodoId, destinoNodoId);

    return aristaNueva;
  }

  eliminarArista(origenNodoId: string, destinoNodoId: string): void {
    this._aristas.update((actual) =>
      actual.filter((arista) => !(arista.origenNodoId === origenNodoId && arista.destinoNodoId === destinoNodoId))
    );

    this.limpiarAristaInexistente();
  }

  seleccionarNodo(nodeId: string | null): void {
    this._nodoSeleccionadoId.set(nodeId);
    if (nodeId) {
      this._aristaSeleccionadaKey.set(null);
    }
  }

  seleccionarArista(origenNodoId: string, destinoNodoId: string): void {
    this._aristaSeleccionadaKey.set(this.keyArista(origenNodoId, destinoNodoId));
    this._nodoSeleccionadoId.set(null);
  }

  limpiarSeleccionArista(): void {
    this._aristaSeleccionadaKey.set(null);
  }

  actualizarEtiquetaArista(origenNodoId: string, destinoNodoId: string, etiqueta: string): void {
    const limpia = etiqueta.trim();

    this._aristas.update((actual) =>
      actual.map((arista) =>
        arista.origenNodoId === origenNodoId && arista.destinoNodoId === destinoNodoId
          ? {
              ...arista,
              etiqueta: limpia || undefined
            }
          : arista
      )
    );
  }

  actualizarCondicionArista(origenNodoId: string, destinoNodoId: string, condicion: string): void {
    const limpia = condicion.trim();

    this._aristas.update((actual) =>
      actual.map((arista) =>
        arista.origenNodoId === origenNodoId && arista.destinoNodoId === destinoNodoId
          ? {
              ...arista,
              condicion: limpia || undefined
            }
          : arista
      )
    );
  }

  setAristas(aristas: Arista[]): void {
    this._aristas.set([...aristas]);
  }

  setNodos(nodos: NodoCanvas[]): void {
    this._nodos.set(nodos.map(n => this.normalizarNodo(n)));
  }

  setCarriles(carriles: Carril[]): void {
    this._carriles.set([...carriles]);
  }

  setZoom(nivel: number): void {
    const acotado = Math.min(DiagramadorEstadoService.MAX_ZOOM, Math.max(DiagramadorEstadoService.MIN_ZOOM, nivel));
    this._zoomNivel.set(Number(acotado.toFixed(2)));
  }

  zoomIn(paso = 0.1): void {
    this.setZoom(this._zoomNivel() + paso);
  }

  zoomOut(paso = 0.1): void {
    this.setZoom(this._zoomNivel() - paso);
  }

  zoomFit(): void {
    const nodos = this._nodos();
    if (nodos.length === 0) {
      this.setZoom(1);
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodos.forEach(n => {
      const x = n.posicion?.x ?? 0;
      const y = n.posicion?.y ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 160); // Ancho aprox nodo
      maxY = Math.max(maxY, y + 100); // Alto aprox nodo
    });

    const padding = 60;
    const availableW = window.innerWidth - 350; // Descontar sidebar
    const availableH = window.innerHeight - 150; // Descontar header

    const zoomX = availableW / (maxX - minX + padding);
    const zoomY = availableH / (maxY - minY + padding);
    
    this.setZoom(Math.min(zoomX, zoomY, 1));
  }

  hidratarDesdePolitica(politica: PoliticaNegocio): void {
    const snapshot = fromPoliticaToSnapshot(politica);

    this._politicaActivaId.set(politica.id ?? null);
    this._carriles.set(snapshot.carriles);
    this._nodos.set(snapshot.nodos.map((nodo) => this.normalizarNodo(nodo)));
    this._aristas.set(snapshot.aristas.map((arista) => ({ ...arista })));
    this._nodoSeleccionadoId.set(null);
    this._aristaSeleccionadaKey.set(null);
    this._zoomNivel.set(1);
    this.recalcularSecuencias();
  }

  limpiarDiagrama(): void {
    this._politicaActivaId.set(null);
    this._carriles.set([{ id: 'carril-1', nombre: 'Departamento 1', departamentoId: undefined, orden: 1 }]);
    this._nodos.set([]);
    this._aristas.set([]);
    this._nodoSeleccionadoId.set(null);
    this._aristaSeleccionadaKey.set(null);
    this._zoomNivel.set(1);
    this.secuenciaNodos.set(0);
    this.secuenciaCarriles.set(1);
  }

  toPoliticaNegocio(nombre: string, estado: string, version = 1): PoliticaNegocio {
    const snapshot: SnapshotWorkflow = {
      carriles: this._carriles().map((carril) => ({ ...carril })),
      nodos: this._nodos().map((nodo) => this.normalizarNodo(nodo)),
      aristas: this._aristas().map((arista) => ({ ...arista }))
    };

    const meta: MetaPolitica = {
      id: this._politicaActivaId() ?? undefined,
      nombre: nombre.trim() || 'Flujo sin nombre',
      estado,
      version
    };

    return toPoliticaFromSnapshot(snapshot, meta);
  }

  sincronizarCarrilIdSegunPosicionY(altoCarril = DiagramadorEstadoService.ALTO_CARRIL_PX): void {
    const carriles = this._carriles();
    if (!carriles.length || altoCarril <= 0) {
      return;
    }

    this._nodos.update((actual) =>
      actual.map((nodo) => {
        const y = Number(nodo.posicion?.y ?? 0);
        const indiceCrudo = Math.floor(y / altoCarril);
        const indice = Math.min(Math.max(indiceCrudo, 0), carriles.length - 1);
        const carrilDestino = carriles[indice];

        return carrilDestino
          ? {
              ...nodo,
              carrilId: carrilDestino.id
            }
          : nodo;
      })
    );
  }

  private construirNodo(tipo: TipoNodoHerramienta, idNodo: string, carrilId: string, posicion: { x: number; y: number }): NodoCanvas {
    const segura = { x: Math.max(posicion.x, 0), y: Math.max(posicion.y, 0) };

    if (tipo === 'compuerta' || tipo === 'fork' || tipo === 'join') {
      return {
        idNodo,
        tipo,
        posicion: segura,
        carrilId,
        condicionLogica: ''
      };
    }

    return {
      idNodo,
      tipo,
      posicion: segura,
      carrilId,
      nombre: this.nombreActividadPorTipo(tipo),
      dptoResponsable: '',
      esquemaFormulario: [] as CampoFormulario[]
    };
  }

  private normalizarNodo(nodo: NodoCanvas): NodoCanvas {
    const carrilIdNormalizado = nodo.carrilId || this._carriles()[0]?.id || 'carril-1';
    const indiceCarril = this._carriles().findIndex((carril) => carril.id === carrilIdNormalizado);
    const yOriginal = Number(nodo.posicion?.y ?? 0);
    const yGlobal = indiceCarril > 0 && yOriginal < DiagramadorEstadoService.ALTO_CARRIL_PX
      ? yOriginal + indiceCarril * DiagramadorEstadoService.ALTO_CARRIL_PX
      : yOriginal;

    if (this.esActividad(nodo)) {
      const nombreCanonico = this.normalizarTipoNodoEstado(nodo.tipo);

      return {
        idNodo: nodo.idNodo,
        tipo: nodo.tipo,
        posicion: {
          x: Number(nodo.posicion?.x ?? 0),
          y: yGlobal
        },
        carrilId: carrilIdNormalizado,
        nombre: nombreCanonico || nodo.nombre || 'Nueva Tarea',
        dptoResponsable: nodo.dptoResponsable ?? '',
        esquemaFormulario: (nodo.esquemaFormulario ?? []).map((campo) => ({
          id: campo.id || crypto.randomUUID(),
          nombre: campo.nombre ?? '',
          tipo: this.normalizarTipoCampo(campo.tipo),
          requerido: !!campo.requerido,
          opciones: campo.opciones
        })),
        permisoDocumental: nodo.permisoDocumental
      };
    }

    return {
      idNodo: nodo.idNodo,
      tipo: nodo.tipo,
      posicion: {
        x: Number(nodo.posicion?.x ?? 0),
        y: yGlobal
      },
      carrilId: carrilIdNormalizado,
      condicionLogica: nodo.condicionLogica ?? ''
    };
  }

  private esActividad(nodo: NodoCanvas): nodo is NodoActividad {
    return nodo.tipo !== 'compuerta' && nodo.tipo !== 'salida_condicional' && nodo.tipo !== 'gateway' && nodo.tipo !== 'fork' && nodo.tipo !== 'join';
  }

  private normalizarTipoNodoEstado(tipo: string): string | null {
    const valor = (tipo ?? '').toLowerCase();

    if (valor === 'inicio' || valor === 'start') {
      return 'Inicio';
    }

    if (valor === 'fin' || valor === 'end') {
      return 'Fin';
    }

    return null;
  }

  private normalizarTipoCampo(tipo: string | undefined): string {
    const lowercase = (tipo ?? '').toLowerCase().trim();

    if (lowercase === 'numero' || lowercase === 'number') return 'number';
    if (lowercase === 'fecha' || lowercase === 'date') return 'date';
    if (lowercase === 'fechahora' || lowercase === 'datetime-local') return 'datetime-local';
    if (lowercase === 'textolargo' || lowercase === 'textarea') return 'textarea';
    if (lowercase === 'booleano' || lowercase === 'boolean' || lowercase === 'bool') return 'boolean';
    if (lowercase === 'seleccion' || lowercase === 'select') return 'select';
    if (lowercase === 'archivo' || lowercase === 'file') return 'archivo';

    return 'text';
  }

  private nombreActividadPorTipo(tipo: TipoNodoHerramienta): string {
    switch (tipo) {
      case 'inicio':
        return 'Inicio';
      case 'fin':
        return 'Fin';
      case 'fork':
        return 'Bifurcación (Fork)';
      case 'join':
        return 'Unión (Join)';
      case 'tarea':
      default:
        return 'Nueva Tarea';
    }
  }

  private siguienteNodoId(prefijo: string): string {
    const siguiente = this.secuenciaNodos() + 1;
    this.secuenciaNodos.set(siguiente);
    return `${prefijo}-${siguiente}`;
  }

  private siguienteCarrilId(): string {
    const siguiente = this.secuenciaCarriles() + 1;
    this.secuenciaCarriles.set(siguiente);
    return `carril-${siguiente}`;
  }

  private recalcularSecuencias(): void {
    const maxNodo = this._nodos().reduce((max, nodo) => {
      const numero = Number(nodo.idNodo.split('-').pop() ?? '0');
      return Number.isFinite(numero) ? Math.max(max, numero) : max;
    }, 0);

    this.secuenciaNodos.set(maxNodo);

    const maxCarril = this._carriles().reduce((max, carril) => {
      const numero = Number(carril.id.split('-').pop() ?? '0');
      return Number.isFinite(numero) ? Math.max(max, numero) : max;
    }, 1);

    this.secuenciaCarriles.set(maxCarril);
  }

  private keyArista(origenNodoId: string, destinoNodoId: string): string {
    return `${origenNodoId}::${destinoNodoId}`;
  }

  private limpiarAristaInexistente(): void {
    const key = this._aristaSeleccionadaKey();
    if (!key) {
      return;
    }

    const existe = this._aristas().some((arista) => this.keyArista(arista.origenNodoId, arista.destinoNodoId) === key);
    if (!existe) {
      this._aristaSeleccionadaKey.set(null);
    }
  }
}
