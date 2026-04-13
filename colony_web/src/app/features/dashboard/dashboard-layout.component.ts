import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-layout.component.html'
})
export class DashboardLayoutComponent {
  private authService = inject(AuthService);

  readonly currentRole = this.authService.getCurrentRole();
  readonly currentDepartment = this.authService.getCurrentDepartment();

  isSidebarOpen = false;

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
    return this.currentRole === 'SUPER_ADMIN' || this.currentRole === 'ADMIN';
  }

  isPendingAssignment(): boolean {
    return this.currentRole === 'FUNCIONARIO' && this.currentDepartment === 'SIN_ASIGNAR';
  }
}
