import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, Observable, tap } from 'rxjs';

interface AuthUser {
  email: string;
  rol: string;
  departamento: string;
}

interface JwtClaims {
  sub?: string;
  rol?: string;
  departamento?: string;
}

interface AuthResponse {
  token: string;
  usuario: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  nombres: string;
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiBaseUrl = 'http://localhost:8080/api/auth';

  private readonly tokenKey = 'token';
  private readonly roleKey = 'rol';
  private readonly departmentKey = 'departamento';

  login(payload: LoginPayload): Observable<void> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/login`, payload).pipe(
      tap((response) => this.persistSession(response)),
      map(() => void 0)
    );
  }

  register(payload: RegisterPayload): Observable<void> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/register`, payload).pipe(
      tap((response) => this.persistSession(response)),
      map(() => void 0)
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.roleKey);
    localStorage.removeItem(this.departmentKey);
    void this.router.navigateByUrl('/');
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem(this.tokenKey);
  }

  getCurrentRole(): string {
    const role = localStorage.getItem(this.roleKey);
    if (role) {
      return role;
    }

    return this.decodeTokenClaims()?.rol ?? '';
  }

  getCurrentDepartment(): string {
    const department = localStorage.getItem(this.departmentKey);
    if (department) {
      return department;
    }

    return this.decodeTokenClaims()?.departamento ?? '';
  }

  getCurrentEmail(): string {
    return this.decodeTokenClaims()?.sub ?? '';
  }

  private persistSession(response: AuthResponse): void {
    localStorage.setItem(this.tokenKey, response.token);

    const roleFromResponse = response.usuario?.rol || this.decodeTokenClaims(response.token)?.rol || '';
    const departmentFromResponse = response.usuario?.departamento || this.decodeTokenClaims(response.token)?.departamento || '';

    localStorage.setItem(this.roleKey, roleFromResponse);
    localStorage.setItem(this.departmentKey, departmentFromResponse);
  }

  private decodeTokenClaims(tokenArg?: string): JwtClaims | null {
    const token = tokenArg ?? localStorage.getItem(this.tokenKey);
    if (!token) {
      return null;
    }

    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }

    try {
      const jsonPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(jsonPayload) as JwtClaims;
    } catch {
      return null;
    }
  }
}
