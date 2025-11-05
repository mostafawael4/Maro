import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { CinematographyComponent } from './cinematography/cinematography.component';
import { PhotographyComponent } from './photography/photography.component';
import { FullRecordingComponent } from './full-recording/full-recording.component';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, CinematographyComponent, PhotographyComponent, FullRecordingComponent],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class PackagesComponent implements OnInit {
  // Active tab/section
  activeSection: string = 'cinematography';

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Set initial section based on current route
    this.updateSectionFromRoute(this.router.url);

    // Listen for route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.updateSectionFromRoute(event.url);
    });
  }

  // Update active section based on route
  updateSectionFromRoute(url: string): void {
    if (url.includes('/cinematography')) {
      this.activeSection = 'cinematography';
    } else if (url.includes('/photography')) {
      this.activeSection = 'photography';
    } else if (url.includes('/fullrecording')) {
      this.activeSection = 'fullrecording';
    } else {
      this.activeSection = 'cinematography'; // Default
    }
  }

  // Switch between different package types
  switchSection(section: string): void {
    this.activeSection = section;
    // Navigate to the corresponding route
    this.router.navigate(['/packages', section]).then(() => {
      // Scroll to top after navigation
      window.scrollTo(0, 0);
    });
  }
}
