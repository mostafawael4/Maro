import { HttpInterceptorFn } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const platformId = inject(PLATFORM_ID);

    // Only handle localStorage in the browser
    if (isPlatformBrowser(platformId)) {
        const sessionId = localStorage.getItem('maro_session_id');

        if (sessionId) {
            // Clone the request and add the X-Session-ID header
            const clonedReq = req.clone({
                setHeaders: {
                    'X-Session-ID': sessionId
                }
            });
            return next(clonedReq);
        }
    }

    return next(req);
};
