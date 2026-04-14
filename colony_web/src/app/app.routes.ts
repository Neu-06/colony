import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { UserManagementComponent } from './features/admin/user-management/user-management.component';
import { DashboardLayoutComponent } from './features/dashboard/dashboard-layout.component';
import { CanvasComponent } from './features/workflow-builder/canvas.component';
import { CanvasPageComponent } from './features/workflow-builder/canvas-page.component';
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
		path: 'app',
		component: DashboardLayoutComponent,
		canActivate: [authGuard],
		children: [
			{
				path: '',
				pathMatch: 'full',
				redirectTo: 'workflow-builder'
			},
			{
				path: 'workflow-builder',
				component: CanvasComponent
			},
			{
				path: 'admin/users',
				component: UserManagementComponent,
				canActivate: [superAdminGuard]
			}
		]
	},
	{
		path: '**',
		redirectTo: ''
	}
];

