# Date Booking System

A lean, single-tenant scheduling boilerplate reverse-engineered from Cal.com.

## Features
- **Single-Tenant**: Designed for individual clients/websites.
- **Native UI**: 100% Tailwind CSS, zero iframe embeds.
- **Timezone Aware**: Automatic visitor timezone detection.
- **Prisma Schema**: Streamlined relational model for users, schedules, and bookings.

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Database Setup**:
   Configure your `DATABASE_URL` in `.env` and run:
   ```bash
   npx prisma db push
   ```

3. **Run Dev Server**:
   ```bash
   npm run dev
   ```

## License
MIT
