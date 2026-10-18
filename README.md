# issues.cash

issues.cash is a bounty platform on Bitcoin Cash that allows the creation and funding of bounties associated to issues on GitHub and GitLab.

A smart contract holds the bounty funds, which gets released when a solution is approved via pull request.

This repository contains everything necessary to host the platform. It is a regular [Next.js](https://nextjs.org) project.

# Bounties

## Create a bounty

On an issue, comment:

```
/bounty <amount> --refund <address> [--expiry <days>]
```

The bot will reply with a contract address and funding instructions.

### Examples

```
# Basic bounty with 90-day default expiry
/bounty 2.35 --refund bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p

# Custom 60-day expiry
/bounty 1.5 --refund bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p --expiry 60
```

## Cancel a bounty

If a bounty has not been funded yet, the maintainer can cancel it by commenting:

```
/bounty cancel
```

This deletes the pending bounty from the system. For funded bounties, close the issue instead to trigger a refund.

## Claim a bounty

To claim a bounty, create a pull request that solves the issue and include the following in the PR body:

```
/claim <issue_number> --address <address>
```

### Example

```
/claim 42 --address bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p
```

When the PR is merged, the oracle verifies the event and releases the funds to the specified address.

## Refund a bounty

To refund a funded bounty, close the issue. The oracle will verify the event and return the funds to the `--refund` address specified when the bounty was created.

**Note**: Refunds are blocked if there are open pull requests claiming the bounty. Close or merge the PRs first.

## Expiry

Each bounty has an expiry date set by the `--expiry` flag (default: 90 days). After this period:

- The maintainer can reclaim the funds directly from the smart contract
- No oracle signature is required
- The bounty status changes to `EXPIRED`

## Commission

A commission may be charged on successful bounty completions (when a PR is merged):

- Commission is not charged on refunds or expired bounties
- The rate is configured by the platform operator
- Some projects may be designated as partners with 0% commission

When a bounty is claimed, the payout message will show:
- Bounty amount
- Network fees
- Commission amount and rate (if applicable)
- Final amount received by contributor

# GitHub app

The app can be installed in any repository here: https://github.com/apps/issues-cash

## Setting up the network

The app runs on `mainnet` by default. To run on `testnet3`, set the following Action variable `Settings -> Secrets and variables -> Actions -> Variables` on your GitHub repository:

```
BCH_NETWORK=testnet3
```

# Real Chipnet transaction tests

`yarn test:e2e` is separate from the mocked Jest suite. It broadcasts real transactions on **Chipnet only**: payouts with and without commission, multi-input payouts, refunds, expiry using the chain's median time, and rejection of an invalid oracle signature. It verifies the decoded transaction inputs/outputs, not just API responses. These are contract/service integration tests, not browser or Telegram-login tests.

`yarn test:e2e:offline` separately checks the harness, recovery keys and transaction construction using CashScript's local BCH VM and `MockNetworkProvider`. It needs no wallet secret and does not replace the real-network suite.

Use a **dedicated, compressed testnet WIF**, funded on Chipnet (for example via https://tbch.googol.cash/). Keep at least 0.002 tBCH available; 0.01 tBCH gives more headroom. Never reuse a mainnet wallet's private key, even re-encoded as a testnet WIF.

```bash
export E2E_RUN_CHIPNET=1
export E2E_FUNDER_WIF='your-dedicated-chipnet-wallet-WIF'
# Unset an inherited mainnet website configuration before running.
export NEXT_PUBLIC_BCH_NETWORK=testnet3
yarn test:e2e
```

Tests use `chipnet.bch.ninja` explicitly. The app's existing `testnet3` address/network setting is routed to Chipnet with `BCH_ELECTRUM_HOST_TESTNET3`; this does not make testnet3 and Chipnet the same chain. `ORACLE_KEY_DIR` redirects oracle files into an ignored per-run directory. Normal app defaults are unchanged.

After each test, recovery attempts to refund remaining escrows and sweep the test wallets (including commissions) back to the funder. Runs consume real testnet fees, generally several thousand satoshis per case. Balances below fee plus dust cannot be swept. Network failures or killed processes can interrupt cleanup; recovery is best-effort, not a guarantee.

Each run writes a public `e2e-artifacts/<run-id>/manifest.json` **before funding**. The per-run test keys are derived from the funder key and run ID with a domain-separated HMAC, so this public manifest plus the original funder WIF is sufficient to recover without publishing private keys. Keep the funder key private and retain manifests for failed runs. Never upload the `keys/` subdirectory.

```bash
# With the ORIGINAL E2E_FUNDER_WIF and E2E_RUN_CHIPNET=1 still set:
E2E_RECOVER_MANIFEST=./e2e-artifacts/<run-id>/manifest.json yarn test:e2e
```

## GitHub Actions

Create an environment named **`chipnet-e2e`** with secret **`E2E_FUNDER_WIF`**. Configure required reviewers for that environment before adding the secret: a same-repository PR executes its code with the spending key, so approve only trusted changes. Use a low-balance test-only wallet.

The **Chipnet transactions** workflow runs on pull requests touching escrow code, migrations, tests or their configuration, and supports manual dispatch after the workflow exists on the default branch. There is no PR-label trigger. Fork PRs are skipped; `pull_request_target` is not used. Runs are serialized across branches, are not cancelled mid-spend, and have a 15-minute timeout. GitHub retains only one queued run for the shared wallet, so a newer queued run can replace an older one. Do not run locally at the same time with the same wallet.

The workflow provisions disposable PostgreSQL, applies migrations (for application-level scenarios added by dependent PRs), and uploads only public transaction/recovery manifests. Transaction links and recovery failures appear in its summary. No faucet calls or automatic top-ups are made.

# GitLab integration

1. Create an access token for the bot in `Settings → Access Tokens`:
  - Role: Maintainer
  - Scopes: `api`

2. Configure the webhook in `Settings → Webhooks → Add new webhook`
   - URL: `https://issues.cash/api/webhooks/gitlab`
   - Secret token: a combination of a secret of your choice, plus the access token created in step number 1: `your-secret|glpat-xxxxxxxxxxxx`
   - Trigger: "Comments", "Issues events", "Merge request events"
   - Enable SSL verification: check

## Setting up the network

The app runs on `mainnet` by default. To run on `testnet3`, set the following project variable in `Settings -> CI/CD -> Variables`:

```
BCH_NETWORK=testnet3
```
