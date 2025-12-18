# Metabolic Magic Tracker

## Overview

A mobile-responsive web application for participants in a metabolic health program. The app enables users to track daily health metrics (blood pressure, waist circumference, glucose, ketones, weight), log food with AI-powered macro analysis, view trends and weekly reports, receive automated health prompts, and communicate with their coach.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, React Context for auth and data
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme variables for consistent design system
- **Charts**: Recharts for data visualization on trends pages

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **API Pattern**: RESTful JSON APIs under `/api` prefix
- **Authentication**: Passport.js with local strategy, session-based auth using express-session
- **Password Handling**: Scrypt hashing with timing-safe comparison

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions using Drizzle's pgTable
- **Migrations**: Drizzle Kit for schema migrations (`drizzle-kit push`)
- **Key Tables**: users, metric_entries, food_entries, conversations, messages, macro_targets

### Authentication & Authorization
- Session-based authentication with memory store (development) or PostgreSQL store (production-ready via connect-pg-simple)
- Role-based access control with three roles: participant, coach, admin
- Protected routes require authentication middleware

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/` directory are used by both frontend and backend
- **API Client**: Centralized API client in `client/src/lib/api.ts` handles all HTTP requests
- **Data Adapter**: Context provider in `client/src/lib/dataAdapter.tsx` manages data fetching and caching
- **Form Validation**: Zod schemas generated from Drizzle tables via drizzle-zod

## External Dependencies

### Database
- PostgreSQL database (connection via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe database queries

### AI Services (Planned)
- Food analysis API endpoints exist for text/photo/voice input to macro extraction
- Integration points prepared for OpenAI or Google Generative AI

### Third-Party Libraries
- **UI**: Radix UI primitives, Lucide icons, class-variance-authority
- **Forms**: React Hook Form with Zod resolver
- **Dates**: date-fns for date manipulation
- **Charts**: Recharts for visualization

### Build & Development
- Vite for frontend bundling with HMR
- esbuild for server bundling
- TypeScript for type safety across the stack