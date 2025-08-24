# Socket.IO Server for Real-time Collaboration

This is a standalone Socket.IO server for handling real-time collaboration features.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure
3. Development: `npm run dev`
4. Production: `npm start`

## Deployment

This server is designed to be deployed on Render.com or similar platforms.

### Environment Variables

- `PORT`: Server port (default: 3001)
- `CLIENT_URL`: Your main app URL (e.g., https://your-app.vercel.app)
- `NODE_ENV`: Environment (production/development)

## Build

Run `npm run build` to compile TypeScript to JavaScript in the `dist/` folder.
