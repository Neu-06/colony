import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CampoFormulario, NodoActividad, NodoCanvas, NodoCompuerta } from '../../models/canvas.models';
import { DiagramadorEstadoService } from '../../services/diagramador-estado.service';

@Component({
  selector: 'app-panel-propiedades',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './panel-propiedades.component.html'
})
export class PanelPropiedadesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly estado = inject(DiagramadorEstadoService);

  readonly nodoSeleccionado = this.estado.nodoSeleccionado;
  readonly aristaSeleccionada = this.estado.aristaSeleccionada;
  readonly tiposCampo = ['Texto', 'Numero', 'Fecha'];

  readonly actividadForm = this.fb.nonNullable.group({
    nombre: '',
    esquemaFormulario: this.fb.array([])
  });

  readonly compuertaForm = this.fb.nonNullable.group({
    condicionLogica: ''
  });

  readonly aristaForm = this.fb.nonNullable.group({
    etiqueta: ''
  });

  constructor() {
    effect(() => {
      const nodo = this.nodoSeleccionado();
      const arista = this.aristaSeleccionada();

      if (!nodo) {
        this.limpiarCampos();
        this.actividadForm.reset({ nombre: '', esquemaFormulario: [] }, { emitEvent: false });
        this.compuertaForm.reset({ condicionLogica: '' }, { emitEvent: false });
      }

      if (nodo) {
        if (this.esNodoActividad(nodo)) {
          this.actividadForm.controls.nombre.setValue(nodo.nombre, { emitEvent: false });
          this.reconstruirCampos(nodo.esquemaFormulario);
        } else {
          this.compuertaForm.controls.condicionLogica.setValue(nodo.condicionLogica, { emitEvent: false });
        }
      }

      this.aristaForm.controls.etiqueta.setValue(arista?.etiqueta ?? '', { emitEvent: false });
    });

    this.actividadForm.valueChanges.subscribe((value) => {
      const nodo = this.nodoSeleccionado();
      if (!nodo || !this.esNodoActividad(nodo)) {
        return;
      }

      const campos = ((value.esquemaFormulario ?? []) as Array<{ nombre?: string; tipo?: string; requerido?: boolean }>).map(
        (item) => ({
          nombre: item?.nombre ?? '',
          tipo: item?.tipo ?? 'Texto',
          requerido: !!item?.requerido
        })
      );

      this.estado.actualizarNodo(nodo.idNodo, {
        nombre: value.nombre ?? '',
        esquemaFormulario: campos
      });
    });

    this.compuertaForm.valueChanges.subscribe((value) => {
      const nodo = this.nodoSeleccionado();
      if (!nodo || !this.esNodoCompuerta(nodo)) {
        return;
      }

      this.estado.actualizarNodo(nodo.idNodo, {
        condicionLogica: value.condicionLogica ?? ''
      });
    });

    this.aristaForm.valueChanges.subscribe((value) => {
      const arista = this.aristaSeleccionada();
      if (!arista) {
        return;
      }

      this.estado.actualizarEtiquetaArista(arista.origenNodoId, arista.destinoNodoId, value.etiqueta ?? '');
    });
  }

  get campos(): FormArray {
    return this.actividadForm.controls.esquemaFormulario;
  }

  agregarCampo(): void {
    this.campos.push(
      this.fb.nonNullable.group({
        nombre: '',
        tipo: 'Texto',
        requerido: false
      })
    );
  }

  quitarCampo(index: number): void {
    this.campos.removeAt(index);
  }

  eliminarNodoSeleccionado(): void {
    const nodo = this.nodoSeleccionado();
    if (!nodo) {
      return;
    }

    this.estado.eliminarNodo(nodo.idNodo);
  }

  limpiarAristaSeleccionada(): void {
    this.estado.limpiarSeleccionArista();
  }

  esNodoActividad(nodo: NodoCanvas | null): nodo is NodoActividad {
    if (!nodo) {
      return false;
    }

    return nodo.tipo !== 'compuerta' && nodo.tipo !== 'gateway' && nodo.tipo !== 'salida_condicional';
  }

  esNodoCompuerta(nodo: NodoCanvas | null): nodo is NodoCompuerta {
    if (!nodo) {
      return false;
    }

    return nodo.tipo === 'compuerta' || nodo.tipo === 'gateway' || nodo.tipo === 'salida_condicional';
  }

  private reconstruirCampos(campos: CampoFormulario[]): void {
    this.limpiarCampos();
    for (const campo of campos) {
      this.campos.push(
        this.fb.nonNullable.group({
          nombre: campo.nombre,
          tipo: campo.tipo,
          requerido: campo.requerido
        })
      );
    }
  }

  private limpiarCampos(): void {
    while (this.campos.length > 0) {
      this.campos.removeAt(0);
    }
  }
}
