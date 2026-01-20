import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { PackagesComponent } from './components/packages/packages.component';
import { GalleryComponent } from './components/gallery/gallery.component';
import { FilmsComponent } from './components/films/films.component';
import { ContactComponent } from './components/contact/contact.component';
import { AdminComponent } from './components/admin/admin.component';
import { FaqsComponent } from './components/faqs/faqs.component';
import { OrdersComponent } from './components/orders/orders.component';
import { OrderDetailsComponent } from './components/order-details/order-details.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { OrderInfoComponent } from './components/order-info/order-info.component';
import { CreateOrderComponent } from './components/create-order/create-order.component';
import { FeedbacksComponent } from './components/feedbacks/feedbacks.component';
import { NotFoundComponent } from './components/not-found/not-found.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { ChangePasswordComponent } from './components/change-password/change-password.component';
import { adminGuard } from './guards/admin.guard';
import { adminLoginGuard } from './guards/admin-login.guard';
import { authGuard } from './guards/auth.guard';
import { ordersAccessGuard } from './guards/orders-access.guard';

export const routes: Routes = [
    { path: '', redirectTo: 'home', pathMatch: 'full' },
    { path: 'home', component: HomeComponent, data: { title: 'Home' } },
    { path: 'packages', component: PackagesComponent, data: { title: 'Packages' } },
    { path: 'gallery', component: GalleryComponent, data: { title: 'Gallery' } },
    { path: 'films', component: FilmsComponent, data: { title: 'Films' } },
    { path: 'faqs', component: FaqsComponent, data: { title: 'FAQs' } },
    { path: 'orders', component: OrdersComponent, canActivate: [ordersAccessGuard], data: { title: 'Orders' } },
    { path: 'create-order', component: CreateOrderComponent, data: { title: 'Create Order' } },
    { path: 'edit-order/:id', component: CreateOrderComponent, data: { title: 'Edit Order' } },
    { path: 'order-details/:id', component: OrderDetailsComponent, data: { title: 'Order Details' } },
    { path: 'dashboard', component: DashboardComponent, canActivate: [adminGuard], data: { title: 'Dashboard' } },
    { path: 'order-info/:id', component: OrderInfoComponent, data: { title: 'Order Info' } },
    { path: 'contact', component: ContactComponent, data: { title: 'Contact' } },
    { path: 'admin', component: AdminComponent, canActivate: [adminLoginGuard], data: { title: 'Admin' } },
    { path: 'feedbacks', component: FeedbacksComponent, data: { title: 'Feedbacks' } },
    { path: 'calendar', component: CalendarComponent, canActivate: [authGuard], data: { title: 'Calendar' } },
    { path: 'change-password', component: ChangePasswordComponent, canActivate: [authGuard], data: { title: 'Change Password' } },
    { path: '**', component: NotFoundComponent, data: { title: 'Page Not Found' } }, // 404 - must be last
];
