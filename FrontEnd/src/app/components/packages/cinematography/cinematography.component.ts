import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cinematography',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinematography.component.html',
  styleUrl: './cinematography.component.scss'
})
export class CinematographyComponent {
  // Cinematography packages
  cinematographyPackages = [
    {
      id: 1,
      name: 'Collection I',
      price: '25,000 LE',
      duration: '14-16 Hours Coverage',
      features: [
        '14-16 Hours Coverage',
        'Short Film (10-20 Minutes)',
        '1 Instagram Reel',
        'Instagram Stories'
      ],
      popular: true
    },
    {
      id: 2,
      name: 'Collection II',
      price: '15,000 LE',
      duration: '10-12 Hours Coverage',
      features: [
        '10-12 Hours Coverage',
        'Highlight Video (8-10 Minutes)',
        '2 Videographers Including'
      ],
      popular: false
    },
    {
      id: 3,
      name: 'Collection III',
      price: '10,000 LE',
      duration: '5-7 Hours Coverage',
      features: [
        '5-7 Hours Coverage',
        'Highlight Video (4-7 Minutes)',
        '1 Videographer Including'
      ],
      popular: false
    }
  ];

  // Extras
  extras = [
    { name: 'Extra Videographer', price: '4,000 LE' },
    { name: 'Extra Hour', price: '3,000 LE' },
    { name: 'Instagram Reel', price: '4,000 LE' }
  ];

  selectedPackage: any = null;

  selectPackage(pkg: any): void {
    this.selectedPackage = pkg;
  }

  contactUs(): void {
    // Navigate to contact or open WhatsApp
    window.open('https://wa.me/201025641261', '_blank');
  }
}

