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
      this.editedPackage = {
        packageName: this.package.packageName,
        displayName: this.package.displayName,
        collections: JSON.parse(JSON.stringify(this.package.collections.map(col => {
          const collectionData: any = {
            collectionName: col.collectionName,
            price: col.price,
            priceAED: col.priceAED || '',
            hiddenInUAE: col.hiddenInUAE || false,
            description: col.description || ''
          };
          if (this.package.packageName !== 'fullRecording') {
            collectionData.duration = col.duration || '';
            collectionData.features = col.features ? [...col.features] : [];
          } else {
            collectionData.features = [];
          }
          return collectionData;
        }))),
        extras: JSON.parse(JSON.stringify(this.package.extras.map(extra => ({
          name: extra.name,
          price: extra.price,
          priceAED: extra.priceAED || '',
          hiddenInUAE: extra.hiddenInUAE || false
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
      priceAED: '',
      hiddenInUAE: false,
      description: ''
    };
    if (!this.isFullRecording()) {
      newCollection.duration = '';
      newCollection.features = [];
    } else {
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
      price: '',
      priceAED: '',
      hiddenInUAE: false
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
          priceAED: col.priceAED || null,
          hiddenInUAE: col.hiddenInUAE || false,
          description: col.description || ''
        };
        if (!this.isFullRecording()) {
          if (col.duration) cleanedCol.duration = col.duration;
          cleanedCol.features = col.features ? col.features.filter((f: string) => f.trim() !== '') : [];
        } else {
          cleanedCol.features = [];
        }
        return cleanedCol;
      }),
      extras: this.editedPackage.extras.map((extra: any) => ({
        name: extra.name,
        price: extra.price,
        priceAED: extra.priceAED || null,
        hiddenInUAE: extra.hiddenInUAE || false
      }))
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

