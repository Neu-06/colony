import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { funcionarioGuard } from './core/guards/funcionario.guard';
import { DepartmentManagementComponent } from './features/admin/department-management/department-management.component';
import { UserManagementComponent } from './features/admin/user-management/user-management.component';
import { DashboardLayoutComponent } from './features/dashboard/dashboard-layout.component';
import { AtencionTramiteComponent } from './features/tramites/atencion-tramite.component';
import { BandejaTareasComponent } from './features/tramites/bandeja-tareas.component';
import { DirectorioTramitesComponent } from './features/tramites/directorio-tramites.component';
import { CanvasComponent } from './features/workflow-builder/canvas.component';
import { CanvasPageComponent } from './features/workflow-builder/canvas-page.component';
import { PublishedFlowsComponent } from './features/workflow-builder/published-flows.component';
import { AuthComponent } from './features/public/auth/auth.component';
import { HomeComponent } from './features/public/home/home.component';

export const routes: Routes = [
	{
		path: '',
		component: HomeComponent
	},
	{
		path: 'auth',
		component: AuthComponent
	},
	{
		path: 'app/canvas',
		component: CanvasPageComponent,
		canActivate: [authGuard, adminGuard]
	},
	{
		path: 'app/canvas/:id',
		component: CanvasPageComponent,
		canActivate: [authGuard, adminGuard]
	},
	{
		path: 'app/canvas/publicadas/:id',
		component: CanvasPageComponent,
		canActivate: [authGuard,adminGuard]
	},
	{
		path: 'app',
		component: DashboardLayoutComponent,
		canActivate: [authGuard],
		children: [
			{
				path: '',
				pathMatch: 'full',
				component: CanvasComponent // Placeholder or just remove redirectTo
			},
			{
				path: 'workflow-builder',
				component: CanvasComponent,
				canActivate: [adminGuard]
			},
			{
				path: 'flujos-publicados',
				component: PublishedFlowsComponent,
				canActivate: [adminGuard]
			},
			{
				path: 'directorio-tramites',
				component: DirectorioTramitesComponent,
				canActivate: [funcionarioGuard]
			},
			{
				path: 'bandeja',
				component: BandejaTareasComponent,
				canActivate: [funcionarioGuard]
			},
			{
				path: 'tramites/atencion/:instanciaId',
				component: AtencionTramiteComponent,
				canActivate: [funcionarioGuard]
			},
			{
				path: 'admin/users',
				component: UserManagementComponent,
				canActivate: [superAdminGuard]
			},
			{
				path: 'admin/departments',
				component: DepartmentManagementComponent,
				canActivate: [superAdminGuard]
			}
		]
	},
	{
		path: '**',
		redirectTo: ''
	}
];

