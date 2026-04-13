import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth.component.html'
})
export class AuthComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly minPasswordLength = 6;

  selectedMode: 'login' | 'register' = 'login';
  isLoading = false;
  errorMessage = '';

  form = this.fb.nonNullable.group({
    nombre: ['', [Validators.minLength(2), Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(this.minPasswordLength)]]
  });

  constructor() {
    this.applyNameValidators();
  }

  setMode(mode: 'login' | 'register'): void {
    if (this.selectedMode === mode) {
      return;
    }

    this.selectedMode = mode;
    this.errorMessage = '';
    this.applyNameValidators();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { nombre, email, password } = this.form.getRawValue();
    const safeName = nombre.trim();

    if (this.selectedMode === 'register' && !safeName) {
      this.errorMessage = 'El nombre es obligatorio para registrarse.';
      return;
    }

    this.errorMessage = '';
    this.isLoading = true;

    const request$ = this.selectedMode === 'login'
      ? this.authService.login({ email, password })
      : this.authService.register({ nombre: safeName, email, password });

    request$
      .pipe(finalize(() => {
        this.isLoading = false;
      }))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/app');
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage = this.mapErrorMessage(error);
        }
      });
  }

  private applyNameValidators(): void {
    const nameControl = this.form.controls.nombre;

    if (this.selectedMode === 'register') {
      nameControl.setValidators([Validators.required, Validators.minLength(2), Validators.maxLength(80)]);
    } else {
      nameControl.setValidators([Validators.minLength(2), Validators.maxLength(80)]);
    }

    nameControl.updateValueAndValidity({ emitEvent: false });
  }

  private mapErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 401 || error.status === 403) {
      return 'Credenciales incorrectas.';
    }

    if (error.status === 409) {
      return 'El correo ya esta registrado.';
    }

    return 'No se pudo completar la autenticacion. Intenta nuevamente.';
  }
}
