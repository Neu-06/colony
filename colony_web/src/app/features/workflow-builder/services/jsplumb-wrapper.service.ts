import { Injectable } from '@angular/core';
import { jsPlumb } from 'jsplumb';
import { Arista, NodoCanvas } from '../models/canvas.models';

interface CallbacksEventos {
  onConnection: (origenNodoId: string, destinoNodoId: string) => void;
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
      Connector: ['Flowchart', { stub: 24, gap: 10, cornerRadius: 6 }],
      PaintStyle: { stroke: '#475569', strokeWidth: 2 },
      Endpoint: 'Blank',
      ConnectionOverlays: [
        ['Arrow', { location: 1, width: 10, length: 10 }],
        ['Label', { id: 'label', label: '', cssClass: 'edge-label' }]
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

        const overlay = connection.getOverlay('label');
        if (overlay) {
          const texto = [arista.etiqueta, arista.condicion ? `[${arista.condicion}]` : null].filter(Boolean).join(' ');
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

      this.callbacks.onConnection(origenNodoId, destinoNodoId);
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

  private inicializarEndpointNodo(
    nodoId: string,
    tipoEndpoint: 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA',
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
      this.instancia.makeSource(elementId, {
        anchor: 'Right',
        filter: '.conector-handle',
        endpoint: 'Blank',
        maxConnections: policy.sourceMax,
        allowLoopback: false,
        connector: ['Flowchart', { stub: 24, gap: 10, cornerRadius: 6 }],
        connectorStyle: { stroke: '#475569', strokeWidth: 2 },
        connectorOverlays: [
          ['Arrow', { location: 1, width: 10, length: 10 }],
          ['Label', { id: 'label', label: '', cssClass: 'edge-label' }]
        ]
      });
    }

    if (policy.targetMax !== null) {
      this.instancia.makeTarget(elementId, {
        anchor: 'Left',
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

  private getEndpointPolicy(tipoEndpoint: 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA'): {
    sourceMax: number | null;
    targetMax: number | null;
  } {
    switch (tipoEndpoint) {
      case 'INICIO':
        return { sourceMax: -1, targetMax: null };
      case 'FIN':
        return { sourceMax: null, targetMax: -1 };
      case 'COMPUERTA':
        return { sourceMax: -1, targetMax: -1 };
      case 'TAREA':
      default:
        return { sourceMax: -1, targetMax: -1 };
    }
  }

  private resolverTipoEndpoint(nodo: NodoCanvas): 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA' {
    if (nodo.tipo === 'inicio' || nodo.tipo === 'start') {
      return 'INICIO';
    }

    if (nodo.tipo === 'fin' || nodo.tipo === 'end') {
      return 'FIN';
    }

    if (nodo.tipo === 'compuerta' || nodo.tipo === 'gateway' || nodo.tipo === 'salida_condicional') {
      return 'COMPUERTA';
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
