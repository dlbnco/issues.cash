# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

issues.cash is a decentralized bounty platform for GitHub/GitLab issues built on Bitcoin Cash. It uses CashScript smart contracts to create trustless escrow for code bounties where:
- Maintainers fund bounties via smart contracts
- Contributors submit solutions via PRs
- An oracle bot verifies GitHub events and authorizes payouts
- Funds are trustlessly held and distributed without intermediaries

## Technology Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Database**: PostgreSQL via Prisma ORM
- **Smart Contracts**: CashScript (Bitcoin Cash script compiler)
- **Blockchain**: Bitcoin Cash via Electrum network
- **Key Libraries**:
  - `cashscript` - Smart contract deployment and interaction
  - `@bitauth/libauth` - Bitcoin Cash address encoding/decoding
  - `@electrum-cash/network` - Blockchain network provider
  - `@noble/secp256k1` - Cryptographic signing

## Development Commands

```bash
# Development server (uses webpack flag)
yarn dev

# Production build
yarn build

# Start production server
yarn start

# Linting
yarn lint

# Database migrations
npx prisma migrate dev
npx prisma generate
npx prisma studio  # GUI for database
```

## Architecture

### Smart Contract System

The core of the application is the `DynamicBounty.cash` CashScript contract located in `/contracts/`. This contract has three execution paths:

1. **complete()** - Pays contributor when PR is merged (requires oracle signature)
2. **refund()** - Returns funds to maintainer when issue is closed (requires oracle signature)
3. **timeout()** - Automatic refund after locktime expires (no oracle needed)

Contract parameters:
- `oraclePubkey` - Bot's public key for verifying GitHub events
- `maintainerPKH` - Hash160 of maintainer's BCH address (for refunds)
- `issueHash` - SHA256 of GitHub issue URL (unique identifier)
- `locktime` - Unix timestamp for automatic refund

### Contract Management (`src/lib/contract.ts`)

Functional approach to contract operations with pure functions:

- **Oracle Key Management**: `getOracleKeys()`, `generateOracleKeys()`, `loadOracleKeys()`
- **Contract Creation**: `createBountyContract()` - Instantiates contracts with parameters
- **Contract Reconstruction**: `reconstructContract()` - Rebuilds from stored params
- **Balance Queries**: `checkContractBalance()`, `getContractUTXOs()`
- **Address Utilities**: `addressToPKH()`, `pkhToAddress()`, `pubkeyToAddress()`
- **High-level API**: `createBounty()`, `checkBountyFunding()`, `rebuildBountyContract()`

The contract manager uses a config pattern: `createConfig()` returns an object with network, provider, artifact, and oracle keys that gets passed to all functions.

### Database Schema (`prisma/schema.prisma`)

Single `Bounty` model tracks bounty lifecycle:

```
PENDING_FUNDING → ACTIVE → CLAIMED/EXPIRED/REFUNDED
```

Key fields:
- `issueUrl`, `issueHash` - GitHub issue identifiers
- `contractAddress` - Deployed smart contract address
- `maintainerAddress`, `maintainerPKH` - Maintainer BCH identifiers
- `amount` - Expected bounty (satoshis)
- `fundedAmount` - Actual funded amount (satoshis)
- `locktime`, `oraclePubkey` - Contract parameters
- `status` - Current state (enum)

### Application Structure

- `/src/app/` - Next.js App Router pages
  - `layout.tsx` - Root layout with Geist fonts
  - `page.tsx` - Homepage (currently default Next.js template)
  - `api/webhooks/github/route.ts` - GitHub webhook handler
- `/src/lib/` - Core business logic
  - `contract.ts` - CashScript contract management (functional)
  - `prisma.ts` - Prisma client singleton
  - `bounty-service.ts` - Bounty creation and management service
  - `command-parser.ts` - Parse /bounty commands from comments

## Important Implementation Notes

### Working with Bitcoin Cash Amounts

All amounts are stored in **satoshis** (1 BCH = 100,000,000 satoshis). Convert for display:
```typescript
const amountBCH = (satoshis / 100_000_000).toFixed(8);
```

### Contract Deployment Flow

1. Create config once at startup: `createConfig(network)`
2. Create bounty: `createBounty(config, issueUrl, maintainerAddr, expiryDays)`
3. Store contract params in database
4. Monitor funding: `checkBountyFunding(config, contractAddress)`
5. Update status when funded
6. Reconstruct later: `rebuildBountyContract(config, storedParams)`

### Oracle Signature Format

Oracle signs messages with specific formats:
- Complete: `"COMPLETE" + issueHash + contributorPKH`
- Refund: `"REFUND" + issueHash`

All signatures use ECDSA on SHA256 hash of the message.

### Address Formats

Bitcoin Cash uses CashAddress format (e.g., `bitcoincash:qp...`). For testnet, prefix is `bchtest:`. The contract stores PKH (hash160) internally, not full addresses.

### Network Configuration

- Testnet: Use `"testnet3"` network for development
- Mainnet: Use `"mainnet"` for production
- Get testnet coins: https://tbch.googol.cash/
- Explorer: https://testnet.bch.loping.net/

### Website Network Filtering

The website can be configured to display bounties from a specific network only:

- `NEXT_PUBLIC_BCH_NETWORK` - Set to `"mainnet"` or `"testnet3"` (default: `"mainnet"`)

This is a **client-side filter only**. The server/database handles all networks:
- GitHub webhooks receive events for all networks (GitHub can't differentiate)
- Database stores bounties from all networks with a `network` field
- Website UI filters by `NEXT_PUBLIC_BCH_NETWORK` env var

Deployment pattern for multiple networks:
- `issues.cash` deploys with `NEXT_PUBLIC_BCH_NETWORK=mainnet`
- `testnet.issues.cash` deploys same app with `NEXT_PUBLIC_BCH_NETWORK=testnet3`

## Path Aliases

TypeScript paths configured with `@/*` alias mapping to `./src/*`:
```typescript
import { prisma } from "@/lib/prisma";
import { createBounty } from "@/lib/contract";
```

## TypeScript Configuration

- Target: ES2017
- Strict mode enabled
- JSX: react-jsx (Next.js 19+ uses automatic JSX runtime)
- Module resolution: bundler (Next.js requirement)

## Webpack Flag

Both `dev` and `build` scripts use `--webpack` flag. This is intentional - Next.js 16 defaults to Turbopack but this project requires webpack for compatibility with CashScript/crypto libraries.

## GitHub Webhook Integration

### Setup

1. **Configure Environment Variables** (see `.env.example`):
   - `GITHUB_WEBHOOK_SECRET` - Secret for verifying webhook signatures
   - `BCH_NETWORK` - Network to use ("testnet3" or "mainnet")
   - `DATABASE_URL` - PostgreSQL connection string
   - `GITHUB_TOKEN` - (Optional) For posting comments back to issues

2. **Generate Oracle Keys**:
   ```bash
   # Keys are auto-generated on first use
   # Stored in oracle-key-testnet3.json and oracle-key-mainnet.json
   # IMPORTANT: Backup these files! They cannot be recovered if lost.
   ```

3. **Configure GitHub Webhook**:
   - URL: `https://yourdomain.com/api/webhooks/github`
   - Content type: `application/json`
   - Secret: Same as `GITHUB_WEBHOOK_SECRET`
   - Events: Select "Issue comments", "Pull requests", and "Issues"

### Bounty Command Format

Users create bounties by commenting on GitHub issues:

```
/bounty <amount> --refund <address> [--expiry <days>]
```

Examples:
- `/bounty 2.35 --refund bitcoincash:qp...` (90 day default expiry)
- `/bounty 1.5 --refund bchtest:qp... --expiry 60` (60 day expiry)
- `/bounty 0.5 --refund bitcoincash:qp... --expiry 30` (30 day expiry)

Requirements:
- Only repository maintainers (OWNER, MEMBER, COLLABORATOR) can create bounties
- Amount must be between 0.0001 and 21,000,000 BCH
- Refund address must be valid CashAddress format
- Expiry must be between 1 and 365 days

### Webhook Flow

1. **Bounty Creation** (`issue_comment` event):
   - User comments `/bounty` command on an issue
   - Webhook validates signature and parses command
   - Checks if user is a maintainer
   - Creates smart contract with specified parameters
   - Stores bounty in database with `PENDING_FUNDING` status
   - Bot replies with funding instructions

2. **Funding Check** (Cron job via `checkPendingBounties()`):
   - Periodically checks blockchain for contract funding
   - Updates status to `ACTIVE` when funds received
   - Should be run every 5-10 minutes

3. **PR Merged** (`pull_request` event with `merged` action):
   - TODO: Oracle signs completion message
   - Format: `"COMPLETE" + issueHash + contributorPKH`
   - Updates database status to `CLAIMED`

4. **Issue Closed** (`issues` event with `closed` action):
   - TODO: Oracle signs refund message if no PR merged
   - Format: `"REFUND" + issueHash`
   - Updates database status to `REFUNDED`

### Command Parser (`src/lib/command-parser.ts`)

Parses `/bounty` commands with validation:
- Amount validation (range, format)
- Address validation (CashAddress format)
- Expiry validation (1-365 days)
- Flag parsing (`--refund`, `--expiry`)

Utility functions:
- `bchToSatoshis()` - Convert BCH to satoshis
- `satoshisToBCH()` - Convert satoshis to BCH
- `formatBCH()` - Format satoshis as BCH string

### Bounty Service (`src/lib/bounty-service.ts`)

High-level bounty operations:
- `createBountyFromCommand()` - Create bounty from parsed command
- `checkPendingBounties()` - Check and update funding status (cron)
- `getBountyByIssueUrl()` - Query bounty by issue URL
- `getBountyByContractAddress()` - Query bounty by contract address
- `listActiveBounties()` - Get all active bounties

### Security

- Webhook signature verification using HMAC-SHA256
- Constant-time comparison to prevent timing attacks
- Authorization checks (only maintainers can create bounties)
- Input validation for all command parameters
- Oracle keys stored separately per network (testnet/mainnet)
- Oracle keys automatically added to `.gitignore`
