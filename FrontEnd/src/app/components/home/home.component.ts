import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import imageData from '../../../assets/images.json';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  images: string[] = [];
  loadedImages: Set<number> = new Set();

  ngOnInit() {
    // Load images from JSON file
    this.images = imageData.gallery;
  }

  onImageLoad(index: number) {
    this.loadedImages.add(index);
  }

  isImageLoaded(index: number): boolean {
    return this.loadedImages.has(index);
  }
}
