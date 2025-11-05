import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-full-recording',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './full-recording.component.html',
  styleUrl: './full-recording.component.scss'
})
export class FullRecordingComponent {
  // Full Recording Services
  services = [
    {
      id: 1,
      name: '1 Camera Man',
      description: '4K Quality Recording',
      price: '5,000 LE',
      icon: 'camera'
    },
    {
      id: 2,
      name: 'Crane',
      description: 'Professional Cinematic Shots',
      price: '8,000 LE',
      icon: 'crane'
    }
  ];

  contactUs(): void {
    window.open('https://wa.me/201025641261', '_blank');
  }
}

