import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrdersService, OrderForm, OrderFormVendors, OrderFormFilmEditing } from '../../services/orders.service';

@Component({
  selector: 'app-create-order',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './create-order.component.html',
  styleUrl: './create-order.component.scss'
})
export class CreateOrderComponent implements OnInit {
  orderForm: FormGroup;
  isSubmitting = false;
  submitError = '';
  submitSuccess = false;

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
    private router: Router
  ) {
    this.orderForm = this.createForm();
  }

  ngOnInit(): void {}

  createForm(): FormGroup {
    return this.fb.group({
      // Basic order info
      email: ['', [Validators.required, Validators.email]],
      clientName: [''],
      notes: [''],

      // Order form fields
      brideAndGroomNames: [''],
      eventDate: [''],
      eventType: this.fb.array([]),
      eventTypeOther: [''],
      eventVenue: [''],
      timelineOfDay: [''],
      shootersStartTime: [''],
      shootersEndTime: [''],
      coupleDescription: [''],
      moodBoardLinks: [''],
      favoriteSongs: this.fb.array([]),
      specialMoments: [''],
      excludeShots: [''],

      // Vendors
      vendors: this.fb.group({
        photographers: this.fb.array([]),
        cinematographers: this.fb.array([]),
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
        includeAccessoriesShots: this.fb.control(''),
        editSequence: this.fb.control(''),
        stylePreference: this.fb.array([]),
        highlightPreference: this.fb.group({
          preparations: this.fb.control(''),
          groupShots: this.fb.control(''),
          dancingParty: this.fb.control('')
        }),
        teaserStyleLinks: this.fb.array([])
      }),

      // Social media
      socialMediaInspiration: this.fb.array([]),
      tiktokIdeas: this.fb.array([])
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
    this.photographersArray.push(this.fb.control(''));
  }

  removePhotographer(index: number): void {
    this.photographersArray.removeAt(index);
  }

  addCinematographer(): void {
    this.cinematographersArray.push(this.fb.control(''));
  }

  removeCinematographer(index: number): void {
    this.cinematographersArray.removeAt(index);
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
  }

  addTiktokIdea(): void {
    this.tiktokIdeasArray.push(this.fb.control(''));
  }

  removeTiktokIdea(index: number): void {
    this.tiktokIdeasArray.removeAt(index);
  }

  addFavoriteSong(): void {
    this.favoriteSongsArray.push(this.fb.control(''));
  }

  removeFavoriteSong(index: number): void {
    this.favoriteSongsArray.removeAt(index);
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



  onSubmit(): void {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      this.submitError = 'Please fill in all required fields correctly.';
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
        setTimeout(() => {
          this.router.navigate(['/orders']);
        }, 2000);
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
}

