import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

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
  isSubmitting = false;

  constructor(private fb: FormBuilder) {
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

    // Check if form is valid
    if (this.contactForm.invalid) {
      // Mark all fields as touched to show errors
      Object.keys(this.contactForm.controls).forEach(key => {
        this.contactForm.get(key)?.markAsTouched();
      });
      this.submitError = true;
      return;
    }

    this.isSubmitting = true;

    // Get form values
    const { name, email, message } = this.contactForm.value;
    const recipientEmail = 'mostafawael556@gmail.com';

    // Create mailto link
    const subject = encodeURIComponent(`Contact Form: Message from ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
    );
    const mailtoLink = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;

    // Open email client
    window.location.href = mailtoLink;

    // Show success message
    setTimeout(() => {
      this.submitSuccess = true;
      this.isSubmitting = false;
      
      // Reset form after successful submission
      this.contactForm.reset();

      // Hide success message after 5 seconds
      setTimeout(() => {
        this.submitSuccess = false;
      }, 5000);
    }, 500);
  }
}
