import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, Observable, tap } from 'rxjs';

interface AuthResponse {
  token: string;
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

  login(payload: LoginPayload): Observable<void> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/login`, payload).pipe(
      tap((response) => localStorage.setItem('token', response.token)),
      map(() => void 0)
    );
  }

  register(payload: RegisterPayload): Observable<void> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/register`, payload).pipe(
      tap((response) => localStorage.setItem('token', response.token)),
      map(() => void 0)
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    void this.router.navigateByUrl('/');
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  }
}
