import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class PackagesComponent {
  constructor(private router: Router) {}

  // Switch between different package types
  switchSection(section: string): void {
    this.router.navigate(['/packages', section]);
  }

  // Check if a route is active
  isActive(route: string): boolean {
    return this.router.url.includes(route);
  }
}
