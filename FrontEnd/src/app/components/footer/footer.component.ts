import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  currentYear: number = new Date().getFullYear();

  // Social media links
  socialLinks = {
    instagram: 'https://www.instagram.com/maro.weddings',
    facebook: '#',
    whatsapp: 'https://wa.me/201025641261', // WhatsApp redirect
    email: 'maroweddings.eg@gmail.com'
  };

  // Quick links
  quickLinks = [
    { name: 'Home', route: '/' },
    { name: 'Packages', route: '/packages' },
    { name: 'Gallery', route: '/gallery' },
    { name: 'Contact Us', route: '/contact' }
  ];

  // Package links
  packageLinks = [
    { name: 'Cinematography', route: '/packages/cinematography' },
    { name: 'Photography', route: '/packages/photography' },
    { name: 'Full Recording', route: '/packages/fullrecording' }
  ];
}

