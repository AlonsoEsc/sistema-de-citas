# API MVP Endpoints

## Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

## Tenant
- `GET /tenants/me`
- `PATCH /tenants/me/settings`
- `GET /entitlements`

## Staff
- `GET /staff`
- `POST /staff`
- `PATCH /staff/:id`
- `GET /staff/:id/schedule`
- `PUT /staff/:id/schedule`

## Services
- `GET /services`
- `POST /services`
- `PATCH /services/:id`

## Customers
- `GET /customers?search=`
- `POST /customers`
- `PATCH /customers/:id`

## Appointments
- `GET /appointments?from=&to=&staffId=`
- `POST /appointments`
- `PATCH /appointments/:id/status`
- `PATCH /appointments/:id/reschedule`
- `DELETE /appointments/:id`

## Public Booking
- `POST /public/:tenantSlug/auth/start`
- `POST /public/:tenantSlug/auth/verify`
- `GET /public/:tenantSlug/services`
- `GET /public/:tenantSlug/staff`
- `GET /public/:tenantSlug/availability?date=&staffId=&serviceIds=`
- `GET /public/:tenantSlug/my-appointments` (auth cliente)
- `POST /public/:tenantSlug/cancel` (auth cliente)
- `POST /public/:tenantSlug/book`

## Notifications
- `GET /notifications/templates`
- `PUT /notifications/templates/:id`

## Plans
- `GET /plans`
- `GET /subscription`
- `POST /subscription/upgrade`
