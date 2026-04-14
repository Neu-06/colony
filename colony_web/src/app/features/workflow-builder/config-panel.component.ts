import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CampoForm, NodoActividad, NodoCanvas, NodoCompuerta } from '../../core/models/canvas.models';
import { CanvasStateService } from './services/canvas-state.service';

@Component({
  selector: 'app-config-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './config-panel.component.html'
})
export class ConfigPanelComponent {
  private readonly fb = inject(FormBuilder);
  private readonly canvasState = inject(CanvasStateService);

  readonly selectedNode = this.canvasState.nodoSeleccionado;
  readonly fieldTypes = ['Texto', 'Numero', 'Fecha'];

  readonly actividadForm = this.fb.nonNullable.group({
    nombre: '',
    esquemaFormulario: this.fb.array([])
  });

  readonly compuertaForm = this.fb.nonNullable.group({
    condicionLogica: ''
  });

  constructor() {
    effect(() => {
      const node = this.selectedNode();

      if (!node) {
        this.clearFieldArray();
        this.actividadForm.reset({ nombre: '', esquemaFormulario: [] }, { emitEvent: false });
        this.compuertaForm.reset({ condicionLogica: '' }, { emitEvent: false });
        return;
      }

      if (this.isActividad(node)) {
        this.actividadForm.controls.nombre.setValue(node.nombre, { emitEvent: false });
        this.rebuildFieldArray(node.esquemaFormulario);
      } else {
        this.compuertaForm.controls.condicionLogica.setValue(node.condicionLogica, { emitEvent: false });
      }
    });

    this.actividadForm.valueChanges.subscribe((value) => {
      const selected = this.selectedNode();
      if (!selected || !this.isActividad(selected)) {
        return;
      }

      const rawFields = (value.esquemaFormulario ?? []) as Array<{ nombre?: string; tipo?: string; requerido?: boolean }>;
      const fields = rawFields.map((item) => ({
        nombre: item?.nombre ?? '',
        tipo: item?.tipo ?? 'Texto',
        requerido: !!item?.requerido
      }));

      this.canvasState.updateNode(selected.idNodo, {
        nombre: value.nombre ?? '',
        esquemaFormulario: fields
      });
    });

    this.compuertaForm.valueChanges.subscribe((value) => {
      const selected = this.selectedNode();
      if (!selected || !this.isCompuerta(selected)) {
        return;
      }

      this.canvasState.updateNode(selected.idNodo, {
        condicionLogica: value.condicionLogica ?? ''
      });
    });
  }

  get fields(): FormArray {
    return this.actividadForm.controls.esquemaFormulario;
  }

  addField(): void {
    this.fields.push(
      this.fb.nonNullable.group({
        nombre: '',
        tipo: 'Texto',
        requerido: false
      })
    );
  }

  removeField(index: number): void {
    this.fields.removeAt(index);
  }

  isActividad(node: NodoCanvas | null): node is NodoActividad {
    if (!node) {
      return false;
    }
    return node.tipo !== 'compuerta' && node.tipo !== 'gateway';
  }

  isCompuerta(node: NodoCanvas | null): node is NodoCompuerta {
    if (!node) {
      return false;
    }
    return node.tipo === 'compuerta' || node.tipo === 'gateway';
  }

  private rebuildFieldArray(fields: CampoForm[]): void {
    this.clearFieldArray();
    for (const field of fields) {
      this.fields.push(
        this.fb.nonNullable.group({
          nombre: field.nombre,
          tipo: field.tipo,
          requerido: field.requerido
        })
      );
    }
  }

  private clearFieldArray(): void {
    while (this.fields.length > 0) {
      this.fields.removeAt(0);
    }
  }
}
