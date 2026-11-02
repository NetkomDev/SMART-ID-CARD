# AKSIS Serverless API Adapter (`api/`)

## Overview
Serverless function bridge entrypoint for Vercel deployment. Instantiates and exports the Express core application handler (`apps/api/src/app.js`) as a serverless request dispatcher for the production domain.

## Interface
- `default`: Express application instance returned by `createApp()` handling incoming HTTP requests on Vercel.

## Invariants
- Stateless request lifecycle matching Vercel Serverless Function specifications.
- Delegates business logic, routing, middleware, and schema validation strictly to `apps/api`.

## Side Effects
- Dispatches HTTP requests and responses to/from the Core API pipeline.

## Verification
- Run: `npm run vercel-build`
