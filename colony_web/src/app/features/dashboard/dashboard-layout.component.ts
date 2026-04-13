import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface DashboardNavItem {
  label: string;
  description: string;
  link: string;
  exact: boolean;
}

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-layout.component.html'
})
export class DashboardLayoutComponent {
  private authService = inject(AuthService);

  isSidebarOpen = false;

  readonly navItems: DashboardNavItem[] = [
    {
      label: 'Workspaces',
      description: 'Gestion de flujos y archivos',
      link: '/app/workflow-builder',
      exact: false
    }
  ];

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  logout(): void {
    this.authService.logout();
  }
}
