# StackMind Web Blog -server

## Project Overview
- **Project Name**: StackMind Web Blog
- **Purpose**: This is the backend server for the StackMind Web Blog platform, built with Node.js and Express. It provides RESTful APIs to manage blog posts, user authentication, comments, and wishlist functionality, integrated with MongoDB for data storage.
- **Live URL**: https://stack-mind-server.vercel.app

## Key Features
- User authentication using JWT tokens.
- CRUD operations for blog posts.
- Fetch recent blogs, featured blogs, and categories.
- Wishlist management for users.
- Comment system for blog posts.
- Star of the week feature.

## NPM Packages Used
- `express`: Web framework for Node.js.
- `mongodb`: MongoDB driver for database operations.
- `jsonwebtoken` (jwt): JSON Web Token implementation for authentication.
- `cookie-parser`: Parse HTTP request cookies.
- `cors`: Enable Cross-Origin Resource Sharing.
- `dotenv`: Load environment variables from a `.env` file.

## Setup and Usage
- Clone the repository, install dependencies with `npm install`, and configure environment variables (e.g., `DB_USER`, `DB_PASS`, `JWT_ACCESS_TOKEN`).
- Run locally with `node index.js` or deploy to Vercel with `vercel --prod`.
- Access APIs at the live URL or `http://localhost:3000` during development.

