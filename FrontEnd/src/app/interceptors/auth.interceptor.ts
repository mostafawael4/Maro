import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const platformId = inject(PLATFORM_ID);

    // Only access localStorage in the browser
    if (isPlatformBrowser(platformId)) {
        const sessionId = localStorage.getItem('maro_session_id');

        if (sessionId) {
            const clonedReq = req.clone({
                setHeaders: {
                    'X-Session-ID': sessionId,
                    'maro-session-id': sessionId
                }
            });
            return next(clonedReq);
        }
    }

    return next(req);
};
