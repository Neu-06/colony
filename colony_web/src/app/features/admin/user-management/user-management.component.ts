import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

interface UserRow {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  rol: string;
  departamento: string;
  telefono?: string;
  activo?: boolean;
}

interface UpdateUserPayload {
  rol: string;
  departamento: string;
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
  private readonly apiUrl = 'http://localhost:8080/api/usuarios';
  private readonly rootSuperAdminEmail = 'super@colony.com';

  readonly roles = ['SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO'];
  readonly departamentos = ['SIN_ASIGNAR', 'RRHH', 'LEGAL', 'FINANZAS', 'SISTEMAS'];

  users: UserRow[] = [];
  isLoading = false;
  isSavingMap: Record<string, boolean> = {};
  statusMessage = '';
  statusType: 'success' | 'error' | '' = '';

  ngOnInit(): void {
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
      }
    });
  }

  saveUser(user: UserRow): void {
    if (this.isProtectedUser(user)) {
      this.statusType = 'error';
      this.statusMessage = 'El super admin principal no se puede degradar.';
      return;
    }

    const payload: UpdateUserPayload = {
      rol: user.rol,
      departamento: user.departamento
    };

    this.isSavingMap[user.id] = true;

    this.http.put<UserRow>(`${this.apiUrl}/${user.id}/asignar`, payload).subscribe({
      next: (updatedUser) => {
        this.users = this.users.map((current) => (current.id === updatedUser.id ? updatedUser : current));
        this.isSavingMap[user.id] = false;
        this.statusType = 'success';
        this.statusMessage = `Cambios guardados para ${updatedUser.email}.`;
        window.alert('Usuario actualizado correctamente.');
      },
      error: (error: HttpErrorResponse) => {
        this.isSavingMap[user.id] = false;

        if (error.status === 401 || error.status === 403) {
          this.statusType = 'error';
          this.statusMessage = 'No tienes permisos suficientes para actualizar usuarios. Vuelve a iniciar sesion.';
          return;
        }

        this.statusType = 'error';
        this.statusMessage = `No se pudo actualizar ${user.email}.`;
      }
    });
  }

  isProtectedUser(user: UserRow): boolean {
    const email = user.email.toLowerCase();
    return email === this.rootSuperAdminEmail || email === this.authService.getCurrentEmail().toLowerCase();
  }
}
