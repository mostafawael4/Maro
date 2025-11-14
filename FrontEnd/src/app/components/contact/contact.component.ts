import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ContactService } from '../../services/contact.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss'
})
export class ContactComponent {
  contactForm: FormGroup;
  submitSuccess = false;
  submitError = false;
  errorMessage = '';
  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private contactService: ContactService
  ) {
    this.contactForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  get name() {
    return this.contactForm.get('name');
  }

  get email() {
    return this.contactForm.get('email');
  }

  get message() {
    return this.contactForm.get('message');
  }

  onSubmit() {
    // Reset messages
    this.submitSuccess = false;
    this.submitError = false;
    this.errorMessage = '';

    // Check if form is valid
    if (this.contactForm.invalid) {
      // Mark all fields as touched to show errors
      Object.keys(this.contactForm.controls).forEach(key => {
        this.contactForm.get(key)?.markAsTouched();
      });
      this.submitError = true;
      this.errorMessage = 'Please fill all fields correctly';
      return;
    }

    this.isSubmitting = true;

    // Get form values
    const { name, email, message } = this.contactForm.value;

    // Submit to API
    this.contactService.submitContactForm({
      clientName: name,
      email: email,
      message: message
    }).subscribe({
      next: (response) => {
        if (response.ok) {
          this.submitSuccess = true;
          this.isSubmitting = false;
          
          // Reset form after successful submission
          this.contactForm.reset();

          // Hide success message after 5 seconds
          setTimeout(() => {
            this.submitSuccess = false;
          }, 5000);
        } else {
          this.submitError = true;
          this.errorMessage = response.message || 'Failed to send message. Please try again.';
          this.isSubmitting = false;
        }
      },
      error: (err) => {
        this.submitError = true;
        this.errorMessage = err.error?.message || 'Failed to send message. Please try again.';
        this.isSubmitting = false;
        console.error('Error submitting contact form:', err);
      }
    });
  }
}
