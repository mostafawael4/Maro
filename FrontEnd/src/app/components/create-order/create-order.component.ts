import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { OrdersService, OrderForm, OrderFormVendors, OrderFormFilmEditing, OrderPricing, SelectedCollectionOption, SelectedExtraOption, SelectedPackageOption, Order } from '../../services/orders.service';
import { SuccessModalComponent } from '../success-modal/success-modal.component';
import { PackagesService, Package, PackageCollection, PackageExtra } from '../../services/packages.service';
import { AuthService } from '../../services/auth.service';
import { CurrencyService } from '../../services/currency.service';

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

  isEditMode = false;
  editingOrderId: string | null = null;
  editingOrder: Order | null = null;
  loadingOrderData = false;
  loadOrderError = '';
  isAdminUser = false;
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

    const orderId = this.route.snapshot.paramMap.get('id');
    this.clientEmailForFetch = this.route.snapshot.queryParamMap.get('email');
    if (orderId) {
      this.isEditMode = true;
      this.editingOrderId = orderId;
      this.loadingOrderData = true;
      this.orderForm.disable({ emitEvent: false });
    }

    this.updatePromoCodeLock();
  }

  ngOnInit(): void {
    this.loadPackages();
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAdminUser = isAuth ?? false;
      if (this.isEditMode && this.editingOrder) {
        this.applyFieldPermissions();
      }
    });

    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAdminUser = isAuth ?? false;
      if (this.isEditMode && this.editingOrder) {
        this.applyFieldPermissions();
      }
      if (!this.initialHydrationAttempted && this.isEditMode && this.editingOrderId) {
        this.tryHydrateEditingOrder(this.editingOrderId);
        this.initialHydrationAttempted = true;
      }
    });

    if (!this.authService.isBrowserEnv) {
      this.isAdminUser = false;
    }
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
        if (this.isEditMode && this.editingOrder) {
          this.setPricingSelections(this.editingOrder.orderForm?.pricing || null);
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

    if (pricing?.collections?.length) {
      pricing.collections.forEach(collection => {
        if (collection.collectionId) {
          this.selectedCollections.set(collection.collectionId, collection);
        }
      });
    }

    if (pricing?.extras?.length) {
      pricing.extras.forEach(extra => {
        if (extra.extraId) {
          this.selectedExtras.set(extra.extraId, extra);
        }
      });
    }

    const pricingGroup = this.getPricingFormGroup();
    pricingGroup?.get('promoCode')?.setValue(pricing?.promoCode || '', { emitEvent: false });
    
    // Convert deposit from EGP to USD for display if outside Egypt
    let depositForDisplay = pricing?.depositPaid ?? 0;
    if (!this.currencyService.isInEgyptValue && depositForDisplay > 0) {
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
      this.appliedPromoCode = pricing.promoCode || null;
    } else {
      this.appliedPromoCode = null;
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

  private mapAccessoriesShotsValue(value?: boolean | string): string {
    if (value === true || value === 'yes') {
      return 'yes';
    }
    if (value === false || value === 'no') {
      return 'no';
    }
    return 'no-preference';
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
      clientName: order.clientName || '',
      notes: order.notes || '',
      brideAndGroomNames: formData.brideAndGroomNames || '',
      eventDate: this.normalizeDateForInput(formData.eventDate),
      eventVenue: formData.eventVenue || '',
      timelineOfDay: formData.timelineOfDay || '',
      shootersStartTime: formData.shootersStartTime || '',
      shootersEndTime: formData.shootersEndTime || '',
      coupleDescription: formData.coupleDescription || '',
      moodBoardLinks: Array.isArray(formData.moodBoardLinks) ? formData.moodBoardLinks.join(', ') : (formData.moodBoardLinks as unknown as string) || '',
      specialMoments: formData.specialMoments || '',
      excludeShots: formData.excludeShots || '',
      eventTypeOther: ''
    }, { emitEvent: false });

    this.setFormArrayValues(this.eventTypeArray, formData.eventType || [], false);
    this.setFormArrayValues(this.favoriteSongsArray, formData.favoriteSongs || []);
    this.setFormArrayValues(this.socialMediaInspirationArray, formData.socialMediaInspiration || []);
    this.setFormArrayValues(this.tiktokIdeasArray, formData.tiktokIdeas || []);
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
    filmEditingGroup.patchValue({
      includeAccessoriesShots: this.mapAccessoriesShotsValue(filmEditing.includeAccessoriesShots),
      editSequence: filmEditing.editSequence || 'no-preference'
    }, { emitEvent: false });
    this.setStylePreferenceSelections(filmEditing.stylePreference || []);

    const highlightSelections = this.parseHighlightSelections(filmEditing.highlightPreference);
    this.highlightPreferenceGroup.patchValue({
      preparations: highlightSelections.preparations || '',
      groupShots: highlightSelections.groupShots || '',
      dancingParty: highlightSelections.dancingParty || ''
    }, { emitEvent: false });

    this.setPricingSelections(formData.pricing || null);
    this.updateVendorControlStates();
    this.orderForm.updateValueAndValidity({ emitEvent: false });
  }

  private applyFieldPermissions(): void {
    const rootFields = ['email', 'clientName', 'notes'];
    rootFields.forEach(field => {
      const control = this.orderForm.get(field);
      if (!control) return;
      if (this.isAdminUser) {
        control.enable({ emitEvent: false });
      } else {
        control.disable({ emitEvent: false });
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
    if (this.formLockedForDate) {
      this.orderForm.disable({ emitEvent: false });
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
    this.promoSuccess = `Promo code applied! Discount: ${this.currencyService.formatCurrency(discountValue)}`;
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
    
    // Convert deposit to EGP for comparison if outside Egypt
    let depositInEGP = depositValue;
    if (!this.currencyService.isInEgyptValue) {
      const rate = this.currencyService.currentExchangeRate;
      if (rate > 0) {
        depositInEGP = depositValue * rate;
      }
    }
    
    // Compare against total (which is in EGP)
    if (depositInEGP > total) {
      // Set max allowed deposit based on location
      if (this.currencyService.isInEgyptValue) {
        // In Egypt: set to total (in EGP)
        depositControl?.setValue(total, { emitEvent: false });
        depositInEGP = total; // Use capped value for calculation
      } else {
        // Outside Egypt: convert total to USD for display
        const rate = this.currencyService.currentExchangeRate;
        if (rate > 0) {
          const maxDepositUSD = Math.round(total / rate);
          depositControl?.setValue(maxDepositUSD, { emitEvent: false });
          depositInEGP = total; // Use capped value for calculation
        }
      }
      this.depositError = 'Deposit cannot exceed total amount.';
    } else {
      this.depositError = '';
    }
    
    const remaining = total - depositInEGP;

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
    
    // Get raw value and sanitize it
    let rawValue = depositControl.value;
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      rawValue = 0;
    }
    
    // Convert to number, handling string inputs
    let value = typeof rawValue === 'string' 
      ? parseFloat(rawValue.toString().replace(/[^\d.-]/g, '')) 
      : Number(rawValue);
    
    // Validate and sanitize
    if (isNaN(value) || value < 0) {
      value = 0;
    }
    
    // Round to whole number (no decimals for currency)
    value = Math.round(value);
    
    // Cap value to maximum before setting (prevent exceeding max)
    // We need to calculate the max based on current total
    const subtotal = [...this.selectedCollections.values(), ...this.selectedExtras.values()].reduce(
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
    
    // Convert value to EGP for comparison
    let valueInEGP = value;
    if (!this.currencyService.isInEgyptValue) {
      const rate = this.currencyService.currentExchangeRate;
      if (rate > 0) {
        valueInEGP = value * rate;
      }
    }
    
    // Cap to maximum
    if (valueInEGP > total && total > 0) {
      if (this.currencyService.isInEgyptValue) {
        value = total;
      } else {
        const rate = this.currencyService.currentExchangeRate;
        if (rate > 0) {
          value = Math.round(total / rate);
        }
      }
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
    let depositPaid = Number(pricingGroup?.get('depositPaid')?.value || 0);

    // Convert USD to EGP if outside Egypt before saving
    if (!this.currencyService.isInEgyptValue && depositPaid > 0) {
      const rate = this.currencyService.currentExchangeRate;
      if (rate > 0) {
        depositPaid = Math.round(depositPaid * rate);
      }
    }

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
    if (this.isEditMode && (this.loadingOrderData || this.loadOrderError || !this.editingOrderId)) {
      return;
    }

    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      this.submitError = 'Please fill in all required fields correctly.';
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
      orderForm: orderFormData
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
}

