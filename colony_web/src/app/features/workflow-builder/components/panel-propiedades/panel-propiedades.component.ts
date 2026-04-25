import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, Input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Arista, CampoFormulario, NodoActividad, NodoCanvas, NodoCompuerta } from '../../models/canvas.models';
import { DiagramadorEstadoService } from '../../services/diagramador-estado.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-panel-propiedades',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './panel-propiedades.component.html'
})
export class PanelPropiedadesComponent {
  @Input() isReadOnly = false;
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly estado = inject(DiagramadorEstadoService);

  private readonly nodoSeleccionadoSignal = this.estado.nodoSeleccionado;
  private readonly aristaSeleccionadaSignal = this.estado.aristaSeleccionada;

  readonly tiposCampo = [
    { label: 'Texto', value: 'text' },
    { label: 'Numero', value: 'number' },
    { label: 'Fecha', value: 'date' },
    { label: 'Booleano', value: 'boolean' }
  ];

  nodoSeleccionadoActual: NodoCanvas | null = null;
  nodoActividadSeleccionado: NodoActividad | null = null;
  nodoEstadoSeleccionado: NodoActividad | null = null;
  nodoCompuertaSeleccionado: NodoCompuerta | null = null;
  aristaSeleccionadaActual: Arista | null = null;
  camposFormulario: CampoFormulario[] = [];

  readonly actividadForm = this.fb.nonNullable.group({
    nombre: ''
  });

  readonly compuertaForm = this.fb.nonNullable.group({
    condicionLogica: ''
  });

  readonly aristaForm = this.fb.nonNullable.group({
    etiqueta: '',
    condicion: ''
  });

  constructor() {
    effect(() => {
      const nodo = this.nodoSeleccionadoSignal();
      const arista = this.aristaSeleccionadaSignal();

      this.nodoSeleccionadoActual = nodo;
      this.aristaSeleccionadaActual = arista;
      this.nodoActividadSeleccionado = this.esNodoActividadEditable(nodo) ? nodo : null;
      this.nodoEstadoSeleccionado = this.esNodoEstado(nodo) ? nodo : null;
      this.nodoCompuertaSeleccionado = this.esNodoCompuerta(nodo) ? nodo : null;
      this.camposFormulario = this.nodoActividadSeleccionado?.esquemaFormulario ?? [];

      if (!nodo) {
        this.camposFormulario = [];
        this.actividadForm.reset({ nombre: '' }, { emitEvent: false });
        this.compuertaForm.reset({ condicionLogica: '' }, { emitEvent: false });
      }
      if (this.nodoActividadSeleccionado) {
        const normalizado = this.normalizarEsquemaFormulario(this.nodoActividadSeleccionado.esquemaFormulario ?? []);
        this.camposFormulario = normalizado;
        this.actividadForm.controls.nombre.setValue(this.nodoActividadSeleccionado.nombre, { emitEvent: false });
      }

      if (this.nodoCompuertaSeleccionado) {
        this.compuertaForm.controls.condicionLogica.setValue(this.nodoCompuertaSeleccionado.condicionLogica, { emitEvent: false });
      }

      this.aristaForm.controls.etiqueta.setValue(arista?.etiqueta ?? '', { emitEvent: false });
      this.aristaForm.controls.condicion.setValue(arista?.condicion ?? '', { emitEvent: false });
    });

    this.actividadForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (this.isReadOnly) return;
      const nodo = this.nodoSeleccionadoSignal();
      if (!nodo || !this.esNodoActividadEditable(nodo)) {
        return;
      }

      this.estado.actualizarNodo(nodo.idNodo, {
        nombre: value.nombre ?? ''
      });
    });

    this.compuertaForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (this.isReadOnly) return;
      const nodo = this.nodoSeleccionadoSignal();
      if (!nodo || !this.esNodoCompuerta(nodo)) {
        return;
      }

      this.estado.actualizarNodo(nodo.idNodo, {
        condicionLogica: value.condicionLogica ?? ''
      });
    });

    this.aristaForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (this.isReadOnly) return;
      const arista = this.aristaSeleccionadaSignal();
      if (!arista) {
        return;
      }

      this.estado.actualizarEtiquetaArista(arista.origenNodoId, arista.destinoNodoId, value.etiqueta ?? '');
      this.estado.actualizarCondicionArista(arista.origenNodoId, arista.destinoNodoId, value.condicion ?? '');
    });
  }

  agregarCampoFormulario(): void {
    const nodo = this.nodoActividadSeleccionado;
    if (!nodo) {
      return;
    }

    // Usar los campos actuales del componente en lugar de los del nodo para no perder cambios sin guardar
    const nuevosCampos = [...this.camposFormulario, {
      id: crypto.randomUUID(),
      nombre: '',
      tipo: 'text',
      requerido: false
    }];

    this.camposFormulario = nuevosCampos;
    // No persistimos automáticamente para seguir la lógica de guardado explícito
  }

  eliminarCampo(campoId?: string): void {
    if (!campoId) return;
    this.camposFormulario = this.camposFormulario.filter(c => c.id !== campoId);
  }

  guardarFormularioExplicitamente(): void {
    this.persistirEsquemaFormulario(this.camposFormulario);
    Swal.fire({
      title: '¡Guardado!',
      text: 'Formulario guardado exitosamente.',
      icon: 'success',
      confirmButtonText: 'Aceptar',
      timer: 2000,
      timerProgressBar: true,
      heightAuto: false
    });
  }

  trackByCampoId(_index: number, campo: CampoFormulario): string {
    return campo.id || `${campo.nombre}-${_index}`;
  }

  eliminarNodoSeleccionado(): void {
    const nodo = this.nodoSeleccionadoActual;
    if (!nodo) {
      return;
    }

    this.estado.eliminarNodo(nodo.idNodo);
  }

  limpiarAristaSeleccionada(): void {
    this.estado.limpiarSeleccionArista();
  }

  limpiarSeleccion(): void {
    this.estado.seleccionarNodo(null);
    this.estado.limpiarSeleccionArista();
  }

  private esNodoActividadEditable(nodo: NodoCanvas | null): nodo is NodoActividad {
    if (!nodo) {
      return false;
    }

    return this.normalizarTipo(nodo.tipo) === 'tarea';
  }

  private esNodoEstado(nodo: NodoCanvas | null): nodo is NodoActividad {
    if (!nodo) {
      return false;
    }

    const tipo = this.normalizarTipo(nodo.tipo);
    return tipo === 'inicio' || tipo === 'fin';
  }

  private esNodoCompuerta(nodo: NodoCanvas | null): nodo is NodoCompuerta {
    if (!nodo) {
      return false;
    }

    return nodo.tipo === 'compuerta' || nodo.tipo === 'gateway' || nodo.tipo === 'salida_condicional';
  }

  private normalizarTipo(tipo: string): 'inicio' | 'fin' | 'compuerta' | 'tarea' {
    const valor = (tipo ?? '').toLowerCase();

    if (valor === 'inicio' || valor === 'start') {
      return 'inicio';
    }

    if (valor === 'fin' || valor === 'end') {
      return 'fin';
    }

    if (valor === 'compuerta' || valor === 'gateway' || valor === 'salida_condicional') {
      return 'compuerta';
    }

    return 'tarea';
  }

  private persistirEsquemaFormulario(campos: CampoFormulario[]): void {
    const nodo = this.nodoActividadSeleccionado;
    if (!nodo) {
      return;
    }

    const normalizado = this.normalizarEsquemaFormulario(campos);
    this.camposFormulario = normalizado;
    this.estado.actualizarNodo(nodo.idNodo, {
      esquemaFormulario: normalizado
    });
  }

  private normalizarEsquemaFormulario(campos: CampoFormulario[]): CampoFormulario[] {
    return (campos ?? []).map((campo) => ({
      id: campo?.id || crypto.randomUUID(),
      nombre: campo?.nombre ?? '',
      tipo: this.normalizarTipoCampo(campo?.tipo),
      requerido: !!campo?.requerido
    }));
  }

  private normalizarTipoCampo(tipo: string | undefined): string {
    const valor = (tipo ?? '').toLowerCase();

    if (valor === 'numero' || valor === 'number') {
      return 'number';
    }

    if (valor === 'fecha' || valor === 'date') {
      return 'date';
    }

    if (valor === 'booleano' || valor === 'boolean' || valor === 'bool') {
      return 'boolean';
    }

    return 'text';
  }

  private sonCamposIguales(actual: CampoFormulario[], siguiente: CampoFormulario[]): boolean {
    if (actual.length !== siguiente.length) {
      return false;
    }

    return actual.every((campo, index) => {
      const candidato = siguiente[index];

      return (
        campo.id === candidato.id
        && campo.nombre === candidato.nombre
        && this.normalizarTipoCampo(campo.tipo) === this.normalizarTipoCampo(candidato.tipo)
        && campo.requerido === candidato.requerido
      );
    });
  }
}
