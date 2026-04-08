import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { OrdersService, OrderForm, OrderFormVendors, OrderFormFilmEditing, OrderPricing, SelectedCollectionOption, SelectedExtraOption, SelectedPackageOption, Order } from '../../services/orders.service';
import { SuccessModalComponent } from '../success-modal/success-modal.component';
import { PackagesService, Package, PackageCollection, PackageExtra } from '../../services/packages.service';
import { AuthService } from '../../services/auth.service';
import { CurrencyService } from '../../services/currency.service';
import { filter, take } from 'rxjs/operators';

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
  showErrorModal = false;
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
  packageSelectionError = 'Please select at least one package.';
  collectionSelectionError = '';
  depositError = '';

  // Event type options
  eventTypes = ['Wedding', 'Engagement', 'Katb Ketab', 'Other'];

  // Edit sequence options
  editSequenceOptions = [
    { value: 'chronological', label: 'Chronological sequence of events' },
    { value: 'random', label: 'Uniquely random sequence of events' },
    { value: 'no-preference', label: 'No preference, whatever fits within my film storyline' }
  ];

  // Accessory shots options


  // Style preference options
  stylePreferenceOptions = ['Romantic', 'Fun/Energetic/Hyped', 'Vintage', 'Emotional', 'Royal', 'Holy'];

  // Highlight preference categories
  highlightPreferenceCategories = ['Preparations/Getting ready', 'Group shots', 'Dancing/party shots'];

  // Highlight preference options for each category
  highlightPreferenceOptions = ['Family', 'Friends', 'Equal amount of shots'];

  isEditMode = false;
  editingOrderId: string | null = null;
  editingOrder: Order | null = null;
  loadingOrderData = false;
  loadOrderError = '';
  isAdminUser = false;
  isStrictAdmin = false;
  formLockedForDate = false;
  editSource: 'dashboard' | 'orders' | null = null;
  private readonly editCachePrefix = 'maro_edit_order_';
  private initialHydrationAttempted = false;
  private clientEmailForFetch: string | null = null;

  constructor(
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private packagesService: PackagesService,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    public currencyService: CurrencyService
  ) {
    this.orderForm = this.createForm();
    this.updateVendorControlStates();

    this.isAdminUser = this.authService.isAuthenticatedValue;
    this.isStrictAdmin = this.authService.isAdmin();

    const orderId = this.route.snapshot.paramMap.get('id');
    this.clientEmailForFetch = this.route.snapshot.queryParamMap.get('email');
    if (orderId) {
      this.isEditMode = true;
      this.editingOrderId = orderId;
      this.loadingOrderData = true;
      this.orderForm.disable({ emitEvent: false });
    }

  }

  ngOnInit(): void {
    // Requirement: "Order creation step — fetch latest currency from backend".
    // detectCurrency() resets currencyReady$ to false and fires a fresh HTTP
    // call, so the pipe below waits for THIS fresh result (not a stale cached one).
    this.currencyService.detectCurrency();

    // Wait for the fresh detect above to complete before loading packages.
    // Ensures ?country=AE is sent for UAE users so hiddenInUAE items are
    // filtered and prices display in the correct currency.
    this.currencyService.currencyReady$.pipe(
      filter((ready) => ready),
      take(1)
    ).subscribe(() => this.loadPackages());

    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAdminUser = isAuth ?? false;
      this.isStrictAdmin = this.authService.isAdmin();
      if (this.isEditMode && this.editingOrder) {
        this.applyDateLock(this.editingOrder);
        this.applyFieldPermissions();
      }
      if (!this.initialHydrationAttempted && this.isEditMode && this.editingOrderId) {
        this.tryHydrateEditingOrder(this.editingOrderId);
        this.initialHydrationAttempted = true;
      }
    });

    this.authService.role$.subscribe(() => {
      this.isStrictAdmin = this.authService.isAdmin();
      if (this.isEditMode && this.editingOrder) {
        this.applyDateLock(this.editingOrder);
        this.applyFieldPermissions();
      }
    });

    if (!this.authService.isBrowserEnv) {
      this.isAdminUser = false;
      this.isStrictAdmin = false;
    }
  }

  createForm(): FormGroup {
    return this.fb.group({
      // Basic order info
      email: ['', [Validators.required, Validators.email]],
      clientName: ['', [Validators.required, Validators.pattern(/^01[0125][0-9]{8}$/)]],
      notes: ['', [Validators.required, Validators.pattern(/^01[0125][0-9]{8}$/)]],

      // Order form fields
      brideAndGroomNames: ['', Validators.required],
      eventDate: ['', Validators.required],
      eventType: this.fb.array([], Validators.required),
      eventTypeOther: [''],
      eventVenue: ['', Validators.required],


      // Vendors
      vendors: this.fb.group({
        photographers: this.fb.array([this.fb.control('')]),
        cinematographers: this.fb.array([this.fb.control('')]),
        makeupArtist: [''],
        hairStylist: [''],
        dressDesigner: [''],
        eventPlanner: [''],
        dj: [''],
        lighting: [''],
        entertainment: [''],
        others: ['']
      }),

      // Film editing
      filmEditing: this.fb.group({
        stylePreference: this.fb.array([], Validators.required),
        teaserStyleLinks: this.fb.array([])
      }),

      // Social media
      socialMediaInspiration: this.fb.array([this.fb.control('')]),
      pricing: this.fb.group({
        promoCode: ['0'], // Using promoCode field to store discount amount
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
        if (this.isEditMode && this.editingOrder) {
          this.setPricingSelections(this.editingOrder.orderForm?.pricing || null);
          // Crucial: ensure field states (like style preference) are updated after pricing is set
          this.updateVendorControlStates();
        }
      },
      error: () => {
        this.packagesError = 'Failed to load packages. Please try again later.';
        this.packagesLoading = false;
      }
    });
  }

  private tryHydrateEditingOrder(orderId: string): void {
    let hydrated = false;

    if (typeof window !== 'undefined') {
      const stateData = window.history.state as { order?: Order; source?: 'dashboard' | 'orders' };
      if (stateData?.order?._id === orderId) {
        this.setEditingOrder(stateData.order, stateData.source);
        hydrated = true;
      }

      if (!hydrated) {
        try {
          const cached = window.sessionStorage?.getItem(`${this.editCachePrefix}${orderId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.order?._id === orderId) {
              if (!this.clientEmailForFetch && parsed.clientEmail) {
                this.clientEmailForFetch = parsed.clientEmail;
              }
              this.setEditingOrder(parsed.order, parsed.source);
              hydrated = true;
            }
          }
        } catch (err) {
          console.warn('Failed to read cached edit order data', err);
        }
      }
    }

    if (hydrated) {
      return;
    }

    if (this.isAdminUser) {
      this.fetchOrderFromApi(orderId);
      return;
    }

    if (this.clientEmailForFetch) {
      this.fetchOrderForClient(orderId, this.clientEmailForFetch);
      return;
    }

  }

  private fetchOrderFromApi(orderId: string): void {
    this.loadingOrderData = true;
    this.ordersService.getOrderById(orderId).subscribe({
      next: (response: any) => {
        const order = response?.order || response;
        if (!order) {
          this.loadOrderError = 'Order not found.';
          this.loadingOrderData = false;
          return;
        }
        this.setEditingOrder(order, 'dashboard');
        this.cacheEditingOrder(order, 'dashboard');
      },
      error: (err) => {
        console.error('Failed to load order for editing', err);
        this.loadOrderError = err.status === 401
          ? 'Your session expired. Please log in again from the dashboard.'
          : 'Failed to load this order. Please try again.';
        this.loadingOrderData = false;
      }
    });
  }

  private fetchOrderForClient(orderId: string, email: string): void {
    this.loadingOrderData = true;
    this.ordersService.getOrdersByEmail(email).subscribe({
      next: (response) => {
        const orders: Order[] = response?.orders || [];
        const order = orders.find(o => o._id === orderId);
        if (!order) {
          this.loadOrderError = 'We could not find this order under your email address.';
          this.loadingOrderData = false;
          return;
        }
        this.setEditingOrder(order, 'orders');
      },
      error: (err) => {
        this.loadingOrderData = false;
      }
    });
  }

  private cacheEditingOrder(order: Order, source?: 'dashboard' | 'orders'): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(
          `${this.editCachePrefix}${order._id}`,
          JSON.stringify({ order, source, clientEmail: this.clientEmailForFetch || null })
        );
      }
    } catch (err) {
      console.warn('Failed to cache order for editing', err);
    }
  }

  private setFormArrayValues(control: FormArray, values: string[] = [], ensureEntry = true): void {
    const validators = control.length ? (control.at(0) as FormControl).validator : null;
    const asyncValidators = control.length ? (control.at(0) as FormControl).asyncValidator : null;
    while (control.length) {
      control.removeAt(0);
    }

    const entries = values && values.length ? values : (ensureEntry ? [''] : []);
    entries.forEach(value => {
      control.push(this.fb.control(value, validators, asyncValidators));
    });
  }

  private setStylePreferenceSelections(values: string[] = []): void {
    const array = this.stylePreferenceArray;
    while (array.length) {
      array.removeAt(0);
    }
    values.forEach(value => {
      array.push(this.fb.control(value));
    });
  }

  private setPricingSelections(pricing?: OrderPricing | null): void {
    this.selectedPackages.clear();
    this.selectedCollections.clear();
    this.selectedExtras.clear();

    if (pricing?.packages?.length) {
      pricing.packages.forEach(pkg => {
        if (pkg.packageId) {
          this.selectedPackages.set(pkg.packageId, pkg);
        }
      });
    }

    // In edit mode use the STORED order currency for display (not current user currency)
    const displayCurrency = pricing?.currency || this.currencyService.currency;

    if (pricing?.collections?.length) {
      pricing.collections.forEach(collection => {
        if (collection.collectionId) {
          const formattedCollection = {
            ...collection,
            priceLabel: this.currencyService.formatOrderCurrency(collection.priceValue, displayCurrency)
          };
          this.selectedCollections.set(collection.collectionId, formattedCollection);
        }
      });
    }

    if (pricing?.extras?.length) {
      pricing.extras.forEach(extra => {
        if (extra.extraId) {
          const formattedExtra = {
            ...extra,
            priceLabel: this.currencyService.formatOrderCurrency(extra.priceValue, displayCurrency)
          };
          this.selectedExtras.set(extra.extraId, formattedExtra);
        }
      });
    }

    const pricingGroup = this.getPricingFormGroup();

    let discountForDisplay = 0;
    if (pricing?.promoCode && !isNaN(Number(pricing.promoCode))) {
      discountForDisplay = Number(pricing.promoCode);
    } else {
      discountForDisplay = pricing?.discount ?? 0;
    }

    // For non-EGP stored orders, show discount as-is (already in stored currency)
    if (displayCurrency === 'USD' && discountForDisplay > 0) {
      const rate = this.currencyService.currentExchangeRate;
      if (rate > 0) {
        discountForDisplay = Math.round(discountForDisplay / rate);
      }
    }
    pricingGroup?.get('promoCode')?.setValue(discountForDisplay.toString(), { emitEvent: false });

    let depositForDisplay = pricing?.depositPaid ?? 0;
    if (displayCurrency === 'USD' && depositForDisplay > 0) {
      const rate = this.currencyService.currentExchangeRate;
      if (rate > 0) {
        depositForDisplay = Math.round(depositForDisplay / rate);
      }
    }
    pricingGroup?.get('depositPaid')?.setValue(depositForDisplay, { emitEvent: false });

    if (pricing) {
      this.pricingSummary = {
        subtotal: pricing.subtotal ?? 0,
        discount: pricing.discount ?? 0,
        total: pricing.total ?? pricing.subtotal ?? 0,
        remaining: pricing.remainingBalance ?? Math.max((pricing.total ?? 0) - (pricing.depositPaid ?? 0), 0)
      };
    } else {
      this.updatePricingSummary();
    }
  }

  private parseHighlightSelections(entries?: string[]): { preparations?: string; groupShots?: string; dancingParty?: string } {
    const result: { preparations?: string; groupShots?: string; dancingParty?: string } = {};
    (entries || []).forEach(entry => {
      const [label, valueRaw] = entry.split(':').map(part => part.trim());
      if (!label || !valueRaw) {
        return;
      }
      const normalized = valueRaw.toLowerCase().includes('equal')
        ? 'equal'
        : valueRaw.toLowerCase().includes('friend')
          ? 'friends'
          : 'family';

      if (label.toLowerCase().includes('preparations')) {
        result.preparations = normalized;
      } else if (label.toLowerCase().includes('group')) {
        result.groupShots = normalized;
      } else if (label.toLowerCase().includes('dancing') || label.toLowerCase().includes('party')) {
        result.dancingParty = normalized;
      }
    });
    return result;
  }



  private normalizeDateForInput(value?: string | Date | null): string {
    if (!value) {
      return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private setEditingOrder(order: Order, source?: 'dashboard' | 'orders'): void {
    this.editingOrder = order;
    if (source) {
      this.editSource = source;
    }
    if (!this.clientEmailForFetch && order.email) {
      this.clientEmailForFetch = order.email;
    }
    this.loadingOrderData = false;
    this.loadOrderError = '';
    this.orderForm.enable({ emitEvent: false });
    this.populateFormWithOrder(order);
    this.applyFieldPermissions();
    this.applyDateLock(order);
    this.cacheEditingOrder(order, this.editSource || source);
    this.updatePromoCodeLock();
  }

  private populateFormWithOrder(order: Order): void {
    const formData = order.orderForm || {};

    this.orderForm.patchValue({
      email: order.email || '',
      clientName: (order.clientName || '').trim(),
      notes: (order.notes || '').trim(),
      brideAndGroomNames: formData.brideAndGroomNames || '',
      eventDate: this.normalizeDateForInput(formData.eventDate),
      eventVenue: formData.eventVenue || '',
      eventTypeOther: ''
    }, { emitEvent: false });

    this.setFormArrayValues(this.eventTypeArray, formData.eventType || [], false);
    this.setFormArrayValues(this.socialMediaInspirationArray, formData.socialMediaInspiration || []);
    this.setFormArrayValues(this.teaserStyleLinksArray, formData.filmEditing?.teaserStyleLinks || [], false);

    const vendors = formData.vendors || {};
    const vendorsGroup = this.orderForm.get('vendors') as FormGroup;
    vendorsGroup.patchValue({
      makeupArtist: vendors.makeupArtist || '',
      hairStylist: vendors.hairStylist || '',
      dressDesigner: vendors.dressDesigner || '',
      eventPlanner: vendors.eventPlanner || '',
      dj: vendors.dj || '',
      lighting: vendors.lighting || '',
      entertainment: vendors.entertainment || '',
      others: vendors.others || ''
    }, { emitEvent: false });
    this.setFormArrayValues(this.photographersArray, vendors.photographers || []);
    this.setFormArrayValues(this.cinematographersArray, vendors.cinematographers || []);

    const filmEditingGroup = this.orderForm.get('filmEditing') as FormGroup;
    const filmEditing = formData.filmEditing || {};
    filmEditingGroup.patchValue({}, { emitEvent: false });
    this.setStylePreferenceSelections(filmEditing.stylePreference || []);

    this.setPricingSelections(formData.pricing || null);
    this.updateVendorControlStates();
    this.orderForm.updateValueAndValidity({ emitEvent: false });
  }

  private applyFieldPermissions(): void {
    const rootFields = ['email', 'clientName', 'notes'];
    rootFields.forEach(field => {
      const control = this.orderForm.get(field);
      if (!control) return;

      if (field === 'email') {
        // Only strict admins can edit email
        if (this.isStrictAdmin) {
          control.enable({ emitEvent: false });
        } else {
          control.disable({ emitEvent: false });
        }
      } else {
        // clientName and notes can be edited by any internal user (admin/editor)
        if (this.isAdminUser) {
          control.enable({ emitEvent: false });
        } else {
          control.disable({ emitEvent: false });
        }
      }
    });
  }

  private applyDateLock(order: Order): void {
    const eventDateValue = order.orderForm?.eventDate;
    if (!eventDateValue) {
      this.formLockedForDate = false;
      return;
    }
    const eventDate = new Date(eventDateValue);
    if (isNaN(eventDate.getTime())) {
      this.formLockedForDate = false;
      return;
    }
    const now = new Date();
    eventDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    this.formLockedForDate = eventDate <= now;

    // Administrators can override the date lock
    if (this.formLockedForDate && !this.isStrictAdmin) {
      this.orderForm.disable({ emitEvent: false });
    } else {
      // If it's not strictly locked for the user, ensure the form is enabled 
      // (specific fields will still be handled by applyFieldPermissions)
      this.orderForm.enable({ emitEvent: false });
      this.applyFieldPermissions();
    }
  }

  private updatePromoCodeLock(): void {
    const promoControl = this.orderForm.get('pricing.promoCode');
    if (!promoControl) {
      return;
    }
    if (this.isEditMode) {
      promoControl.disable({ emitEvent: false });
    } else {
      promoControl.enable({ emitEvent: false });
    }
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
    // Mark the FormArray as touched when user interacts with checkboxes
    array.markAsTouched();
  }

  isEventTypeSelected(eventType: string): boolean {
    return this.eventTypeArray.value.includes(eventType);
  }

  isOtherEventTypeSelected(): boolean {
    return this.isEventTypeSelected('Other');
  }


  addPhotographer(): void {
    this.photographersArray.push(this.fb.control(''));
  }

  removePhotographer(index: number): void {
    this.photographersArray.removeAt(index);
    if (this.photographersArray.length === 0) {
      this.addPhotographer();
    }
  }

  addCinematographer(): void {
    this.cinematographersArray.push(this.fb.control(''));
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
    this.socialMediaInspirationArray.push(this.fb.control(''));
  }

  removeSocialMediaInspiration(index: number): void {
    this.socialMediaInspirationArray.removeAt(index);
    if (this.socialMediaInspirationArray.length === 0) {
      this.addSocialMediaInspiration();
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
    // For AED users: use priceAED if available, otherwise fall back to EGP base price
    let priceValue: number;
    if (this.currencyService.currency === 'AED' && collection.priceAED) {
      priceValue = this.parsePriceValue(collection.priceAED);
    } else {
      priceValue = this.parsePriceValue(collection.price);
    }
    return {
      packageId: pkg._id,
      packageName: pkg.packageName,
      packageDisplayName: pkg.displayName,
      collectionId: collection._id,
      collectionName: collection.collectionName,
      priceLabel: this.currencyService.formatPackagePrice(collection.price, collection.priceAED),
      priceValue
    };
  }

  private buildExtraSelection(pkg: Package, extra: PackageExtra): SelectedExtraOption {
    let priceValue: number;
    if (this.currencyService.currency === 'AED' && extra.priceAED) {
      priceValue = this.parsePriceValue(extra.priceAED);
    } else {
      priceValue = this.parsePriceValue(extra.price);
    }
    return {
      packageId: pkg._id,
      packageName: pkg.packageName,
      packageDisplayName: pkg.displayName,
      extraId: extra._id,
      extraName: extra.name,
      priceLabel: this.currencyService.formatPackagePrice(extra.price, extra.priceAED),
      priceValue
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

  public updatePricingSummary(): void {
    const subtotal =
      [...this.selectedCollections.values(), ...this.selectedExtras.values()].reduce(
        (sum, item) => sum + (item.priceValue || 0),
        0
      );

    const pricingGroup = this.getPricingFormGroup();
    let discount = Number(pricingGroup?.get('promoCode')?.value || 0);

    // Convert discount back to EGP if user is outside Egypt
    if (!this.currencyService.isInEgyptValue && discount > 0) {
      const rate = this.currencyService.currentExchangeRate;
      if (rate > 0) {
        discount = Math.round(discount * rate);
      }
    }

    if (discount > subtotal) {
      discount = subtotal;
    }

    const total = subtotal - discount;
    const depositControl = pricingGroup?.get('depositPaid');

    // Deposit is now always 50% of the total
    const depositInEGP = Math.round(total * 0.5);

    // Set the value in the form control for submission
    depositControl?.setValue(depositInEGP, { emitEvent: false });

    const remaining = total - depositInEGP;

    this.pricingSummary = {
      subtotal,
      discount,
      total,
      remaining
    };

    this.depositError = '';
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
      // Build detailed error message
      const errorMessages: string[] = [];
      if (this.packageSelectionError) {
        errorMessages.push(this.packageSelectionError);
      }
      if (this.collectionSelectionError) {
        errorMessages.push(this.collectionSelectionError);
      }
      if (errorMessages.length > 0) {
        this.submitError = errorMessages.join('\n\n');
      } else {
        this.submitError = 'Please complete the Packages & Pricing selections.';
      }
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

    // Style preference is only required/visible if cinematography is selected
    if (disableCinematographers) {
      this.stylePreferenceArray.enable({ emitEvent: false });
    } else {
      this.stylePreferenceArray.disable({ emitEvent: false });
    }
  }

  private setArrayDisabledState(array: FormArray, shouldDisable: boolean): void {
    if (shouldDisable && array.enabled) {
      array.disable({ emitEvent: false });
    } else if (!shouldDisable && array.disabled) {
      array.enable({ emitEvent: false });
    }
  }

  onDepositChange(): void {
    // This is no longer used as the field is removed from UI
    // But we keep the method to avoid potential template errors if not fully updated
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
    let depositPaid = Number(pricingGroup?.get('depositPaid')?.value || 0);

    if (depositPaid > 0) {
      pricing.depositPaid = depositPaid;
      pricing.remainingBalance = this.pricingSummary.remaining;
    }

    if (this.pricingSummary.discount > 0) {
      pricing.discount = this.pricingSummary.discount;
      pricing.promoCode = this.pricingSummary.discount.toString();
    }

    // In edit mode, use stored currency; for new orders use detected currency
    if (this.isEditMode && this.editingOrder?.orderForm?.pricing?.currency) {
      pricing.currency = this.editingOrder.orderForm.pricing.currency;
    } else {
      pricing.currency = this.currencyService.getCurrencyCode();
    }

    if (!hasSelections && !(pricing.discount && pricing.discount > 0)) {
      return undefined;
    }

    return pricing;
  }



  onSubmit(): void {
    if (this.isEditMode && (this.loadingOrderData || this.loadOrderError || !this.editingOrderId)) {
      return;
    }

    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      const invalidFields = this.getFormValidationErrors();
      this.submitError = 'Please check the following fields: ' + invalidFields.join(', ') + '.';
      this.showErrorModal = true;
      return;
    }

    if (!this.validatePackageSelections(true)) {
      this.showErrorModal = true;
      return;
    }

    this.isSubmitting = true;
    this.submitError = '';
    this.submitSuccess = false;

    const formValue = this.orderForm.getRawValue();

    // Handle event types - if "Other" is selected, replace it with the custom value
    let eventTypes = (formValue.eventType || []).filter((t: string) => t);
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

      vendors: this.buildVendorsObject(formValue.vendors),
      filmEditing: this.buildFilmEditingObject(formValue.filmEditing),
      socialMediaInspiration: formValue.socialMediaInspiration.filter((i: string) => i) || undefined
    };

    const pricing = this.buildPricingPayload();
    if (pricing) {
      orderFormData.pricing = pricing;
    }

    if (this.isEditMode && this.editingOrderId) {
      const updatePayload: any = {
        orderForm: orderFormData
      };

      if (this.isAdminUser) {
        updatePayload.email = formValue.email;
        updatePayload.clientName = formValue.clientName || undefined;
        updatePayload.notes = formValue.notes || undefined;
      }

      this.ordersService.updateOrder(this.editingOrderId, updatePayload).subscribe({
        next: (response) => {
          this.isSubmitting = false;
          this.submitSuccess = true;
          if (response?.order) {
            this.setEditingOrder(response.order, this.editSource || undefined);
          }
        },
        error: (error) => {
          this.isSubmitting = false;
          this.submitError = error.error?.message || 'Failed to update order. Please try again.';
          this.showErrorModal = true;
          console.error('Error updating order:', error);
        }
      });
      return;
    }

    const orderData = {
      email: formValue.email,
      clientName: formValue.clientName || undefined,
      notes: formValue.notes || undefined,
      orderForm: orderFormData,
      currency: this.currencyService.getCurrencyCode() // pass detected currency to backend
    };

    this.ordersService.createOrder(orderData).subscribe({

      next: () => {
        this.isSubmitting = false;
        this.submitSuccess = true;
      },
      error: (error) => {
        this.isSubmitting = false;
        this.submitError = error.error?.message || 'Failed to create order. Please try again.';
        this.showErrorModal = true;
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




    if (filmEditing.stylePreference && filmEditing.stylePreference.length > 0) {
      filmEditingObj.stylePreference = filmEditing.stylePreference;
      hasData = true;
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
    this.navigateAfterEdit();
  }

  onSuccessModalClose(): void {
    this.submitSuccess = false;
    this.navigateAfterEdit();
  }

  onErrorModalClose(): void {
    this.showErrorModal = false;
    this.submitError = '';
  }

  private navigateAfterEdit(): void {
    if (this.isEditMode) {
      if (this.editSource === 'dashboard') {
        this.router.navigate(['/dashboard']);
        return;
      }
      this.router.navigate(['/orders']);
      return;
    }
    this.router.navigate(['/orders']);
  }

  private getFormValidationErrors(): string[] {
    const errors: string[] = [];
    const controls = this.orderForm.controls;

    const fieldLabels: { [key: string]: string } = {
      email: 'Email Address',
      clientName: "Groom's Number",
      notes: "Bride's Number",
      brideAndGroomNames: "Bride & Groom's Names",
      eventDate: 'Event Date',
      eventVenue: 'Event Venue',
      eventType: 'Event Type',
      vendors: 'Vendors Section',
      filmEditing: 'Film Editing Section',
      'filmEditing.stylePreference': 'Style Preference'
    };

    Object.keys(controls).forEach(key => {
      const control = controls[key];
      if (control.invalid) {
        if (key === 'vendors' || key === 'filmEditing') {
          const group = control as FormGroup;
          Object.keys(group.controls).forEach(subKey => {
            const subControl = group.get(subKey);
            if (subControl?.invalid) {
              const label = fieldLabels[`${key}.${subKey}`] || fieldLabels[subKey] || `${key} ${subKey}`;
              if (!errors.includes(label)) errors.push(label);
            }
          });
        } else {
          errors.push(fieldLabels[key] || key);
        }
      }
    });

    return errors;
  }
}

