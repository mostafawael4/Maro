import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrdersService, OrderForm, OrderFormVendors, OrderFormFilmEditing, OrderPricing, SelectedCollectionOption, SelectedExtraOption, SelectedPackageOption } from '../../services/orders.service';
import { SuccessModalComponent } from '../success-modal/success-modal.component';
import { PackagesService, Package, PackageCollection, PackageExtra } from '../../services/packages.service';

@Component({
  selector: 'app-create-order',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SuccessModalComponent],
  templateUrl: './create-order.component.html',
  styleUrl: './create-order.component.scss'
})
export class CreateOrderComponent implements OnInit {
  orderForm: FormGroup;
  isSubmitting = false;
  submitError = '';
  submitSuccess = false;
  packages: Package[] = [];
  packagesLoading = false;
  packagesError = '';

  selectedPackages = new Map<string, SelectedPackageOption>();
  selectedCollections = new Map<string, SelectedCollectionOption>();
  selectedExtras = new Map<string, SelectedExtraOption>();

  pricingSummary = {
    subtotal: 0,
    discount: 0,
    total: 0,
    remaining: 0
  };
  appliedPromoCode: string | null = null;
  promoError = '';
  promoSuccess = '';
  packageSelectionError = 'Please select at least one package.';
  collectionSelectionError = '';
  depositError = '';

  private readonly PROMO_CODES: Record<string, number> = {
    maro1000: 1000,
    maro2000: 2000,
    maro3000: 3000
  };

  // Event type options
  eventTypes = ['Wedding', 'Engagement', 'Katb Ketab', 'Other'];

  // Edit sequence options
  editSequenceOptions = [
    { value: 'chronological', label: 'Chronological sequence of events' },
    { value: 'random', label: 'Uniquely random sequence of events' },
    { value: 'no-preference', label: 'No preference, whatever fits within my film storyline' }
  ];

  // Accessory shots options
  accessoryShotsOptions = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'no-preference', label: 'No preference, whatever fits within my film storyline' }
  ];

  // Style preference options
  stylePreferenceOptions = ['Romantic', 'Fun/Energetic/Hyped', 'Vintage', 'Emotional', 'Royal', 'Holy'];

  // Highlight preference categories
  highlightPreferenceCategories = ['Preparations/Getting ready', 'Group shots', 'Dancing/party shots'];
  
  // Highlight preference options for each category
  highlightPreferenceOptions = ['Family', 'Friends', 'Equal amount of shots'];

  constructor(
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private packagesService: PackagesService,
    private router: Router
  ) {
    this.orderForm = this.createForm();
    this.updateVendorControlStates();
  }

  ngOnInit(): void {
    this.loadPackages();
  }

  createForm(): FormGroup {
    return this.fb.group({
      // Basic order info
      email: ['', [Validators.required, Validators.email]],
      clientName: ['', [Validators.required, Validators.minLength(3)]],
      notes: [''],

      // Order form fields
      brideAndGroomNames: ['', Validators.required],
      eventDate: ['', Validators.required],
      eventType: this.fb.array([], Validators.required),
      eventTypeOther: [''],
      eventVenue: ['', Validators.required],
      timelineOfDay: ['', Validators.required],
      shootersStartTime: ['', Validators.required],
      shootersEndTime: ['', Validators.required],
      coupleDescription: ['', Validators.required],
      moodBoardLinks: ['', Validators.required],
      favoriteSongs: this.fb.array([this.fb.control('', Validators.required)], Validators.required),
      specialMoments: ['', Validators.required],
      excludeShots: ['', Validators.required],

      // Vendors
      vendors: this.fb.group({
        photographers: this.fb.array([this.fb.control('', Validators.required)], Validators.required),
        cinematographers: this.fb.array([this.fb.control('', Validators.required)], Validators.required),
        makeupArtist: ['', Validators.required],
        hairStylist: ['', Validators.required],
        dressDesigner: ['', Validators.required],
        eventPlanner: ['', Validators.required],
        dj: ['', Validators.required],
        lighting: ['', Validators.required],
        entertainment: ['', Validators.required],
        others: ['', Validators.required]
      }),

      // Film editing
      filmEditing: this.fb.group({
        includeAccessoriesShots: this.fb.control('', Validators.required),
        editSequence: this.fb.control('', Validators.required),
        stylePreference: this.fb.array([], Validators.required),
        highlightPreference: this.fb.group({
          preparations: this.fb.control('', Validators.required),
          groupShots: this.fb.control('', Validators.required),
          dancingParty: this.fb.control('', Validators.required)
        }),
        teaserStyleLinks: this.fb.array([])
      }),

      // Social media
      socialMediaInspiration: this.fb.array([this.fb.control('', Validators.required)], Validators.required),
      tiktokIdeas: this.fb.array([this.fb.control('', Validators.required)], Validators.required),
      pricing: this.fb.group({
        promoCode: [''],
        depositPaid: [0, [Validators.min(0)]]
      })
    });
  }

  private loadPackages(): void {
    this.packagesLoading = true;
    this.packagesService.getAllPackages().subscribe({
      next: (packages) => {
        this.packages = packages || [];
        this.packagesLoading = false;
      },
      error: () => {
        this.packagesError = 'Failed to load packages. Please try again later.';
        this.packagesLoading = false;
      }
    });
  }

  // Helper methods for FormArrays
  get eventTypeArray(): FormArray {
    return this.orderForm.get('eventType') as FormArray;
  }


  get photographersArray(): FormArray {
    return (this.orderForm.get('vendors') as FormGroup).get('photographers') as FormArray;
  }

  get cinematographersArray(): FormArray {
    return (this.orderForm.get('vendors') as FormGroup).get('cinematographers') as FormArray;
  }

  get stylePreferenceArray(): FormArray {
    return (this.orderForm.get('filmEditing') as FormGroup).get('stylePreference') as FormArray;
  }

  get highlightPreferenceGroup(): FormGroup {
    return (this.orderForm.get('filmEditing') as FormGroup).get('highlightPreference') as FormGroup;
  }

  get teaserStyleLinksArray(): FormArray {
    return (this.orderForm.get('filmEditing') as FormGroup).get('teaserStyleLinks') as FormArray;
  }

  get socialMediaInspirationArray(): FormArray {
    return this.orderForm.get('socialMediaInspiration') as FormArray;
  }

  get tiktokIdeasArray(): FormArray {
    return this.orderForm.get('tiktokIdeas') as FormArray;
  }

  get favoriteSongsArray(): FormArray {
    return this.orderForm.get('favoriteSongs') as FormArray;
  }

  // Event Type checkbox methods
  toggleEventType(eventType: string): void {
    const array = this.eventTypeArray;
    const index = array.value.indexOf(eventType);
    if (index > -1) {
      array.removeAt(index);
      // Clear "Other" field if "Other" is unchecked
      if (eventType === 'Other') {
        this.orderForm.patchValue({ eventTypeOther: '' });
      }
    } else {
      array.push(this.fb.control(eventType));
    }
  }

  isEventTypeSelected(eventType: string): boolean {
    return this.eventTypeArray.value.includes(eventType);
  }

  isOtherEventTypeSelected(): boolean {
    return this.isEventTypeSelected('Other');
  }


  addPhotographer(): void {
    this.photographersArray.push(this.fb.control('', Validators.required));
  }

  removePhotographer(index: number): void {
    this.photographersArray.removeAt(index);
    if (this.photographersArray.length === 0) {
      this.addPhotographer();
    }
  }

  addCinematographer(): void {
    this.cinematographersArray.push(this.fb.control('', Validators.required));
  }

  removeCinematographer(index: number): void {
    this.cinematographersArray.removeAt(index);
    if (this.cinematographersArray.length === 0) {
      this.addCinematographer();
    }
  }

  addTeaserStyleLink(): void {
    this.teaserStyleLinksArray.push(this.fb.control(''));
  }

  removeTeaserStyleLink(index: number): void {
    this.teaserStyleLinksArray.removeAt(index);
  }

  addSocialMediaInspiration(): void {
    this.socialMediaInspirationArray.push(this.fb.control('', Validators.required));
  }

  removeSocialMediaInspiration(index: number): void {
    this.socialMediaInspirationArray.removeAt(index);
    if (this.socialMediaInspirationArray.length === 0) {
      this.addSocialMediaInspiration();
    }
  }

  addTiktokIdea(): void {
    this.tiktokIdeasArray.push(this.fb.control('', Validators.required));
  }

  removeTiktokIdea(index: number): void {
    this.tiktokIdeasArray.removeAt(index);
    if (this.tiktokIdeasArray.length === 0) {
      this.addTiktokIdea();
    }
  }

  addFavoriteSong(): void {
    this.favoriteSongsArray.push(this.fb.control('', Validators.required));
  }

  removeFavoriteSong(index: number): void {
    this.favoriteSongsArray.removeAt(index);
    if (this.favoriteSongsArray.length === 0) {
      this.addFavoriteSong();
    }
  }

  // Toggle checkbox arrays
  toggleStylePreference(option: string): void {
    const array = this.stylePreferenceArray;
    const index = array.value.indexOf(option);
    if (index > -1) {
      array.removeAt(index);
    } else {
      array.push(this.fb.control(option));
    }
  }

  isStylePreferenceSelected(option: string): boolean {
    return this.stylePreferenceArray.value.includes(option);
  }

  togglePackageSelection(pkg: Package): void {
    const packageId = pkg._id;
    if (this.selectedPackages.has(packageId)) {
      this.selectedPackages.delete(packageId);
      this.removeSelectionsByPackage(packageId);
    } else {
      this.selectedPackages.set(packageId, this.buildPackageSelection(pkg));
    }
    this.updatePricingSummary();
    this.validatePackageSelections();
    this.updateVendorControlStates();
  }

  isPackageSelected(packageId: string): boolean {
    return this.selectedPackages.has(packageId);
  }

  toggleCollection(pkg: Package, collection: PackageCollection): void {
    if (!collection?._id) {
      return;
    }
    const collectionId = collection._id;
    if (this.selectedCollections.has(collectionId)) {
      this.selectedCollections.delete(collectionId);
    } else {
      this.ensurePackageSelected(pkg);
      this.selectedCollections.set(collectionId, this.buildCollectionSelection(pkg, collection));
    }
    this.updatePricingSummary();
    this.validatePackageSelections();
    this.updateVendorControlStates();
  }

  isCollectionSelected(collectionId: string): boolean {
    return this.selectedCollections.has(collectionId);
  }

  toggleExtra(pkg: Package, extra: PackageExtra): void {
    if (!extra?._id) {
      return;
    }
    const extraId = extra._id;
    if (this.selectedExtras.has(extraId)) {
      this.selectedExtras.delete(extraId);
    } else {
      this.ensurePackageSelected(pkg);
      this.selectedExtras.set(extraId, this.buildExtraSelection(pkg, extra));
    }
    this.updatePricingSummary();
    this.validatePackageSelections();
  }

  isExtraSelected(extraId: string): boolean {
    return this.selectedExtras.has(extraId);
  }

  get hasSelectedPhotographyPackage(): boolean {
    return this.isPackageTypeSelected('photography');
  }

  get hasSelectedCinematographyPackage(): boolean {
    return this.isPackageTypeSelected('cinematography');
  }

  applyPromoCode(): void {
    const pricingGroup = this.getPricingFormGroup();
    const rawCode = pricingGroup?.get('promoCode')?.value || '';
    const normalizedCode = rawCode.trim().toLowerCase();

    if (!normalizedCode) {
      this.appliedPromoCode = null;
      this.promoError = 'Please enter a promo code before applying.';
      this.promoSuccess = '';
      this.updatePricingSummary();
      return;
    }

    const discountValue = this.PROMO_CODES[normalizedCode];
    if (!discountValue) {
      this.appliedPromoCode = null;
      this.promoError = 'Invalid promo code. Try maro1000, maro2000, or maro3000.';
      this.promoSuccess = '';
      this.updatePricingSummary();
      return;
    }

    this.appliedPromoCode = normalizedCode;
    this.promoError = '';
    this.promoSuccess = `Promo code applied! Discount: ${discountValue.toLocaleString()} EGP`;
    this.updatePricingSummary();
  }

  clearPromoCode(): void {
    const pricingGroup = this.getPricingFormGroup();
    pricingGroup?.get('promoCode')?.setValue('');
    this.appliedPromoCode = null;
    this.promoError = '';
    this.promoSuccess = '';
    this.updatePricingSummary();
  }

  getSelectedCollectionsList(): SelectedCollectionOption[] {
    return Array.from(this.selectedCollections.values());
  }

  getSelectedExtrasList(): SelectedExtraOption[] {
    return Array.from(this.selectedExtras.values());
  }

  private buildPackageSelection(pkg: Package): SelectedPackageOption {
    return {
      packageId: pkg._id,
      packageName: pkg.packageName,
      packageDisplayName: pkg.displayName
    };
  }

  private buildCollectionSelection(pkg: Package, collection: PackageCollection): SelectedCollectionOption {
    return {
      packageId: pkg._id,
      packageName: pkg.packageName,
      packageDisplayName: pkg.displayName,
      collectionId: collection._id,
      collectionName: collection.collectionName,
      priceLabel: collection.price,
      priceValue: this.parsePriceValue(collection.price)
    };
  }

  private buildExtraSelection(pkg: Package, extra: PackageExtra): SelectedExtraOption {
    return {
      packageId: pkg._id,
      packageName: pkg.packageName,
      packageDisplayName: pkg.displayName,
      extraId: extra._id,
      extraName: extra.name,
      priceLabel: extra.price,
      priceValue: this.parsePriceValue(extra.price)
    };
  }

  private ensurePackageSelected(pkg: Package): void {
    if (!this.selectedPackages.has(pkg._id)) {
      this.selectedPackages.set(pkg._id, this.buildPackageSelection(pkg));
    }
  }

  private removeSelectionsByPackage(packageId: string): void {
    this.selectedCollections.forEach((selection, key) => {
      if (selection.packageId === packageId) {
        this.selectedCollections.delete(key);
      }
    });
    this.selectedExtras.forEach((selection, key) => {
      if (selection.packageId === packageId) {
        this.selectedExtras.delete(key);
      }
    });
  }

  private parsePriceValue(price?: string | number): number {
    if (typeof price === 'number') {
      return price;
    }
    if (!price) {
      return 0;
    }
    const numeric = parseFloat(price.toString().replace(/[^\d.-]/g, ''));
    return isNaN(numeric) ? 0 : numeric;
  }

  private updatePricingSummary(): void {
    const subtotal =
      [...this.selectedCollections.values(), ...this.selectedExtras.values()].reduce(
        (sum, item) => sum + (item.priceValue || 0),
        0
      );

    let discount = 0;
    if (this.appliedPromoCode) {
      discount = this.PROMO_CODES[this.appliedPromoCode] || 0;
    }
    if (discount > subtotal) {
      discount = subtotal;
    }

    const total = subtotal - discount;
    const pricingGroup = this.getPricingFormGroup();
    const depositControl = pricingGroup?.get('depositPaid');
    let depositValue = Number(depositControl?.value || 0);
    if (depositValue < 0 || isNaN(depositValue)) {
      depositValue = 0;
      depositControl?.setValue(0, { emitEvent: false });
    }
    if (depositValue > total) {
      depositValue = total;
      depositControl?.setValue(depositValue, { emitEvent: false });
      this.depositError = 'Deposit cannot exceed total amount.';
    } else {
      this.depositError = '';
    }
    const remaining = total - depositValue;

    this.pricingSummary = {
      subtotal,
      discount,
      total,
      remaining
    };
  }

  private hasCollectionForPackage(packageId: string): boolean {
    for (const collection of this.selectedCollections.values()) {
      if (collection.packageId === packageId) {
        return true;
      }
    }
    return false;
  }

  private validatePackageSelections(setSubmitError = false): boolean {
    this.packageSelectionError = '';
    this.collectionSelectionError = '';

    if (!this.packages.length) {
      return true;
    }

    let isValid = true;

    if (!this.selectedPackages.size) {
      this.packageSelectionError = 'Please select at least one package.';
      isValid = false;
    }

    const packagesMissingCollections = Array.from(this.selectedPackages.values()).filter(
      (pkg) => !this.hasCollectionForPackage(pkg.packageId)
    );

    if (packagesMissingCollections.length) {
      if (packagesMissingCollections.length === 1) {
        const pkgName =
          packagesMissingCollections[0].packageDisplayName ||
          packagesMissingCollections[0].packageName ||
          'this package';
        this.collectionSelectionError = `Please select at least one collection for ${pkgName}.`;
      } else {
        const pkgNames = packagesMissingCollections
          .map((pkg) => pkg.packageDisplayName || pkg.packageName || 'a package')
          .join(', ');
        this.collectionSelectionError = `Please select at least one collection for every selected package. Missing: ${pkgNames}.`;
      }
      isValid = false;
    }

    if (!isValid && setSubmitError) {
      this.submitError = 'Please complete the Packages & Pricing selections.';
    } else if (isValid && this.submitError === 'Please complete the Packages & Pricing selections.') {
      this.submitError = '';
    }

    return isValid;
  }

  private isPackageTypeSelected(packageName: string): boolean {
    return Array.from(this.selectedPackages.values()).some(
      (pkg) => pkg.packageName === packageName
    );
  }

  private updateVendorControlStates(): void {
    const disablePhotographers = this.hasSelectedPhotographyPackage;
    const disableCinematographers = this.hasSelectedCinematographyPackage;

    this.setArrayDisabledState(this.photographersArray, disablePhotographers);
    this.setArrayDisabledState(this.cinematographersArray, disableCinematographers);
  }

  private setArrayDisabledState(array: FormArray, shouldDisable: boolean): void {
    if (shouldDisable && array.enabled) {
      array.disable({ emitEvent: false });
    } else if (!shouldDisable && array.disabled) {
      array.enable({ emitEvent: false });
    }
  }

  onDepositChange(): void {
    const pricingGroup = this.getPricingFormGroup();
    const depositControl = pricingGroup?.get('depositPaid');
    if (!depositControl) {
      return;
    }
    let value = Number(depositControl.value || 0);
    if (isNaN(value) || value < 0) {
      value = 0;
    }
    depositControl.setValue(value, { emitEvent: false });
    this.updatePricingSummary();
  }

  private getPricingFormGroup(): FormGroup | null {
    return this.orderForm.get('pricing') as FormGroup;
  }

  private buildPricingPayload(): OrderPricing | undefined {
    const packages = Array.from(this.selectedPackages.values());
    const collections = this.getSelectedCollectionsList();
    const extras = this.getSelectedExtrasList();
    const hasSelections = packages.length > 0 || collections.length > 0 || extras.length > 0;
    const pricing: OrderPricing = {};

    if (packages.length > 0) {
      pricing.packages = packages;
    }
    if (collections.length > 0) {
      pricing.collections = collections;
    }
    if (extras.length > 0) {
      pricing.extras = extras;
    }

    if (hasSelections) {
      pricing.subtotal = this.pricingSummary.subtotal;
      pricing.discount = this.pricingSummary.discount;
      pricing.total = this.pricingSummary.total;
    }

    const pricingGroup = this.getPricingFormGroup();
    const depositPaid = Number(pricingGroup?.get('depositPaid')?.value || 0);

    if (depositPaid > 0) {
      pricing.depositPaid = depositPaid;
      pricing.remainingBalance = this.pricingSummary.remaining;
    }

    if (this.appliedPromoCode) {
      pricing.promoCode = this.appliedPromoCode;
    }

    if (!hasSelections && !pricing.promoCode) {
      return undefined;
    }

    return pricing;
  }



  onSubmit(): void {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      this.submitError = 'Please fill in all required fields correctly.';
      return;
    }

    if (!this.validatePackageSelections(true)) {
      return;
    }

    this.isSubmitting = true;
    this.submitError = '';
    this.submitSuccess = false;

    const formValue = this.orderForm.value;

    // Handle event types - if "Other" is selected, replace it with the custom value
    let eventTypes = formValue.eventType.filter((t: string) => t);
    if (eventTypes.includes('Other') && formValue.eventTypeOther) {
      eventTypes = eventTypes.filter((t: string) => t !== 'Other');
      eventTypes.push(formValue.eventTypeOther);
    }

    // Build orderForm object
    const orderFormData: OrderForm = {
      brideAndGroomNames: formValue.brideAndGroomNames || undefined,
      eventDate: formValue.eventDate || undefined,
      eventType: eventTypes.length > 0 ? eventTypes : undefined,
      eventVenue: formValue.eventVenue || undefined,
      timelineOfDay: formValue.timelineOfDay || undefined,
      shootersStartTime: formValue.shootersStartTime || undefined,
      shootersEndTime: formValue.shootersEndTime || undefined,
      coupleDescription: formValue.coupleDescription || undefined,
      moodBoardLinks: formValue.moodBoardLinks 
        ? formValue.moodBoardLinks.split(',').map((link: string) => link.trim()).filter((link: string) => link)
        : undefined,
      favoriteSongs: formValue.favoriteSongs && formValue.favoriteSongs.length > 0
        ? formValue.favoriteSongs.filter((song: string) => song && song.trim())
        : undefined,
      specialMoments: formValue.specialMoments || undefined,
      excludeShots: formValue.excludeShots || undefined,
      vendors: this.buildVendorsObject(formValue.vendors),
      filmEditing: this.buildFilmEditingObject(formValue.filmEditing),
      socialMediaInspiration: formValue.socialMediaInspiration.filter((i: string) => i) || undefined,
      tiktokIdeas: formValue.tiktokIdeas.filter((i: string) => i) || undefined
    };

    const pricing = this.buildPricingPayload();
    if (pricing) {
      orderFormData.pricing = pricing;
    }

    const orderData = {
      email: formValue.email,
      clientName: formValue.clientName || undefined,
      notes: formValue.notes || undefined,
      orderForm: orderFormData
    };

    this.ordersService.createOrder(orderData).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.submitSuccess = true;
      },
      error: (error) => {
        this.isSubmitting = false;
        this.submitError = error.error?.message || 'Failed to create order. Please try again.';
        console.error('Error creating order:', error);
      }
    });
  }

  private buildVendorsObject(vendors: any): OrderFormVendors | undefined {
    const vendorsObj: OrderFormVendors = {};
    let hasData = false;

    if (vendors.photographers && vendors.photographers.length > 0) {
      const filtered = vendors.photographers.filter((p: string) => p);
      if (filtered.length > 0) {
        vendorsObj.photographers = filtered;
        hasData = true;
      }
    }
    if (vendors.cinematographers && vendors.cinematographers.length > 0) {
      const filtered = vendors.cinematographers.filter((c: string) => c);
      if (filtered.length > 0) {
        vendorsObj.cinematographers = filtered;
        hasData = true;
      }
    }
    if (vendors.makeupArtist) { vendorsObj.makeupArtist = vendors.makeupArtist; hasData = true; }
    if (vendors.hairStylist) { vendorsObj.hairStylist = vendors.hairStylist; hasData = true; }
    if (vendors.dressDesigner) { vendorsObj.dressDesigner = vendors.dressDesigner; hasData = true; }
    if (vendors.eventPlanner) { vendorsObj.eventPlanner = vendors.eventPlanner; hasData = true; }
    if (vendors.dj) { vendorsObj.dj = vendors.dj; hasData = true; }
    if (vendors.lighting) { vendorsObj.lighting = vendors.lighting; hasData = true; }
    if (vendors.entertainment) { vendorsObj.entertainment = vendors.entertainment; hasData = true; }
    if (vendors.others) { vendorsObj.others = vendors.others; hasData = true; }

    return hasData ? vendorsObj : undefined;
  }

  private buildFilmEditingObject(filmEditing: any): OrderFormFilmEditing | undefined {
    const filmEditingObj: OrderFormFilmEditing = {};
    let hasData = false;

    // Handle includeAccessoriesShots - convert radio value to boolean if needed
    // Save if user selected 'yes' or 'no', but not if 'no-preference' or empty
    if (filmEditing.includeAccessoriesShots && 
        filmEditing.includeAccessoriesShots !== '' && 
        filmEditing.includeAccessoriesShots !== 'no-preference' &&
        (filmEditing.includeAccessoriesShots === 'yes' || filmEditing.includeAccessoriesShots === 'no')) {
      filmEditingObj.includeAccessoriesShots = filmEditing.includeAccessoriesShots === 'yes';
      hasData = true;
    }
    
    if (filmEditing.editSequence && filmEditing.editSequence !== '' && filmEditing.editSequence !== 'no-preference') {
      filmEditingObj.editSequence = filmEditing.editSequence;
      hasData = true;
    }
    
    if (filmEditing.stylePreference && filmEditing.stylePreference.length > 0) {
      filmEditingObj.stylePreference = filmEditing.stylePreference;
      hasData = true;
    }
    
    // Handle highlight preference - convert from object to array format
    // Save all selections including 'equal' to show user made a choice
    if (filmEditing.highlightPreference) {
      const highlightArray: string[] = [];
      const prefs = filmEditing.highlightPreference;
      
      // Convert the object structure to array format expected by backend
      // Include 'equal' selections as well to show the user made a choice
      if (prefs.preparations && prefs.preparations !== '') {
        if (prefs.preparations === 'equal') {
          highlightArray.push(`Preparations: Equal amount of shots`);
        } else {
          highlightArray.push(`Preparations: ${prefs.preparations}`);
        }
      }
      if (prefs.groupShots && prefs.groupShots !== '') {
        if (prefs.groupShots === 'equal') {
          highlightArray.push(`Group shots: Equal amount of shots`);
        } else {
          highlightArray.push(`Group shots: ${prefs.groupShots}`);
        }
      }
      if (prefs.dancingParty && prefs.dancingParty !== '') {
        if (prefs.dancingParty === 'equal') {
          highlightArray.push(`Dancing/party: Equal amount of shots`);
        } else {
          highlightArray.push(`Dancing/party: ${prefs.dancingParty}`);
        }
      }
      
      if (highlightArray.length > 0) {
        filmEditingObj.highlightPreference = highlightArray;
        hasData = true;
      }
    }
    
    if (filmEditing.teaserStyleLinks && filmEditing.teaserStyleLinks.length > 0) {
      const filtered = filmEditing.teaserStyleLinks.filter((l: string) => l);
      if (filtered.length > 0) {
        filmEditingObj.teaserStyleLinks = filtered;
        hasData = true;
      }
    }

    return hasData ? filmEditingObj : undefined;
  }

  onCancel(): void {
    this.router.navigate(['/orders']);
  }

  onSuccessModalClose(): void {
    this.submitSuccess = false;
    this.router.navigate(['/orders']);
  }
}

