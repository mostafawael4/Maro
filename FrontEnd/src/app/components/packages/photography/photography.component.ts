import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-photography',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './photography.component.html',
  styleUrl: './photography.component.scss'
})
export class PhotographyComponent {
  // Photography packages
  photographyPackages = [
    {
      id: 1,
      name: 'Collection I',
      price: '20,000 LE',
      duration: '14-16 Hours Coverage',
      features: [
        '14-16 Hours Coverage',
        'Unlimited Photos',
        '3 Photographers Including'
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
        'Unlimited Photos',
        '2 Photographers Including'
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
        'Unlimited Photos',
        '1 Photographer Including'
      ],
      popular: false
    }
  ];

  // Extras
  extras = [
    { name: 'Extra Photographer', price: '4,000 LE' },
    { name: 'Extra Hour', price: '3,000 LE' },
    { name: '1 Film Roll', price: '4,000 LE' }
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

