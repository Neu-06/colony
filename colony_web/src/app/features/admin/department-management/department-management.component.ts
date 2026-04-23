import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertaService } from '../../../core/services/alerta.service';
import { DepartamentoDto, DepartamentoService } from '../../../core/services/departamento.service';

@Component({
  selector: 'app-department-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './department-management.component.html'
})
export class DepartmentManagementComponent implements OnInit {
  private readonly alertaService = inject(AlertaService);
  private readonly departamentoService = inject(DepartamentoService);

  departamentos: DepartamentoDto[] = [];
  nuevoDepartamentoNombre = '';

  isLoading = false;
  isCreating = false;
  isSavingMap: Record<string, boolean> = {};
  isDeletingMap: Record<string, boolean> = {};
  statusMessage = '';
  statusType: 'success' | 'error' | '' = '';

  ngOnInit(): void {
    this.cargarDepartamentos();
  }

  cargarDepartamentos(): void {
    this.isLoading = true;
    this.statusMessage = '';

    this.departamentoService.listar().subscribe({
      next: (departamentos) => {
        this.departamentos = departamentos;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.statusType = 'error';
        this.statusMessage = 'No se pudieron cargar los departamentos.';
        this.alertaService.mostrarError(this.statusMessage);
      }
    });
  }

  crearDepartamento(): void {
    const nombre = this.nuevoDepartamentoNombre.trim();
    if (!nombre) {
      return;
    }

    this.isCreating = true;
    this.departamentoService.crear({ nombre }).subscribe({
      next: (creado) => {
        this.departamentos = [...this.departamentos, creado].sort((a, b) => a.nombre.localeCompare(b.nombre));
        this.nuevoDepartamentoNombre = '';
        this.isCreating = false;
        this.statusType = 'success';
        this.statusMessage = 'Departamento creado correctamente.';
        this.alertaService.mostrarExito(this.statusMessage);
      },
      error: () => {
        this.isCreating = false;
        this.statusType = 'error';
        this.statusMessage = 'No se pudo crear el departamento.';
        this.alertaService.mostrarError(this.statusMessage);
      }
    });
  }

  guardarDepartamento(departamento: DepartamentoDto): void {
    const nombre = (departamento.nombre ?? '').trim();
    if (!nombre) {
      this.alertaService.mostrarError('El nombre del departamento no puede estar vacio.');
      return;
    }

    this.isSavingMap[departamento.id] = true;
    this.departamentoService.actualizar(departamento.id, { nombre }).subscribe({
      next: (actualizado) => {
        this.departamentos = this.departamentos
          .map((item) => (item.id === actualizado.id ? actualizado : item))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));

        this.isSavingMap[departamento.id] = false;
        this.statusType = 'success';
        this.statusMessage = 'Departamento actualizado.';
        this.alertaService.mostrarExito(this.statusMessage);
      },
      error: () => {
        this.isSavingMap[departamento.id] = false;
        this.statusType = 'error';
        this.statusMessage = 'No se pudo actualizar el departamento.';
        this.alertaService.mostrarError(this.statusMessage);
      }
    });
  }

  async eliminarDepartamento(departamento: DepartamentoDto): Promise<void> {
    const confirmado = await this.alertaService.confirmarAccion(
      'Eliminar departamento',
      `Se eliminara "${departamento.nombre}". Esta accion no se puede deshacer.`
    );

    if (!confirmado) {
      return;
    }

    this.isDeletingMap[departamento.id] = true;
    this.departamentoService.eliminar(departamento.id).subscribe({
      next: () => {
        this.departamentos = this.departamentos.filter((item) => item.id !== departamento.id);
        this.isDeletingMap[departamento.id] = false;
        this.statusType = 'success';
        this.statusMessage = 'Departamento eliminado.';
        this.alertaService.mostrarExito(this.statusMessage);
      },
      error: (error: HttpErrorResponse) => {
        this.isDeletingMap[departamento.id] = false;

        if (error.status === 409) {
          this.statusType = 'error';
          this.statusMessage = 'No se puede eliminar: existen usuarios asignados a este departamento.';
          this.alertaService.mostrarError(this.statusMessage);
          return;
        }

        this.statusType = 'error';
        this.statusMessage = 'No se pudo eliminar el departamento.';
        this.alertaService.mostrarError(this.statusMessage);
      }
    });
  }
}
