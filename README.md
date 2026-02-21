# BridgeOnline

A real-time multiplayer Bridge card game built with Next.js 15, Socket.io, and PostgreSQL.

## Features

- ♠ ♥ Real-time multiplayer Bridge gameplay ♦ ♣
- ACBL-compliant rules and scoring
- Private game rooms with invite codes
- User authentication and profiles
- Responsive design for all devices

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS
- **Backend**: Next.js API Routes, Socket.io for real-time
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js v5

## Getting Started

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd BridgeOnline
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your database connection string and other required values.

4. Set up the database:
```bash
npx prisma db push
npx prisma generate
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
BridgeOnline/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard page
│   ├── login/             # Login page
│   ├── register/          # Registration page
│   └── globals.css        # Global styles
├── components/            # React components
├── lib/                   # Utilities and configuration
│   ├── game/             # Game logic (deck, bidding, scoring, playing)
│   ├── auth.ts           # NextAuth configuration
│   └── db.ts             # Prisma client
├── prisma/               # Database schema
├── server/               # Socket.io server
└── types/                # TypeScript type definitions
```

## How to Play

1. **Register/Login**: Create an account or log in
2. **Create Room**: Start a new game room and get an invite code
3. **Invite Friends**: Share the invite code with 3 friends
4. **Bidding**: Players bid to establish the contract
5. **Playing**: Try to win tricks to fulfill your contract
6. **Scoring**: Points awarded based on ACBL rules

## Development

- Run development server: `npm run dev`
- Build for production: `npm run build`
- Start production server: `npm start`
- Database migrations: `npx prisma db push`
- View database: `npx prisma studio`

## License

ISC
