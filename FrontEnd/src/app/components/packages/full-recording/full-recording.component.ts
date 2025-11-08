import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PackagesService, PackageCollection } from '../../../services/packages.service';

@Component({
  selector: 'app-full-recording',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './full-recording.component.html',
  styleUrl: './full-recording.component.scss'
})
export class FullRecordingComponent implements OnInit {
  // Full Recording Services
  services: PackageCollection[] = [];
  
  isLoading: boolean = true;
  errorMessage: string = '';

  constructor(private packagesService: PackagesService) {}

  ngOnInit(): void {
    this.loadFullRecordingServices();
  }

  loadFullRecordingServices(): void {
    this.isLoading = true;
    this.packagesService.getAllPackages().subscribe({
      next: (packages) => {
        // Find the fullRecording package
        const fullRecordingPackage = packages.find(pkg => pkg.packageName === 'fullRecording');
        
        if (fullRecordingPackage) {
          this.services = fullRecordingPackage.collections;
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading full recording services:', error);
        this.errorMessage = 'Failed to load services. Please try again later.';
        this.isLoading = false;
      }
    });
  }

  contactUs(): void {
    window.open('https://wa.me/201025641261', '_blank');
  }
}

