import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PackagesService, Package, PackageCollection, PackageExtra } from '../../services/packages.service';

@Component({
  selector: 'app-edit-package-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-package-modal.component.html',
  styleUrl: './edit-package-modal.component.scss'
})
export class EditPackageModalComponent implements OnInit {
  @Input() package!: Package;
  @Input() show: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  // Editable copy of the package data
  editedPackage: any = {
    packageName: '',
    displayName: '',
    collections: [],
    extras: []
  };

  isSaving: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  constructor(private packagesService: PackagesService) {}

  ngOnInit() {
    this.initializeEditedPackage();
  }

  ngOnChanges() {
    if (this.package) {
      this.initializeEditedPackage();
    }
  }

  initializeEditedPackage() {
    if (this.package) {
      // Deep copy the package data
      this.editedPackage = {
        packageName: this.package.packageName,
        displayName: this.package.displayName,
        collections: JSON.parse(JSON.stringify(this.package.collections.map(col => {
          const collectionData: any = {
            collectionName: col.collectionName,
            price: col.price,
            description: col.description || ''
          };
          
          // Package-specific fields
          if (this.package.packageName !== 'fullRecording') {
            // Cinematography & Photography: include duration and features
            collectionData.duration = col.duration || '';
            collectionData.features = col.features ? [...col.features] : [];
          } else {
            // Full Recording: empty features array for backend compatibility
            collectionData.features = [];
          }
          
          return collectionData;
        }))),
        extras: JSON.parse(JSON.stringify(this.package.extras.map(extra => ({
          name: extra.name,
          price: extra.price
        }))))
      };
    }
  }

  // Helper methods to check package type
  isFullRecording(): boolean {
    return this.editedPackage.packageName === 'fullRecording';
  }
  
  isNotFullRecording(): boolean {
    return this.editedPackage.packageName !== 'fullRecording';
  }

  // TrackBy functions for better performance
  trackByCollectionIndex(index: number): number {
    return index;
  }

  trackByFeatureIndex(index: number): number {
    return index;
  }

  trackByExtraIndex(index: number): number {
    return index;
  }

  // Collection methods
  addCollection() {
    const newCollection: any = {
      collectionName: '',
      price: '',
      description: ''
    };
    
    // Add package-specific fields
    if (!this.isFullRecording()) {
      // Cinematography & Photography: duration and features
      newCollection.duration = '';
      newCollection.features = [];
    } else {
      // Full Recording: empty features array for backend
      newCollection.features = [];
    }
    
    this.editedPackage.collections.push(newCollection);
  }

  removeCollection(index: number) {
    if (confirm('Are you sure you want to remove this collection?')) {
      this.editedPackage.collections.splice(index, 1);
    }
  }

  addFeature(collectionIndex: number) {
    if (!this.editedPackage.collections[collectionIndex].features) {
      this.editedPackage.collections[collectionIndex].features = [];
    }
    this.editedPackage.collections[collectionIndex].features.push('');
  }

  removeFeature(collectionIndex: number, featureIndex: number) {
    this.editedPackage.collections[collectionIndex].features.splice(featureIndex, 1);
  }

  // Extra methods
  addExtra() {
    this.editedPackage.extras.push({
      name: '',
      price: ''
    });
  }

  removeExtra(index: number) {
    if (confirm('Are you sure you want to remove this extra?')) {
      this.editedPackage.extras.splice(index, 1);
    }
  }

  // Save package
  savePackage() {
    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Validate data
    if (!this.editedPackage.packageName || !this.editedPackage.displayName) {
      this.errorMessage = 'Package name and display name are required.';
      this.isSaving = false;
      return;
    }

    // Prepare package data for saving
    const packageToSave = {
      ...this.editedPackage,
      collections: this.editedPackage.collections.map((col: any) => {
        const cleanedCol: any = {
          collectionName: col.collectionName,
          price: col.price,
          description: col.description || ''
        };
        
        // Include package-specific fields
        if (!this.isFullRecording()) {
          // Cinematography & Photography: duration and features
          if (col.duration) cleanedCol.duration = col.duration;
          cleanedCol.features = col.features ? col.features.filter((f: string) => f.trim() !== '') : [];
        } else {
          // Full Recording: always send empty features array
          cleanedCol.features = [];
        }
        
        return cleanedCol;
      })
    };

    this.packagesService.savePackage(packageToSave).subscribe({
      next: (response) => {
        this.successMessage = 'Package saved successfully!';
        this.isSaving = false;
        
        setTimeout(() => {
          this.saved.emit();
          this.closeModal();
        }, 1500);
      },
      error: (error) => {
        console.error('Error saving package:', error);
        this.errorMessage = error.error?.message || 'Failed to save package. Please try again.';
        this.isSaving = false;
      }
    });
  }

  closeModal() {
    this.errorMessage = '';
    this.successMessage = '';
    this.close.emit();
  }
}

