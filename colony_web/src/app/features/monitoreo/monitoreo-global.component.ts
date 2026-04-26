import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Client } from '@stomp/stompjs';

export interface InstanciaMonitorDto {
  instanciaId: string;
  codigo: string;
  estadoGeneral: string;
  semaforo: string;
  nodoActualId: string;
  fechaInicio?: string;
}

export interface GrupoPoliticaDto {
  politicaId: string;
  politicaNombre: string;
  instancias: InstanciaMonitorDto[];
  abierto?: boolean;
}

export interface RastreoResultado {
  codigo: string;
  estadoGeneral: string;
  nodoActual: string;
  fechaInicio: string;
  historial: string[];
}

@Component({
  selector: 'app-monitoreo-global',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './monitoreo-global.component.html'
})
export class MonitoreoGlobalComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8080/api/monitoreo';
  private readonly rastreoUrl = 'http://localhost:8080/api/rastreo';

  // --- SECCIÓN A: Rastreador ---
  codigoBusqueda = '';
  rastreoResultado: RastreoResultado | null = null;
  rastreoError: string | null = null;
  buscando = false;

  // --- SECCIÓN B: Tablero agrupado ---
  grupos: GrupoPoliticaDto[] = [];
  cargando = true;
  errorCarga: string | null = null;

  // --- WebSocket ---
  private stompClient: Client | null = null;

  ngOnInit(): void {
    this.cargarInstancias();
    this.conectarWebSocket();
  }

  ngOnDestroy(): void {
    this.stompClient?.deactivate();
  }

  cargarInstancias(): void {
    this.cargando = true;
    this.errorCarga = null;
    this.http.get<GrupoPoliticaDto[]>(`${this.apiUrl}/instancias`).subscribe({
      next: (grupos) => {
        this.grupos = grupos.map(g => ({ ...g, abierto: true }));
        this.cargando = false;
      },
      error: () => {
        this.errorCarga = 'No se pudo cargar el tablero. Verifica la conexión con el backend.';
        this.cargando = false;
      }
    });
  }

  rastrear(): void {
    const codigo = this.codigoBusqueda.trim().toUpperCase();
    if (!codigo) return;
    this.buscando = true;
    this.rastreoResultado = null;
    this.rastreoError = null;

    this.http.get<RastreoResultado>(`${this.rastreoUrl}/${codigo}`).subscribe({
      next: (res) => {
        this.rastreoResultado = res;
        this.buscando = false;
      },
      error: () => {
        this.rastreoError = `No se encontró ningún trámite con el código "${codigo}".`;
        this.buscando = false;
      }
    });
  }

  toggleGrupo(grupo: GrupoPoliticaDto): void {
    grupo.abierto = !grupo.abierto;
  }

  private conectarWebSocket(): void {
    this.stompClient = new Client({
      brokerURL: 'ws://localhost:8080/ws-collab',
      reconnectDelay: 5000,
      onConnect: () => {
        this.stompClient?.subscribe('/topic/monitoreo', (message) => {
          const actualizado: InstanciaMonitorDto = JSON.parse(message.body);
          this.aplicarActualizacion(actualizado);
        });
      }
    });
    this.stompClient.activate();
  }

  private aplicarActualizacion(actualizado: InstanciaMonitorDto): void {
    // Buscar en grupos existentes
    for (const grupo of this.grupos) {
      if (grupo.politicaId === actualizado.instanciaId || true) {
        const idx = grupo.instancias.findIndex(i => i.instanciaId === actualizado.instanciaId);
        if (idx !== -1) {
          // Mutar el objeto directamente para activar la detección de cambios
          grupo.instancias[idx] = { ...grupo.instancias[idx], ...actualizado };
          return;
        }
      }
    }
    // Si no se encontró, recargar el tablero para incluir la nueva instancia
    this.cargarInstancias();
  }

  semaforoBadgeClass(semaforo: string): string {
    switch ((semaforo || '').toUpperCase()) {
      case 'VERDE':    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'AMARILLO': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'ROJO':
      default:         return 'bg-red-100 text-red-800 border-red-200';
    }
  }

  semaforoIcon(semaforo: string): string {
    switch ((semaforo || '').toUpperCase()) {
      case 'VERDE':    return '🟢';
      case 'AMARILLO': return '🟡';
      default:         return '🔴';
    }
  }

  estadoBadgeClass(estado: string): string {
    return (estado || '').toUpperCase() === 'FINALIZADO'
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : 'bg-blue-100 text-blue-800 border-blue-200';
  }

  totalInstancias(): number {
    return this.grupos.reduce((acc, g) => acc + g.instancias.length, 0);
  }

  enProceso(): number {
    return this.grupos.reduce((acc, g) =>
      acc + g.instancias.filter(i => i.estadoGeneral === 'EN_PROCESO').length, 0);
  }

  finalizados(): number {
    return this.grupos.reduce((acc, g) =>
      acc + g.instancias.filter(i => i.estadoGeneral === 'FINALIZADO').length, 0);
  }
}
