// =============================================================================
// Toast notification service (signal-backed, rendered by ToastContainer).
// =============================================================================
import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  readonly list = this.toasts.asReadonly();

  success(title: string, message?: string): void {
    this.push('success', title, message, 3800);
  }

  error(title: string, message?: string): void {
    this.push('error', title, message, 6000);
  }

  info(title: string, message?: string): void {
    this.push('info', title, message, 4200);
  }

  warning(title: string, message?: string): void {
    this.push('warning', title, message, 5000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  private push(type: ToastType, title: string, message: string | undefined, duration: number): void {
    const isDuplicate = this.toasts().some((t) => t.type === type && t.title === title && t.message === message);
    if (isDuplicate) return;

    const toast: Toast = { id: this.nextId++, type, title, message, duration };
    this.toasts.update((list) => [...list.slice(-3), toast]);
    setTimeout(() => this.dismiss(toast.id), duration);
  }
}
