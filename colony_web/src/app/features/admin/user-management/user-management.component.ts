import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DepartamentoDto, DepartamentoService } from '../../../core/services/departamento.service';
import { AlertaService } from '../../../core/services/alerta.service';
import { AuthService } from '../../../core/services/auth.service';

interface UserRow {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  rol: string;
  departamentoId: string;
  departamentoNombre?: string;
  telefono?: string;
  activo?: boolean;
}

interface UpdateUserPayload {
  rol: string;
  departamentoId: string;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-management.component.html'
})
export class UserManagementComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly alertaService = inject(AlertaService);
  private readonly departamentoService = inject(DepartamentoService);
  private readonly apiUrl = 'http://localhost:8080/api/usuarios';
  private readonly rootSuperAdminEmail = 'super@colony.com';
  private readonly sinAsignar = 'SIN_ASIGNAR';

  readonly roles = ['SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO'];

  users: UserRow[] = [];
  departamentos: DepartamentoDto[] = [];

  isLoading = false;
  isLoadingDepartamentos = false;
  isSavingMap: Record<string, boolean> = {};
  statusMessage = '';
  statusType: 'success' | 'error' | '' = '';

  ngOnInit(): void {
    this.loadDepartamentos();
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.statusMessage = '';
    this.http.get<UserRow[]>(this.apiUrl).subscribe({
      next: (users) => {
        this.users = users;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.statusType = 'error';
        this.statusMessage = 'No se pudo cargar la lista de usuarios.';
        this.alertaService.mostrarError(this.statusMessage);
      }
    });
  }

  loadDepartamentos(): void {
    this.isLoadingDepartamentos = true;

    this.departamentoService.listar().subscribe({
      next: (departamentos) => {
        this.departamentos = departamentos;
        this.isLoadingDepartamentos = false;
      },
      error: () => {
        this.isLoadingDepartamentos = false;
        this.alertaService.mostrarError('No se pudieron cargar los departamentos.');
      }
    });
  }

  saveUser(user: UserRow): void {
    if (this.isProtectedUser(user)) {
      this.statusType = 'error';
      this.statusMessage = 'El super admin principal no se puede degradar.';
      this.alertaService.mostrarError(this.statusMessage);
      return;
    }

    const payload: UpdateUserPayload = {
      rol: user.rol,
      departamentoId: user.departamentoId || this.sinAsignar
    };

    this.isSavingMap[user.id] = true;

    this.http.put<UserRow>(`${this.apiUrl}/${user.id}/asignar`, payload).subscribe({
      next: (updatedUser) => {
        this.users = this.users.map((current) => (current.id === updatedUser.id ? updatedUser : current));
        this.isSavingMap[user.id] = false;
        this.statusType = 'success';
        this.statusMessage = `Cambios guardados para ${updatedUser.email}.`;
        this.alertaService.mostrarExito('Usuario actualizado correctamente.');
      },
      error: (error: HttpErrorResponse) => {
        this.isSavingMap[user.id] = false;

        if (error.status === 401 || error.status === 403) {
          this.statusType = 'error';
          this.statusMessage = 'No tienes permisos suficientes para actualizar usuarios. Vuelve a iniciar sesion.';
          this.alertaService.mostrarError(this.statusMessage);
          return;
        }

        this.statusType = 'error';
        this.statusMessage = `No se pudo actualizar ${user.email}.`;
        this.alertaService.mostrarError(this.statusMessage);
      }
    });
  }

  isProtectedUser(user: UserRow): boolean {
    const email = user.email.toLowerCase();
    return email === this.rootSuperAdminEmail || email === this.authService.getCurrentEmail().toLowerCase();
  }

  etiquetaDepartamento(departamento: DepartamentoDto): string {
    return departamento.nombre;
  }
}
