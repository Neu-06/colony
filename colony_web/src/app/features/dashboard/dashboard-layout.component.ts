import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-layout.component.html'
})
export class DashboardLayoutComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly currentRole = this.authService.getCurrentRole();
  readonly currentDepartment = this.authService.getCurrentDepartmentName();
  readonly currentDepartmentId = this.authService.getCurrentDepartment();

  isSidebarOpen = false;

  ngOnInit(): void {
    // Redireccion inicial inteligente segun el rol si estamos en la raiz del app
    if (this.router.url === '/app') {
      if (this.isSuperAdmin()) {
        this.router.navigate(['/app/admin/users']);
      } else if (this.canAccessCanvas()) {
        this.router.navigate(['/app/workflow-builder']);
      } else if (this.isFuncionario()) {
        this.router.navigate(['/app/bandeja']);
      }
    }
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  logout(): void {
    this.authService.logout();
  }

  isSuperAdmin(): boolean {
    return this.currentRole === 'SUPER_ADMIN';
  }

  canAccessCanvas(): boolean {
    return this.currentRole === 'ADMIN';
  }

  isFuncionario(): boolean {
    return this.currentRole === 'FUNCIONARIO';
  }

  isPendingAssignment(): boolean {
    return this.currentRole === 'FUNCIONARIO'
      && (!this.currentDepartmentId || this.currentDepartmentId === 'SIN_ASIGNAR');
  }
}
