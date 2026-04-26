import { Injectable } from '@angular/core';
import { jsPlumb } from 'jsplumb';
import { Arista, NodoCanvas } from '../models/canvas.models';

interface CallbacksEventos {
  onConnection: (origenNodoId: string, destinoNodoId: string, connection: any) => void;
  onConnectionClick: (origenNodoId: string, destinoNodoId: string) => void;
  onNodeDragStop: (nodeId: string, posicion?: { x: number; y: number }) => void;
}

@Injectable({
  providedIn: 'root'
})
export class JsplumbWrapperService {
  private instancia: any = null;
  private sincronizandoDesdeEstado = false;
  private isReadOnly = false;
  private callbacks: CallbacksEventos | null = null;
  private readonly endpointInicializado = new Map<string, string>();

  inicializar(container: HTMLElement, callbacks: CallbacksEventos, isReadOnly = false): void {
    this.callbacks = callbacks;
    this.isReadOnly = isReadOnly;
    this.instancia = jsPlumb.getInstance({ Container: container });
    
    if (isReadOnly) {
        this.instancia.setDraggable = () => {}; // Desactivar drag globalmente de forma bruta si es necesario
    }

    this.instancia.importDefaults({
      Connector: ['Flowchart', { stub: 30, gap: 0, cornerRadius: 5 }],
      PaintStyle: { stroke: '#475569', strokeWidth: 2 },
      Endpoint: 'Blank',
      ConnectionOverlays: [
        ['Arrow', { location: 1, width: 10, length: 10 }],
        ['Label', { id: 'label', label: '', cssClass: 'bg-white p-1 text-xs border rounded text-blue-600' }]
      ]
    });

    this.bindEventos();
  }

  sincronizarNodos(nodos: NodoCanvas[], resolverIdElemento: (idNodo: string) => string): void {
    if (!this.instancia) {
      return;
    }

    const activos = new Set(nodos.map((nodo) => nodo.idNodo));
    for (const nodoId of this.endpointInicializado.keys()) {
      if (!activos.has(nodoId)) {
        this.endpointInicializado.delete(nodoId);
      }
    }

    for (const nodo of nodos) {
      const tipoEndpoint = this.resolverTipoEndpoint(nodo);
      if (this.endpointInicializado.get(nodo.idNodo) === tipoEndpoint) {
        continue;
      }

      this.inicializarEndpointNodo(nodo.idNodo, tipoEndpoint, resolverIdElemento);
      this.endpointInicializado.set(nodo.idNodo, tipoEndpoint);
    }
  }

  dibujarAristas(
    aristas: Arista[],
    resolverIdElemento: (idNodo: string) => string,
    aristaSeleccionada: Arista | null,
    zoomNivel: number
  ): void {
    if (!this.instancia) {
      return;
    }

    this.sincronizandoDesdeEstado = true;
    try {
      this.instancia.deleteEveryConnection();

      for (const arista of aristas) {
        const sourceId = resolverIdElemento(arista.origenNodoId);
        const targetId = resolverIdElemento(arista.destinoNodoId);

        if (!document.getElementById(sourceId) || !document.getElementById(targetId)) {
          continue;
        }

        const connection = this.instancia.connect({
          source: sourceId,
          target: targetId,
          anchors: ['Continuous', 'Continuous']
        });

        if (!connection) {
          continue;
        }

        if (arista.condicion) {
          connection.setParameter('condicion', arista.condicion);
        }
        if (arista.etiqueta) {
          connection.setParameter('etiqueta', arista.etiqueta);
        }

        const overlay = connection.getOverlay('label');
        if (overlay) {
          const condicion = connection.getParameter('condicion') || arista.condicion;
          // Mostrar solo la condición si existe, o la etiqueta original
          const texto = condicion || arista.etiqueta;
          overlay.setLabel(texto || '');
        }

        const activa =
          !!aristaSeleccionada &&
          aristaSeleccionada.origenNodoId === arista.origenNodoId &&
          aristaSeleccionada.destinoNodoId === arista.destinoNodoId;

        connection.setPaintStyle({
          stroke: activa ? '#1d4ed8' : '#475569',
          strokeWidth: activa ? 3 : 2
        });
      }
    } finally {
      this.sincronizandoDesdeEstado = false;
    }

    this.instancia.setZoom(zoomNivel);
    this.instancia.repaintEverything();
  }

  repintarTodo(): void {
    if (!this.instancia) {
      return;
    }

    this.instancia.repaintEverything();
  }

  obtenerAristasDesdeLienzo(): Arista[] {
    if (!this.instancia) return [];
    
    return this.instancia.getAllConnections().map((conn: any) => {
      const origenId = this.extraerNodoId(conn.sourceId);
      const destinoId = this.extraerNodoId(conn.targetId);
      const etiqueta = conn.getParameter('etiqueta');
      const condicion = conn.getParameter('condicion');
      
      const arista: Arista = {
        origenNodoId: origenId || '',
        destinoNodoId: destinoId || '',
        salidaOrigenId: conn.endpoints[0]?.getUuid?.() || null,
        entradaDestinoId: conn.endpoints[1]?.getUuid?.() || null,
        etiqueta: etiqueta || null,
        condicion: condicion || null
      };
      
      return arista;
    });
  }

  destruir(): void {
    this.endpointInicializado.clear();
    this.callbacks = null;

    if (!this.instancia) {
      return;
    }

    this.instancia.reset();
    if (typeof this.instancia.destroy === 'function') {
      this.instancia.destroy();
    }
    this.instancia = null;
  }

  private bindEventos(): void {
    if (!this.instancia) {
      return;
    }

    // Validador previo a la conexión (UML interceptor)
    this.instancia.bind('beforeDrop', (info: any) => {
      const sourceId = info?.sourceId as string | undefined;
      const targetId = info?.targetId as string | undefined;

      if (sourceId && targetId && sourceId === targetId) {
        this.mostrarToastUML('UML: Un nodo no puede conectarse a sí mismo.');
        return false;
      }
      return true;
    });

    this.instancia.bind('connection', (info: any) => {
      if (this.sincronizandoDesdeEstado || !this.callbacks) {
        return;
      }

      const origenNodoId = this.extraerNodoId(info?.sourceId);
      const destinoNodoId = this.extraerNodoId(info?.targetId);
      if (!origenNodoId || !destinoNodoId) {
        return;
      }

      const targetElement = info?.target as HTMLElement | null;
      if (targetElement) {
        const clasesGlow = ['shadow-[0_0_15px_rgba(34,197,94,0.8)]', 'ring-2', 'ring-green-500', 'transition-all'];
        targetElement.classList.add(...clasesGlow);
        setTimeout(() => {
          targetElement.classList.remove(...clasesGlow);
        }, 800);
      }

      this.callbacks.onConnection(origenNodoId, destinoNodoId, info.connection);
    });

    this.instancia.bind('click', (connection: any, originalEvent?: MouseEvent) => {
      if (!this.callbacks) {
        return;
      }
      originalEvent?.stopPropagation();

      const origenNodoId = this.extraerNodoId(connection?.sourceId);
      const destinoNodoId = this.extraerNodoId(connection?.targetId);
      if (!origenNodoId || !destinoNodoId) {
        return;
      }

      this.callbacks.onConnectionClick(origenNodoId, destinoNodoId);
    });

    this.instancia.bind('dragStop', (params: any) => {
      if (!this.callbacks) {
        return;
      }

      const elementId = this.extraerElementoDragId(params);
      const nodoId = this.extraerNodoId(elementId);
      if (!nodoId) {
        return;
      }

      this.callbacks.onNodeDragStop(nodoId, this.extraerPosicionDrag(params));
    });
  }

  private mostrarToastUML(mensaje: string): void {
    const toast = document.createElement('div');
    toast.textContent = mensaje;
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f8fafc;padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:none;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  private inicializarEndpointNodo(
    nodoId: string,
    tipoEndpoint: 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA' | 'FORK' | 'JOIN',
    resolverIdElemento: (idNodo: string) => string
  ): void {
    if (!this.instancia) {
      return;
    }

    const elementId = resolverIdElemento(nodoId);
    if (!document.getElementById(elementId)) {
      return;
    }

    this.instancia.unmakeSource(elementId);
    this.instancia.unmakeTarget(elementId);

    if (this.isReadOnly) {
      return;
    }

    this.instancia.draggable(elementId, {
      containment: 'parent'
    });

    const policy = this.getEndpointPolicy(tipoEndpoint);

    if (policy.sourceMax !== null) {
      const sourceAnchor = tipoEndpoint === 'FORK' ? 'ContinuousRight' :
                           tipoEndpoint === 'JOIN' ? 'Right' : 'Right';
      this.instancia.makeSource(elementId, {
        anchor: sourceAnchor,
        filter: '.conector-handle',
        endpoint: 'Blank',
        maxConnections: policy.sourceMax,
        allowLoopback: false,
        connector: ['Flowchart', { stub: 30, gap: 0, cornerRadius: 5 }],
        connectorStyle: { stroke: '#475569', strokeWidth: 2 },
        connectorOverlays: [
          ['Arrow', { location: 1, width: 10, length: 10 }],
          ['Label', { id: 'label', label: '', cssClass: 'edge-label' }]
        ]
      });
    }

    if (policy.targetMax !== null) {
      const targetAnchor = tipoEndpoint === 'JOIN' ? 'ContinuousLeft' :
                           tipoEndpoint === 'FORK' ? 'Left' : 'Left';
      this.instancia.makeTarget(elementId, {
        anchor: targetAnchor,
        endpoint: 'Blank',
        maxConnections: policy.targetMax,
        allowLoopback: false,
        dropOptions: {
          tolerance: 'touch',
          hoverClass: 'ring-4 ring-blue-300 transition-all'
        }
      });
    }
  }

  private getEndpointPolicy(tipoEndpoint: 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA' | 'FORK' | 'JOIN'): {
    sourceMax: number | null;
    targetMax: number | null;
  } {
    switch (tipoEndpoint) {
      case 'INICIO':
        return { sourceMax: 1, targetMax: null };
      case 'FIN':
        return { sourceMax: null, targetMax: -1 };
      case 'COMPUERTA':
        return { sourceMax: -1, targetMax: 1 };
      case 'FORK':
        return { sourceMax: -1, targetMax: 1 };
      case 'JOIN':
        return { sourceMax: 1, targetMax: -1 };
      case 'TAREA':
      default:
        return { sourceMax: 1, targetMax: -1 };
    }
  }

  private resolverTipoEndpoint(nodo: NodoCanvas): 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA' | 'FORK' | 'JOIN' {
    if (nodo.tipo === 'inicio' || nodo.tipo === 'start') {
      return 'INICIO';
    }

    if (nodo.tipo === 'fin' || nodo.tipo === 'end') {
      return 'FIN';
    }

    if (nodo.tipo === 'compuerta' || nodo.tipo === 'gateway' || nodo.tipo === 'salida_condicional') {
      return 'COMPUERTA';
    }

    if (nodo.tipo === 'fork') {
      return 'FORK';
    }

    if (nodo.tipo === 'join') {
      return 'JOIN';
    }

    return 'TAREA';
  }

  private extraerNodoId(elementId: string | undefined): string | null {
    if (!elementId || !elementId.startsWith('node-')) {
      return null;
    }

    return elementId.slice(5);
  }

  private extraerElementoDragId(params: any): string | undefined {
    if (typeof params?.el === 'string') {
      return params.el;
    }

    if (typeof params?.el?.id === 'string') {
      return params.el.id;
    }

    if (Array.isArray(params?.selection) && typeof params.selection[0]?.id === 'string') {
      return params.selection[0].id;
    }

    if (typeof params?.drag?.el?.id === 'string') {
      return params.drag.el.id;
    }

    return undefined;
  }

  private extraerPosicionDrag(params: any): { x: number; y: number } | undefined {
    if (params?.pos && typeof params.pos[0] === 'number' && typeof params.pos[1] === 'number') {
      return {
        x: params.pos[0],
        y: params.pos[1]
      };
    }

    if (params?.pos && typeof params.pos.left === 'number' && typeof params.pos.top === 'number') {
      return {
        x: params.pos.left,
        y: params.pos.top
      };
    }

    if (params?.el?.style) {
      const x = Number.parseFloat(params.el.style.left);
      const y = Number.parseFloat(params.el.style.top);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x, y };
      }
    }

    return undefined;
  }
}
